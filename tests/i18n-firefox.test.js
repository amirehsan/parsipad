import { describe, it, expect, afterEach } from 'vitest';
import { translations, t } from '../lib/i18n.js';

/**
 * A handful of strings name Chrome or one of its internal pages, which is
 * wrong in the Firefox build. Each has a `<key>Firefox` variant that t()
 * picks there instead, in both languages.
 */
const VARIANTS = [
  'shortcutNotSetHint', 'shortcutsFixedNote', 'newTabOpenChrome', 'newTabOpenChromeFailed',
  'newTabEnabledHint', 'newTabRecentsHint', 'newTabRecentsDenied'
];

afterEach(() => {
  delete globalThis.chrome;
});

describe('Firefox wording', () => {
  it('has a Firefox variant for every Chrome-specific string, in both languages', () => {
    for (const key of VARIANTS) {
      for (const lang of ['en', 'fa']) {
        expect(translations[lang][`${key}Firefox`], `${lang}.${key}Firefox`).toBeTruthy();
      }
    }
  });

  it('names no Chrome in any Firefox variant', () => {
    for (const lang of ['en', 'fa']) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (key.endsWith('Firefox')) expect(value, `${lang}.${key}`).not.toMatch(/Chrome|chrome:\/\/|کروم/);
      }
    }
  });

  it('overrides only keys that exist', () => {
    for (const lang of ['en', 'fa']) {
      for (const key of Object.keys(translations[lang])) {
        if (key.endsWith('Firefox')) expect(translations.en[key.slice(0, -'Firefox'.length)], key).toBeTruthy();
      }
    }
  });

  it('t() picks the variant only in Firefox', () => {
    globalThis.chrome = { runtime: { getURL: (p = '') => 'moz-extension://abc/' + p } };
    expect(t('newTabOpenChrome', 'fa')).toBe(translations.fa.newTabOpenChromeFirefox);
    expect(t('newTabOpenChrome', 'en')).toBe(translations.en.newTabOpenChromeFirefox);
    // A key without a variant reads the same in both browsers.
    expect(t('translate', 'en')).toBe(translations.en.translate);
    globalThis.chrome.runtime.getURL = (p = '') => 'chrome-extension://abc/' + p;
    expect(t('newTabOpenChrome', 'fa')).toBe(translations.fa.newTabOpenChrome);
  });
});
