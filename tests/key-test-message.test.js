import { describe, it, expect } from 'vitest';
import { describeKeyTest, keyTestErrorResult, isKeyRejected } from '../lib/key-help.js';
import { translations } from '../lib/i18n.js';
describe('describeKeyTest', () => {
  it('reports success with model and time', () => {
    const r = describeKeyTest({ ok: true, model: 'claude-haiku-5-5', ms: 812 }, 'en', 'claude');
    expect(r.tone).toBe('ok');
    expect(r.text).toContain('claude-haiku-5-5'); expect(r.text).toContain('812');
  });
  it('localizes a provider rejection', () => {
    const r = describeKeyTest({ ok: false, code: 'INVALID_API_KEY' }, 'fa', 'claude');
    expect(r.tone).toBe('error');
    expect(r.text).toMatch(/[؀-ۿ]/);
    expect(r.text).not.toMatch(/INVALID_API_KEY/);
  });
  it('names the expected prefix for a malformed key', () => {
    const r = describeKeyTest({ ok: false, code: 'INVALID_KEY_FORMAT', prefixes: ['sk-ant-'] }, 'en', 'claude');
    expect(r.text).toContain('sk-ant-');
    expect(translations.fa.keyFormatInvalid).toMatch(/\{prefixes\}/);
  });
});

describe('describeKeyTest fills the existing templates', () => {
  it('formats the time in the UI language and keeps the ok template', () => {
    expect(describeKeyTest({ ok: true, model: 'm', ms: 1234 }, 'en', 'claude').text).toBe('Key works. m replied in 1,234 ms.');
  });

  it('puts the localized reason into the keyTestFailed template', () => {
    expect(describeKeyTest({ ok: false, code: 'RATE_LIMITED' }, 'en', 'claude').text)
      .toBe(`Test failed. ${translations.en.errorRateLimited}`);
    expect(describeKeyTest({ ok: false, code: 'RATE_LIMITED' }, 'fa', 'gemini').text)
      .toBe(translations.fa.keyTestFailed.replace('{reason}', translations.fa.errorRateLimited));
  });

  it('names the provider and joins every prefix with a slash', () => {
    const r = describeKeyTest({ ok: false, code: 'INVALID_KEY_FORMAT', prefixes: ['AIza', 'AQ.'] }, 'en', 'gemini');
    expect(r.tone).toBe('error');
    expect(r.text).toBe('Test failed. A Gemini key starts with AIza / AQ., so check that you copied all of it.');
    expect(r.ltr).toEqual(['AIza', 'AQ.']);
  });

  it('falls back to the provider prefixes when the result does not carry them', () => {
    expect(describeKeyTest({ ok: false, code: 'INVALID_KEY_FORMAT' }, 'en', 'openai').text).toContain('A ChatGPT key starts with sk-,');
  });

  it('keeps the provider message for an unknown failure, as testApiKey does', () => {
    expect(describeKeyTest({ ok: false, code: 'UNKNOWN', message: 'model overloaded' }, 'en', 'claude').text)
      .toBe('Test failed. model overloaded');
    expect(describeKeyTest({ ok: false, message: 'no code here' }, 'en', 'claude').text).toBe('Test failed. no code here');
  });

  it('falls back to the unknown error text when there is nothing to say', () => {
    expect(describeKeyTest(undefined, 'fa', 'claude').text).toContain(translations.fa.errorUnknown);
    expect(describeKeyTest({ ok: false, code: 'UNKNOWN' }, 'en', 'claude').text).toContain(translations.en.errorUnknown);
  });

  it('does not treat $ in a model name or message as a replacement pattern', () => {
    expect(describeKeyTest({ ok: false, message: 'cost $& more' }, 'en', 'claude').text).toBe('Test failed. cost $& more');
  });
});

describe('describeKeyTest on the key pages', () => {
  it('says the provider rejected the key instead of pointing at settings', () => {
    for (const lang of ['en', 'fa']) {
      const text = describeKeyTest({ ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' }, lang, 'claude').text;
      expect(text).toBe(translations[lang].keyTestFailed.replace('{reason}', translations[lang].keyRejected));
      expect(text).not.toContain(translations[lang].errorInvalidApiKey);
    }
    expect(translations.en.keyRejected).not.toMatch(/settings/i);
  });

  it('does not end the format sentence right after the prefixes', () => {
    for (const lang of ['en', 'fa']) {
      expect(translations[lang].keyFormatInvalid, lang).toMatch(/\{prefixes\}[^.]/);
    }
  });

  it('reads errorCode and error as well as code and message', () => {
    expect(describeKeyTest({ ok: false, errorCode: 'RATE_LIMITED' }, 'en', 'claude').text).toBe(`Test failed. ${translations.en.errorRateLimited}`);
    expect(describeKeyTest({ ok: false, error: 'from error' }, 'en', 'claude').text).toBe('Test failed. from error');
  });

  it('says a key was saved untested when the test reached no verdict', () => {
    for (const lang of ['en', 'fa']) {
      const r = describeKeyTest({ ok: false, code: 'NETWORK' }, lang, 'claude', { stored: true });
      expect(r.tone).toBe('info');
      expect(r.text).toBe(translations[lang].keySavedUntested.replace('{reason}', translations[lang].errorNetwork));
    }
    expect(translations.en.keySavedUntested).toBe('Saved, but it could not be tested right now: {reason}');
  });
});

describe('isKeyRejected', () => {
  it('is a verdict on the key only for a bad format or a rejected key', () => {
    expect(isKeyRejected({ ok: false, code: 'INVALID_API_KEY' })).toBe(true);
    expect(isKeyRejected({ ok: false, code: 'INVALID_KEY_FORMAT' })).toBe(true);
    expect(isKeyRejected({ ok: false, errorCode: 'INVALID_API_KEY' })).toBe(true);
    for (const code of ['NETWORK', 'TIMEOUT', 'RATE_LIMITED', 'SERVER_ERROR', 'UNKNOWN', undefined]) {
      expect(isKeyRejected({ ok: false, code }), String(code)).toBe(false);
    }
    expect(isKeyRejected({ ok: true, model: 'm', ms: 1 })).toBe(false);
  });
});

describe('keyTestErrorResult', () => {
  it('keeps the code and prefixes of a malformed key', () => {
    const error = Object.assign(new Error('Invalid Claude API key format'), { code: 'INVALID_KEY_FORMAT', prefixes: ['sk-ant-'] });
    expect(keyTestErrorResult(error)).toEqual({ ok: false, code: 'INVALID_KEY_FORMAT', prefixes: ['sk-ant-'] });
  });

  it('turns anything else into an unknown failure that keeps its message', () => {
    expect(keyTestErrorResult(new Error('Could not establish connection'))).toEqual({ ok: false, code: 'UNKNOWN', message: 'Could not establish connection' });
  });
});
