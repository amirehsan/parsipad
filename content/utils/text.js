/**
 * Text-related utilities for the ParsiPad content script.
 */

/**
 * Pattern matched against error messages to detect missing API key,
 * so callers can render a consistent toast with a CTA to open Settings.
 */
export const MISSING_API_KEY_PATTERN = /api key (not configured|not set)/i;

/**
 * True if the given error message looks like a missing-API-key error.
 * @param {string} message
 * @returns {boolean}
 */
export function isMissingApiKeyError(message) {
  return typeof message === 'string' && MISSING_API_KEY_PATTERN.test(message);
}

/**
 * Escape a string for safe insertion into HTML.
 * Uses textContent → innerHTML which handles all special characters reliably.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
