// tests/library-page-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/library/library.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * The Library page driven through its own markup, with chrome.storage held in
 * memory. What the user does (switch tabs, search, delete and undo, clear,
 * copy, open in the panel) and what ends up in storage.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'library/library.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

const DAY = 86400e3;
const NOW = Date.now();
const en = translations.en;

function seed() {
  return {
    translation_history: [
      { id: 1, original: 'Hello', translation: 'سلام', direction: 'en-fa', timestamp: NOW - 60e3 },
      { id: 2, original: 'Good night', translation: 'شب بخیر', direction: 'en-fa', timestamp: NOW - 3 * DAY }
    ],
    polish_history: [
      { id: 1, original: 'hey there', professional: 'Good afternoon.', conversational: 'Hey!', concise: 'Hi.', timestamp: NOW - 2 * 60e3 }
    ],
    dictionary_history: [
      { id: 5, word: 'apple', translation: 'سیب', sourceLang: 'en', targetLang: 'fa', timestamp: NOW - 5 * 60e3 }
    ],
    favorites: [
      { id: 'fav_1', type: 'translation', originalText: 'Hello', savedText: 'سلام', direction: 'en-fa', timestamp: NOW - 60e3 },
      { id: 'grammar_1', type: 'grammar', originalText: 'I went home', savedText: '', direction: 'en-to-fa', lesson: { title: 'Past simple', points: [] }, timestamp: NOW - 60e3 }
    ]
  };
}

let store;
let failNextSet;
let sidePanelOpen;
let sessionSet;

function installChrome() {
  failNextSet = false;
  sidePanelOpen = vi.fn().mockResolvedValue(undefined);
  sessionSet = vi.fn().mockResolvedValue(undefined);
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          const keys = Array.isArray(key) ? key : [key];
          const out = {};
          for (const k of keys) if (k in store) out[k] = structuredClone(store[k]);
          return out;
        }),
        set: vi.fn(async (items) => {
          if (failNextSet) {
            failNextSet = false;
            throw new Error('QUOTA_BYTES quota exceeded');
          }
          Object.assign(store, structuredClone(items));
        }),
        remove: vi.fn(async (key) => {
          for (const k of Array.isArray(key) ? key : [key]) delete store[k];
        })
      },
      session: { set: sessionSet }
    },
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 5 }) },
    sidePanel: { open: sidePanelOpen }
  };
}

async function openLibrary(search = '', data = seed()) {
  store = data;
  installChrome();
  history.replaceState(null, '', `/library/library.html${search}`);
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../library/library.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => {
    const ready = document.querySelectorAll('.lib-card').length > 0 || !document.getElementById('library-empty').hidden;
    expect(ready).toBe(true);
  });
}

