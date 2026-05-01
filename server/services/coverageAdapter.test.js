import { describe, it, expect } from 'vitest';
import { parseContent } from './coverageAdapter.js';

describe('coverageAdapter.parseContent', () => {
  it('extracts numbers from a text report', () => {
    const text = `
      Summary
      Functional coverage: 78.5%
      Code coverage = 64.2%
    `;
    const r = parseContent(text);
    expect(r.functional).toBeCloseTo(78.5, 1);
    expect(r.code).toBeCloseTo(64.2, 1);
  });

  it('reads JSON variants', () => {
    const r = parseContent(JSON.stringify({ functional_coverage: 90, code_coverage: 71.4 }));
    expect(r.functional).toBe(90);
    expect(r.code).toBeCloseTo(71.4, 1);
  });

  it('clamps out-of-range values', () => {
    const r = parseContent('Functional coverage: 142%');
    expect(r.functional).toBe(100);
  });
});
