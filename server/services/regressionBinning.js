import crypto from 'crypto';

/**
 * Normalize failure line into a stable signature key for binning.
 */
export function signatureKeyFromLine(line) {
  const trimmed = (line || '').trim();
  const collapsed = trimmed.replace(/\d+/g, '#').replace(/\s+/g, ' ');
  return crypto.createHash('sha1').update(collapsed).digest('hex').slice(0, 16);
}

/**
 * Cluster raw failure lines into signature buckets.
 */
export function binFailures(lines) {
  const buckets = new Map();
  for (const line of lines) {
    if (!line || !String(line).trim()) continue;
    const key = signatureKeyFromLine(line);
    if (!buckets.has(key)) {
      buckets.set(key, { key, title: line.slice(0, 200), lines: [] });
    }
    buckets.get(key).lines.push(line);
  }
  return [...buckets.values()].map((b) => ({
    signature_key: b.key,
    title: b.title,
    total: b.lines.length,
    sample: b.lines[0],
  }));
}
