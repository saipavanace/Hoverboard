import { describe, it, expect } from 'vitest';
import {
  collectRegressionRequirementPairs,
  collectRegressionRequirementPairsFromBareLines,
} from './regressionRequirementLinks.js';

describe('regressionRequirementLinks', () => {
  it('finds VR/SR/CR/AR tokens in context window around a FAIL line', () => {
    const text = [
      'UVM_INFO tb.sv(10) checking VR-00007 status',
      'INFO misc',
      'FAIL: burst length mismatch at fifo',
      'UVM_FATAL wrapper',
    ].join('\n');
    const map = collectRegressionRequirementPairs(
      [{ label: 't.log', text }],
      {
        patterns: [{ name: 'fail', regex: 'FAIL\\b' }],
        vrLogRegex: null,
        contextLinesBefore: 5,
        contextLinesAfter: 2,
      }
    );
    const keys = [...map.keys()];
    expect(keys.length).toBeGreaterThan(0);
    const set = map.get(keys[0]);
    expect(set?.has('VR-00007')).toBe(true);
  });

  it('extracts IDs from bare failure lines only', () => {
    const map = collectRegressionRequirementPairsFromBareLines(
      ['FAIL: timeout SR-00003 exceeded', 'ERROR x AR-00001 y'],
      null
    );
    let foundSr = false;
    let foundAr = false;
    for (const s of map.values()) {
      if (s.has('SR-00003')) foundSr = true;
      if (s.has('AR-00001')) foundAr = true;
    }
    expect(foundSr).toBe(true);
    expect(foundAr).toBe(true);
  });
});
