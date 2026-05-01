import { describe, it, expect } from 'vitest';
import {
  classifyLine,
  compilePatterns,
  scanLogText,
} from './regressionAdapter.js';

describe('regressionAdapter', () => {
  it('classifies failure-like lines using default patterns', () => {
    const p = compilePatterns();
    expect(classifyLine('FAIL: timeout in tx', p)).toBe('fail');
    expect(classifyLine('UVM_FATAL: bad state', p)).toBe('fatal');
    expect(classifyLine('OK: passed', p)).toBe(null);
  });

  it('honors custom patterns', () => {
    const p = compilePatterns([{ name: 'crash', regex: 'segfault' }]);
    expect(classifyLine('Got segfault here', p)).toBe('crash');
    expect(classifyLine('FAIL plain', p)).toBe(null);
  });

  it('extracts failures from a multi-line log', () => {
    const text = [
      'INFO start',
      'FAIL: thing',
      'PASS other',
      'ERROR rare',
    ].join('\n');
    const p = compilePatterns();
    const out = scanLogText(text, p);
    expect(out.length).toBe(2);
    expect(out[0]).toMatch(/FAIL/);
    expect(out[1]).toMatch(/ERROR/);
  });
});
