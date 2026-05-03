import { describe, it, expect } from 'vitest';
import { getToolVersion, getToolVersionMeta } from './toolVersion.js';

describe('toolVersion', () => {
  it('returns a non-empty version from server package.json', () => {
    const v = getToolVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('parses beta prerelease and phase', () => {
    const m = getToolVersionMeta();
    expect(m.version).toBeTruthy();
    expect(['beta', 'alpha', 'rc', 'prerelease', 'pre-1.0', 'stable']).toContain(m.phase);
  });
});
