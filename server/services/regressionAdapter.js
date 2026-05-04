import fs from 'fs';
import path from 'path';
import { binFailures } from './regressionBinning.js';

const DEFAULT_PATTERNS = [
  { name: 'fail', regex: 'FAIL\\b' },
  { name: 'error', regex: 'ERROR\\b' },
  { name: 'assert', regex: 'ASSERT' },
  { name: 'timeout', regex: 'timeout' },
  { name: 'fatal', regex: 'UVM_FATAL' },
];

const DEFAULT_FILE_PATTERNS = [/\.log$/i, /\.txt$/i, /\.out$/i, /\.summary$/i];

export function compilePatterns(patterns) {
  const list = Array.isArray(patterns) && patterns.length ? patterns : DEFAULT_PATTERNS;
  return list
    .map((p) => {
      try {
        return { name: p.name || 'fail', re: new RegExp(p.regex, 'i') };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function classifyLine(line, patterns) {
  for (const { name, re } of patterns) {
    if (re.test(line)) return name;
  }
  return null;
}

export function scanLogText(text, patterns, opts = {}) {
  const limit = opts.maxLines ?? 5000;
  const lines = String(text || '').split(/\r?\n/);
  const failures = [];
  for (let i = 0; i < lines.length && i < limit; i++) {
    const line = lines[i];
    if (classifyLine(line, patterns)) failures.push(line.trim().slice(0, 400));
  }
  return failures;
}

export function readLogFileSlice(filePath, maxBytes = 5 * 1024 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytes) {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, 0);
      fs.closeSync(fd);
      return buf.toString('utf8');
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * @param {Array<{ label: string, text: string }>} entries — log contents + display labels (paths or archive paths).
 */
export function scanRegressionFromTexts(entries, opts = {}) {
  const patterns = compilePatterns(opts.patterns);
  const failures = [];
  const filesScanned = [];
  const maxLinesPerFile = opts.maxLinesPerFile ?? 4000;
  for (const { label, text } of entries) {
    filesScanned.push(label);
    failures.push(...scanLogText(text, patterns, { maxLines: maxLinesPerFile }));
  }
  const similarityThreshold = opts.similarityThreshold ?? 0;
  const bins = binFailures(failures, { similarityThreshold });
  const sourceLabel = opts.sourceLabel ?? 'upload';
  return {
    rootDir: sourceLabel,
    filesScanned: filesScanned.length,
    failures: failures.length,
    failureLines: failures,
    bins,
  };
}

export function scanRegressionDirectory(rootDir, opts = {}) {
  const filePatterns = opts.filePatterns?.length ? opts.filePatterns : DEFAULT_FILE_PATTERNS;
  const maxFiles = opts.maxFiles ?? 800;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const entries = [];
  walk(rootDir, 0, opts.maxDepth ?? 8, filePatterns, (filePath) => {
    if (entries.length >= maxFiles) return;
    const text = readLogFileSlice(filePath, maxBytes);
    if (!text) return;
    entries.push({ label: filePath, text });
  });
  return scanRegressionFromTexts(entries, { ...opts, sourceLabel: rootDir });
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
    if (e.isDirectory()) {
      walk(p, depth + 1, maxDepth, filePatterns, onFile);
    } else if (e.isFile() && filePatterns.some((rx) => rx.test(e.name))) {
      onFile(p);
    }
  }
}
