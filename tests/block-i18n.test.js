// tests/block-i18n.test.js
import { describe, it, expect } from 'vitest';
import { translations } from '../lib/i18n.js';

const KEYS = [
  'blockTranslate',
  'blockTranslateHint',
  'blockTranslateIconLabel',
  'blockTranslateDismiss',
  'blockTranslateRetry',
  'blockTranslateTruncated'
];

describe('block translate copy', () => {
  it.each(KEYS)('has an English string for %s', (key) => {
    expect(typeof translations.en[key]).toBe('string');
    expect(translations.en[key].length).toBeGreaterThan(0);
  });

  it.each(KEYS)('has a Persian string for %s', (key) => {
    expect(typeof translations.fa[key]).toBe('string');
    expect(translations.fa[key].length).toBeGreaterThan(0);
  });

  it('does not leave a Persian string identical to its English source', () => {
    for (const key of KEYS) {
      expect(translations.fa[key]).not.toBe(translations.en[key]);
    }
  });
});
