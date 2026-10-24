// tests/i18n-keys.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * Keys that a page's markup depends on. A label and the hint under it once
 * shared one key, so applyTranslations wrote the same sentence into both.
 */
const rootDir = path.resolve(__dirname, '..');
const settingsHtml = fs.readFileSync(path.join(rootDir, 'settings/settings.html'), 'utf8');

function expectInBothLocales(keys) {
  for (const key of keys) {
    expect(translations.en[key], `en.${key}`).toBeTruthy();
    expect(translations.fa[key], `fa.${key}`).toBeTruthy();
  }
}

describe('settings dictionary card', () => {
  it('label and hint use different keys that exist in both locales', () => {
    expectInBothLocales(['translateEnToFa', 'translateEnToFaHint', 'translateFaToEn', 'translateFaToEnHint']);
    expect(translations.en.translateEnToFa).not.toBe(translations.en.translateEnToFaHint);
    expect(translations.en.translateFaToEn).not.toBe(translations.en.translateFaToEnHint);
    expect(settingsHtml).toMatch(/class="toggle-hint" data-i18n="translateEnToFaHint"/);
    expect(settingsHtml).toMatch(/class="toggle-hint" data-i18n="translateFaToEnHint"/);
  });
});