const $ = (selector) => document.querySelector(selector);
const cards = () => [...document.querySelectorAll('.lib-card')].map(card => card.getAttribute('data-key'));
const card = (key) => [...document.querySelectorAll('.lib-card')].find(c => c.getAttribute('data-key') === key);
const action = (key, name) => card(key).querySelector(`[data-action="${name}"]`);
const status = () => $('#library-status-text').textContent;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const asked = () => window.confirm.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('library page: tabs and filters', () => {
  it('lists every kind of history, newest first, under day headings', async () => {
    await openLibrary();
    expect(cards()).toEqual(['translation:1', 'polish:1', 'dictionary:5', 'translation:2']);
    const headings = [...document.querySelectorAll('.lib-list h2')].map(h => h.textContent);
    expect(headings).toEqual([en.libraryToday, en.libraryThisWeek]);
    expect($('#library-tab-history').getAttribute('aria-selected')).toBe('true');
    expect(card('translation:1').querySelector('[data-action="favorite"]').getAttribute('aria-pressed')).toBe('true');
    expect(card('dictionary:5').querySelector('[data-action="favorite"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens on the tab, type, direction and search the URL names', async () => {
    await openLibrary('?tab=favorites');
    expect($('#library-tab-favorites').getAttribute('aria-selected')).toBe('true');
    expect($('#library-panel').getAttribute('aria-labelledby')).toBe('library-tab-favorites');
    expect(cards()).toEqual(['favorite:fav_1']);

    await openLibrary('?type=dictionary');
    expect(cards()).toEqual(['dictionary:5']);
    expect($('[data-type="dictionary"]').getAttribute('aria-pressed')).toBe('true');

    await openLibrary('?q=night');
    expect($('#library-search').value).toBe('night');
    expect(cards()).toEqual(['translation:2']);
  });

  it('puts lessons on their own tab and hides the type chips there', async () => {
    await openLibrary('?tab=lessons');
    expect(cards()).toEqual(['favorite:grammar_1']);
    expect($('#library-types').hidden).toBe(true);
  });

  it('moves between tabs with the arrow keys and keeps the tab in the URL', async () => {
    await openLibrary();
    $('#library-tab-history').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement.id).toBe('library-tab-favorites');
    expect($('#library-tab-favorites').getAttribute('aria-selected')).toBe('true');
    expect($('#library-tab-favorites').tabIndex).toBe(0);
    expect($('#library-tab-history').tabIndex).toBe(-1);
    expect(location.search).toBe('?tab=favorites');
    $('#library-tab-favorites').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement.id).toBe('library-tab-lessons');
    $('#library-tab-lessons').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement.id).toBe('library-tab-history');
    expect(location.search).toBe('');
  });

  it('filters by search after typing stops and writes it to the URL', async () => {
    await openLibrary();
    const search = $('#library-search');
    search.value = 'apple';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cards()).toHaveLength(4);
    await vi.waitFor(() => expect(cards()).toEqual(['dictionary:5']));
    expect(location.search).toBe('?q=apple');
  });

  it('offers the directions present and filters by one', async () => {
    await openLibrary();
    const select = $('#library-direction');
    expect([...select.options].map(o => o.value)).toEqual(['all', 'en-fa']);
    expect(select.options[1].textContent).toBe('EN → FA');
    select.value = 'en-fa';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(cards()).toEqual(['translation:1', 'dictionary:5', 'translation:2']);
    expect(location.search).toBe('?dir=en-fa');
  });

  it('says why the list is empty', async () => {
    await openLibrary('?q=zzz');
    expect($('#library-empty').textContent).toBe(en.libraryNoMatches);
    await openLibrary('', {});
    expect($('#library-empty').textContent).toBe(en.libraryEmpty);
    expect($('#library-clear').hidden).toBe(true);
  });
});

describe('library page: delete and undo', () => {
  it('deletes at once, offers Undo, and Undo puts the entry back where it was', async () => {
    await openLibrary();
    action('translation:1', 'delete').click();
    expect(cards()).not.toContain('translation:1');
    expect($('#library-undo').hidden).toBe(false);
    await vi.waitFor(() => expect(status()).toBe(en.libraryDeleted));
    await vi.waitFor(() => expect(store.translation_history.map(h => h.id)).toEqual([2]));

    $('#library-undo').click();
    await vi.waitFor(() => expect(store.translation_history.map(h => h.id)).toEqual([1, 2]));
    await vi.waitFor(() => expect(cards()).toContain('translation:1'));
    expect($('#library-undo').hidden).toBe(true);
  });

  it('announces a second identical message as a change, not as nothing', async () => {
    await openLibrary();
    action('translation:1', 'delete').click();
    await vi.waitFor(() => expect(status()).toBe(en.libraryDeleted));
    action('dictionary:5', 'delete').click();
    expect(status()).toBe('');
    await vi.waitFor(() => expect(status()).toBe(en.libraryDeleted));
  });

  it('does not bring back a delete made while an Undo was being written', async () => {
    await openLibrary();
    action('translation:1', 'delete').click();
    await vi.waitFor(() => expect(store.translation_history.map(h => h.id)).toEqual([2]));
    $('#library-undo').click();
    action('dictionary:5', 'delete').click();
    await vi.waitFor(() => expect(store.translation_history.map(h => h.id)).toEqual([1, 2]));
    await vi.waitFor(() => expect(store.dictionary_history).toEqual([]));
    await vi.waitFor(() => expect(cards()).toContain('translation:1'));
    await settle();
    expect(cards()).not.toContain('dictionary:5');
  });

  it('closes the status on leaving, so a page restored from the back cache shows no dead Undo', async () => {
    await openLibrary();
    action('translation:1', 'delete').click();
    await vi.waitFor(() => expect(status()).toBe(en.libraryDeleted));
    window.dispatchEvent(new Event('pagehide'));
    expect(status()).toBe('');
    expect($('#library-undo').hidden).toBe(true);
  });

  it('keeps one Undo at a time: a second delete closes the first window', async () => {
    await openLibrary();
    action('translation:1', 'delete').click();
    action('dictionary:5', 'delete').click();
    await vi.waitFor(() => expect(store.dictionary_history).toEqual([]));
    $('#library-undo').click();
    await vi.waitFor(() => expect(store.dictionary_history.map(h => h.id)).toEqual([5]));
    await settle();
    expect(store.translation_history.map(h => h.id)).toEqual([2]);
    expect(cards()).not.toContain('translation:1');
  });

  it('shows what is stored and says so when a delete cannot be written', async () => {
    await openLibrary();
    failNextSet = true;
    action('translation:1', 'delete').click();
    await vi.waitFor(() => expect(status()).toBe(en.libraryWriteFailed));
    expect(cards()).toContain('translation:1');
    expect($('#library-undo').hidden).toBe(true);
  });

  it('moves focus to the next card instead of dropping it', async () => {
    await openLibrary();
    action('polish:1', 'delete').focus();
    action('polish:1', 'delete').click();
    expect(document.activeElement.closest('.lib-card').getAttribute('data-key')).toBe('dictionary:5');
  });
});

