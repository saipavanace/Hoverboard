import { describe, it, expect } from 'vitest';
import { validateAnswerJson, notFoundAnswer, notFoundLlmNotConfiguredAnswer } from './answerValidation.js';

describe('answerValidation', () => {
  it('notFoundAnswer is valid', () => {
    const n = notFoundAnswer();
    const v = validateAnswerJson(n);
    expect(v.ok).toBe(true);
  });

  it('notFoundLlmNotConfiguredAnswer is valid', () => {
    const n = notFoundLlmNotConfiguredAnswer();
    const v = validateAnswerJson(n);
    expect(v.ok).toBe(true);
    expect(n.shortAnswer).toContain('not configured');
  });

  it('rejects bad status', () => {
    const v = validateAnswerJson({ status: 'foo', shortAnswer: 'x', detailedAnswer: 'y' });
    expect(v.ok).toBe(false);
  });
});
