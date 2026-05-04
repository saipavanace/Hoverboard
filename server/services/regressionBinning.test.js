import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  normalizedEditDistance,
  normalizeLineForSignature,
  signatureKeyFromLine,
  binFailures,
  clusterFailureAggregates,
  clampSimilarityThreshold,
  aggregatesFromStoredSignatures,
} from './regressionBinning.js';

describe('regressionBinning', () => {
  it('computes Levenshtein distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('a', 'a')).toBe(0);
  });

  it('computes normalized edit distance in [0,1]', () => {
    expect(normalizedEditDistance('same', 'same')).toBe(0);
    expect(normalizedEditDistance('a', 'b')).toBe(1);
    expect(normalizedEditDistance('ab', 'ba')).toBe(1);
  });

  it('normalizes digits and whitespace like legacy hashing', () => {
    expect(normalizeLineForSignature('FAIL  foo  12 bar')).toBe('FAIL foo # bar');
  });

  it('signatureKeyFromLine matches sha of normalized form', () => {
    const a = signatureKeyFromLine('FAIL err 99');
    const b = signatureKeyFromLine('FAIL err 42');
    expect(a).toBe(b);
  });

  it('threshold 0 bins only identical normalized lines together', () => {
    const lines = ['FAIL typeA err', 'FAIL typeB err', 'FAIL typeA err'];
    const bins = binFailures(lines, { similarityThreshold: 0 });
    expect(bins.length).toBe(2);
    expect(bins.find((b) => b.title.includes('typeA')).total).toBe(2);
  });

  it('threshold 1 merges all distinct lines into one bin', () => {
    const lines = ['FAIL aaa', 'ERROR bbb', 'ASSERT ccc'];
    const bins = binFailures(lines, { similarityThreshold: 1 });
    expect(bins.length).toBe(1);
    expect(bins[0].total).toBe(3);
  });

  it('clusterFailureAggregates merges similar normalized strings', () => {
    const rows = [
      { normalized: 'FAIL uart_timeout #', total: 5, sample: 'FAIL uart_timeout 12' },
      { normalized: 'FAIL uart_timeout # ms', total: 2, sample: 'FAIL uart_timeout 99 ms' },
      { normalized: 'OTHER', total: 1, sample: 'OTHER' },
    ];
    const loose = clusterFailureAggregates(rows, 0.35);
    expect(loose.length).toBeLessThan(3);
    const tight = clusterFailureAggregates(rows, 0);
    expect(tight.length).toBe(3);
  });

  it('clampSimilarityThreshold clamps to [0,1]', () => {
    expect(clampSimilarityThreshold(-1, 0.5)).toBe(0);
    expect(clampSimilarityThreshold(2, 0.5)).toBe(1);
    expect(clampSimilarityThreshold('0.25', 0.5)).toBe(0.25);
  });

  it('aggregatesFromStoredSignatures merges rows that normalize identically', () => {
    const agg = aggregatesFromStoredSignatures([
      { title: 'FAIL err 1', total: 5 },
      { title: 'FAIL err 9', total: 3 },
      { title: 'OTHER', total: 1 },
    ]);
    expect(agg.length).toBe(2);
    const hit = agg.find((r) => r.normalized === normalizeLineForSignature('FAIL err 1'));
    expect(hit?.total).toBe(8);
  });

  it('legacy stored aggregates cluster into one bin at full similarity', () => {
    const agg = aggregatesFromStoredSignatures([
      { title: 'FAIL: aaa', total: 10 },
      { title: 'ERROR: bbb', total: 20 },
      { title: 'panic ccc', total: 7 },
    ]);
    const bins = clusterFailureAggregates(agg, 1);
    expect(bins.length).toBe(1);
    expect(bins[0].total).toBe(37);
  });
});
