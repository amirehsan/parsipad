// tests/popup-polish-direction-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/popup/popup.html"}
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Polish results carry their own direction. The Persian UI sets the whole
 * popup right to left, and a card that inherited that laid English out RTL,
 * putting a sentence's final period at its start (".time").
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

const POLISHED = {
  professional: 'Could we move our meeting to Thursday? I have a doctor\'s appointment at the original time.',
  conversational: 'Hey! Any chance we could push the meeting to Thursday?',
  concise: 'Could we move the meeting to Thursday?'
};

let store;
let responses;

/** Every chrome.* call the popup makes resolves; storage is held in memory. */
function installChrome() {
  const listener = { addListener: vi.fn(), removeListener: vi.fn() };
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          const keys = key === null || key === undefined ? Object.keys(store) : Array.isArray(key) ? key : typeof key === 'object' ? Object.keys(key) : [key];
          const out = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (items) => { Object.assign(store, items); }),
        remove: vi.fn(async () => {})
      },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      onChanged: listener
    },
    runtime: {
      id: 'parsipad',
      getURL: (p) => `chrome-extension://parsipad/${p}`,
      getManifest: () => ({ version: '0.0.0' }),
      sendMessage: vi.fn(async (msg) => responses[msg && msg.action] || {}),
      connect: vi.fn(() => ({ postMessage: vi.fn(), disconnect: vi.fn(), onMessage: listener, onDisconnect: listener })),
      onMessage: listener
    },
    commands: { getAll: vi.fn(async () => []) },
    tabs: { query: vi.fn(async () => [{ id: 1, url: 'https://example.com/' }]), create: vi.fn(), sendMessage: vi.fn(async () => ({})) },
    sidePanel: { open: vi.fn(async () => {}) },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) }
  };
}

const $ = (selector) => document.querySelector(selector);
const card = (variant) => $(`#polish-${variant}`);

async function polishIn(lang) {
  store = { onboarding_complete: true, ui_language: lang, theme: 'light', selectedProvider: 'claude', apiKey: 'sk-ant-test-key' };
  responses = { POLISH: POLISHED };
  installChrome();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../popup/popup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // init has run once it has written the character count, in either language,
  // over the markup's placeholder.
  await vi.waitFor(() => expect($('#char-count').textContent).toContain('|'));
  $('#mode-polish').click();
  $('#input-text').value = 'hi can we move the meeting to thursday';
  $('#input-text').dispatchEvent(new Event('input', { bubbles: true }));
  $('#action-btn').click();
  await vi.waitFor(() => expect(card('concise').textContent).toBe(POLISHED.concise));
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('Polish result direction', () => {
  it('lays English results out left to right in the Persian UI', async () => {
    await polishIn('fa');
    for (const variant of ['professional', 'conversational', 'concise']) {
      expect(card(variant).getAttribute('dir')).toBe('ltr');
      expect(card(variant).getAttribute('lang')).toBe('en');
    }
  });

  it('marks English results left to right in the English UI too', async () => {
    await polishIn('en');
    expect(card('professional').getAttribute('dir')).toBe('ltr');
  });

  it('keeps the direction when a variant is regenerated', async () => {
    await polishIn('fa');
    responses.REGENERATE_POLISH_VARIANT = { text: 'Would Thursday work instead?' };
    $('.polish-regenerate-btn[data-version="conversational"]').click();
    await vi.waitFor(() => expect(card('conversational').textContent).toBe('Would Thursday work instead?'));
    expect(card('conversational').getAttribute('dir')).toBe('ltr');
    expect(card('conversational').getAttribute('lang')).toBe('en');
  });

  it('lays a Persian result out right to left', async () => {
    await polishIn('en');
    responses.REGENERATE_POLISH_VARIANT = { text: 'آیا می‌توانیم جلسه را به پنجشنبه منتقل کنیم؟' };
    $('.polish-regenerate-btn[data-version="concise"]').click();
    await vi.waitFor(() => expect(card('concise').getAttribute('dir')).toBe('rtl'));
    expect(card('concise').getAttribute('lang')).toBe('fa');
  });
});

describe('Polish regenerate request', () => {
  // Regenerate sent only the original text, so the worker could not know
  // what the writer had rejected and often handed back a near copy.
  it('sends the version on the card as the one to replace', async () => {
    await polishIn('en');
    responses.REGENERATE_POLISH_VARIANT = { text: 'Could we move the meeting?' };
    $('.polish-regenerate-btn[data-version="concise"]').click();
    await vi.waitFor(() => expect(card('concise').textContent).toBe('Could we move the meeting?'));
    // The popup from an earlier test in this file still has its DOMContentLoaded
    // listener on the shared document, so it set itself up on this DOM too and
    // answers the click with its own stale card. The instance under test
    // registered last, so its message comes last.
    const sent = chrome.runtime.sendMessage.mock.calls.map(([m]) => m).filter((m) => m.action === 'REGENERATE_POLISH_VARIANT').at(-1);
    expect(sent).toMatchObject({ text: 'hi can we move the meeting to thursday', variant: 'concise', previous: POLISHED.concise });
  });
});
