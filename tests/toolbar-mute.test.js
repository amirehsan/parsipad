// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// Mute ParsiPad on this site from the selection toolbar, and the shared toast
// that confirms it and offers Undo. The source checks pin the interface; the
// behaviour tests drive the real content script.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { functionBody } from './helpers/source.js';

const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');

describe('mute from the toolbar (source)', () => {
  it('offers the action and writes the shared list', () => {
    const body = functionBody(js, 'createSelectionPopup');
    expect(body).toMatch(/action: 'mute'/);
    expect(body).toMatch(/t\('toolbarMute', userLang\)/);
    expect(js).toMatch(/addMutedSite\(location\.hostname\)/);
    expect(js).toMatch(/removeMutedSite\(/);
  });

  it('the toast can carry an action, is announced and is themed', () => {
    const body = functionBody(js, 'showToast');
    expect(body).toMatch(/action/);
    expect(body).toMatch(/role = 'status'/);
    expect(body).toMatch(/setAttribute\('role', role\)/);
    expect(body).toMatch(/themeVars\(\)/);
    expect(body).not.toMatch(/Open Settings|'Dismiss'|API key not configured/);
    expect(functionBody(js, 'showMissingApiKeyToast')).toMatch(/role: 'alert'/);
  });

  it('never lets the stored list overwrite a mute that already landed', () => {
    const body = functionBody(js, 'loadMutedSites');
    expect(body).toMatch(/if \(mutedLoaded\) return;/);
    expect(js).toMatch(/changes\[MUTED_SITES_KEY\]\) \{\s*mutedLoaded = true;/);
  });
});

// The toolbar and the toast live in closed shadow roots; keep a handle on
// each root as it is attached so the test can see inside.
const roots = new Map();
const storageListeners = [];
const store = new Map([['selection_popup_enabled', true]]);
const sent = [];
let onMessage = null;
let missingKey = false;

function storageGet(keys) {
  const list = keys === null || keys === undefined ? [...store.keys()] : [].concat(keys);
  const out = {};
  for (const key of list) if (store.has(key)) out[key] = structuredClone(store.get(key));
  return Promise.resolve(out);
}

function storageSet(items) {
  const changes = {};
  for (const [key, value] of Object.entries(items)) {
    changes[key] = { oldValue: store.get(key), newValue: structuredClone(value) };
    store.set(key, structuredClone(value));
  }
  for (const listener of storageListeners) listener(changes, 'local');
  return Promise.resolve();
}

beforeAll(async () => {
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    roots.set(this, root);
    return root;
  };
  globalThis.chrome = {
    runtime: {
      id: 'parsipad',
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      sendMessage: (message) => {
        sent.push(message);
        // Page translation asks whether a key is set before it asks the user.
        if (message.action === 'CHECK_API_KEY') return Promise.resolve({ hasApiKey: !missingKey });
        return Promise.resolve();
      },
      // Page translation streams its batches over a port; answer as the
      // service worker does when no key is set.
      connect: () => {
        const onMessageListeners = [];
        return {
          onMessage: { addListener: (fn) => onMessageListeners.push(fn) },
          onDisconnect: { addListener: () => {} },
          postMessage: () => {
            if (!missingKey) return;
            queueMicrotask(() => {
              for (const fn of onMessageListeners) fn({ type: 'error', message: 'API key not set', code: 'API_KEY_NOT_SET' });
            });
          },
          disconnect: () => {}
        };
      },
      getURL: (p) => p
    },
    storage: {
      local: { get: storageGet, set: storageSet },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };
  document.body.innerHTML = `
    <div id="page">
      <a id="before" href="#before">before</a>
      <p id="text">several words to select</p>
    </div>`;
  await import('../content/main.js');
  // Let the stored settings load.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.getElementById('parsipad-toast')?.remove();
  document.getSelection().removeAllRanges();
  document.activeElement?.blur?.();
  vi.useRealTimers();
  await storageSet({ muted_sites: [] });
});

const $ = (id) => document.getElementById(id);
const toolbar = () => $('parsipad-selection-popup');
const buttons = () => [...roots.get(toolbar()).querySelectorAll('.selection-btn')];
const muteButton = () => roots.get(toolbar()).querySelector('[data-action="mute"]');
const toastHost = () => $('parsipad-toast');
const toast = () => roots.get(toastHost());

function selectWords() {
  const node = $('text').firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 13);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  vi.advanceTimersByTime(300);
}

function key(target, name, init = {}) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, composed: true, ...init });
  target.dispatchEvent(event);
  return event;
}

// detail is the click count: 0 when Enter or Space pressed the button.
function press(button, { keyboard = false } = {}) {
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: keyboard ? 0 : 1 }));
}

// addMutedSite reads, then writes; let both settle.
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// The toast enters the page empty and says its message a moment later, so
// screen readers see the live region before its text.
const LIVE_REGION_DELAY_MS = 100;
async function shown() {
  await settle();
  vi.advanceTimersByTime(LIVE_REGION_DELAY_MS);
}

