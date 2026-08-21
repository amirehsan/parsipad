import { t } from '../../lib/i18n.js';

/**
 * Every label the card can render. The test asserts each one resolves in
 * both interface languages, so adding a key here without translating it
 * fails the suite rather than shipping an English string to a Persian UI.
 */
export const CARD_LABEL_KEYS = Object.freeze([
  'cardOtherMeanings',
  'cardAlso',
  'cardHere',
  'cardNote',
  'cardListen',
  'cardCopy',
  'cardSave',
  'cardReadAsEnglish',
  'cardReadAsPersian',
  'cardSentence',
  'cardExplain',
  'cardSwap',
  'cardClose',
  'cardExpandSource',
  'cardProviderHint',
  'cardSynonyms',
  'cardAntonyms'
]);

/**
 * Localized card label with {name} placeholder substitution.
 * @param {string} key
 * @param {string} lang - interface language
 * @param {Object} [vars] - placeholder values
 * @returns {string}
 */
export function cardLabel(key, lang, vars) {
  const raw = t(key, lang);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  ));
}
