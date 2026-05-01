import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('verifies round-trip', () => {
    const h = hashPassword('secret123');
    expect(h.startsWith('pbkdf2$')).toBe(true);
    expect(verifyPassword('secret123', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
  });
});
