import fs from 'fs';
import path from 'path';

const DEFAULT_VR_REGEX =
  /(?:UVM_INFO|uvm_info|UVM_NOTE)[\s\S]{0,200}?\b(VR-\d{3,8})\b/i;

const FALLBACK_VR_REGEX = /\b(VR-\d{3,8})\b/i;

const DEFAULT_FILES = [/\.log$/i, /\.txt$/i, /\.out$/i];

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
 * Scan a single text and return Set of VR public_ids found.
 * - When `strictUvmInfo` is true, only UVM_INFO-like lines count.
 * - Otherwise also accepts a bare VR-XXXXX reference as a fallback.
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
      const id = m[1].toUpperCase();
      found.set(id, (found.get(id) || 0) + 1);
    }
  }
  return found; // Map<VR-id, hits>
}

export function scanDirectory(rootDir, opts = {}) {
  const filePatterns = opts.filePatterns?.length ? opts.filePatterns : DEFAULT_FILES;
  const merged = new Map();
  const files = [];
  walk(rootDir, 0, opts.maxDepth ?? 8, filePatterns, (filePath) => {
    let text = '';
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > (opts.maxBytes ?? 8 * 1024 * 1024)) return;
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
    files.push(filePath);
    const found = scanContents(text, opts);
    for (const [id, n] of found.entries()) {
      merged.set(id, (merged.get(id) || 0) + n);
    }
  });
  return { rootDir, files: files.length, hits: merged };
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
