// tests/popup-slow-reply.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/popup/popup.html"}
// The popup six seconds into a request with no reply says the provider is
// slow, and clears the notice the moment the reply or an error lands. A
// Polish request of one or two words is turned away with the amber notice.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

const POLISHED = {
  professional: 'Could we move our meeting to Thursday?',
  conversational: 'Any chance we could push the meeting to Thursday?',
  concise: 'Could we move the meeting to Thursday?'
};
const TRANSLATED = { mode: 'sentence', translation: 'گربه روی تشک نشست.', direction: 'en-fa', alternatives: [], note: '' };

let store;
let responses;
let pending;

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

/** Every chrome.* call the popup makes resolves; a pending action stays open until the test releases it. */
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
      sendMessage: vi.fn((msg) => pending[msg && msg.action] || Promise.resolve(responses[msg && msg.action] || {})),
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
const notice = () => $('#wait-notice');

async function openPopup({ mode = 'translate', text, lang = 'en', provider = 'claude' }) {
  // A key for each provider a test may pick; without one the action button is disabled.
  store = { onboarding_complete: true, ui_language: lang, theme: 'light', selectedProvider: provider, apiKey: 'sk-ant-test-key', geminiApiKey: 'AIzaSyTestKey000000000000000000000000000' };
  installChrome();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../popup/popup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect($('#char-count').textContent).toContain('|'));
  if (mode === 'polish') $('#mode-polish').click();
  $('#input-text').value = text;
  $('#input-text').dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  responses = {};
  pending = {};
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('a slow reply in the popup', () => {
  it('says the provider is slow six seconds into a Polish request, and clears when the reply lands', async () => {
    const reply = deferred();
    pending.POLISH = reply.promise;
    await openPopup({ mode: 'polish', text: 'hi can we move the meeting to thursday', provider: 'gemini' });
    $('#action-btn').click();
    await vi.advanceTimersByTimeAsync(5999);
    expect(notice().hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(notice().hidden).toBe(false));
    expect(notice().textContent).toContain('Gemini is taking longer than usual');
    expect(notice().getAttribute('role')).toBe('status');
    reply.resolve(POLISHED);
    await vi.waitFor(() => expect($('#polish-concise').textContent).toBe(POLISHED.concise));
    expect(notice().hidden).toBe(true);
  });

  it('shows no notice when the reply is quick', async () => {
    responses.POLISH = POLISHED;
    await openPopup({ mode: 'polish', text: 'hi can we move the meeting to thursday' });
    $('#action-btn').click();
    await vi.waitFor(() => expect($('#polish-concise').textContent).toBe(POLISHED.concise));
    await vi.advanceTimersByTimeAsync(7000);
    expect(notice().hidden).toBe(true);
  });

  it('covers Translate too, and clears when the request fails', async () => {
    const reply = deferred();
    pending.TRANSLATE = reply.promise;
    await openPopup({ text: 'The cat sat on the mat.' });
    $('#action-btn').click();
    await vi.advanceTimersByTimeAsync(6000);
    await vi.waitFor(() => expect(notice().hidden).toBe(false));
    expect(notice().textContent).toContain('Claude is taking longer than usual');
    reply.resolve({ error: 'Translation service unavailable. Please try again.', errorCode: 'SERVER_ERROR' });
    await vi.waitFor(() => expect($('#error-section').hidden).toBe(false));
    expect(notice().hidden).toBe(true);
  });

  it('clears when a translation lands', async () => {
    const reply = deferred();
    pending.TRANSLATE = reply.promise;
    await openPopup({ text: 'The cat sat on the mat.' });
    $('#action-btn').click();
    await vi.advanceTimersByTimeAsync(6000);
    await vi.waitFor(() => expect(notice().hidden).toBe(false));
    reply.resolve(TRANSLATED);
    await vi.waitFor(() => expect($('#output-section').hidden).toBe(false));
    expect(notice().hidden).toBe(true);
  });

  it('is worded in Persian in the Persian interface', async () => {
    const reply = deferred();
    pending.POLISH = reply.promise;
    await openPopup({ mode: 'polish', text: 'hi can we move the meeting to thursday', lang: 'fa', provider: 'gemini' });
    $('#action-btn').click();
    await vi.advanceTimersByTimeAsync(6000);
    await vi.waitFor(() => expect(notice().hidden).toBe(false));
    expect(notice().textContent.trim()).toBe(translations.fa.slowReply.replace('{provider}', 'Gemini'));
    reply.resolve(POLISHED);
    // Let the result land before the chrome stub goes away.
    await vi.waitFor(() => expect($('#polish-concise').textContent).toBe(POLISHED.concise));
  });
});

describe('a Polish request of one or two words', () => {
  it('is turned away with the amber notice, not the red one', async () => {
    responses.POLISH = { error: translations.en.errorPolishTooShort, errorCode: 'POLISH_TOO_SHORT' };
    await openPopup({ mode: 'polish', text: 'thanks alot' });
    $('#action-btn').click();
    await vi.waitFor(() => expect($('#error-section').hidden).toBe(false));
    expect($('#error-message').textContent).toBe(translations.en.errorPolishTooShort);
    expect($('#error-section').classList.contains('is-destructive')).toBe(false);
    expect($('#polish-section').hidden).toBe(true);
  });
});
