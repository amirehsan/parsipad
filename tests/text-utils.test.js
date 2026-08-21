import { describe, it, expect } from 'vitest';
import { isMissingApiKeyError, isMissingApiKeyResponse } from '../content/utils/text.js';

describe('isMissingApiKeyError', () => {
  it('matches the English "not configured" wording', () => {
    expect(isMissingApiKeyError('API key not configured')).toBe(true);
  });
  it('matches the English "not set" wording', () => {
    expect(isMissingApiKeyError('API key not set. Please configure it in settings.')).toBe(true);
  });
  it('does not match unrelated messages', () => {
    expect(isMissingApiKeyError('Network error, please try again')).toBe(false);
  });
  it('does not match non-string input', () => {
    expect(isMissingApiKeyError(undefined)).toBe(false);
    expect(isMissingApiKeyError(null)).toBe(false);
  });
});

describe('isMissingApiKeyResponse', () => {
  it('matches on errorCode alone, the primary signal', () => {
    expect(isMissingApiKeyResponse({ error: 'something unrelated', errorCode: 'API_KEY_NOT_SET' })).toBe(true);
  });
  it('falls back to the English pattern when errorCode is absent', () => {
    expect(isMissingApiKeyResponse({ error: 'API key not configured' })).toBe(true);
  });
  it('matches a localized Persian message when the code is present', () => {
    const response = {
      error: 'کلید API تنظیم نشده است. آن را در تنظیمات وارد کنید.',
      errorCode: 'API_KEY_NOT_SET'
    };
    expect(isMissingApiKeyResponse(response)).toBe(true);
  });
  it('does not match a plain unrelated error', () => {
    expect(isMissingApiKeyResponse({ error: 'Network error, please try again', errorCode: 'NETWORK' })).toBe(false);
  });
  it('does not match a localized error for a different code', () => {
    expect(isMissingApiKeyResponse({ error: 'خطای شبکه', errorCode: 'NETWORK' })).toBe(false);
  });
  it('handles a missing or empty response', () => {
    expect(isMissingApiKeyResponse(undefined)).toBe(false);
    expect(isMissingApiKeyResponse(null)).toBe(false);
    expect(isMissingApiKeyResponse({})).toBe(false);
  });
});
