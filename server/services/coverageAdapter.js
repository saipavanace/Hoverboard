import fs from 'fs';
import path from 'path';

const DEFAULT_FILES = [
  /coverage[_-]?summary\.json$/i,
  /coverage\.json$/i,
  /ucdb[_-]?summary\.txt$/i,
  /coverage[_-]?summary\.txt$/i,
  /functional[_-]?coverage\.txt$/i,
  /code[_-]?coverage\.txt$/i,
  /coverage\.report$/i,
];

const DEFAULT_REGEX = {
  functional: [
    /functional\s*coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
    /\bfcov\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
    /\bfunctional\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
  ],
  code: [
    /code\s*coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
    /\bccov\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
    /\boverall\s*coverage\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i,
  ],
};

export function compileRegex(map) {
  const out = { functional: [], code: [] };
  const m = map || {};
  for (const k of Object.keys(out)) {
    const list = Array.isArray(m[k]) && m[k].length ? m[k] : DEFAULT_REGEX[k];
    out[k] = list
      .map((s) => {
        try {
          return s instanceof RegExp ? s : new RegExp(s, 'i');
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  return out;
}

export function parseContent(text, regexMap) {
  const r = compileRegex(regexMap);
  const result = { functional: null, code: null };

  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const j = JSON.parse(trimmed);
      const pick = (obj, keys) => {
        for (const k of keys) {
          if (obj && obj[k] != null && !Number.isNaN(Number(obj[k]))) return Number(obj[k]);
        }
        return null;
      };
      const fc = pick(j, ['functional_coverage', 'functionalCoverage', 'fcov', 'functional']);
      const cc = pick(j, ['code_coverage', 'codeCoverage', 'ccov', 'code']);
      if (fc != null) result.functional = clamp(fc);
      if (cc != null) result.code = clamp(cc);
      if (result.functional != null || result.code != null) return result;
    } catch {
      /* fall through */
    }
  }

  for (const re of r.functional) {
    const m = trimmed.match(re);
    if (m) {
      result.functional = clamp(Number(m[1]));
      break;
    }
  }
  for (const re of r.code) {
    const m = trimmed.match(re);
    if (m) {
      result.code = clamp(Number(m[1]));
      break;
    }
  }
  return result;
}

/**
 * @param {Array<{ label: string, text: string }>} entries
 */
export function scanCoverageFromTexts(entries, opts = {}) {
  const regexMap = opts.regex || DEFAULT_REGEX;
  const matches = [];
  const maxB = opts.maxBytes ?? 2 * 1024 * 1024;
  for (const { label: filePath, text: rawText } of entries) {
    let text = String(rawText ?? '');
    if (Buffer.byteLength(text, 'utf8') > maxB) {
      text = Buffer.from(text, 'utf8').subarray(0, maxB).toString('utf8');
    }
    const v = parseContent(text, regexMap);
    if (v.functional != null || v.code != null) matches.push({ filePath, ...v });
  }
  const functional = pickAverage(matches, 'functional');
  const code = pickAverage(matches, 'code');
  const src = opts.sourceLabel ?? 'upload';
  return { rootDir: src, files: matches.length, functional, code, matches };
}

export function scanCoverageDirectory(rootDir, opts = {}) {
  const filePatterns = opts.filePatterns?.length ? opts.filePatterns : DEFAULT_FILES;
  const entries = [];
  walk(rootDir, 0, opts.maxDepth ?? 8, filePatterns, (filePath) => {
    let text = '';
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 2 * 1024 * 1024) return;
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
    entries.push({ label: filePath, text });
  });
  return scanCoverageFromTexts(entries, { ...opts, sourceLabel: rootDir });
}

function clamp(n) {
  if (Number.isNaN(n)) return null;
  if (n > 100) return 100;
  if (n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function pickAverage(matches, key) {
  const vals = matches.map((m) => m[key]).filter((x) => x != null);
  if (!vals.length) return null;
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length);
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
