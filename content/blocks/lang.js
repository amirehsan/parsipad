/**
 * The interface language for block-translate's own chrome.
 *
 * Held here rather than in index.js so icon.js and render.js can read it
 * without importing index.js, which imports them both back.
 */

import { t } from '../../lib/i18n.js';

let uiLang = 'en';

/** @param {string} lang */
export function setUiLang(lang) {
  uiLang = lang || 'en';
}

/**
 * A label in the user's interface language.
 * @param {string} key
 * @returns {string}
 */
export function label(key) {
  return t(key, uiLang);
}

/**
 * Whether the reader reads Persian, from the interface language or the
 * browser's own.
 *
 * Deliberately one-directional. Knowing someone reads Persian tells us a
 * Persian block needs no translation. Seeing an English interface tells us
 * nothing, because ParsiPad's core case is a Persian speaker reading English
 * with the interface left in English, and suppressing English blocks for them
 * would remove the feature entirely.
 */
export function readsPersian() {
  if (uiLang === 'fa') return true;
  try {
    return String(navigator.language || '').toLowerCase().startsWith('fa');
  } catch {
    return false;
  }
}
