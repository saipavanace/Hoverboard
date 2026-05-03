import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const DEFAULT_LOG_NAME_RE = /\.(log|txt|out)$/i;

/** Filenames accepted for coverage ingest (matches typical report names + loose uploads). */
export function coverageUploadFilename(name) {
  const n = String(name || '').replace(/\\/g, '/');
  if (DEFAULT_LOG_NAME_RE.test(n)) return true;
  return (
    /coverage[_-]?summary\.json$/i.test(n) ||
    /coverage\.json$/i.test(n) ||
    /ucdb[_-]?summary\.txt$/i.test(n) ||
    /coverage[_-]?summary\.txt$/i.test(n) ||
    /functional[_-]?coverage\.txt$/i.test(n) ||
    /code[_-]?coverage\.txt$/i.test(n) ||
    /coverage\.report$/i.test(n)
  );
}

/**
 * Reject zip-slip and absolute paths; return POSIX-style path inside archive or null.
 */
export function safeArchivePath(name) {
  const raw = String(name || '').replace(/\\/g, '/').trim();
  if (!raw) return null;
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return null;
  const norm = path.posix.normalize(raw);
  if (norm.startsWith('..') || norm.includes('/../') || norm === '..') return null;
  return norm;
}

/**
 * Build `{ path, text }` entries from multer-stored files + optional zip.
 * Caller must unlink `tempPaths` after use.
 */
export function collectLogEntriesFromUpload({ logFiles = [], zipFiles = [] }, opts = {}) {
  const maxFiles = opts.maxFiles ?? 80;
  const maxEntryBytes = opts.maxEntryBytes ?? 8 * 1024 * 1024;
  const accept =
    typeof opts.acceptFilename === 'function' ? opts.acceptFilename : (name) => DEFAULT_LOG_NAME_RE.test(name);
  const entries = [];
  const tempPaths = [];

  const appendEntry = (logicalPath, text) => {
    if (entries.length >= maxFiles) return;
    let t = String(text ?? '');
    if (Buffer.byteLength(t, 'utf8') > maxEntryBytes) {
      t = Buffer.from(t, 'utf8').subarray(0, maxEntryBytes).toString('utf8');
    }
    entries.push({ path: logicalPath, text: t });
  };

  for (const f of logFiles) {
    if (!f?.path) continue;
    tempPaths.push(f.path);
    const name = f.originalname || path.basename(f.path);
    if (!accept(name)) continue;
    try {
      const stat = fs.statSync(f.path);
      if (stat.size > maxEntryBytes) {
        const fd = fs.openSync(f.path, 'r');
        const buf = Buffer.alloc(maxEntryBytes);
        fs.readSync(fd, buf, 0, maxEntryBytes, 0);
        fs.closeSync(fd);
        appendEntry(name, buf.toString('utf8'));
      } else {
        appendEntry(name, fs.readFileSync(f.path, 'utf8'));
      }
    } catch {
      /* skip unreadable */
    }
  }

  for (const z of zipFiles) {
    if (!z?.path) continue;
    tempPaths.push(z.path);
    try {
      const buf = fs.readFileSync(z.path);
      const zip = new AdmZip(buf);
      for (const ent of zip.getEntries()) {
        if (entries.length >= maxFiles) break;
        if (ent.isDirectory) continue;
        const safe = safeArchivePath(ent.entryName);
        if (!safe || !accept(safe)) continue;
        const data = ent.getData();
        if (!Buffer.isBuffer(data)) continue;
        const slice = data.length > maxEntryBytes ? data.subarray(0, maxEntryBytes) : data;
        appendEntry(safe, slice.toString('utf8'));
      }
    } catch {
      /* bad zip */
    }
  }

  return { entries, tempPaths };
}

export function unlinkUploadTemps(paths) {
  for (const p of paths || []) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}
