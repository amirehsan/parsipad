/** Full English language names used inside prompts. */
export const LANGUAGE_NAMES = Object.freeze({
  fa: 'Persian',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  he: 'Hebrew',
  el: 'Greek',
  th: 'Thai',
  hi: 'Hindi',
  ar: 'Arabic',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese'
});

/**
 * @param {string} code
 * @returns {string}
 */
export function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || 'the source language';
}
