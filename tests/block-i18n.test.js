// tests/block-i18n.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
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

describe('block translate copy is wired up', () => {
  const root = path.resolve(__dirname, '..');
  const sources = ['content/blocks/icon.js', 'content/blocks/render.js']
    .map((p) => fs.readFileSync(path.join(root, p), 'utf8'))
    .join('\n');

  it.each([
    'blockTranslateIconLabel',
    'blockTranslateDismiss',
    'blockTranslateRetry',
    'blockTranslateTruncated'
  ])('%s is read by the block UI, not just defined', (key) => {
    expect(sources).toContain(key);
  });

  it('leaves no hardcoded English in the block UI', () => {
    expect(sources).not.toContain("'Retry'");
    expect(sources).not.toContain("'Dismiss'");
    expect(sources).not.toContain('Translate this block to Persian');
  });
});
