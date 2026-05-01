import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('evidence upload API', () => {
  let app;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-ev-'));
    process.env.HOVERBOARD_DB_PATH = path.join(dir, 't.sqlite');
    process.env.NODE_ENV = 'test';
    ({ app } = await import('./index.js'));
  });

  it('accepts upload, computes SHA-256, lists evidence', async () => {
    const upload = await request(app)
      .post('/api/projects/1/evidence/upload')
      .field('artifact_id', '')
      .attach('file', Buffer.from('hello-evidence'), 'sample.txt');
    expect(upload.status).toBe(201);
    expect(upload.body.file_hash).toMatch(/^[a-f0-9]{64}$/);

    const list = await request(app).get('/api/projects/1/evidence');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((r) => r.file_hash === upload.body.file_hash)).toBe(true);
  });
});
