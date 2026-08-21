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
 * Matches only the English wording, so it is a fallback for paths that
 * still throw plain English errors (dictionary, polish); prefer
 * isMissingApiKeyResponse wherever a response object with errorCode is
 * available, since localized error messages will not match this pattern.
 * @param {string} message
 * @returns {boolean}
 */
export function isMissingApiKeyError(message) {
  return typeof message === 'string' && MISSING_API_KEY_PATTERN.test(message);
}

/**
 * True if the given service worker response is a missing-API-key error.
 * The service worker localizes error messages, so the stable errorCode is
 * the primary signal; the English pattern is kept only as a fallback for
 * responses that carry no errorCode.
 * @param {{error?: string, errorCode?: string}} response
 * @returns {boolean}
 */
export function isMissingApiKeyResponse(response) {
  if (!response) return false;
  if (response.errorCode === 'API_KEY_NOT_SET') return true;
  return isMissingApiKeyError(response.error);
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
