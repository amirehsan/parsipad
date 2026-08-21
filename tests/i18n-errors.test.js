import { describe, it, expect } from 'vitest';
import { translations, t } from '../lib/i18n.js';
import { ERROR_CODES, errorI18nKey } from '../lib/translation/errors.js';

describe('i18n coverage for the translation core', () => {
  const keys = [...Object.keys(ERROR_CODES).map(errorI18nKey), 'translateOtherLanguages', 'enableTranslateOtherLanguages', 'translateOtherLanguagesHint'];
  it.each(keys)('%s exists in English and Persian', (key) => {
    expect(typeof translations.en[key]).toBe('string');
    expect(typeof translations.fa[key]).toBe('string');
    expect(t(key, 'fa')).not.toBe(key);
  });
});
