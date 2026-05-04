import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { db } from './db.js';

describe('SpecPilot API (spec versions from Specs tab)', () => {
  let app;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-sp-'));
    process.env.HOVERBOARD_DB_PATH = path.join(dir, 't.sqlite');
    process.env.NODE_ENV = 'test';
    ({ app } = await import('./index.js'));
  });

  it('lists spec versions (may be empty)', async () => {
    const r = await request(app).get('/api/specpilot/spec-versions').set('X-Project-Id', '1');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('reindexes from spec version extracted_text and answers', async () => {
    const specIdentifier = `sp-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`INSERT INTO specs (identifier, name, project_id) VALUES (?, 'Integration Spec', 1)`).run(
      specIdentifier
    );
    const specRow = db.prepare(`SELECT id FROM specs WHERE identifier = ?`).get(specIdentifier);
    db.prepare(
      `
      INSERT INTO spec_versions (spec_id, version, original_filename, mime_type, storage_path, extracted_text, changelog)
      VALUES (?, '1.0', 'sample-spec.txt', 'text/plain', '', ?, '{}')
    `
    ).run(specRow.id, '# A\n\nHello exclusive access requirements.\n'.repeat(15));

    const vid = db.prepare(`SELECT id FROM spec_versions WHERE spec_id = ?`).get(specRow.id).id;

    const rq = await request(app)
      .post(`/api/specpilot/spec-versions/${vid}/reindex`)
      .set('X-Project-Id', '1');
    expect(rq.status).toBe(202);
    expect(rq.body.accepted).toBe(true);

    let ready = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const st = db.prepare(`SELECT status FROM specpilot_documents WHERE spec_version_id = ?`).get(vid);
      if (st?.status === 'ready') {
        ready = true;
        break;
      }
      if (st?.status === 'failed') {
        throw new Error(`reindex failed: ${db.prepare(`SELECT status_message FROM specpilot_documents WHERE spec_version_id = ?`).get(vid)?.status_message}`);
      }
    }
    expect(ready).toBe(true);

    const chunks = db.prepare(`SELECT COUNT(*) AS n FROM specpilot_chunks c JOIN specpilot_documents d ON d.id = c.document_id WHERE d.spec_version_id = ?`).get(vid);
    expect(chunks.n).toBeGreaterThan(0);

    const ask = await request(app)
      .post('/api/specpilot/ask')
      .set('X-Project-Id', '1')
      .send({ question: 'What about exclusive access?', documentIds: [vid] });

    expect(ask.status).toBe(200);
    expect(ask.body.answer?.status).toBeTruthy();
    expect(ask.body.answer?.shortAnswer).toBeTruthy();
  }, 30000);
});
