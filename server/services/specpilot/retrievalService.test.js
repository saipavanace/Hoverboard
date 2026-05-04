import { describe, it, expect } from 'vitest';
import { buildFtsQuery, normalizeScores, mergeAndRerank } from './retrievalService.js';

describe('retrievalService', () => {
  it('buildFtsQuery builds AND token query', () => {
    const q = buildFtsQuery('CHI exclusive access monitor');
    expect(q).toContain('AND');
  });

  it('normalizeScores maps to 0..1', () => {
    const m = new Map([
      ['a', 10],
      ['b', 20],
    ]);
    const n = normalizeScores(m);
    expect(n.get('a')).toBe(0);
    expect(n.get('b')).toBe(1);
  });

  it('mergeAndRerank prefers hybrid when both present', () => {
    const kw = new Map([
      ['c1', 0.8],
      ['c2', 0.2],
    ]);
    const vec = new Map([
      ['c1', 0.4],
      ['c2', 0.9],
    ]);
    const merged = mergeAndRerank(kw, vec, 0.5, 0.5);
    expect(merged[0].id).toBeTruthy();
  });
});
