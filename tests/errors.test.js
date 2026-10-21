import { describe, it, expect } from 'vitest';
import { ERROR_CODES, TranslationError, toTranslationError, errorI18nKey, isContextInvalidated } from '../lib/translation/errors.js';

describe('TranslationError', () => {
  it('keeps a known code and a default message', () => {
    const err = new TranslationError('TRUNCATED');
    expect(err.code).toBe(ERROR_CODES.TRUNCATED);
    expect(err.message).toMatch(/cut off/i);
    expect(err).toBeInstanceOf(Error);
  });

  it('falls back to UNKNOWN for unknown codes but keeps the message', () => {
    const err = new TranslationError('NOPE', 'custom text');
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('custom text');
  });

  it('maps fetch failures to NETWORK', () => {
    expect(toTranslationError(new Error('Failed to fetch')).code).toBe('NETWORK');
  });

  it('maps timeouts to TIMEOUT', () => {
    const dom = new DOMException('Request timed out', 'TimeoutError');
    expect(toTranslationError(dom).code).toBe('TIMEOUT');
    expect(toTranslationError(new Error('request timed out')).code).toBe('TIMEOUT');
  });

  it('maps aborts to ABORTED', () => {
    expect(toTranslationError(new DOMException('Aborted', 'AbortError')).code).toBe('ABORTED');
  });

  // Chrome's exact wording, as a content script left behind by an extension
  // reload sees it. Retrying cannot clear this one, so it needs its own code
  // rather than landing in UNKNOWN with the raw string on display.
  it('maps an invalidated extension context to its own code', () => {
    const err = new Error('Extension context invalidated.');
    expect(isContextInvalidated(err)).toBe(true);
    expect(toTranslationError(err).code).toBe('CONTEXT_INVALIDATED');
  });

  it('does not mistake other failures for an invalidated context', () => {
    expect(isContextInvalidated(new Error('Failed to fetch'))).toBe(false);
    expect(isContextInvalidated(null)).toBe(false);
    expect(isContextInvalidated(undefined)).toBe(false);
    expect(toTranslationError(new Error('Failed to fetch')).code).toBe('NETWORK');
  });

  it('passes TranslationError through unchanged', () => {
    const original = new TranslationError('RATE_LIMITED');
    expect(toTranslationError(original)).toBe(original);
  });

  it('wraps anything else as UNKNOWN with the original message', () => {
    const err = toTranslationError(new Error('boom'));
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('boom');
  });

  it('derives i18n keys from codes', () => {
    expect(errorI18nKey('TRUNCATED')).toBe('errorTruncated');
    expect(errorI18nKey('INVALID_API_KEY')).toBe('errorInvalidApiKey');
    expect(errorI18nKey('WHATEVER')).toBe('errorUnknown');
  });
});
