import { describe, it, expect } from 'vitest';
import { scanContents } from './vrCoverage.js';

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
});
