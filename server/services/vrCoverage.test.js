import { describe, it, expect } from 'vitest';
import {
  scanContents,
  canonicalVrPublicId,
  extractTestNameFromLogPath,
} from './vrCoverage.js';

describe('vrCoverage.scanContents', () => {
  it('counts VR ids inside UVM_INFO lines by default', () => {
    const text = [
      'UVM_INFO: starting test for VR-00001 stuff',
      'random VR-00002 outside info',
      'uvm_info path:line VR-00001 again',
    ].join('\n');
    const found = scanContents(text);
    expect(found.get('VR-00001')).toBe(2);
    expect(found.has('VR-00002')).toBe(false);
  });

  it('falls back to plain VR id matches when strict=false', () => {
    const found = scanContents('VR-00099 random line', { strictUvmInfo: false });
    expect(found.get('VR-00099')).toBe(1);
  });

  it('normalizes VR_003 style ids to canonical VR-00003', () => {
    const found = scanContents('UVM_INFO ../ VR_003 done', { strictUvmInfo: false });
    expect(found.get('VR-00003')).toBe(1);
  });
});

describe('canonicalVrPublicId', () => {
  it('pads numeric suffix', () => {
    expect(canonicalVrPublicId('VR_3')).toBe('VR-00003');
    expect(canonicalVrPublicId('VR-003')).toBe('VR-00003');
  });
});

describe('extractTestNameFromLogPath', () => {
  it('uses directory before vcs.log and strips zeros from basename', () => {
    const p = 'debug/cust_tb/hw_d2d_config_01/run/ncore_sys_test_0_0/vcs.log';
    const { testRaw, testNormalized } = extractTestNameFromLogPath(p);
    expect(testRaw).toBe('ncore_sys_test_0_0');
    expect(testNormalized).toBe('ncore_sys_test');
  });
});
