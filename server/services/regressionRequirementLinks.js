import { scanContents, compileVrRegex } from './vrCoverage.js';
import { signatureKeyFromLine } from './regressionBinning.js';
import { compilePatterns, scanLogTextWithLineIndices } from './regressionAdapter.js';

/**
 * For each parser-matched failure line, collect VR/SR/CR/AR tokens from a surrounding line window
 * (same log file). Weak correlation: IDs need not be on the FAIL line itself.
 *
 * @param {Array<{ label: string, text: string }>} entries
 * @param {object} opts
 * @param {unknown} [opts.patterns] regression parser config
 * @param {string} [opts.vrLogRegex] config vrLogRegex (optional filter on qualifying lines)
 * @param {number} [opts.contextLinesBefore]
 * @param {number} [opts.contextLinesAfter]
 * @param {number} [opts.maxLinesPerFile]
 */
export function collectRegressionRequirementPairs(entries, opts = {}) {
  const patterns = compilePatterns(opts.patterns);
  const before = opts.contextLinesBefore ?? 45;
  const after = opts.contextLinesAfter ?? 15;
  const maxLines = opts.maxLinesPerFile ?? 4000;
  const scanOpts = { strictUvmInfo: false, regex: compileVrRegex(opts.vrLogRegex) };

  /** @type {Map<string, Set<string>>} */
  const sigToReqs = new Map();

  function add(sigKey, pubId) {
    if (!sigKey || !pubId) return;
    if (!sigToReqs.has(sigKey)) sigToReqs.set(sigKey, new Set());
    sigToReqs.get(sigKey).add(pubId);
  }

  for (const { text } of entries) {
    const failures = scanLogTextWithLineIndices(text, patterns, { maxLines });
    const lines = String(text || '').split(/\r?\n/);
    for (const { line, lineIndex } of failures) {
      const start = Math.max(0, lineIndex - before);
      const end = Math.min(lines.length, lineIndex + after + 1);
      const windowText = lines.slice(start, end).join('\n');
      const hits = scanContents(windowText, scanOpts);
      const sigKey = signatureKeyFromLine(line);
      for (const pubId of hits.keys()) {
        add(sigKey, pubId);
      }
    }
  }
  return sigToReqs;
}

/**
 * When ingest sends bare failure lines (no file context), only IDs on the failure line count.
 */
export function collectRegressionRequirementPairsFromBareLines(lines, vrLogRegex) {
  const scanOpts = { strictUvmInfo: false, regex: compileVrRegex(vrLogRegex) };
  /** @type {Map<string, Set<string>>} */
  const sigToReqs = new Map();
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    const sigKey = signatureKeyFromLine(line);
    const hits = scanContents(line, scanOpts);
    for (const pubId of hits.keys()) {
      if (!sigToReqs.has(sigKey)) sigToReqs.set(sigKey, new Set());
      sigToReqs.get(sigKey).add(pubId);
    }
  }
  return sigToReqs;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} projectId
 * @param {Map<string, Set<string>>} sigToReqs
 * @param {number} [increment] roll-up weight per ingest batch (default 1)
 */
export function mergeRegressionRequirementLinks(db, projectId, sigToReqs, increment = 1) {
  if (!sigToReqs?.size) return;
  const upsert = db.prepare(`
    INSERT INTO regression_signature_requirements (project_id, signature_key, requirement_public_id, link_count, last_seen_at)
    VALUES (@project_id, @signature_key, @requirement_public_id, @inc, datetime('now'))
    ON CONFLICT(project_id, signature_key, requirement_public_id) DO UPDATE SET
      link_count = regression_signature_requirements.link_count + excluded.link_count,
      last_seen_at = datetime('now')
  `);
  const inc = Math.max(1, Number(increment) || 1);
  const run = db.transaction(() => {
    for (const [sigKey, reqSet] of sigToReqs.entries()) {
      for (const pubId of reqSet) {
        upsert.run({
          project_id: projectId,
          signature_key: sigKey,
          requirement_public_id: pubId,
          inc,
        });
      }
    }
  });
  run();
}
