// tests/settings-provider-cards-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/settings/settings.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ACTIONS, STORAGE_KEYS } from '../lib/constants.js';
import { translations } from '../lib/i18n.js';

/**
 * The AI provider section is three provider cards, each with its own key
 * field, reveal, Save & test, Clear and status line. Driven through the real
 * markup and settings.js with chrome.storage held in memory: Save & test on
 * one card saves and tests that provider only, reports in the UI language
 * under that field, and leaves the other providers' keys alone (Review
 * Focus 3).
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'settings/settings.css'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

const GEMINI_KEY = 'AIzaSyStoredGeminiKey';
const OPENAI_KEY = 'sk-stored-openai-key';

let store;
let testResult;
// Listeners each loaded copy of settings.js adds to document. A fresh import
// does not remove the last one's, and a stale DOMContentLoaded would bind the
// new page twice, so they are taken off before the next page loads.
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
      onChanged: { addListener: vi.fn() }
    },
    runtime: {
      getManifest: () => ({ version: '0.0.0-test' }),
      getURL: (p) => `chrome-extension://parsipad/${p}`,
      sendMessage: vi.fn(async () => testResult)
    },
    tabs: { create: vi.fn() },
    commands: { getAll: vi.fn(async () => []) }
  };
}

async function loadSettings(lang) {
  store = new Map([
    [STORAGE_KEYS.language, lang],
    [STORAGE_KEYS.geminiApiKey, GEMINI_KEY],
    [STORAGE_KEYS.openaiApiKey, OPENAI_KEY]
  ]);
  globalThis.chrome = fakeChrome();
  detachPage();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../settings/settings.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect(document.getElementById('about-version').textContent).toBe('0.0.0-test'));
}

const card = (provider) => document.querySelector(`.provider-card[data-provider="${provider}"]`);
const keyInput = (provider) => card(provider).querySelector('input[type="password"], input[name$="-api-key"]');
const statusLine = (provider) => card(provider).querySelector('.key-test-status');
const saveButton = (provider) => card(provider).querySelector('.save-key-btn');
const testCalls = () => chrome.runtime.sendMessage.mock.calls.filter(([msg]) => msg?.action === ACTIONS.TEST_API_KEY);

function expectOtherKeysUntouched() {
  expect(store.get(STORAGE_KEYS.geminiApiKey)).toBe(GEMINI_KEY);
  expect(store.get(STORAGE_KEYS.openaiApiKey)).toBe(OPENAI_KEY);
}

beforeEach(() => {
  const addEventListener = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    pageListeners.push([type, listener, options]);
    addEventListener(type, listener, options);
  });
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  Element.prototype.scrollIntoView = vi.fn();
  window.confirm = vi.fn(() => true);
  testResult = { ok: true, model: 'claude-haiku-5-5', ms: 812 };
});

afterEach(() => {
  detachPage();
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('provider cards markup', () => {
  it('is one fieldset with a legend and three provider cards', () => {
    const section = html.slice(html.indexOf('<section id="providers"'), html.indexOf('<section id="reading"'));
    expect(section).toMatch(/<fieldset[^>]*>\s*<legend/);
    const cards = [...section.matchAll(/<article class="provider-card" data-provider="(\w+)"/g)].map((m) => m[1]);
    expect(cards).toEqual(['claude', 'gemini', 'openai']);
    expect(html).not.toMatch(/api-key-tab|id="api-status"|api-key-panel/);
  });

  it('gives every key field its label, no spellcheck, ltr and a placeholder ending in an ellipsis', () => {
    for (const provider of ['claude', 'gemini', 'openai']) {
      const input = html.match(new RegExp(`<input[^>]+name="${provider}-api-key"[^>]*>`))[0];
      expect(input).toMatch(/type="password"/);
      expect(input).toMatch(/autocomplete="off"/);
      expect(input).toMatch(/spellcheck="false"/);
      expect(input).toMatch(/dir="ltr"/);
      expect(input).toMatch(/placeholder="[^"]*…"/);
      const id = input.match(/id="([^"]+)"/)[1];
      expect(html).toMatch(new RegExp(`<label[^>]+for="${id}"`));
    }
    expect(html).not.toMatch(/placeholder="[^"]*\.\.\."/);
  });

  it('names its transitions and rings the card while its radio has focus', () => {
    const rules = [...css.matchAll(/(^|\n)([^{}\n]*provider[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(3);
    for (const [, , selector, body] of rules) {
      expect(body, selector).not.toMatch(/transition:\s*all/);
    }
    expect(css).toMatch(/\.provider-card:has\(input[^)]*:focus-visible\)\s*\{[^}]*outline:\s*var\(--ring-width\) solid var\(--ring-color\)/);
    expect(css).toMatch(/\.provider-card\s*\{[^}]*transition:\s*border-color var\(--motion-fast\)[^;]*box-shadow var\(--motion-fast\)/);
  });
});

describe.each(['en', 'fa'])('provider cards in %s', (lang) => {
  const tr = translations[lang];
  beforeEach(() => loadSettings(lang));

  it('makes no provider request on load or when a provider is chosen', async () => {
    const gemini = card('gemini').querySelector('input[name="provider"]');
    gemini.click();
    await vi.waitFor(() => expect(store.get(STORAGE_KEYS.selectedProvider)).toBe('gemini'));
    expect(testCalls()).toHaveLength(0);
    expect(statusLine('gemini').textContent).toBe('');
  });

  it('shows whether each provider has a key, in the UI language', () => {
    expect(card('claude').querySelector('.key-state').textContent).toBe(tr.keyNotConfigured);
    expect(card('gemini').querySelector('.key-state').textContent).toBe(tr.keyConfigured);
    expect(keyInput('gemini').value).toBe(GEMINI_KEY);
  });

  it('a malformed key: localized message under that field, focus back in it, no request, other keys untouched', async () => {
    keyInput('claude').value = 'wrong-key';
    saveButton('claude').click();

    await vi.waitFor(() => expect(statusLine('claude').dataset.state).toBe('error'));
    const expected = tr.keyTestFailed.replace('{reason}', tr.keyFormatInvalid.replace('{provider}', 'Claude').replace('{prefixes}', 'sk-ant-'));
    expect(statusLine('claude').textContent).toBe(expected);
    expect(statusLine('claude').querySelector('bdi[dir="ltr"]').textContent).toBe('sk-ant-');
    expect(document.activeElement).toBe(keyInput('claude'));
    expect(testCalls()).toHaveLength(0);
    expect(store.has(STORAGE_KEYS.apiKey)).toBe(false);
    expectOtherKeysUntouched();
    expect(statusLine('gemini').textContent).toBe('');
    expect(statusLine('openai').textContent).toBe('');
  });

  it('a key the provider rejects: its localized reason under that field and focus back in it', async () => {
    testResult = { ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' };
    keyInput('claude').value = '"sk-ant-wrong"';
    saveButton('claude').click();

    await vi.waitFor(() => expect(statusLine('claude').dataset.state).toBe('error'));
    expect(statusLine('claude').textContent).toBe(tr.keyTestFailed.replace('{reason}', tr.errorInvalidApiKey));
    expect(document.activeElement).toBe(keyInput('claude'));
    expect(testCalls()).toEqual([[{ action: ACTIONS.TEST_API_KEY, provider: 'claude', key: 'sk-ant-wrong' }]]);
    expectOtherKeysUntouched();
  });

  it('a good key: saved, tested once for that provider only, success under its field', async () => {
    keyInput('claude').value = 'sk-ant-good';
    saveButton('claude').click();

    await vi.waitFor(() => expect(statusLine('claude').dataset.state).toBe('ok'));
    expect(statusLine('claude').textContent).toBe(tr.keyTestOk.replace('{model}', 'claude-haiku-5-5').replace('{ms}', '812'));
    expect(store.get(STORAGE_KEYS.apiKey)).toBe('sk-ant-good');
    expect(testCalls()).toEqual([[{ action: ACTIONS.TEST_API_KEY, provider: 'claude', key: 'sk-ant-good' }]]);
    expect(card('claude').querySelector('.key-state').textContent).toBe(tr.keyConfigured);
    expect(saveButton('claude').disabled).toBe(false);
    expectOtherKeysUntouched();
  });

  it('an empty field asks for a key and keeps focus there', async () => {
    saveButton('claude').click();
    await vi.waitFor(() => expect(statusLine('claude').textContent).toBe(tr.pleaseEnterApiKey));
    expect(document.activeElement).toBe(keyInput('claude'));
    expect(testCalls()).toHaveLength(0);
  });

  it('clearing one card removes only that key and says so in the UI language', async () => {
    card('gemini').querySelector('.clear-key-btn').click();
    await vi.waitFor(() => expect(store.has(STORAGE_KEYS.geminiApiKey)).toBe(false));
    await vi.waitFor(() => expect(statusLine('gemini').textContent).toBe(tr.keyCleared));
    expect(keyInput('gemini').value).toBe('');
    expect(card('gemini').querySelector('.key-state').textContent).toBe(tr.keyNotConfigured);
    expect(store.get(STORAGE_KEYS.openaiApiKey)).toBe(OPENAI_KEY);
    expect(testCalls()).toHaveLength(0);
  });

  it('reveal shows and hides only that key, with a pressed state and a localized label', () => {
    const button = card('openai').querySelector('.key-reveal');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe(tr.revealKey);
    button.click();
    expect(keyInput('openai').type).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe(tr.hideKey);
    expect(keyInput('gemini').type).toBe('password');
    button.click();
    expect(keyInput('openai').type).toBe('password');
    expect(button.getAttribute('aria-label')).toBe(tr.revealKey);
  });
});
