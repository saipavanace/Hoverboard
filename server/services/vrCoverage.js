import fs from 'fs';
import path from 'path';

const REQ_PREFIX = '(?:VR|SR|CR|AR)';

/** Every verification token on a line (used after line qualifies as UVM-style / strict). */
const ID_TOKEN_RE = new RegExp(`\\b(${REQ_PREFIX}[-_]\\d{1,8})\\b`, 'gi');

const FALLBACK_VR_REGEX = new RegExp(`\\b(${REQ_PREFIX}[-_]\\d{1,8})\\b`, 'i');

const UVM_LINE_QUALIFIER = /(?:UVM_INFO|uvm_info|UVM_NOTE)/i;

const DEFAULT_FILES = [/\.log$/i, /\.txt$/i, /\.out$/i];

/**
 * Normalize log tokens (VR_003, SR-3, CR_001) to canonical PREFIX-00003.
 */
export function canonicalRequirementPublicId(raw) {
  const s = String(raw).trim().toUpperCase().replace(/_/g, '-');
  const m = s.match(/^(VR|SR|CR|AR)-(\d+)$/);
  if (!m) return s;
  const n = parseInt(m[2], 10);
  if (Number.isNaN(n)) return s;
  return `${m[1]}-${String(n).padStart(5, '0')}`;
}

/** @deprecated use canonicalRequirementPublicId */
export function canonicalVrPublicId(raw) {
  return canonicalRequirementPublicId(raw);
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

/** All capture-group-1 matches on a line (regex must define one capture for the id token). */
function matchAllIdCaptures(line, regex) {
  if (!regex) return [];
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const re = new RegExp(regex.source, flags);
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function strictLineQualifies(line, customRe) {
  if (customRe) {
    const flags = customRe.flags.replace(/g/g, '');
    return new RegExp(customRe.source, flags).test(line);
  }
  return UVM_LINE_QUALIFIER.test(line);
}

/**
 * Scan a single text and return Map of canonical requirement public_id -> hit count.
 * - When `strictUvmInfo` is true, only lines matching the configured pattern (or UVM_INFO) are scanned;
 *   then every VR/SR/CR/AR token on that line is counted.
 * - Otherwise every line is scanned for id tokens; if none, a single fallback match is tried per line.
 */
export function scanContents(text, opts = {}) {
  const strict = opts.strictUvmInfo !== false;
  const customRe = compileVrRegex(opts.regex);
  const lines = String(text || '').split(/\r?\n/);
  const found = new Map();
  for (const raw of lines) {
    const line = raw.slice(0, 1200);
    if (strict && !strictLineQualifies(line, customRe)) continue;

    let caps = matchAllIdCaptures(line, ID_TOKEN_RE);
    if (!caps.length && !strict) {
      const m = FALLBACK_VR_REGEX.exec(line);
      if (m?.[1]) caps = [m[1]];
    }
    for (const cap of caps) {
      const id = canonicalRequirementPublicId(cap);
      found.set(id, (found.get(id) || 0) + 1);
    }
  }
  return found;
}

/**
 * @param {Array<{ path: string, text: string }>} entries
 */
export function scanRequirementLogsFromTexts(entries, opts = {}) {
  const merged = new Map();
  const perFileHits = [];
  const maxB = opts.maxBytes ?? 8 * 1024 * 1024;
  for (const { path: filePath, text: rawText } of entries) {
    let text = String(rawText ?? '');
    if (Buffer.byteLength(text, 'utf8') > maxB) {
      text = Buffer.from(text, 'utf8').subarray(0, maxB).toString('utf8');
    }
    const found = scanContents(text, opts);
    perFileHits.push({ path: filePath, hits: found });
    for (const [id, n] of found.entries()) {
      merged.set(id, (merged.get(id) || 0) + n);
    }
  }
  const label = opts.sourceLabel ?? 'upload';
  return { rootDir: label, files: perFileHits.length, hits: merged, perFileHits };
}

export function scanDirectory(rootDir, opts = {}) {
  const filePatterns = opts.filePatterns?.length ? opts.filePatterns : DEFAULT_FILES;
  const entries = [];
  walk(rootDir, 0, opts.maxDepth ?? 8, filePatterns, (filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > (opts.maxBytes ?? 8 * 1024 * 1024)) return;
      const text = fs.readFileSync(filePath, 'utf8');
      entries.push({ path: filePath, text });
    } catch {
      /* skip */
    }
  });
  return scanRequirementLogsFromTexts(entries, { ...opts, sourceLabel: rootDir });
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
