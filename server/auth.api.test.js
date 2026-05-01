import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('API auth gate', () => {
  let app;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-test-'));
    process.env.HOVERBOARD_DB_PATH = path.join(dir, 't.sqlite');
    process.env.NODE_ENV = 'test';
    ({ app } = await import('./index.js'));
  });

  it('health is public', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
  });

  it('config is public', async () => {
    const r = await request(app).get('/api/config');
    expect(r.status).toBe(200);
  });

  it('specs list allowed when auth is disabled (test env)', async () => {
    const r = await request(app).get('/api/specs');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
