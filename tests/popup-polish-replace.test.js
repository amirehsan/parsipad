// tests/popup-polish-replace.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/popup/popup.html"}
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Replace on the popup's Polish cards puts the version into the popup's own
 * text box, so it can be polished again, translated or copied from there.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

const POLISHED = {
  professional: 'Could we move our meeting to Thursday?',
  conversational: 'Hey! Any chance we could push the meeting to Thursday?',
  concise: 'Could we move the meeting to Thursday?'
};

let store;
let responses;

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

async function polish() {
  store = { onboarding_complete: true, ui_language: 'en', theme: 'light', selectedProvider: 'claude', apiKey: 'sk-ant-test-key' };
  responses = { POLISH: POLISHED };
  installChrome();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../popup/popup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect($('#char-count').textContent).toContain('|'));
  $('#mode-polish').click();
  $('#input-text').value = 'hi can we move the meeting to thursday';
  $('#input-text').dispatchEvent(new Event('input', { bubbles: true }));
  $('#action-btn').click();
  await vi.waitFor(() => expect($('#polish-concise').textContent).toBe(POLISHED.concise));
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete globalThis.chrome;
});

describe('Replace on the popup Polish cards', () => {
  it('each Polish card has a Replace button with the i18n key', () => {
    const buttons = html.match(/<button class="polish-replace-btn"[^>]*>/g) || [];
    expect(buttons).toHaveLength(3);
    for (const variant of ['professional', 'conversational', 'concise']) {
      expect(html).toMatch(new RegExp(`<button class="polish-replace-btn" data-version="${variant}" data-i18n="replace">Replace</button>`));
    }
  });

  it('Replace fills the text box, fires input and focuses it', async () => {
    await polish();
    const input = $('#input-text');
    const inputs = [];
    input.addEventListener('input', () => inputs.push(1));
    $('.polish-replace-btn[data-version="conversational"]').click();
    expect(input.value).toBe(POLISHED.conversational);
    expect(inputs).toHaveLength(1);
    expect($('#char-count').textContent).toContain(`${POLISHED.conversational.length} `);
    expect(document.activeElement).toBe(input);
  });

  it('the button reads Replaced for a moment', async () => {
    await polish();
    vi.useFakeTimers();
    const btn = $('.polish-replace-btn[data-version="concise"]');
    btn.click();
    expect(btn.textContent).toBe('Replaced');
    vi.advanceTimersByTime(1500);
    expect(btn.textContent).toBe('Replace');
  });

  it('the popup translation card has no Replace', () => {
    expect(popupJs).not.toMatch(/onReplace/);
  });
});
