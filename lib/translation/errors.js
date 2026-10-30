/**
 * Typed errors for the translation pipeline. Every failure that reaches the
 * UI carries a stable code so messages can be localized (see errorI18nKey)
 * and so callers can branch without string matching.
 */

export const ERROR_CODES = Object.freeze({
  EMPTY_INPUT: 'EMPTY_INPUT',
  UNSUPPORTED: 'UNSUPPORTED',
  POLISH_ENGLISH_ONLY: 'POLISH_ENGLISH_ONLY',
  TRUNCATED: 'TRUNCATED',
  PARSE_FAILED: 'PARSE_FAILED',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  API_KEY_NOT_SET: 'API_KEY_NOT_SET',
  CONTEXT_INVALIDATED: 'CONTEXT_INVALIDATED',
  UNKNOWN: 'UNKNOWN'
});

// English fallbacks. The UI prefers the localized string from lib/i18n.js.
const DEFAULT_MESSAGES = {
  EMPTY_INPUT: 'Select or type some text to translate.',
  UNSUPPORTED: 'ParsiPad only supports Persian and English. Please try a different selection.',
  POLISH_ENGLISH_ONLY: 'Polish works on English text only. Use Translate for Persian text.',
  TRUNCATED: 'The translation was cut off. Select a shorter passage or translate in parts.',
  PARSE_FAILED: 'The translation could not be read. Please try again.',
  NETWORK: 'Check your internet connection.',
  TIMEOUT: 'The translation took too long. Please try again.',
  ABORTED: 'Translation cancelled.',
  INVALID_API_KEY: 'Invalid API key. Please check settings.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  SERVER_ERROR: 'Translation service unavailable. Please try again.',
  API_KEY_NOT_SET: 'API key not set. Please configure it in settings.',
  CONTEXT_INVALIDATED: 'ParsiPad was updated. Reload the page to continue.',
  UNKNOWN: 'An unexpected error occurred.'
};

const I18N_KEYS = {
  EMPTY_INPUT: 'errorEmptyInput',
  UNSUPPORTED: 'errorUnsupported',
  POLISH_ENGLISH_ONLY: 'errorPolishEnglishOnly',
  TRUNCATED: 'errorTruncated',
  PARSE_FAILED: 'errorParseFailed',
  NETWORK: 'errorNetwork',
  TIMEOUT: 'errorTimeout',
  ABORTED: 'errorAborted',
  INVALID_API_KEY: 'errorInvalidApiKey',
  RATE_LIMITED: 'errorRateLimited',
  SERVER_ERROR: 'errorServerError',
  API_KEY_NOT_SET: 'errorApiKeyNotSet',
  CONTEXT_INVALIDATED: 'errorContextInvalidated',
  UNKNOWN: 'errorUnknown'
};

export class TranslationError extends Error {
  /**
   * @param {string} code - One of ERROR_CODES; unknown codes become UNKNOWN
   * @param {string} [message] - Optional override (used for provider messages)
   */
  constructor(code, message) {
    const safeCode = ERROR_CODES[code] ? code : ERROR_CODES.UNKNOWN;
    super(message || DEFAULT_MESSAGES[safeCode]);
    this.name = 'TranslationError';
    this.code = safeCode;
  }
}

/**
 * Chrome tears down the extension's context on reload, update or disable, but
 * leaves content scripts from the old version running in already-open pages.
 * Every call they make into the extension throws this from then on, and no
 * amount of retrying brings the context back - only reloading the page does.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isContextInvalidated(error) {
  const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
  return /extension context invalidated/i.test(message);
}

/**
 * Normalize any thrown value into a TranslationError.
 * @param {unknown} error
 * @returns {TranslationError}
 */
export function toTranslationError(error) {
  if (error instanceof TranslationError) return error;
  const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
  const name = error?.name || '';
  if (isContextInvalidated(error)) return new TranslationError(ERROR_CODES.CONTEXT_INVALIDATED);
  if (name === 'AbortError') return new TranslationError(ERROR_CODES.ABORTED);
  if (name === 'TimeoutError' || /timed out|timeout/i.test(message)) return new TranslationError(ERROR_CODES.TIMEOUT);
  if (/failed to fetch|networkerror|network error/i.test(message)) return new TranslationError(ERROR_CODES.NETWORK);
  return new TranslationError(ERROR_CODES.UNKNOWN, message || undefined);
}

/**
 * i18n key for a code (see lib/i18n.js).
 * @param {string} code
 * @returns {string}
 */
export function errorI18nKey(code) {
  return I18N_KEYS[code] || I18N_KEYS.UNKNOWN;
}
