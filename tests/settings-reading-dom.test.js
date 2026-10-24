// tests/settings-reading-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/settings/settings.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { STORAGE_KEYS } from '../lib/constants.js';
import { translations } from '../lib/i18n.js';

/**
 * The Muted sites card in Reading on web pages, driven through the real
 * markup and settings.js with chrome.storage held in memory: chips for the
 * stored hosts, the add form (valid, invalid, already muted), unmuting with
 * focus kept in the list, and a mute made elsewhere showing up live. Also
 * the "Ask before translating a whole page" row, wired but hidden until
 * Plan E reads the preference.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

let store;
let changeListeners;
const pageListeners = [];

function detachPage() {
  for (const [type, listener, options] of pageListeners.splice(0)) {
    document.removeEventListener(type, listener, options);
  }
}

function fakeChrome() {
  const pick = (keys) => {
    if (keys === null || keys === undefined) return Object.fromEntries(store);
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const out = {};
    for (const key of list) if (store.has(key)) out[key] = store.get(key);
    return out;
  };
  return {
    storage: {
      local: {
        get: vi.fn(async (keys) => pick(keys)),
        set: vi.fn(async (items) => { for (const [k, v] of Object.entries(items)) store.set(k, v); }),
        remove: vi.fn(async (keys) => { for (const k of [].concat(keys)) store.delete(k); })
      },
      onChanged: { addListener: vi.fn((fn) => changeListeners.push(fn)) }
    },
    runtime: {
      getManifest: () => ({ version: '0.0.0-test' }),
      getURL: (p) => `chrome-extension://parsipad/${p}`,
      sendMessage: vi.fn(async () => ({}))
    },
    tabs: { create: vi.fn() },
    commands: { getAll: vi.fn(async () => []) }
  };
}

async function loadSettings(lang, muted, extra = {}) {
  store = new Map([[STORAGE_KEYS.language, lang], ...Object.entries(extra)]);
  if (muted) store.set(STORAGE_KEYS.mutedSites, muted);
  changeListeners = [];
  globalThis.chrome = fakeChrome();
  detachPage();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../settings/settings.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect(document.getElementById('about-version').textContent).toBe('0.0.0-test'));
}

const list = () => document.getElementById('muted-sites-list');
const input = () => document.getElementById('muted-site-input');
const status = () => document.getElementById('muted-site-status');
const empty = () => document.getElementById('muted-sites-empty');
const chipHosts = () => [...list().querySelectorAll('li')].map((li) => li.querySelector('bdi').textContent);
const unmuteButton = (host) => [...list().querySelectorAll('li')]
  .find((li) => li.querySelector('bdi').textContent === host)
  .querySelector('button');
const fill = (lang, key, values = {}) => Object.entries(values)
  .reduce((text, [name, value]) => text.replace(`{${name}}`, value), translations[lang][key]);

function submit(value) {
  input().value = value;
  input().focus();
  document.getElementById('muted-site-form').querySelector('button[type="submit"]').click();
}

beforeEach(() => {
  const addEventListener = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    pageListeners.push([type, listener, options]);
    addEventListener(type, listener, options);
  });
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  detachPage();
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe.each(['en', 'fa'])('muted sites in %s', (lang) => {
  it('shows each stored host as a chip with its own unmute button', async () => {
    await loadSettings(lang, ['alpha.com', 'beta.org']);
    expect(chipHosts()).toEqual(['alpha.com', 'beta.org']);
    for (const li of list().querySelectorAll('li')) {
      const host = li.querySelector('bdi').textContent;
      expect(li.querySelector('bdi').getAttribute('dir')).toBe('ltr');
      const button = li.querySelector('button');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('aria-label')).toBe(fill(lang, 'unmuteSite', { host }));
      expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    }
    expect(empty().hidden).toBe(true);
    expect(list().hidden).toBe(false);
  });

  it('says so when no site is muted', async () => {
    await loadSettings(lang);
    expect(chipHosts()).toEqual([]);
    expect(list().hidden).toBe(true);
    expect(empty().hidden).toBe(false);
    expect(empty().textContent).toBe(translations[lang].mutedSitesEmpty);
  });

  it('adds a pasted address as its host, clears the field and keeps focus there', async () => {
    await loadSettings(lang, ['zeta.org']);
    submit('https://www.Example.com/some/page?q=1');
    await vi.waitFor(() => expect(chipHosts()).toEqual(['example.com', 'zeta.org']));
    expect(store.get(STORAGE_KEYS.mutedSites)).toEqual(['example.com', 'zeta.org']);
    expect(input().value).toBe('');
    expect(document.activeElement).toBe(input());
    expect(status().textContent).toBe(fill(lang, 'mutedSiteAdded', { host: 'example.com' }));
    expect(status().querySelector('bdi[dir="ltr"]').textContent).toBe('example.com');
    expect(status().dataset.state).toBe('ok');
  });

  it('rejects what is not a site inline and keeps focus in the field', async () => {
    await loadSettings(lang, ['zeta.org']);
    submit('not a host');
    await vi.waitFor(() => expect(status().textContent).toBe(fill(lang, 'mutedSiteInvalid', { example: 'example.com' })));
    expect(status().dataset.state).toBe('error');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(input().value).toBe('not a host');
    expect(document.activeElement).toBe(input());
    expect(store.get(STORAGE_KEYS.mutedSites)).toEqual(['zeta.org']);
    input().dispatchEvent(new Event('input'));
    expect(input().hasAttribute('aria-invalid')).toBe(false);
  });

  it('says a site is already muted instead of adding it twice', async () => {
    await loadSettings(lang, ['example.com']);
    chrome.storage.local.set.mockClear();
    submit('www.example.com');
    await vi.waitFor(() => expect(status().textContent).toBe(fill(lang, 'mutedSiteDuplicate', { host: 'example.com' })));
    expect(chipHosts()).toEqual(['example.com']);
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(expect.objectContaining({ [STORAGE_KEYS.mutedSites]: expect.anything() }));
    expect(document.activeElement).toBe(input());
  });

  it('after unmuting, moves focus to the next chip, else the previous one, else the field', async () => {
    await loadSettings(lang, ['a.com', 'b.com', 'c.com']);
    unmuteButton('b.com').click();
    await vi.waitFor(() => expect(chipHosts()).toEqual(['a.com', 'c.com']));
    expect(store.get(STORAGE_KEYS.mutedSites)).toEqual(['a.com', 'c.com']);
    expect(document.activeElement).toBe(unmuteButton('c.com'));
    expect(status().textContent).toBe(fill(lang, 'mutedSiteRemoved', { host: 'b.com' }));

    unmuteButton('c.com').click();
    await vi.waitFor(() => expect(chipHosts()).toEqual(['a.com']));
    expect(document.activeElement).toBe(unmuteButton('a.com'));

    unmuteButton('a.com').click();
    await vi.waitFor(() => expect(chipHosts()).toEqual([]));
    expect(document.activeElement).toBe(input());
    expect(empty().hidden).toBe(false);
  });

  it('shows a mute made elsewhere without a reload', async () => {
    await loadSettings(lang, ['a.com']);
    store.set(STORAGE_KEYS.mutedSites, ['a.com', 'news.example.com']);
    for (const listener of changeListeners) {
      listener({ [STORAGE_KEYS.mutedSites]: { oldValue: ['a.com'], newValue: ['a.com', 'news.example.com'] } }, 'local');
    }
    await vi.waitFor(() => expect(chipHosts()).toEqual(['a.com', 'news.example.com']));
  });

  it('keeps focus on a chip when another chip changes underneath it', async () => {
    await loadSettings(lang, ['a.com', 'b.com']);
    unmuteButton('b.com').focus();
    store.set(STORAGE_KEYS.mutedSites, ['b.com']);
    for (const listener of changeListeners) {
      listener({ [STORAGE_KEYS.mutedSites]: { oldValue: ['a.com', 'b.com'], newValue: ['b.com'] } }, 'local');
    }
    await vi.waitFor(() => expect(chipHosts()).toEqual(['b.com']));
    expect(document.activeElement).toBe(unmuteButton('b.com'));
  });
});

describe('muted sites live update', () => {
  it('a failed reload of the list is caught, not left unhandled', async () => {
    await loadSettings('en', ['a.com']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      chrome.storage.local.get.mockRejectedValue(new Error('storage gone'));
      for (const listener of changeListeners) {
        listener({ [STORAGE_KEYS.mutedSites]: { oldValue: ['a.com'], newValue: [] } }, 'local');
      }
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(chipHosts()).toEqual(['a.com']);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('View Welcome Guide', () => {
  it('opens the guide in this tab, marked as coming from Settings', async () => {
    await loadSettings('en');
    const hrefSetter = vi.spyOn(location, 'href', 'set').mockImplementation(() => {});
    document.getElementById('welcome-guide-btn').click();
    expect(hrefSetter).toHaveBeenCalledWith('../welcome/welcome.html?from=settings');
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

describe('ask before translating a whole page', () => {
  it('is wired and stored but its row stays hidden until Plan E', async () => {
    await loadSettings('en');
    const box = document.getElementById('confirm-page-translate-toggle');
    expect(box.closest('.setting-row').hidden).toBe(true);
    expect(box.checked).toBe(true);
    box.click();
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.confirmPageTranslate)).toBe(false));
  });

  it('reads a stored false', async () => {
    await loadSettings('fa', null, { [STORAGE_KEYS.confirmPageTranslate]: false });
    expect(document.getElementById('confirm-page-translate-toggle').checked).toBe(false);
  });
});
