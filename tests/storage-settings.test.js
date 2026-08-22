import { describe, it, expect, beforeEach, vi } from 'vitest';

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
