import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import pool from '../db/pool.js';
import { createUser, createTrainee, loginAgent } from './helpers.js';

describe('role rules (docs/project-brief.md Section 4)', () => {
  it('lets a Training Captain create and edit only their own flight, not another TC\'s', async () => {
    const tc1 = await createUser({ email: 'tc1@test.local', role: 'TRAINING_CAPTAIN' });
    await createUser({ email: 'tc2@test.local', role: 'TRAINING_CAPTAIN' });
    const trainee = await createTrainee({});

    const tc1Agent = request.agent(app);
    await loginAgent(tc1Agent, 'tc1@test.local');
    const created = await tc1Agent.post('/api/flights').send({ traineeId: trainee.id, date: '2026-01-01', hours: 1 });
    expect(created.status).toBe(201);
    expect(created.body.trainingCaptainId).toBe(tc1.id);

    const tc2Agent = request.agent(app);
    await loginAgent(tc2Agent, 'tc2@test.local');
    const forbiddenEdit = await tc2Agent.patch(`/api/flights/${created.body.id}`).send({ debriefComments: 'hijacked' });
    expect(forbiddenEdit.status).toBe(403);
  });

  it('does not let HOTC override the Training Captain lock on a flight', async () => {
    await createUser({ email: 'tc3@test.local', role: 'TRAINING_CAPTAIN' });
    await createUser({ email: 'hotc3@test.local', role: 'HOTC' });
    const trainee = await createTrainee({});

    const tcAgent = request.agent(app);
    await loginAgent(tcAgent, 'tc3@test.local');
    const created = await tcAgent.post('/api/flights').send({ traineeId: trainee.id, date: '2026-01-01', hours: 1 });

    const hotcAgent = request.agent(app);
    await loginAgent(hotcAgent, 'hotc3@test.local');
    const res = await hotcAgent.patch(`/api/flights/${created.body.id}`).send({ debriefComments: 'override attempt' });
    expect(res.status).toBe(403);
  });

  it('does not erase other flight fields when only the rating is updated', async () => {
    await createUser({ email: 'tc4@test.local', role: 'TRAINING_CAPTAIN' });
    const trainee = await createTrainee({});

    const tcAgent = request.agent(app);
    await loginAgent(tcAgent, 'tc4@test.local');
    const created = await tcAgent.post('/api/flights').send({ traineeId: trainee.id, date: '2026-01-01', hours: 3 });
    await tcAgent.patch(`/api/flights/${created.body.id}`).send({ debriefComments: 'good sector work' });

    const ratingUpdate = await tcAgent.patch(`/api/flights/${created.body.id}`).send({ loftPerformanceRating: 'Above average' });
    expect(ratingUpdate.status).toBe(200);
    expect(ratingUpdate.body.debriefComments).toBe('good sector work');
    expect(Number(ratingUpdate.body.hours)).toBe(3);
  });

  it('lets a trainee acknowledge only their own finalized flight, without erasing data', async () => {
    await createUser({ email: 'tc5@test.local', role: 'TRAINING_CAPTAIN' });
    const traineeUser = await createUser({ email: 'trainee1@test.local', role: 'TRAINEE' });
    const trainee = await createTrainee({});
    await pool.query('UPDATE trainees SET user_id = $1 WHERE id = $2', [traineeUser.id, trainee.id]);

    const tcAgent = request.agent(app);
    await loginAgent(tcAgent, 'tc5@test.local');
    const created = await tcAgent.post('/api/flights').send({ traineeId: trainee.id, date: '2026-01-01', hours: 2 });

    const traineeAgent = request.agent(app);
    await loginAgent(traineeAgent, 'trainee1@test.local');

    const beforeFinalize = await traineeAgent.post(`/api/flights/${created.body.id}/acknowledge`);
    expect(beforeFinalize.status).toBe(409);

    await tcAgent.post(`/api/flights/${created.body.id}/finalize`);
    const ack = await traineeAgent.post(`/api/flights/${created.body.id}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledgedByTrainee).toBe(true);
    expect(Number(ack.body.hours)).toBe(2);
  });

  it('blocks a CA Trainer from viewing pilot trainee records', async () => {
    await createUser({ email: 'ca.trainer@test.local', role: 'CA_TRAINER' });
    const pilot = await createTrainee({ type: 'PILOT', role: 'FIRST_OFFICER', fleet: 'DASH_8' });

    const agent = request.agent(app);
    await loginAgent(agent, 'ca.trainer@test.local');
    const res = await agent.get(`/api/trainees/${pilot.id}`);
    expect(res.status).toBe(403);
  });

  it('lets HOTC, Examiner, CA Trainer, and CA Checker create flights, not just Training Captain', async () => {
    const roles = ['HOTC', 'EXAMINER', 'CA_TRAINER', 'CA_CHECKER'];
    for (const role of roles) {
      await createUser({ email: `${role.toLowerCase()}.creator@test.local`, role });
    }
    const pilot = await createTrainee({ type: 'PILOT', role: 'FIRST_OFFICER', fleet: 'DASH_8' });
    const cabinAttendant = await createTrainee({ type: 'CABIN_ATTENDANT', role: 'CABIN_ATTENDANT', fleet: 'CA_DASH_8' });

    for (const role of ['HOTC', 'EXAMINER']) {
      const agent = request.agent(app);
      await loginAgent(agent, `${role.toLowerCase()}.creator@test.local`);
      const res = await agent.post('/api/flights').send({ traineeId: pilot.id, date: '2026-01-01', hours: 1 });
      expect(res.status).toBe(201);
    }
    for (const role of ['CA_TRAINER', 'CA_CHECKER']) {
      const agent = request.agent(app);
      await loginAgent(agent, `${role.toLowerCase()}.creator@test.local`);
      const res = await agent.post('/api/flights').send({ traineeId: cabinAttendant.id, date: '2026-01-01', hours: 1 });
      expect(res.status).toBe(201);
    }
  });

  it('still blocks Trainee and CC from creating flights', async () => {
    await createUser({ email: 'trainee.creator@test.local', role: 'TRAINEE' });
    await createUser({ email: 'cc.creator@test.local', role: 'CC' });
    const trainee = await createTrainee({});

    for (const email of ['trainee.creator@test.local', 'cc.creator@test.local']) {
      const agent = request.agent(app);
      await loginAgent(agent, email);
      const res = await agent.post('/api/flights').send({ traineeId: trainee.id, date: '2026-01-01', hours: 1 });
      expect(res.status).toBe(403);
    }
  });

  it('locks a flight to its creator regardless of role, even against another HOTC', async () => {
    await createUser({ email: 'hotc.owner@test.local', role: 'HOTC' });
    await createUser({ email: 'hotc.other@test.local', role: 'HOTC' });
    const trainee = await createTrainee({});

    const ownerAgent = request.agent(app);
    await loginAgent(ownerAgent, 'hotc.owner@test.local');
    const created = await ownerAgent.post('/api/flights').send({ traineeId: trainee.id, date: '2026-01-01', hours: 1 });
    expect(created.status).toBe(201);

    const otherAgent = request.agent(app);
    await loginAgent(otherAgent, 'hotc.other@test.local');
    const res = await otherAgent.patch(`/api/flights/${created.body.id}`).send({ debriefComments: 'not mine to edit' });
    expect(res.status).toBe(403);
  });

  it('hides archived trainees from everyone except HOTC/HOFO/Flight Ops Admin', async () => {
    await createUser({ email: 'examiner1@test.local', role: 'EXAMINER' });
    await createUser({ email: 'hofo1@test.local', role: 'HOFO' });
    const archived = await createTrainee({});
    await pool.query('UPDATE trainees SET archived = true, archived_at = now() WHERE id = $1', [archived.id]);

    const examinerAgent = request.agent(app);
    await loginAgent(examinerAgent, 'examiner1@test.local');
    const denied = await examinerAgent.get(`/api/trainees/${archived.id}`);
    expect(denied.status).toBe(403);

    const hofoAgent = request.agent(app);
    await loginAgent(hofoAgent, 'hofo1@test.local');
    const allowed = await hofoAgent.get(`/api/trainees/${archived.id}`);
    expect(allowed.status).toBe(200);
  });

  it('lets HOTC manage syllabus curriculum items, and a new item shows up for a matching trainee', async () => {
    await createUser({ email: 'hotc.syllabus@test.local', role: 'HOTC' });
    await createUser({ email: 'tc.syllabus@test.local', role: 'TRAINING_CAPTAIN' });
    const trainee = await createTrainee({ type: 'CABIN_ATTENDANT', role: 'CABIN_ATTENDANT', fleet: 'CA_DASH_8', phase: 1 });

    const hotcAgent = request.agent(app);
    await loginAgent(hotcAgent, 'hotc.syllabus@test.local');

    const forbidden = request.agent(app);
    await loginAgent(forbidden, 'tc.syllabus@test.local');
    const tcAttempt = await forbidden.post('/api/syllabus/items').send({
      fleet: 'CA_DASH_8', roleScope: 'BOTH', phase: 1, description: 'Should not be allowed',
    });
    expect(tcAttempt.status).toBe(403);

    const created = await hotcAgent.post('/api/syllabus/items').send({
      fleet: 'CA_DASH_8', roleScope: 'BOTH', phase: 1, description: 'Cabin emergency drill',
    });
    expect(created.status).toBe(201);

    const forTrainee = await hotcAgent.get(`/api/syllabus/trainee/${trainee.id}`);
    expect(forTrainee.body.some((item) => item.description === 'Cabin emergency drill')).toBe(true);

    const deleted = await hotcAgent.delete(`/api/syllabus/items/${created.body.id}`);
    expect(deleted.status).toBe(204);
  });
});
