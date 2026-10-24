import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEYS, PROVIDERS } from '../lib/constants.js';

function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return data.has(key) ? { [key]: data.get(key) } : {}; },
        async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, v); },
        async remove(key) { data.delete(key); }
      }
    }
  };
}

describe('translateOtherLanguages setting', () => {
  let storage;
  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    storage = await import('../lib/storage.js');
  });
  it('defaults to true and persists changes', async () => {
    expect(await storage.getTranslateOtherLanguages()).toBe(true);
    await storage.setTranslateOtherLanguages(false);
    expect(await storage.getTranslateOtherLanguages()).toBe(false);
  });
});

describe('block translate setting', () => {
  it('registers a storage key', () => {
    expect(STORAGE_KEYS.blockTranslate).toBe('block_translate_enabled');
  });
});

describe('provider API key formats', () => {
  let storage;
  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    storage = await import('../lib/storage.js');
  });

  // Google AI Studio has moved from "AIza" keys to newer "AQ." authentication
  // keys, and issues either one depending on the account, so a key of either
  // shape has to save rather than being turned away as malformed.
  it('accepts both shapes of Gemini key', async () => {
    await storage.setProviderApiKey(PROVIDERS.GEMINI, 'AIzaSyPlaceholderValue');
    expect(await storage.getProviderApiKey(PROVIDERS.GEMINI)).toBe('AIzaSyPlaceholderValue');

    await storage.setProviderApiKey(PROVIDERS.GEMINI, 'AQ.AbPlaceholderValue');
    expect(await storage.getProviderApiKey(PROVIDERS.GEMINI)).toBe('AQ.AbPlaceholderValue');
  });

  // The UI localizes this from the code and prefixes; the message is for logs.
  it('names every accepted prefix when a key matches none of them', async () => {
    await expect(storage.setProviderApiKey(PROVIDERS.GEMINI, 'not-a-key'))
      .rejects.toMatchObject({ code: 'INVALID_KEY_FORMAT', prefixes: ['AIza', 'AQ.'] });
    expect(await storage.getProviderApiKey(PROVIDERS.GEMINI)).toBeNull();
  });

  // Keys get pasted out of .env files and code samples, quotes and all.
  it('tidies a pasted key before validating and storing it', async () => {
    await storage.setProviderApiKey(PROVIDERS.GEMINI, '  "AQ.AbPlaceholderValue"  ');
    expect(await storage.getProviderApiKey(PROVIDERS.GEMINI)).toBe('AQ.AbPlaceholderValue');

    await storage.setProviderApiKey(PROVIDERS.CLAUDE, "'sk-ant-placeholder'");
    expect(await storage.getProviderApiKey(PROVIDERS.CLAUDE)).toBe('sk-ant-placeholder');
  });

  it('still holds the other providers to their own prefix', async () => {
    await expect(storage.setProviderApiKey(PROVIDERS.CLAUDE, 'AIzaSyPlaceholderValue'))
      .rejects.toMatchObject({ code: 'INVALID_KEY_FORMAT', prefixes: ['sk-ant-'] });
    await expect(storage.setProviderApiKey(PROVIDERS.OPENAI, 'AQ.AbPlaceholderValue'))
      .rejects.toMatchObject({ code: 'INVALID_KEY_FORMAT', prefixes: ['sk-'] });
  });
});

describe('practice session size', () => {
  let storage;
  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    storage = await import('../lib/storage.js');
  });

  it('defaults to ten cards', async () => {
    expect(await storage.getPracticeSessionSize()).toBe(10);
  });

  it('stores the size clamped to the range and returns what it stored', async () => {
    expect(await storage.setPracticeSessionSize(2)).toBe(5);
    expect(await storage.getPracticeSessionSize()).toBe(5);
    expect(await storage.setPracticeSessionSize(99)).toBe(30);
    expect(await storage.getPracticeSessionSize()).toBe(30);
    expect(await storage.setPracticeSessionSize('x')).toBe(10);
    expect(await storage.getPracticeSessionSize()).toBe(10);
    await storage.setPracticeSessionSize(17);
    expect(await chrome.storage.local.get(STORAGE_KEYS.practiceSessionSize)).toEqual({ practice_session_size: 17 });
  });

  it('reads a corrupt stored value as the default', async () => {
    await chrome.storage.local.set({ practice_session_size: 'lots' });
    expect(await storage.getPracticeSessionSize()).toBe(10);
  });
});
