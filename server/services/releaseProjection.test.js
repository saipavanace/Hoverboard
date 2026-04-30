import { describe, it, expect } from 'vitest';
import { computeReleaseReadiness } from './releaseProjection.js';

describe('computeReleaseReadiness', () => {
  it('returns TBD early phase', () => {
    const r = computeReleaseReadiness(
      {
        passRate: 10,
        functionalCoverage: 10,
        codeCoverage: 10,
        vrCoverage: 10,
        drClosure: 10,
      },
      { passRate: 0.2, functionalCov: 0.2, codeCov: 0.2, vrCov: 0.2, drClosure: 0.2 },
      []
    );
    expect(r.projectedReleaseDate).toBeNull();
    expect(r.projectionNote.toLowerCase()).toContain('early');
  });

  it('raises confidence with stable history', () => {
    const r = computeReleaseReadiness(
      {
        passRate: 90,
        functionalCoverage: 75,
        codeCoverage: 70,
        vrCoverage: 80,
        drClosure: 85,
      },
      { passRate: 0.25, functionalCov: 0.2, codeCov: 0.15, vrCov: 0.15, drClosure: 0.25 },
      [2, 2.1, 2.05, 2, 2.02, 2.03, 2.01]
    );
    expect(r.score).toBeGreaterThan(50);
    expect(r.confidence).toBeGreaterThan(0);
  });
});
