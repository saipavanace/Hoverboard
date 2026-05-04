import { describe, it, expect } from 'vitest';
import { parseIntoSections, chunkSections, splitWithOverlap, estimateTokens } from './chunkingService.js';

describe('chunkingService', () => {
  it('splits long sections with overlap', () => {
    const long = 'x'.repeat(5000);
    const parts = splitWithOverlap(long, 800, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBeGreaterThan(0);
  });

  it('parses headings into sections', () => {
    const text = `Intro line\n\n1 Overview\nThis is overview.\n\n2 Details\nMore text here.`;
    const secs = parseIntoSections(text, {});
    expect(secs.length).toBeGreaterThanOrEqual(1);
    expect(estimateTokens('hello')).toBeGreaterThan(0);
  });

  it('chunkSections produces bounded chunks', () => {
    const secs = parseIntoSections('# Title\n\nBody paragraph.\n\n## Sub\nSub content.'.repeat(20), {});
    const chunks = chunkSections('Doc', secs);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].section_path).toBeTruthy();
  });
});
