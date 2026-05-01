import fs from 'fs';
import path from 'path';

const DEFAULT_VR_REGEX =
  /(?:UVM_INFO|uvm_info|UVM_NOTE)[\s\S]{0,200}?\b(VR[-_]\d{1,8})\b/i;

const FALLBACK_VR_REGEX = /\b(VR[-_]\d{1,8})\b/i;

const DEFAULT_FILES = [/\.log$/i, /\.txt$/i, /\.out$/i];

/** Normalize log tokens (VR_003, VR-3) to canonical DB form VR-00003 */
export function canonicalVrPublicId(raw) {
  const s = String(raw).trim().toUpperCase().replace(/_/g, '-');
  const m = s.match(/^VR-(\d+)$/);
  if (!m) return s;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n)) return s;
  return `VR-${String(n).padStart(5, '0')}`;
}

/**
 * For paths like .../ncore_sys_test_0_0/vcs.log, directory basename is the test run folder.
 * Strips every `0` character from that name per naming convention, then collapses underscores.
 */
export function extractTestNameFromLogPath(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  if (!/\/vcs\.log$/i.test(norm)) {
    return { testRaw: null, testNormalized: null };
  }
  const dir = path.dirname(norm);
  const segment = path.basename(dir);
  const strippedZeros = segment.replace(/0/g, '');
  const testNormalized = strippedZeros.replace(/_+/g, '_').replace(/^_|_$/g, '') || null;
  return { testRaw: segment, testNormalized };
}

export function compileVrRegex(input) {
  if (!input) return null;
  try {
    if (input instanceof RegExp) return input;
    return new RegExp(input, 'i');
  } catch {
    return null;
  }
}

/**
 * Scan a single text and return Map of canonical VR public_id -> hit count.
 * - When `strictUvmInfo` is true, only UVM_INFO-like lines count.
 * - Otherwise also accepts a bare VR reference as a fallback.
 */
export function scanContents(text, opts = {}) {
  const strict = opts.strictUvmInfo !== false;
  const customRe = compileVrRegex(opts.regex);
  const primary = customRe || DEFAULT_VR_REGEX;
  const lines = String(text || '').split(/\r?\n/);
  const found = new Map();
  for (const raw of lines) {
    const line = raw.slice(0, 1200);
    let m = primary.exec(line);
    if (!m && !strict) {
      m = FALLBACK_VR_REGEX.exec(line);
    }
    if (m && m[1]) {
      const id = canonicalVrPublicId(m[1]);
      found.set(id, (found.get(id) || 0) + 1);
    }
  }
  return found;
}

export function scanDirectory(rootDir, opts = {}) {
  const filePatterns = opts.filePatterns?.length ? opts.filePatterns : DEFAULT_FILES;
  const merged = new Map();
  const perFileHits = [];
  walk(rootDir, 0, opts.maxDepth ?? 8, filePatterns, (filePath) => {
    let text = '';
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > (opts.maxBytes ?? 8 * 1024 * 1024)) return;
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
    const found = scanContents(text, opts);
    perFileHits.push({ path: filePath, hits: found });
    for (const [id, n] of found.entries()) {
      merged.set(id, (merged.get(id) || 0) + n);
    }
  });
  return { rootDir, files: perFileHits.length, hits: merged, perFileHits };
}

function walk(dir, depth, maxDepth, filePatterns, onFile) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1, maxDepth, filePatterns, onFile);
    else if (e.isFile() && filePatterns.some((rx) => rx.test(e.name))) onFile(p);
  }
}
