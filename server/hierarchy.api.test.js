import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('teams and manager hierarchy validation', () => {
  let app;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-hier-'));
    process.env.HOVERBOARD_DB_PATH = path.join(dir, 't.sqlite');
    process.env.NODE_ENV = 'test';
    ({ app } = await import('./index.js'));
  });

  it('rejects circular team parent assignment', async () => {
    const pid = 1;
    const a = await request(app).post(`/api/projects/${pid}/teams`).send({ name: 'Team A' });
    expect(a.status).toBe(201);
    const b = await request(app).post(`/api/projects/${pid}/teams`).send({
      name: 'Team B',
      parent_team_id: a.body.id,
    });
    expect(b.status).toBe(201);
    const bad = await request(app).patch(`/api/projects/${pid}/teams/${a.body.id}`).send({
      parent_team_id: b.body.id,
    });
    expect(bad.status).toBe(400);
    expect(String(bad.body.error || '')).toMatch(/circular/i);
  });

  it('rejects circular manager assignment', async () => {
    const list = await request(app).get('/api/admin/users');
    expect(list.status).toBe(200);
    const withIds = list.body.filter((u) => u.id && u.email !== 'system@hoverboard.internal').slice(0, 2);
    if (withIds.length < 2) return;
    const u1 = withIds[0].id;
    const u2 = withIds[1].id;
    await request(app).patch(`/api/admin/users/${u1}`).send({ manager_user_id: null });
    await request(app).patch(`/api/admin/users/${u2}`).send({ manager_user_id: null });
    await request(app).patch(`/api/admin/users/${u1}`).send({ manager_user_id: u2 });
    const bad = await request(app).patch(`/api/admin/users/${u2}`).send({ manager_user_id: u1 });
    expect(bad.status).toBe(400);
    expect(String(bad.body.error || '')).toMatch(/circular/i);
  });
});
