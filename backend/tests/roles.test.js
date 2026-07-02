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
});
