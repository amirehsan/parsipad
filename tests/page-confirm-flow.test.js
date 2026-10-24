// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// A whole-page translation asks first, in the real content script: nothing
// reaches the provider until the user presses Translate, a missing key still
// gets its toast instead of the dialog, and a navigation or a Cancel from the
// popup closes the dialog without a request.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { translations } from '../lib/i18n.js';

// The overlay and the toast live in closed shadow roots; keep a handle on
// each root as it is attached so the test can see inside.
const roots = new Map();
const store = new Map();
const storageListeners = [];
const sent = [];
const ports = [];
let onMessage = null;
let missingKey = false;

function storageGet(keys) {
  const list = keys === null || keys === undefined ? [...store.keys()] : [].concat(keys);
  const out = {};
  for (const k of list) if (store.has(k)) out[k] = structuredClone(store.get(k));
  return Promise.resolve(out);
}

function storageSet(items) {
  const changes = {};
  for (const [k, value] of Object.entries(items)) {
    changes[k] = { oldValue: store.get(k), newValue: structuredClone(value) };
    store.set(k, structuredClone(value));
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
        if (message.action === 'CHECK_API_KEY') return Promise.resolve({ hasApiKey: !missingKey });
        return Promise.resolve();
      },
      // Batches stream over a port; every one is recorded, and answered with
      // a numbered translation of each line.
      connect: () => {
        const listeners = [];
        const port = {
          started: null,
          onMessage: { addListener: (fn) => listeners.push(fn) },
          onDisconnect: { addListener: () => {} },
          postMessage: (msg) => {
            port.started = msg;
            const lines = msg.text.split('\n').map((line) => line.replace(/^\[(\d+)\] (.*)$/, '[$1] FA:$2'));
            queueMicrotask(() => {
              for (const fn of listeners) fn({ type: 'done', result: { translation: lines.join('\n') } });
            });
          },
          disconnect: () => {}
        };
        ports.push(port);
        return port;
      },
      getURL: (p) => p
    },
    storage: {
      local: { get: storageGet, set: storageSet },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };
  await import('../content/main.js');
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  document.body.innerHTML = `
    <button id="before">before</button>
    <h1>A heading</h1>
    <p>First paragraph with a <a href="#">link</a> inside.</p>
    <p>Second paragraph.</p>`;
  sent.length = 0;
  ports.length = 0;
  missingKey = false;
  store.clear();
});

afterEach(() => {
  // A navigation resets page translation, as an SPA route change does.
  history.pushState({}, '', '/article');
  document.getElementById('parsipad-toast')?.remove();
  document.getElementById('parsipad-page-toggle')?.remove();
});

const overlayHost = () => document.getElementById('parsipad-page-progress');
const overlay = () => (overlayHost() ? roots.get(overlayHost()) : null);
const dialog = () => overlay()?.querySelector('[role="dialog"]') ?? null;
const control = (action) => dialog().querySelector(`[data-action="${action}"]`);

function translatePage() {
  onMessage({ action: 'TRANSLATE_PAGE' }, { id: 'parsipad' }, () => {});
}

function pageState() {
  let state;
  onMessage({ action: 'GET_PAGE_TRANSLATION_STATE' }, { id: 'parsipad' }, (r) => { state = r; });
  return state;
}

