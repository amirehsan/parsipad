import { describe, it, expect } from 'vitest';
import { CARD_LABEL_KEYS, cardLabel } from '../shared/card/labels.js';
import { translations } from '../lib/i18n.js';

describe('card labels', () => {
  it.each(CARD_LABEL_KEYS)('%s exists in both languages', (key) => {
    expect(typeof translations.en[key]).toBe('string');
    expect(translations.en[key].length).toBeGreaterThan(0);
    expect(typeof translations.fa[key]).toBe('string');
    expect(translations.fa[key].length).toBeGreaterThan(0);
  });

  it('returns the localized string', () => {
    expect(cardLabel('cardOtherMeanings', 'en')).toBe('Other meanings');
    expect(cardLabel('cardOtherMeanings', 'fa')).toBe(translations.fa.cardOtherMeanings);
  });

  it('falls back to English for an unknown language', () => {
    expect(cardLabel('cardAlso', 'de')).toBe('Also');
  });

  it('substitutes placeholders', () => {
    const en = cardLabel('cardProviderHint', 'en', { provider: 'Gemini' });
    expect(en).toContain('Gemini');
    expect(en).not.toContain('{provider}');
    const fa = cardLabel('cardProviderHint', 'fa', { provider: 'Gemini' });
    expect(fa).toContain('Gemini');
    expect(fa).not.toContain('{provider}');
  });

  it('leaves an unsubstituted placeholder alone rather than printing undefined', () => {
    expect(cardLabel('cardProviderHint', 'en')).not.toContain('undefined');
  });

  it('returns the key itself for an unknown key, never empty', () => {
    expect(cardLabel('cardNoSuchKey', 'en')).toBe('cardNoSuchKey');
  });
});
