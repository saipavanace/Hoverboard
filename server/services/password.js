import crypto from 'crypto';

const ITERATIONS = 310000;
const KEYLEN = 32;
const DIGEST = 'sha256';

/** Returns format: pbkdf2$sha256$salt$iterations$hash */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(plain, salt, ITERATIONS, KEYLEN, DIGEST)
    .toString('hex');
  return `pbkdf2$${DIGEST}$${salt}$${ITERATIONS}$${hash}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const [, digest, salt, iterStr, expected] = parts;
  const iterations = Number(iterStr);
  if (!iterations || digest !== DIGEST) return false;
  const hash = crypto.pbkdf2Sync(plain, salt, iterations, KEYLEN, digest).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