describe('mute from the toolbar', () => {
  it('adds a fourth button to the roving group, labelled through t()', () => {
    $('before').focus();
    selectWords();
    expect(buttons().map((b) => b.dataset.action)).toEqual(['translate', 'polish', 'dictionary', 'mute']);
    expect(buttons().map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    expect(muteButton().getAttribute('aria-label')).toBe(translations.en.toolbarMute);
    key($('before'), 'Tab');
    key(roots.get(toolbar()).activeElement, 'End');
    expect(roots.get(toolbar()).activeElement).toBe(muteButton());
    key(muteButton(), 'ArrowRight');
    expect(roots.get(toolbar()).activeElement).toBe(buttons()[0]);
  });

  it('stores the normalized host, closes the toolbar and names the stored host', async () => {
    selectWords();
    press(muteButton());
    await shown();
    expect(store.get('muted_sites')).toEqual(['example.com']);
    expect(toolbar()).toBeNull();

    const message = toast().querySelector('.message');
    expect(message.getAttribute('role')).toBe('status');
    expect(message.textContent).toBe(translations.en.mutedOnSite.replace('{host}', 'example.com'));
    const bdi = message.querySelector('bdi');
    expect(bdi.getAttribute('dir')).toBe('ltr');
    expect(bdi.textContent).toBe('example.com');
    // Besides Undo, the toast points to the Muted sites list in Settings.
    const manage = toast().querySelector('.open');
    expect(manage.hidden).toBe(false);
    expect(manage.textContent).toBe(translations.en.manageMutedSites);
    // Undo stays the primary action; Manage is the quieter one beside it.
    expect(manage.classList.contains('secondary')).toBe(true);
    expect(toast().querySelector('.action').textContent).toBe(translations.en.libraryUndo);
    expect(toast().querySelector('.close').getAttribute('aria-label')).toBe(translations.en.cardClose);
    // themeVars() defines the accent the action button uses.
    expect(toast().querySelector('style').textContent).toMatch(/--pp-accent:/);

    // Muted: a new selection gets no toolbar.
    selectWords();
    expect(toolbar()).toBeNull();
  });

  it('opens Settings at the Muted sites list from the toast', async () => {
    selectWords();
    press(muteButton());
    await shown();
    toast().querySelector('.open').click();
    expect(sent.at(-1)).toEqual({ action: 'OPEN_OPTIONS', section: 'reading' });
    expect(toastHost()).toBeNull();
  });

  it('Undo removes the host it stored, and the toolbar comes back', async () => {
    await storageSet({ muted_sites: ['other.org'] });
    selectWords();
    press(muteButton());
    await shown();
    expect(store.get('muted_sites')).toEqual(['example.com', 'other.org']);

    toast().querySelector('.action').click();
    await settle();
    expect(store.get('muted_sites')).toEqual(['other.org']);
    expect(toastHost()).toBeNull();

    selectWords();
    expect(toolbar()).not.toBeNull();
  });

  it('moves focus to Undo when pressed from the keyboard, and back when the toast closes', async () => {
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    key(roots.get(toolbar()).activeElement, 'End');
    press(muteButton(), { keyboard: true });
    await shown();
    expect(document.activeElement).toBe(toastHost());
    expect(toast().activeElement).toBe(toast().querySelector('.action'));

    key(toast().activeElement, 'Escape');
    expect(toastHost()).toBeNull();
    expect(document.activeElement).toBe($('before'));
  });

  it('leaves focus alone when pressed with the pointer', async () => {
    $('before').focus();
    selectWords();
    press(muteButton());
    await shown();
    expect(toastHost()).not.toBeNull();
    expect(document.activeElement).toBe($('before'));
  });

  it('keeps the toast while the pointer or focus is inside it, and closes it after 10 s otherwise', async () => {
    selectWords();
    press(muteButton());
    await shown();
    const box = toast().querySelector('.toast');

    box.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(20000);
    expect(toastHost()).not.toBeNull();
    box.dispatchEvent(new Event('pointerleave'));

    toast().querySelector('.action').focus();
    vi.advanceTimersByTime(20000);
    expect(toastHost()).not.toBeNull();
    toast().querySelector('.action').blur();

    vi.advanceTimersByTime(9999);
    expect(toastHost()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(toastHost()).toBeNull();
    // The host is still muted: closing is not undoing.
    expect(store.get('muted_sites')).toEqual(['example.com']);
  });

  it('enters the page with an empty live region, then says the message and focuses Undo', async () => {
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    key(roots.get(toolbar()).activeElement, 'End');
    press(muteButton(), { keyboard: true });
    await settle();
    const message = toast().querySelector('.message');
    expect(message.getAttribute('role')).toBe('status');
    expect(message.textContent).toBe('');
    expect(document.activeElement).toBe($('before'));

    vi.advanceTimersByTime(LIVE_REGION_DELAY_MS);
    expect(message.textContent).toBe(translations.en.mutedOnSite.replace('{host}', 'example.com'));
    const undo = toast().querySelector('.action');
    // Focus on Undo reads the message too.
    expect(message.id).toBeTruthy();
    expect(undo.getAttribute('aria-describedby')).toBe(message.id);
    expect(toast().activeElement).toBe(undo);
  });

  it('offers no Undo when the site was already on the list', async () => {
    selectWords();
    // Muted from another tab; the change has not reached this page yet.
    store.set('muted_sites', ['example.com']);
    press(muteButton());
    await shown();
    expect(toast().querySelector('.message').textContent)
      .toBe(translations.en.mutedOnSite.replace('{host}', 'example.com'));
    expect(toast().querySelector('.action').hidden).toBe(true);
    expect(store.get('muted_sites')).toEqual(['example.com']);
  });

  it('hands focus back when closed with its close button', async () => {
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    key(roots.get(toolbar()).activeElement, 'End');
    press(muteButton(), { keyboard: true });
    await shown();
    const close = toast().querySelector('.close');
    close.focus();
    close.click();
    expect(toastHost()).toBeNull();
    expect(document.activeElement).toBe($('before'));
  });

  it('pauses its timer while the pointer is inside and resumes what was left', async () => {
    selectWords();
    press(muteButton());
    await shown();
    const box = toast().querySelector('.toast');
    vi.advanceTimersByTime(4000);
    box.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(30000);
    expect(toastHost()).not.toBeNull();
    box.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(5999);
    expect(toastHost()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(toastHost()).toBeNull();
  });

  it('is not offered on a host that cannot be muted', () => {
    window.happyDOM.setURL('http://intranet/wiki');
    try {
      selectWords();
      expect(toolbar()).not.toBeNull();
      expect(muteButton()).toBeNull();
      expect(buttons()).toHaveLength(3);
    } finally {
      window.happyDOM.setURL('https://www.example.com/article');
    }
  });

  it('speaks Persian in the toast when the interface is Persian', async () => {
    for (const listener of storageListeners) listener({ ui_language: { newValue: 'fa' } }, 'local');
    try {
      selectWords();
      expect(muteButton().getAttribute('aria-label')).toBe(translations.fa.toolbarMute);
      press(muteButton());
      await shown();
      const message = toast().querySelector('.message');
      expect(message.textContent).toBe(translations.fa.mutedOnSite.replace('{host}', 'example.com'));
      expect(message.getAttribute('dir')).toBe('rtl');
      expect(toast().querySelector('.action').textContent).toBe(translations.fa.libraryUndo);
    } finally {
      for (const listener of storageListeners) listener({ ui_language: { newValue: 'en' } }, 'local');
    }
  });
});

describe('the page-translation toasts', () => {
  it('says there is no text to translate in the interface language', async () => {
    for (const listener of storageListeners) listener({ ui_language: { newValue: 'fa' } }, 'local');
    $('page').style.display = 'none';
    try {
      onMessage({ action: 'TRANSLATE_PAGE' }, { id: 'parsipad' }, () => {});
      await shown();
      const message = toast().querySelector('.message');
      expect(message.getAttribute('role')).toBe('status');
      expect(message.textContent).toBe(translations.fa.noTextOnPage);
      expect(message.getAttribute('dir')).toBe('rtl');
    } finally {
      $('page').style.display = '';
      for (const listener of storageListeners) listener({ ui_language: { newValue: 'en' } }, 'local');
    }
  });

  it('stays an alert, in the interface language, with Open Settings', async () => {
    // Page translation has no floating box, so a missing key comes back as
    // the toast.
    // A mute toast holds focus on Undo when the alert replaces it.
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    key(roots.get(toolbar()).activeElement, 'End');
    press(muteButton(), { keyboard: true });
    await shown();
    expect(document.activeElement).toBe(toastHost());

    missingKey = true;
    try {
      onMessage({ action: 'TRANSLATE_PAGE' }, { id: 'parsipad' }, () => {});
      await shown();
      // Replaced while it held focus: focus goes back, not to <body>.
      expect(document.activeElement).toBe($('before'));
      const message = toast().querySelector('.message');
      expect(message.getAttribute('role')).toBe('alert');
      expect(message.textContent).toBe(translations.en.apiKeyNotConfigured);
      expect(toast().querySelector('.action').hidden).toBe(true);
      const open = toast().querySelector('.open');
      expect(open.hidden).toBe(false);
      expect(open.textContent).toBe(translations.en.openSettings);
      open.click();
      expect(sent.at(-1)).toEqual({ action: 'OPEN_OPTIONS' });
      expect(toastHost()).toBeNull();
    } finally {
      missingKey = false;
      $('parsipad-page-toggle')?.remove();
    }
  });
});