async function dialogShown() {
  await vi.waitFor(() => expect(dialog()).not.toBeNull());
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('confirming a whole-page translation', () => {
  it('shows the paragraph count, cost and provider before any request', async () => {
    store.set('selectedProvider', 'gemini');
    translatePage();
    await dialogShown();
    expect(ports).toEqual([]);
    // The heading, both paragraphs and the button's label.
    expect(dialog().textContent).toContain('4 paragraphs');
    expect(dialog().textContent).toContain('Gemini');
    expect(dialog().textContent).toContain('<$0.01');
    // Only the dialog: the progress UI waits for the answer.
    expect(overlay().querySelector('.parsipad-progress-overlay')).toBeNull();
    expect(overlay().activeElement).toBe(control('go'));
    expect(pageState().isTranslating).toBe(true);
  });

  it('names Claude when no provider was ever chosen', async () => {
    translatePage();
    await dialogShown();
    expect(dialog().textContent).toContain('Claude');
  });

  it('Cancel sends nothing, removes the overlay and lets the page be asked again', async () => {
    document.getElementById('before').focus();
    translatePage();
    await dialogShown();
    control('cancel').click();
    await settle();
    expect(ports).toEqual([]);
    expect(overlayHost()).toBeNull();
    expect(pageState()).toEqual({ isTranslated: false, isTranslating: false, isShowingTranslated: false });
    expect(document.activeElement).toBe(document.getElementById('before'));

    translatePage();
    await dialogShown();
    expect(ports).toEqual([]);
  });

  it('Escape in the dialog declines without a request', async () => {
    translatePage();
    await dialogShown();
    control('go').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await settle();
    expect(ports).toEqual([]);
    expect(overlayHost()).toBeNull();
    expect(pageState().isTranslating).toBe(false);
  });

  it('Translate starts the requests and shows the progress UI', async () => {
    translatePage();
    await dialogShown();
    control('go').click();
    await vi.waitFor(() => expect(ports.length).toBeGreaterThan(0));
    expect(ports[0].started.mode).toBe('batch');
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    expect(document.querySelector('h1').textContent).toBe('FA:A heading');
    expect(store.has('confirm_page_translate')).toBe(false);
  });

  it('Don\'t ask again stores the choice, and the next page goes straight to the requests', async () => {
    translatePage();
    await dialogShown();
    dialog().querySelector('input[type="checkbox"]').click();
    control('go').click();
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    expect(store.get('confirm_page_translate')).toBe(false);

    history.pushState({}, '', '/next');
    document.body.innerHTML = '<p>Another page.</p>';
    ports.length = 0;
    translatePage();
    await vi.waitFor(() => expect(ports.length).toBe(1));
    expect(dialog()).toBeNull();
  });

  it('does not ask when the switch in Settings is off', async () => {
    store.set('confirm_page_translate', false);
    translatePage();
    await vi.waitFor(() => expect(ports.length).toBe(1));
    expect(dialog()).toBeNull();
  });

  it('a missing key shows the missing-key toast and no dialog', async () => {
    missingKey = true;
    translatePage();
    await vi.waitFor(() => expect(document.getElementById('parsipad-toast')).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 150));
    const toast = roots.get(document.getElementById('parsipad-toast'));
    expect(toast.querySelector('.message').textContent).toBe(translations.en.apiKeyNotConfigured);
    expect(dialog()).toBeNull();
    expect(overlayHost()).toBeNull();
    expect(ports).toEqual([]);
    expect(pageState().isTranslating).toBe(false);
  });

  it('a navigation while the dialog is up closes it quietly, with no request', async () => {
    translatePage();
    await dialogShown();
    history.pushState({}, '', '/elsewhere');
    await settle();
    expect(overlayHost()).toBeNull();
    expect(ports).toEqual([]);
    expect(document.getElementById('parsipad-toast')).toBeNull();
    expect(pageState()).toEqual({ isTranslated: false, isTranslating: false, isShowingTranslated: false });
  });

  it('Cancel from the popup closes the dialog with no request', async () => {
    translatePage();
    await dialogShown();
    onMessage({ action: 'CANCEL_PAGE_TRANSLATION' }, { id: 'parsipad' }, () => {});
    await settle();
    expect(overlayHost()).toBeNull();
    expect(ports).toEqual([]);
    expect(pageState().isTranslating).toBe(false);
  });

  it('asks in Persian when the interface is Persian', async () => {
    for (const listener of storageListeners) listener({ ui_language: { newValue: 'fa' } }, 'local');
    try {
      translatePage();
      await dialogShown();
      expect(control('go').textContent).toBe(translations.fa.pageConfirmGo);
      expect(control('cancel').textContent).toBe(translations.fa.cancel);
    } finally {
      for (const listener of storageListeners) listener({ ui_language: { newValue: 'en' } }, 'local');
    }
  });
});
