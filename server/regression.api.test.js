import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('GET /api/regressions/signatures', () => {
  let app;
  let db;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-reg-'));
    process.env.HOVERBOARD_DB_PATH = path.join(dir, 't.sqlite');
    process.env.NODE_ENV = 'test';
    ({ app } = await import('./index.js'));
    ({ db } = await import('./db.js'));

    const ins = db.prepare(`
      INSERT INTO regression_signatures (signature_key, title, category, class, state, total, trend_json)
      VALUES (@signature_key, @title, 'regression', 'fail', 'OPEN', @total, '[]')
    `);
    ins.run({ signature_key: 'sig_a', title: 'FAIL: alpha line', total: 10 });
    ins.run({ signature_key: 'sig_b', title: 'ERROR: beta line', total: 22 });
    ins.run({ signature_key: 'sig_c', title: 'panic gamma line', total: 8 });
  });

  it('clusters legacy rows into one bucket when similarity=1 (no regression_failure_lines)', async () => {
    const r = await request(app)
      .get('/api/regressions/signatures')
      .query({ similarity: 1 })
      .set('X-Project-Id', '1');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBe(1);
    expect(r.body[0].total).toBe(40);
    expect(r.body[0].legacySignatureCluster).toBe(true);
    expect(r.body[0].similarityThresholdPct).toBe(100);
  });

  it('keeps separate buckets at similarity=0 when titles normalize distinctly', async () => {
    const r = await request(app)
      .get('/api/regressions/signatures')
      .query({ similarity: 0 })
      .set('X-Project-Id', '1');
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(3);
  });
});
