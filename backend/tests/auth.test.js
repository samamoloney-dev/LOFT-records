import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/server.js';
import { createUser, loginAgent, PASSWORD } from './helpers.js';

describe('auth', () => {
  it('logs in with correct credentials and rejects wrong password', async () => {
    await createUser({ email: 'hotc@test.local', role: 'HOTC' });

    const ok = await request(app).post('/api/auth/login').send({ email: 'hotc@test.local', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('HOTC');

    const bad = await request(app).post('/api/auth/login').send({ email: 'hotc@test.local', password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    const res = await request(app).get('/api/trainees');
    expect(res.status).toBe(401);
  });

  it('/me returns the session user after login', async () => {
    await createUser({ email: 'hotc2@test.local', role: 'HOTC' });
    const agent = request.agent(app);
    await loginAgent(agent, 'hotc2@test.local');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('hotc2@test.local');
  });
});
