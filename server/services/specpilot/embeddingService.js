import { db } from '../../db.js';
import { getSpecpilotEnv } from './config.js';
import { generateEmbedding, generateEmbeddings } from './llmProvider.js';

function vecToBlob(vec) {
  const f32 = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) f32[i] = vec[i];
  return Buffer.from(f32.buffer);
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/**
 * Embed chunks that are missing embeddings or have stale content hash.
 * @param {string[]} chunkIds
 */
export async function embedChunkIds(chunkIds) {
  const env = getSpecpilotEnv();
  if (!env.embeddingKey || !chunkIds.length) return { embedded: 0, skipped: chunkIds.length };

  const sel = db.prepare(`SELECT id, text, content_hash FROM specpilot_chunks WHERE id = ?`);
  const existing = db.prepare(`SELECT content_hash FROM spec_chunk_embeddings WHERE chunk_id = ?`);
  const upsert = db.prepare(`
    INSERT INTO spec_chunk_embeddings (chunk_id, embedding, dim, model_name, content_hash, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(chunk_id) DO UPDATE SET
      embedding = excluded.embedding,
      dim = excluded.dim,
      model_name = excluded.model_name,
      content_hash = excluded.content_hash,
      created_at = datetime('now')
  `);

  const need = [];
  for (const id of chunkIds) {
    const row = sel.get(id);
    if (!row) continue;
    const prev = existing.get(id);
    if (prev?.content_hash === row.content_hash) continue;
    need.push(row);
  }

  if (!need.length) return { embedded: 0, skipped: chunkIds.length };

  const batchSize = 16;
  let embedded = 0;
  for (let i = 0; i < need.length; i += batchSize) {
    const batch = need.slice(i, i + batchSize);
    const texts = batch.map((r) => r.text);
    const vectors = await generateEmbeddings(texts);
    for (let j = 0; j < batch.length; j++) {
      const vec = vectors[j];
      upsert.run(
        batch[j].id,
        vecToBlob(vec),
        vec.length,
        env.embeddingModel,
        batch[j].content_hash
      );
      embedded++;
    }
  }
  return { embedded, skipped: chunkIds.length - embedded };
}
