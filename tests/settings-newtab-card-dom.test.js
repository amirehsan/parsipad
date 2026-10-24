// tests/settings-newtab-card-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/settings/settings.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { STORAGE_KEYS } from '../lib/constants.js';
import { translations } from '../lib/i18n.js';

/**
 * The New tab card in Settings > Flashcards, driven through the real markup
 * and settings.js: the page switch, the two panel switches, and Most visited
 * asking Chrome for the optional topSites permission from the click itself.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

let store;

function fakeChrome({ permission = false, grant = false } = {}) {
  const pick = (keys) => {
    if (keys === null || keys === undefined) return Object.fromEntries(store);
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const out = {};
    for (const key of list) if (store.has(key)) out[key] = structuredClone(store.get(key));
    return out;
  };
  return {
    storage: {
      local: {
        get: vi.fn(async (keys) => pick(keys)),
        set: vi.fn(async (items) => { for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v)); }),
        remove: vi.fn(async (keys) => { for (const k of [].concat(keys)) store.delete(k); })
      },
      onChanged: { addListener: vi.fn() }
    },
    runtime: {
      getManifest: () => ({ version: '0.0.0-test' }),
      getURL: (p) => `chrome-extension://parsipad/${p}`,
      sendMessage: vi.fn(async () => ({}))
    },
    permissions: {
      contains: vi.fn(async () => permission),
      request: vi.fn(async () => grant)
    },
    tabs: { create: vi.fn() },
    commands: { getAll: vi.fn(async () => []) }
  };
}

async function loadSettings(lang, seed = {}, chromeOptions) {
  store = new Map([[STORAGE_KEYS.language, lang], ...Object.entries(seed)]);
  globalThis.chrome = fakeChrome(chromeOptions);
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../settings/settings.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect(document.getElementById('about-version').textContent).toBe('0.0.0-test'));
}

const $ = (id) => document.getElementById(id);

beforeEach(() => {
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  delete globalThis.chrome;
});

describe.each(['en', 'fa'])('the New tab card in %s', (lang) => {
  it('sits in Flashcards after the Practice card, with a heading and three labelled switches', async () => {
    await loadSettings(lang);
    const section = $('flashcards');
    const cards = section.querySelectorAll('.settings-card');
    expect(cards).toHaveLength(2);
    expect(cards[1].querySelector('h3.card-title').textContent).toBe(translations[lang].newTabCardTitle);
    for (const id of ['newtab-enabled-toggle', 'newtab-bookmarks-toggle', 'newtab-recents-toggle']) {
      const box = $(id);
      expect(cards[1].contains(box), id).toBe(true);
      expect(document.querySelector(`label[for="${id}"]`).textContent.trim(), id).not.toBe('');
      expect($(box.getAttribute('aria-describedby')).textContent.trim(), id).not.toBe('');
    }
  });

  it('is on by default with the bookmarks button on and Most visited off', async () => {
    await loadSettings(lang);
    expect($('newtab-enabled-toggle').checked).toBe(true);
    expect($('newtab-bookmarks-toggle').checked).toBe(true);
    expect($('newtab-recents-toggle').checked).toBe(false);
  });
});

describe('the New tab switches', () => {
  it('turns the page off and on again', async () => {
    await loadSettings('en');
    $('newtab-enabled-toggle').click();
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.newTabEnabled)).toBe(false));
    $('newtab-enabled-toggle').click();
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.newTabEnabled)).toBe(true));
  });

  it('saves the bookmarks switch without touching Most visited', async () => {
    await loadSettings('en');
    $('newtab-bookmarks-toggle').click();
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.newTabPanels)).toEqual({ bookmarks: false, recents: false }));
  });

  it('asks Chrome for topSites when Most visited is turned on, and keeps it on when granted', async () => {
    await loadSettings('en', {}, { grant: true });
    $('newtab-recents-toggle').click();
    expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ['topSites'] });
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.newTabPanels)).toEqual({ bookmarks: true, recents: true }));
    expect($('newtab-recents-toggle').checked).toBe(true);
    expect($('newtab-recents-status').textContent).toBe('');
  });

  it('turns Most visited back off and says why when the request is denied', async () => {
    await loadSettings('en', {}, { grant: false });
    $('newtab-recents-toggle').click();
    await vi.waitFor(() => expect($('newtab-recents-toggle').checked).toBe(false));
    expect(store.get(STORAGE_KEYS.newTabPanels)?.recents ?? false).toBe(false);
    expect($('newtab-recents-status').textContent).toBe(translations.en.newTabRecentsDenied);
  });

  it('turns Most visited off without asking anything', async () => {
    await loadSettings('en', { [STORAGE_KEYS.newTabPanels]: { bookmarks: true, recents: true } }, { permission: true });
    expect($('newtab-recents-toggle').checked).toBe(true);
    $('newtab-recents-toggle').click();
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.newTabPanels)).toEqual({ bookmarks: true, recents: false }));
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('shows Most visited off when the permission was revoked in Chrome', async () => {
    await loadSettings('en', { [STORAGE_KEYS.newTabPanels]: { bookmarks: true, recents: true } }, { permission: false });
    expect($('newtab-recents-toggle').checked).toBe(false);
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.newTabPanels)).toEqual({ bookmarks: true, recents: false }));
  });

  it('reflects a stored choice to keep the page off', async () => {
    await loadSettings('en', { [STORAGE_KEYS.newTabEnabled]: false });
    expect($('newtab-enabled-toggle').checked).toBe(false);
  });
});
