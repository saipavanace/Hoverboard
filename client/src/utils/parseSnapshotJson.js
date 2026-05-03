import JSON5 from 'json5';

/**
 * Parse admin snapshot / bulk JSON from the textarea.
 * Uses JSON5 so trailing commas, comments, and unquoted keys from hand-editing don’t break Apply.
 */
/** Returns **null** when the editor is blank — do not treat as `{}` or Apply sends empty `{}`. */
export function parseSnapshotJson(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  return JSON5.parse(t);
}

const SNAPSHOT_TOP_KEYS = new Set(['meta', 'config', 'computed', 'tables']);

/**
 * Shape normalisation before PUT /api/admin/full-snapshot — unwraps accidental wrappers and
 * builds **tables** when only row arrays sit at the root (same rules as server).
 */
export function normalizeSnapshotForApply(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof obj !== 'object' || Array.isArray(obj)) return raw;

  for (const key of ['snapshot', 'payload', 'body', 'json', 'data', 'result']) {
    const v = obj[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && (v.tables !== undefined || v.meta !== undefined)) {
      obj = v;
      break;
    }
    if (typeof v === 'string' && v.trim().startsWith('{')) {
      try {
        const inner = JSON5.parse(v);
        if (
          inner &&
          typeof inner === 'object' &&
          !Array.isArray(inner) &&
          (inner.tables !== undefined || inner.meta !== undefined)
        ) {
          obj = inner;
          break;
        }
      } catch {
        /* continue */
      }
    }
  }

  if (obj.tables != null && typeof obj.tables === 'object' && !Array.isArray(obj.tables)) {
    return obj;
  }

  const entries = Object.entries(obj).filter(([k]) => !SNAPSHOT_TOP_KEYS.has(k));
  if (entries.length > 0 && entries.every(([, v]) => Array.isArray(v))) {
    return {
      ...(obj.meta !== undefined ? { meta: obj.meta } : {}),
      ...(obj.config !== undefined ? { config: obj.config } : {}),
      ...(obj.computed !== undefined ? { computed: obj.computed } : {}),
      tables: Object.fromEntries(entries),
    };
  }

  return obj;
}
