import crypto from 'crypto';

/** Max distinct normalized lines to cluster with full pairwise comparison (guards CPU). */
export const MAX_CLUSTER_DISTINCT = 4000;

/**
 * Normalize failure line for stable comparison (digits → #, collapse whitespace).
 */
export function normalizeLineForSignature(line) {
  const trimmed = (line || '').trim();
  return trimmed.replace(/\d+/g, '#').replace(/\s+/g, ' ');
}

/**
 * Minimum edit operations to transform a into b (insert/delete/substitute).
 */
export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  /** @type {number[]} */
  let prev = new Array(n + 1);
  /** @type {number[]} */
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const sc = s.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[n];
}

/**
 * Normalized edit distance in [0, 1]: edits / max(lengths).
 */
export function normalizedEditDistance(a, b) {
  const la = String(a).length;
  const lb = String(b).length;
  const den = Math.max(la, lb, 1);
  return levenshtein(a, b) / den;
}

export function signatureKeyFromNormalized(collapsed) {
  return crypto.createHash('sha1').update(collapsed).digest('hex').slice(0, 16);
}

/**
 * Normalize failure line into a stable signature key for binning.
 */
export function signatureKeyFromLine(line) {
  const collapsed = normalizeLineForSignature(line);
  return signatureKeyFromNormalized(collapsed);
}

/** Aggregate raw lines into distinct normalized rows with counts (shared ingest path). */
export function aggregateDistinctFailureLines(lines) {
  /** @type {Map<string, { total: number, sample: string }>} */
  const byNorm = new Map();
  for (const line of lines) {
    if (!line || !String(line).trim()) continue;
    const raw = String(line).trim().slice(0, 400);
    const norm = normalizeLineForSignature(raw);
    if (!norm) continue;
    const cur = byNorm.get(norm);
    if (!cur) byNorm.set(norm, { total: 1, sample: raw });
    else cur.total += 1;
  }
  return [...byNorm.entries()].map(([normalized, v]) => ({
    normalized,
    total: v.total,
    sample: v.sample,
  }));
}

/**
 * Build distinct normalized aggregates from persisted signature rows when `regression_failure_lines` is empty.
 * Used for legacy DBs and demo-seeded data so the similarity slider still applies.
 *
 * @param {Array<{ title?: string, total?: number }>} sigRows
 */
export function aggregatesFromStoredSignatures(sigRows) {
  /** @type {Map<string, { normalized: string, total: number, sample: string }>} */
  const m = new Map();
  for (const s of sigRows) {
    const sample = String(s.title || '').trim().slice(0, 400);
    const norm = normalizeLineForSignature(sample);
    if (!norm) continue;
    const total = Number(s.total) || 0;
    const cur = m.get(norm);
    if (!cur) m.set(norm, { normalized: norm, total, sample: sample || norm });
    else cur.total += total;
  }
  return [...m.values()];
}

class UnionFind {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i);
    this.r = new Array(n).fill(0);
  }
  find(i) {
    if (this.p[i] !== i) this.p[i] = this.find(this.p[i]);
    return this.p[i];
  }
  union(i, j) {
    let a = this.find(i);
    let b = this.find(j);
    if (a === b) return;
    if (this.r[a] < this.r[b]) [a, b] = [b, a];
    this.p[b] = a;
    if (this.r[a] === this.r[b]) this.r[a] += 1;
  }
}

/**
 * Cluster distinct normalized failure rows using single-link union–find:
 * merge when normalized edit distance ≤ threshold.
 *
 * @param {Array<{ normalized: string, total: number, sample: string }>} rows
 * @param {number} threshold 0..1
 * @returns {Array<{ signature_key: string, title: string, total: number, sample: string }>}
 */
function clusterSlicePairwise(slice, threshold) {
  const t = Math.min(1, Math.max(0, Number(threshold) || 0));
  const n = slice.length;
  const norms = slice.map((r) => r.normalized);
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    const ai = norms[i];
    const la = ai.length;
    for (let j = i + 1; j < n; j++) {
      const bj = norms[j];
      const lb = bj.length;
      const maxl = Math.max(la, lb, 1);
      if (Math.abs(la - lb) / maxl > t) continue;
      if (ai === bj || normalizedEditDistance(ai, bj) <= t) {
        uf.union(i, j);
      }
    }
  }

  /** @type {Map<number, number[]>} */
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }

  const bins = [];
  for (const idxs of groups.values()) {
    let repI = idxs[0];
    let best = slice[repI].total;
    for (const idx of idxs) {
      if (slice[idx].total > best) {
        best = slice[idx].total;
        repI = idx;
      }
    }
    const rep = slice[repI];
    let sum = 0;
    for (const idx of idxs) sum += slice[idx].total;
    const key = signatureKeyFromNormalized(rep.normalized);
    bins.push({
      signature_key: key,
      title: rep.sample.slice(0, 200),
      total: sum,
      sample: rep.sample,
    });
  }
  return bins;
}

export function clusterFailureAggregates(rows, threshold) {
  if (!rows.length) return [];

  const sorted = [...rows].sort((a, b) => b.total - a.total || a.normalized.localeCompare(b.normalized));
  const t = Math.min(1, Math.max(0, Number(threshold) || 0));

  if (sorted.length <= MAX_CLUSTER_DISTINCT) {
    const bins = clusterSlicePairwise(sorted, t);
    bins.sort((a, b) => b.total - a.total);
    return bins;
  }

  const head = sorted.slice(0, MAX_CLUSTER_DISTINCT);
  const tail = sorted.slice(MAX_CLUSTER_DISTINCT);
  const headBins = clusterSlicePairwise(head, t);
  const tailBins = tail.map((r) => ({
    signature_key: signatureKeyFromNormalized(r.normalized),
    title: r.sample.slice(0, 200),
    total: r.total,
    sample: r.sample,
  }));
  const bins = [...headBins, ...tailBins];
  bins.sort((a, b) => b.total - a.total);
  return bins;
}

/**
 * Cluster raw failure lines into signature buckets.
 * @param {string[]} lines
 * @param {{ similarityThreshold?: number }} [options] threshold 0..1 (normalized edit distance)
 */
export function binFailures(lines, options = {}) {
  const threshold = options.similarityThreshold ?? 0;
  const rows = aggregateDistinctFailureLines(lines);
  return clusterFailureAggregates(rows, threshold);
}

/**
 * Parse API/config similarity threshold; defaults to config default when invalid.
 */
export function clampSimilarityThreshold(v, fallback = 0) {
  const n = Number(v);
  if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  return fallback;
}
