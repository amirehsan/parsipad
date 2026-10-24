// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// A whole-page translation asks first, in the real content script: nothing
// reaches the provider until the user presses Translate, a missing key still
// gets its toast instead of the dialog, and a navigation or a Cancel from the
// popup closes the dialog without a request.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { functionBody } from './helpers/source.js';
import { loadContentScript } from './helpers/content-script.js';

const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');

let h;

beforeAll(async () => {
  h = await loadContentScript();
});

beforeEach(() => {
  document.body.innerHTML = `
    <button id="before">before</button>
    <h1>A heading</h1>
    <p>First paragraph with a <a href="#">link</a> inside.</p>
    <p>Second paragraph.</p>`;
  h.reset();
});

afterEach(() => {
  // A navigation resets page translation, as an SPA route change does. Only
  // a change of path or query counts, so go elsewhere and back.
  history.pushState({}, '', '/reset');
  history.pushState({}, '', '/article');
  document.getElementById('parsipad-toast')?.remove();
  document.getElementById('parsipad-page-toggle')?.remove();
});

const overlayHost = () => document.getElementById('parsipad-page-progress');
const overlay = () => (overlayHost() ? h.roots.get(overlayHost()) : null);
const dialog = () => overlay()?.querySelector('[role="dialog"]') ?? null;
const control = (action) => dialog().querySelector(`[data-action="${action}"]`);

function translatePage() {
  h.onMessage({ action: 'TRANSLATE_PAGE' });
}

