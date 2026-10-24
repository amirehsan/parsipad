import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordProviderHealth, getProviderHealth, healthTone, trackProviderCall } from '../lib/provider-health.js';
import { TranslationError, ERROR_CODES } from '../lib/translation/errors.js';
import { translations } from '../lib/i18n.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.chrome = {
    storage: {
      local: {
        get: async (k) => ({ [k]: store.get(k) }),
        set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); }
      }
    }
  };
});

describe('provider health', () => {
  it('records and reads back the latest outcome per provider', async () => {
    await recordProviderHealth('claude', { ok: true, ms: 812 });
    await recordProviderHealth('gemini', { ok: false, code: 'INVALID_API_KEY' });
    expect((await getProviderHealth('claude')).ok).toBe(true);
    expect((await getProviderHealth('gemini')).code).toBe('INVALID_API_KEY');
    expect(await getProviderHealth('openai')).toBeNull();
  });

  it('maps outcomes to a tone', () => {
    expect(healthTone(null)).toBe('unknown');
    expect(healthTone({ ok: true })).toBe('ok');
    expect(healthTone({ ok: false, code: 'RATE_LIMITED' })).toBe('warn');
    expect(healthTone({ ok: false, code: 'TIMEOUT' })).toBe('warn');
    expect(healthTone({ ok: false, code: 'INVALID_API_KEY' })).toBe('error');
  });

  it('keeps simultaneous writes for different providers', async () => {
    await Promise.all([
      recordProviderHealth('claude', { ok: true }),
      recordProviderHealth('gemini', { ok: true }),
      recordProviderHealth('openai', { ok: false, code: 'NETWORK' })
    ]);
    expect(await getProviderHealth('claude')).not.toBeNull();
    expect(await getProviderHealth('gemini')).not.toBeNull();
    expect((await getProviderHealth('openai')).code).toBe('NETWORK');
  });
});

describe('trackProviderCall', () => {
  const provider = { config: { id: 'claude' } };
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('records success with a duration and passes the value through', async () => {
    const value = await trackProviderCall(provider, async () => 'result');
    await settle();
    expect(value).toBe('result');
    const record = await getProviderHealth('claude');
    expect(record.ok).toBe(true);
    expect(typeof record.ms).toBe('number');
  });

  it('records the error code and rethrows the original error', async () => {
    const error = new TranslationError(ERROR_CODES.RATE_LIMITED);
    await expect(trackProviderCall(provider, async () => { throw error; })).rejects.toBe(error);
    await settle();
    expect(await getProviderHealth('claude')).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });

  it('records UNKNOWN for a plain error', async () => {
    await expect(trackProviderCall(provider, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await settle();
    expect((await getProviderHealth('claude')).code).toBe('UNKNOWN');
  });

  it('does not record a cancelled request', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    await expect(trackProviderCall(provider, async () => { throw abort; })).rejects.toBe(abort);
    await settle();
    expect(await getProviderHealth('claude')).toBeNull();
  });

  it('never lets a storage failure change the result or the error', async () => {
    globalThis.chrome.storage.local.get = vi.fn(async () => { throw new Error('storage down'); });
    expect(await trackProviderCall(provider, async () => 'fine')).toBe('fine');
    await expect(trackProviderCall(provider, async () => { throw new Error('real'); })).rejects.toThrow('real');
    await settle();
  });

  it('survives chrome being unavailable', async () => {
    delete globalThis.chrome;
    expect(await trackProviderCall(provider, async () => 'fine')).toBe('fine');
  });

  it('ignores providers without an id', async () => {
    expect(await trackProviderCall({ config: {} }, async () => 'fine')).toBe('fine');
    await settle();
    expect(store.size).toBe(0);
  });
});

describe('badge copy', () => {
  it('has a sentence for every tone in both locales, with the time slot where needed', () => {
    for (const lang of ['en', 'fa']) {
      for (const key of ['providerHealthOk', 'providerHealthWarn', 'providerHealthError', 'providerHealthUnknown']) {
        expect(translations[lang][key], `${lang}.${key}`).toBeTruthy();
      }
      for (const key of ['providerHealthOk', 'providerHealthWarn', 'providerHealthError']) {
        expect(translations[lang][key]).toContain('{ago}');
      }
    }
  });
});
