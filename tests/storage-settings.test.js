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

describe('New Tab panel switches', () => {
  let storage;
  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    storage = await import('../lib/storage.js');
  });

  it('defaults to cards and bookmarks on, most visited off', async () => {
    // Recents is off by default because turning it on requires the optional
    // topSites permission, which is only asked for on an explicit click.
    expect(await storage.getNewTabPanels()).toEqual({
      flashcard: true, bookmarks: true, recents: false
    });
  });

  it('persists one switch without disturbing the others', async () => {
    await storage.setNewTabPanels({ recents: true });
    expect(await storage.getNewTabPanels()).toEqual({
      flashcard: true, bookmarks: true, recents: true
    });
  });

  it('allows every panel to be off', async () => {
    // A user who wants a bare page with just the gradient is entitled to it,
    // so this is a valid state rather than one to clamp away.
    await storage.setNewTabPanels({ flashcard: false, bookmarks: false, recents: false });
    expect(await storage.getNewTabPanels()).toEqual({
      flashcard: false, bookmarks: false, recents: false
    });
  });

  it('ignores a panel name the page cannot render', async () => {
    await storage.setNewTabPanels({ flashcard: false, weather: true });
    const panels = await storage.getNewTabPanels();
    expect(panels).toEqual({ flashcard: false, bookmarks: true, recents: false });
    expect('weather' in panels).toBe(false);
  });

  it('falls back to defaults for a corrupt or half-written value', async () => {
    await chrome.storage.local.set({ newtab_panels: 'not an object' });
    expect(await storage.getNewTabPanels()).toEqual({
      flashcard: true, bookmarks: true, recents: false
    });
    await chrome.storage.local.set({ newtab_panels: { flashcard: 'yes' } });
    expect(await storage.getNewTabPanels()).toEqual({
      flashcard: true, bookmarks: true, recents: false
    });
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

  it('names every accepted prefix when a key matches none of them', async () => {
    await expect(storage.setProviderApiKey(PROVIDERS.GEMINI, 'not-a-key'))
      .rejects.toThrow(/"AIza" or "AQ\."/);
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
      .rejects.toThrow(/"sk-ant-"/);
    await expect(storage.setProviderApiKey(PROVIDERS.OPENAI, 'AQ.AbPlaceholderValue'))
      .rejects.toThrow(/"sk-"/);
  });
});
