// tests/newtab-page-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/newtab/newtab.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * The New Tab driven through its own markup, with chrome.* held in memory:
 * the word dealt from the Practice deck, flipping and copying it, the empty
 * state, the off state and its way back to Chrome's page, the bookmarks
 * drawer, the Most visited tiles, theme and language.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'newtab/newtab.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
const en = translations.en;
const fa = translations.fa;

function seed() {
  return {
    favorites: [
      { id: 'f1', type: 'translation', originalText: 'apple', savedText: 'سیب', direction: 'en-fa' },
      { id: 'g1', type: 'grammar', originalText: 'I went home', savedText: '', lesson: { title: 'Past simple' } },
      // A 2.x favorite, stored under the legacy field names.
      { id: 'f2', type: 'dictionary', original: 'کتاب', saved: 'book' }
    ]
  };
}

const TREE = [{
  id: '0',
  children: [
    {
      id: '1', title: 'Bookmarks bar', children: [
        { id: '10', title: '<img src=x onerror=alert(1)>', url: 'https://evil.example/' },
        { id: '11', title: 'Persian news', url: 'https://www.bbc.com/persian' },
        { id: '12', title: 'Extensions', url: 'chrome://extensions/' }
      ]
    },
    { id: '2', title: 'Other bookmarks', children: [{ id: '20', title: 'Docs', url: 'https://developer.chrome.com/docs' }] },
    { id: '3', title: 'Empty folder', children: [] }
  ]
}];

let store;
let listeners;
const pageListeners = [];

function detachPage() {
  for (const [target, type, listener, options] of pageListeners.splice(0)) {
    target.removeEventListener(type, listener, options);
  }
}

function installChrome({ permission = false, grant = false, updateFails = false } = {}) {
  listeners = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          const keys = key === null || key === undefined ? Object.keys(store) : Array.isArray(key) ? key : [key];
          const out = {};
          for (const k of keys) if (k in store) out[k] = structuredClone(store[k]);
          return out;
        }),
        set: vi.fn(async (items) => {
          const changes = {};
          for (const [k, v] of Object.entries(items)) changes[k] = { oldValue: store[k], newValue: v };
          Object.assign(store, structuredClone(items));
          for (const fn of listeners) fn(changes, 'local');
        })
      },
      onChanged: { addListener: vi.fn((fn) => listeners.push(fn)) }
    },
    runtime: {
      id: 'parsipad',
      getURL: (p) => `chrome-extension://parsipad${p.startsWith('/') ? '' : '/'}${p}`
    },
    bookmarks: { getTree: vi.fn(async () => structuredClone(TREE)) },
    permissions: {
      contains: vi.fn(async () => permission),
      request: vi.fn(async () => grant)
    },
    topSites: {
      get: vi.fn(async () => [
        { url: 'https://github.com/', title: 'GitHub' },
        { url: 'https://github.com/settings', title: 'GitHub settings' },
        { url: 'chrome://settings/', title: 'Settings' },
        { url: 'https://example.com/', title: '<b>Example</b>' }
      ])
    },
    tabs: {
      getCurrent: vi.fn(async () => ({ id: 42 })),
      create: vi.fn(async () => ({ id: 43 })),
      update: vi.fn(async () => {
        if (updateFails) throw new Error('Not allowed to load local resource');
        return { id: 42 };
      })
    }
  };
}

async function openNewTab(data = seed(), chromeOptions) {
  store = data;
  installChrome(chromeOptions);
  detachPage();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.className = '';
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../newtab/newtab.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => {
    const ready = !$('#nt-page').hidden || !$('#nt-off').hidden;
    expect(ready).toBe(true);
  });
}

const $ = (selector) => document.querySelector(selector);
const front = () => $('#nt-front-text').textContent;
const status = () => $('#nt-status').textContent;
const press = (key, target = document.body, init = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  for (const target of [document, window]) {
    const add = target.addEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      pageListeners.push([target, type, listener, options]);
      add(type, listener, options);
    });
  }
  // Shuffle draws j = i every time, so the deck keeps the stored order.
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});

