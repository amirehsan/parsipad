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