describe('library page: clear all', () => {
  it('clears dictionary lookups too, even when they are all that is left', async () => {
    await openLibrary('', { dictionary_history: seed().dictionary_history });
    expect($('#library-clear').hidden).toBe(false);
    $('#library-clear').click();
    expect(window.confirm).toHaveBeenCalledWith(en.confirmClearAllHistory.replace('{hidden}', ''));
    expect(asked()).toMatch(/translations, polished text and dictionary lookups/);
    // Nothing is hidden, so the question stays short.
    expect(asked()).not.toMatch(/hidden/);
    await vi.waitFor(() => expect(store.dictionary_history).toBeUndefined());
    await vi.waitFor(() => expect($('#library-empty').hidden).toBe(false));
  });

  it('clears only the type shown, behind a question that names it', async () => {
    await openLibrary('?type=polish');
    $('#library-clear').click();
    expect(asked()).toBe('Clear all polished text in your history? This cannot be undone.');
    await vi.waitFor(() => expect(store.polish_history).toBeUndefined());
    expect(store.translation_history).toHaveLength(2);
    expect(store.dictionary_history).toHaveLength(1);
  });

  it('clears favorites without touching saved lessons, and does nothing when declined', async () => {
    await openLibrary('?tab=favorites');
    window.confirm.mockReturnValueOnce(false);
    $('#library-clear').click();
    await settle();
    expect(store.favorites).toHaveLength(2);

    $('#library-clear').click();
    expect(asked()).toBe('Clear all favorites except saved lessons? This cannot be undone.');
    await vi.waitFor(() => expect(store.favorites.map(f => f.id)).toEqual(['grammar_1']));
  });

  it('names the favorite type it clears', async () => {
    await openLibrary('?tab=favorites&type=translation');
    $('#library-clear').click();
    expect(asked()).toBe('Clear all favorite translations? This cannot be undone.');
    await vi.waitFor(() => expect(store.favorites.map(f => f.id)).toEqual(['grammar_1']));
  });

  it('asks about saved lessons on the Lessons tab', async () => {
    await openLibrary('?tab=lessons');
    $('#library-clear').click();
    expect(asked()).toBe('Clear all saved grammar lessons? This cannot be undone.');
    await vi.waitFor(() => expect(store.favorites.map(f => f.id)).toEqual(['fav_1']));
  });

  it('ignores search and direction when choosing what to clear, and says so', async () => {
    await openLibrary('?type=translation&q=night');
    expect(cards()).toEqual(['translation:2']);
    $('#library-clear').click();
    expect(asked()).toMatch(/translations/);
    expect(asked()).toMatch(/including entries hidden by the search or the direction filter/);
    await vi.waitFor(() => expect(store.translation_history).toBeUndefined());
  });

  it('asks in Persian, naming the type and the hidden entries', async () => {
    await openLibrary('?type=dictionary&dir=fa-en', { ...seed(), ui_language: 'fa' });
    $('#library-clear').click();
    expect(asked()).toMatch(/جستجوهای فرهنگ لغت/);
    expect(asked()).toMatch(/پنهان/);
    expect(asked()).not.toMatch(/\{/);
  });
});

describe('library page: card actions', () => {
  it('copies the variant whose button was pressed and announces it', async () => {
    await openLibrary();
    card('polish:1').querySelector('[data-action="copy"][data-variant="concise"]').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hi.'));
    await vi.waitFor(() => expect(status()).toBe(en.libraryCopied));
    action('translation:2', 'copy').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('شب بخیر'));
  });

  it('opens the side panel inside the click, with the text waiting for it', async () => {
    await openLibrary();
    await vi.waitFor(() => expect(chrome.windows.getCurrent).toHaveBeenCalled());
    await settle();
    action('translation:2', 'open-in-panel').click();
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 5 });
    expect(sessionSet).toHaveBeenCalledTimes(1);
    const { panel_prefill: prefill } = sessionSet.mock.calls[0][0];
    expect(prefill.text).toBe('Good night');
    expect(prefill.windowId).toBe(5);
    expect(prefill.mode).toBe('translate');
    expect(Math.abs(prefill.at - Date.now())).toBeLessThan(5000);
  });

  it('opens a polish entry in the panel\'s Polish mode', async () => {
    await openLibrary();
    await vi.waitFor(() => expect(chrome.windows.getCurrent).toHaveBeenCalled());
    await settle();
    action('polish:1', 'open-in-panel').click();
    const { panel_prefill: prefill } = sessionSet.mock.calls[0][0];
    expect(prefill).toMatchObject({ text: 'hey there', mode: 'polish', windowId: 5 });
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 5 });
  });

  it('stars and unstars a history entry', async () => {
    await openLibrary();
    const star = action('dictionary:5', 'favorite');
    star.click();
    await vi.waitFor(() => expect(star.getAttribute('aria-pressed')).toBe('true'));
    const added = store.favorites.find(f => f.originalText === 'apple');
    expect(added).toMatchObject({ type: 'dictionary', savedText: 'سیب', direction: 'en-fa' });

    const unstar = action('translation:1', 'favorite');
    unstar.click();
    await vi.waitFor(() => expect(unstar.getAttribute('aria-pressed')).toBe('false'));
    expect(store.favorites.some(f => f.id === 'fav_1')).toBe(false);
  });

  it('unstarring on the Favorites tab removes the favorite with Undo', async () => {
    const data = seed();
    data.favorites.splice(1, 0, { id: 'fav_2', type: 'translation', originalText: 'Thanks', savedText: 'ممنون', direction: 'en-fa', timestamp: NOW - 2 * 60e3 });
    await openLibrary('?tab=favorites', data);
    action('favorite:fav_1', 'favorite').click();
    expect(cards()).not.toContain('favorite:fav_1');
    expect($('#library-undo').hidden).toBe(false);
    expect(document.activeElement.getAttribute('data-action')).toBe('favorite');
    expect(document.activeElement.closest('.lib-card').getAttribute('data-key')).toBe('favorite:fav_2');
    await vi.waitFor(() => expect(status()).toBe(en.libraryRemovedFavorite));
    expect(translations.fa.libraryRemovedFavorite).toBeTruthy();
    expect(en.libraryRemovedFavorite).not.toBe(en.libraryDeleted);
    await vi.waitFor(() => expect(store.favorites.map(f => f.id)).toEqual(['fav_2', 'grammar_1']));
    $('#library-undo').click();
    await vi.waitFor(() => expect(store.favorites.map(f => f.id)).toEqual(['fav_1', 'fav_2', 'grammar_1']));
    await vi.waitFor(() => expect(cards()).toEqual(['favorite:fav_1', 'favorite:fav_2']));
  });
});
