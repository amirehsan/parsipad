// tests/block-lang.test.js
import { describe, it, expect } from 'vitest';
import { setUiLang, label, readsPersian } from '../content/blocks/lang.js';

describe('block translate labels', () => {
  it('falls back to English by default', () => {
    setUiLang('en');
    expect(label('blockTranslateRetry')).toBe('Retry');
  });

  it('returns Persian once the interface language is Persian', () => {
    setUiLang('fa');
    const fa = label('blockTranslateRetry');
    expect(fa).not.toBe('Retry');
    expect(fa.length).toBeGreaterThan(0);
    setUiLang('en');
  });

  it('treats an unknown language as English rather than throwing', () => {
    setUiLang('zz');
    expect(label('blockTranslateRetry')).toBe('Retry');
    setUiLang('en');
  });
});

describe('readsPersian', () => {
  it('reports Persian readership from the interface language', () => {
    setUiLang('fa');
    expect(readsPersian()).toBe(true);
    setUiLang('en');
  });
});