afterEach(() => {
  detachPage();
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('new tab: before anything is read', () => {
  it('ships both views hidden, so the page cannot flash before the setting is known', () => {
    expect(html).toMatch(/<div id="nt-page" class="nt-page" hidden>/);
    expect(html).toMatch(/<main id="nt-off" class="nt-off" hidden>/);
    expect(html.indexOf('../lib/theme-boot.js')).toBeLessThan(html.indexOf('</head>'));
  });
});

describe('new tab: the word', () => {
  it('shows the saved side of a favorite from the Practice deck, in its own language', async () => {
    await openNewTab();
    expect($('#nt-page').hidden).toBe(false);
    expect($('#nt-off').hidden).toBe(true);
    expect($('#nt-word').hidden).toBe(false);
    expect($('#nt-empty').hidden).toBe(true);
    expect(front()).toBe('سیب');
    expect($('#nt-back-text').textContent).toBe('apple');
    expect($('#nt-face-front').getAttribute('lang')).toBe('fa');
    expect($('#nt-face-front').getAttribute('dir')).toBe('rtl');
    expect($('#nt-face-back').getAttribute('lang')).toBe('en');
    expect($('#nt-face-back').getAttribute('dir')).toBe('ltr');
    expect($('#nt-card').getAttribute('aria-pressed')).toBe('false');
    expect($('#nt-face-back').getAttribute('aria-hidden')).toBe('true');
    // The hint on the Persian face is in the interface language.
    expect($('#nt-face-front .nt-hint').getAttribute('lang')).toBe('en');
    expect($('#nt-front-text').dataset.size).toBe('xl');
  });

  it('sizes a long favorite down a step, through lib/text-size.js', async () => {
    const long = 'a sentence that is clearly longer than a single word on a card';
    await openNewTab({ favorites: [{ id: 'x', type: 'translation', originalText: 'x', savedText: long }] });
    expect($('#nt-front-text').dataset.size).toBe('md');
  });

  it('includes a 2.x favorite and leaves grammar lessons out', async () => {
    await openNewTab();
    $('#nt-another').click();
    expect(front()).toBe('book');
    expect($('#nt-back-text').textContent).toBe('کتاب');
    $('#nt-another').click();
    // Two cards in the deck: the third press comes round to the first again.
    expect(front()).toBe('سیب');
  });

  it('flips with the card and with Space or Enter from the page, and shows a new card face up', async () => {
    await openNewTab();
    $('#nt-card').click();
    expect($('#nt-card').getAttribute('aria-pressed')).toBe('true');
    expect($('#nt-face-front').getAttribute('aria-hidden')).toBe('true');
    expect($('#nt-face-back').getAttribute('aria-hidden')).toBe('false');
    expect(press(' ').defaultPrevented).toBe(true);
    expect($('#nt-card').getAttribute('aria-pressed')).toBe('false');
    press('Enter');
    expect($('#nt-card').getAttribute('aria-pressed')).toBe('true');
    $('#nt-another').click();
    expect($('#nt-card').getAttribute('aria-pressed')).toBe('false');
  });

  it('leaves Space on a focused button to that button, and Space with a modifier alone', async () => {
    await openNewTab();
    const another = $('#nt-another');
    another.focus();
    expect(press(' ', another).defaultPrevented).toBe(false);
    expect(press(' ', document.body, { shiftKey: true }).defaultPrevented).toBe(false);
    expect($('#nt-card').getAttribute('aria-pressed')).toBe('false');
  });

  it('copies the face that is showing, from the button and the c key, on any layout', async () => {
    await openNewTab();
    $('#nt-copy').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('سیب'));
    await vi.waitFor(() => expect(status()).toBe(en.libraryCopied));
    $('#nt-card').click();
    press('ز', document.body, { code: 'KeyC' });
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('apple'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  it('leaves Cmd+C and c in a form control to the browser', async () => {
    await openNewTab();
    press('c', document.body, { code: 'KeyC', metaKey: true });
    press('c', document.body, { code: 'KeyC', ctrlKey: true });
    $('#nt-bookmarks-btn').click();
    await vi.waitFor(() => expect(document.activeElement).toBe($('#nt-bookmark-search')));
    press('c', $('#nt-bookmark-search'), { code: 'KeyC' });
    await Promise.resolve();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('says so when the clipboard refuses', async () => {
    await openNewTab();
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    $('#nt-copy').click();
    await vi.waitFor(() => expect(status()).toBe(en.libraryCopyFailed));
  });

  it('links to Practice and to the favorites in the Library', async () => {
    await openNewTab();
    expect($('#nt-practice-link').getAttribute('href')).toBe('../practice/practice.html');
    expect($('#nt-favorites-link').getAttribute('href')).toBe('../library/library.html?tab=favorites');
  });

  it('shows the clock, the date and a greeting in both languages', async () => {
    await openNewTab();
    expect($('#nt-clock').textContent).toMatch(/\d{1,2}:\d{2}/);
    expect($('#nt-date').textContent).toMatch(/2\d{3}/);
    const greetings = [en.greetingMorning, en.greetingAfternoon, en.greetingEvening, en.greetingNight];
    expect(greetings).toContain($('#nt-greeting-primary').textContent);
    expect($('#nt-greeting-secondary').getAttribute('lang')).toBe('fa');
    expect($('#nt-greeting-secondary').getAttribute('dir')).toBe('rtl');
  });

  it('never reads bookmarks or most visited sites just to open', async () => {
    await openNewTab();
    expect(chrome.bookmarks.getTree).not.toHaveBeenCalled();
    expect(chrome.topSites.get).not.toHaveBeenCalled();
  });
});

describe('new tab: no favorites yet', () => {
  it('shows a calm message and points to the Library', async () => {
    await openNewTab({ favorites: [] });
    expect($('#nt-word').hidden).toBe(true);
    expect($('#nt-empty').hidden).toBe(false);
    expect($('#nt-empty').textContent).toContain(en.newTabEmpty);
    expect($('#nt-empty a').getAttribute('href')).toBe('../library/library.html?tab=favorites');
    // Nothing to flip or copy.
    press(' ');
    press('c', document.body, { code: 'KeyC' });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe('new tab: turned off', () => {
  const off = () => ({ ...seed(), newtab_enabled: false, newtab_panels: { bookmarks: true, recents: true } });

  it('renders a plain page with the way back, and no word, panels or bookmarks', async () => {
    await openNewTab(off(), { permission: true });
    expect($('#nt-off').hidden).toBe(false);
    expect($('#nt-page').hidden).toBe(true);
    expect($('#nt-front-text').textContent).toBe('');
    expect($('#nt-open-chrome').textContent).toBe(en.newTabOpenChrome);
    expect($('#nt-off-clock').textContent).toMatch(/\d{1,2}:\d{2}/);
    // The page never even asked for what it would have shown.
    const asked = chrome.storage.local.get.mock.calls.flat(2);
    expect(asked).not.toContain('favorites');
    expect(chrome.topSites.get).not.toHaveBeenCalled();
    press('/');
    expect($('#nt-drawer').hasAttribute('inert')).toBe(true);
    expect(chrome.bookmarks.getTree).not.toHaveBeenCalled();
  });

  it("opens Chrome's own New Tab in this tab", async () => {
    await openNewTab(off());
    $('#nt-open-chrome').click();
    await vi.waitFor(() => expect(chrome.tabs.update).toHaveBeenCalledWith(42, { url: 'chrome://new-tab-page/' }));
    expect($('#nt-off-fallback').hidden).toBe(true);
  });

  it('explains and links to Settings when Chrome refuses', async () => {
    await openNewTab(off(), { updateFails: true });
    $('#nt-open-chrome').click();
    await vi.waitFor(() => expect($('#nt-off-fallback').hidden).toBe(false));
    expect($('#nt-off-fallback').textContent).toContain(en.newTabOpenChromeFailed);
    expect($('#nt-off-fallback a').getAttribute('href')).toBe('../settings/settings.html#flashcards');
  });

  it('follows the switch live, both ways', async () => {
    await openNewTab();
    await chrome.storage.local.set({ newtab_enabled: false });
    await vi.waitFor(() => expect($('#nt-off').hidden).toBe(false));
    expect($('#nt-page').hidden).toBe(true);
    await chrome.storage.local.set({ newtab_enabled: true });
    await vi.waitFor(() => expect($('#nt-page').hidden).toBe(false));
    expect($('#nt-off').hidden).toBe(true);
  });
});

describe('new tab: the bookmarks drawer', () => {
  it('opens with its button, builds the tree as text, and closes with Escape returning focus', async () => {
    await openNewTab();
    const button = $('#nt-bookmarks-btn');
    expect(button.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.focus();
    button.click();
    await vi.waitFor(() => expect(document.activeElement).toBe($('#nt-bookmark-search')));
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect($('#nt-drawer').hasAttribute('inert')).toBe(false);
    const tree = $('#nt-bookmark-tree');
    // A hostile title stays text.
    expect(tree.querySelector('img[onerror]')).toBeNull();
    expect(tree.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(tree.textContent).toContain('Persian news');
    expect(tree.textContent).not.toContain('Empty folder');
    const link = [...tree.querySelectorAll('a')].find(a => a.textContent.includes('Docs'));
    expect(link.getAttribute('href')).toBe('https://developer.chrome.com/docs');
    const icon = link.querySelector('img');
    expect(icon.getAttribute('src')).toMatch(/^chrome-extension:\/\/parsipad\/_favicon\/\?pageUrl=/);

    press('Escape', $('#nt-bookmark-search'));
    expect($('#nt-drawer').hasAttribute('inert')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('opens with / from the page and loads the tree only once', async () => {
    await openNewTab();
    $('#nt-card').focus();
    expect(press('/', $('#nt-card')).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe($('#nt-bookmark-search')));
    press('Escape', $('#nt-bookmark-search'));
    expect(document.activeElement).toBe($('#nt-card'));
    press('/');
    await vi.waitFor(() => expect($('#nt-drawer').hasAttribute('inert')).toBe(false));
    expect(chrome.bookmarks.getTree).toHaveBeenCalledTimes(1);
  });

  it('does not take / while typing in a field', async () => {
    await openNewTab();
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    expect(press('/', field).defaultPrevented).toBe(false);
    expect($('#nt-drawer').hasAttribute('inert')).toBe(true);
  });

  it('filters by title or address, marks the match as text, and Escape clears before it closes', async () => {
    await openNewTab();
    press('/');
    await vi.waitFor(() => expect(document.activeElement).toBe($('#nt-bookmark-search')));
    const search = $('#nt-bookmark-search');
    search.value = 'persian';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect($('#nt-bookmark-tree mark')?.textContent).toBe('Persian'));
    expect($('#nt-bookmark-tree').querySelectorAll('a')).toHaveLength(1);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect($('#nt-bookmark-empty').hidden).toBe(false));
    press('Escape', search);
    expect(search.value).toBe('');
    expect($('#nt-drawer').hasAttribute('inert')).toBe(false);
    press('Escape', search);
    expect($('#nt-drawer').hasAttribute('inert')).toBe(true);
  });

  it('leaves the card behind the open drawer alone: no flip, no copy', async () => {
    await openNewTab();
    press('/');
    await vi.waitFor(() => expect(document.activeElement).toBe($('#nt-bookmark-search')));
    const link = [...$('#nt-bookmark-tree').querySelectorAll('a')].find(a => a.textContent.includes('Persian'));
    link.focus();
    press('c', link);
    expect(press(' ').defaultPrevented).toBe(false);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect($('#nt-card').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens a chrome:// bookmark here on a plain click and in a new tab with a modifier', async () => {
    await openNewTab();
    press('/');
    await vi.waitFor(() => expect($('#nt-bookmark-tree a')).not.toBeNull());
    const link = [...$('#nt-bookmark-tree').querySelectorAll('a')].find(a => a.textContent.includes('Extensions'));
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/', active: false });
    expect(chrome.tabs.update).not.toHaveBeenCalled();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(chrome.tabs.update).toHaveBeenCalledWith({ url: 'chrome://extensions/' });
  });

  it('is gone when the bookmarks panel is switched off', async () => {
    await openNewTab({ ...seed(), newtab_panels: { bookmarks: false, recents: false } });
    expect($('#nt-bookmarks-btn').hidden).toBe(true);
    press('/');
    expect($('#nt-drawer').hasAttribute('inert')).toBe(true);
    expect(chrome.bookmarks.getTree).not.toHaveBeenCalled();
  });
});

describe('new tab: most visited', () => {
  it('shows nothing and asks for nothing while the panel is off', async () => {
    await openNewTab(seed(), { permission: true });
    expect($('#nt-recents').hidden).toBe(true);
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('shows nothing without the permission, even when switched on', async () => {
    await openNewTab({ ...seed(), newtab_panels: { bookmarks: true, recents: true } }, { permission: false });
    await Promise.resolve();
    expect($('#nt-recents').hidden).toBe(true);
    expect(chrome.topSites.get).not.toHaveBeenCalled();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it('shows one tile per site, with the icon from the browser cache and the title as text', async () => {
    await openNewTab({ ...seed(), newtab_panels: { bookmarks: true, recents: true } }, { permission: true });
    await vi.waitFor(() => expect($('#nt-recents').hidden).toBe(false));
    const tiles = [...document.querySelectorAll('#nt-tiles a')];
    expect(tiles.map(a => a.getAttribute('href'))).toEqual(['https://github.com/', 'https://example.com/']);
    expect(tiles[1].textContent).toContain('<b>Example</b>');
    expect(document.querySelector('#nt-tiles b')).toBeNull();
    expect(tiles[0].querySelector('img').getAttribute('src')).toMatch(/^chrome-extension:\/\/parsipad\/_favicon\/\?pageUrl=https%3A%2F%2Fgithub\.com/);
  });
});

describe('new tab: theme and language', () => {
  it('applies the stored theme in both conventions, and follows a change live', async () => {
    await openNewTab({ ...seed(), theme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await chrome.storage.local.set({ theme: 'light' });
    await vi.waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('follows the system when the theme is System', async () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    await openNewTab({ ...seed(), theme: 'system' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    media.matches = false;
    const onChange = media.addEventListener.mock.calls.find(([type]) => type === 'change')[1];
    onChange();
    await vi.waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));
  });

  it('speaks Persian with the interface right to left and the greeting pair swapped', async () => {
    await openNewTab({ ...seed(), ui_language: 'fa' });
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('fa');
    expect(document.title).toBe(fa.newTabTitle);
    expect($('#nt-copy').textContent).toBe(fa.practiceCopy);
    expect($('#nt-greeting-secondary').getAttribute('lang')).toBe('en');
    expect($('#nt-face-front .nt-hint').getAttribute('lang')).toBe('fa');
    // Latin digits, as everywhere else in the Persian interface.
    expect($('#nt-clock').textContent).not.toMatch(/[۰-۹]/);
  });

  it('follows a language change live', async () => {
    await openNewTab();
    await chrome.storage.local.set({ ui_language: 'fa' });
    await vi.waitFor(() => expect($('#nt-copy').textContent).toBe(fa.practiceCopy));
    expect(document.documentElement.dir).toBe('rtl');
  });
});