function pageState() {
  return h.onMessage({ action: 'GET_PAGE_TRANSLATION_STATE' });
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
    h.store.set('selectedProvider', 'gemini');
    translatePage();
    await dialogShown();
    expect(h.ports).toEqual([]);
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
    expect(h.ports).toEqual([]);
    expect(overlayHost()).toBeNull();
    expect(pageState()).toEqual({ isTranslated: false, isTranslating: false, isShowingTranslated: false });
    expect(document.activeElement).toBe(document.getElementById('before'));

    translatePage();
    await dialogShown();
    expect(h.ports).toEqual([]);
  });

  it('Escape in the dialog declines without a request', async () => {
    translatePage();
    await dialogShown();
    control('go').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await settle();
    expect(h.ports).toEqual([]);
    expect(overlayHost()).toBeNull();
    expect(pageState().isTranslating).toBe(false);
  });

  it('says it is preparing while it reads the page and checks the key', async () => {
    let open;
    h.keyCheckGate = new Promise((resolve) => { open = resolve; });
    translatePage();
    await settle();
    const status = overlay().querySelector('[role="status"]');
    expect(status.textContent).toBe(translations.en.pagePreparing);
    expect(translations.en.pagePreparing.endsWith('\u2026')).toBe(true);
    expect(dialog()).toBeNull();
    open();
    await dialogShown();
    expect(overlay().querySelector('[role="status"]')).toBeNull();
  });

  it('covers the page with a scrim while it asks, and a click on it is Cancel', async () => {
    document.getElementById('before').focus();
    translatePage();
    await dialogShown();
    const host = overlayHost();
    expect(host.style.position).toBe('fixed');
    for (const side of ['top', 'right', 'bottom', 'left']) expect(host.style[side], side).toBe('0px');
    expect(host.style.transform).toBe('');
    const scrim = overlay().querySelector('.parsipad-scrim');
    expect(scrim).not.toBeNull();
    scrim.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await settle();
    expect(h.ports).toEqual([]);
    expect(overlayHost()).toBeNull();
    expect(pageState().isTranslating).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('before'));
  });

  it('a click inside the dialog is not a click on the scrim', async () => {
    translatePage();
    await dialogShown();
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await settle();
    expect(dialog()).not.toBeNull();
  });

  it('goes back to the bottom-centre progress card after Translate', async () => {
    let finish;
    const gate = new Promise((resolve) => { finish = resolve; });
    translatePage();
    await dialogShown();
    // Hold the first batch so the progress card can be seen.
    const connect = chrome.runtime.connect;
    chrome.runtime.connect = () => {
      const port = connect();
      const post = port.postMessage;
      port.postMessage = (msg) => { gate.then(() => post(msg)); };
      return port;
    };
    try {
      control('go').click();
      await vi.waitFor(() => expect(h.ports.length).toBe(1));
      const host = overlayHost();
      expect(host.style.top).toBe('');
      expect(host.style.bottom).toBe('24px');
      expect(host.style.transform).toBe('translateX(-50%)');
      expect(overlay().querySelector('.parsipad-scrim')).toBeNull();
      expect(overlay().querySelector('.parsipad-progress-overlay')).not.toBeNull();
    } finally {
      chrome.runtime.connect = connect;
      finish();
    }
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
  });

  it('Translate starts the requests and shows the progress UI', async () => {
    translatePage();
    await dialogShown();
    control('go').click();
    await vi.waitFor(() => expect(h.ports.length).toBeGreaterThan(0));
    expect(h.ports[0].started.mode).toBe('batch');
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    expect(document.querySelector('h1').textContent).toBe('FA:A heading');
    expect(h.store.has('confirm_page_translate')).toBe(false);
  });

  it('Don\'t ask again stores the choice, and the next page goes straight to the requests', async () => {
    translatePage();
    await dialogShown();
    dialog().querySelector('input[type="checkbox"]').click();
    control('go').click();
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    expect(h.store.get('confirm_page_translate')).toBe(false);

    history.pushState({}, '', '/next');
    document.body.innerHTML = '<p>Another page.</p>';
    h.ports.length = 0;
    translatePage();
    await vi.waitFor(() => expect(h.ports.length).toBe(1));
    expect(dialog()).toBeNull();
  });

  it('does not ask when the switch in Settings is off', async () => {
    h.store.set('confirm_page_translate', false);
    translatePage();
    await vi.waitFor(() => expect(h.ports.length).toBe(1));
    expect(dialog()).toBeNull();
  });

  it('a missing key shows the missing-key toast and no dialog', async () => {
    h.missingKey = true;
    translatePage();
    await vi.waitFor(() => expect(document.getElementById('parsipad-toast')).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 150));
    const toast = h.roots.get(document.getElementById('parsipad-toast'));
    expect(toast.querySelector('.message').textContent).toBe(translations.en.apiKeyNotConfigured);
    expect(dialog()).toBeNull();
    expect(overlayHost()).toBeNull();
    expect(h.ports).toEqual([]);
    expect(pageState().isTranslating).toBe(false);
  });

  it('a missing key leaves no page-translation state behind', () => {
    const body = functionBody(js, 'handleTranslatePage');
    const branch = body.slice(body.indexOf('if (!keySet)'), body.indexOf('}', body.indexOf('if (!keySet)')));
    expect(branch).toMatch(/discard = true;/);
    expect(body).toMatch(/if \(discard\) pageTranslationState = null;/);
  });

  it('a navigation while the dialog is up closes it quietly, with no request', async () => {
    translatePage();
    await dialogShown();
    history.pushState({}, '', '/elsewhere');
    await settle();
    expect(overlayHost()).toBeNull();
    expect(h.ports).toEqual([]);
    expect(document.getElementById('parsipad-toast')).toBeNull();
    expect(pageState()).toEqual({ isTranslated: false, isTranslating: false, isShowingTranslated: false });
  });

  it('Cancel from the popup closes the dialog with no request', async () => {
    translatePage();
    await dialogShown();
    h.onMessage({ action: 'CANCEL_PAGE_TRANSLATION' });
    await settle();
    expect(overlayHost()).toBeNull();
    expect(h.ports).toEqual([]);
    expect(pageState().isTranslating).toBe(false);
  });

  it('asks in Persian when the interface is Persian', async () => {
    h.setUiLanguage('fa');
    try {
      translatePage();
      await dialogShown();
      expect(control('go').textContent).toBe(translations.fa.pageConfirmGo);
      expect(control('cancel').textContent).toBe(translations.fa.cancel);
    } finally {
      h.setUiLanguage('en');
    }
  });
});
