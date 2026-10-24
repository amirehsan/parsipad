// tests/welcome-page-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/welcome/welcome.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ACTIONS, STORAGE_KEYS } from '../lib/constants.js';
import { translations } from '../lib/i18n.js';

/**
 * The Welcome page driven through its own markup and welcome.js, with
 * chrome.storage held in memory. Save & test tests the typed key before it is
 * stored, exactly as Settings does: a malformed key sends nothing, a key the
 * provider rejects is never stored, a pass stores it and sets keyWorks, and a
 * test that reaches no verdict stores it and says it is untested. keyWorks
 * starts true when a key is already stored, and nothing is sent without a
 * click. Task 7 extends this file with the sample translation and Done.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'welcome/welcome.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.indexOf('<script type="module"'));

let store;
let testResult;
let page;
// Listeners each loaded copy of welcome.js adds to document. A fresh import
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
      getURL: (p) => `chrome-extension://parsipad/${p}`,
      sendMessage: vi.fn(async () => testResult)
    }
  };
}

async function loadWelcome(lang, stored = {}) {
  store = new Map([[STORAGE_KEYS.language, lang], ...Object.entries(stored)]);
  globalThis.chrome = fakeChrome();
  detachPage();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  page = await import('../welcome/welcome.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect(document.querySelector('#key-help .key-help')).not.toBeNull());
}

const keyInput = () => document.getElementById('api-key');
const status = () => document.getElementById('api-status');
const saveButton = () => document.getElementById('save-key-btn');
const revealButton = () => document.getElementById('toggle-visibility');
const radio = (provider) => document.querySelector(`input[name="provider"][value="${provider}"]`);
const testCalls = () => chrome.runtime.sendMessage.mock.calls.filter(([msg]) => msg?.action === ACTIONS.TEST_API_KEY);

beforeEach(() => {
  const addEventListener = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    pageListeners.push([type, listener, options]);
    addEventListener(type, listener, options);
  });
  testResult = { ok: true, model: 'claude-haiku-5-5', ms: 812 };
});

afterEach(() => {
  detachPage();
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('welcome setup markup', () => {
  it('gives the key field its label, no spellcheck, ltr and a placeholder ending in an ellipsis', () => {
    const input = html.match(/<input[^>]+id="api-key"[^>]*>/)[0];
    expect(input).toMatch(/type="password"/);
    expect(input).toMatch(/autocomplete="off"/);
    expect(input).toMatch(/spellcheck="false"/);
    expect(input).toMatch(/dir="ltr"/);
    expect(input).toMatch(/placeholder="[^"]*…"/);
    expect(html).toMatch(/<label[^>]+for="api-key"/);
  });

  it('groups the providers under a legend and announces the status politely', () => {
    const setup = html.slice(html.indexOf('<section id="setup"'), html.indexOf('<section id="features"'));
    expect(setup).toMatch(/<fieldset[^>]*>\s*<legend[^>]*data-i18n="chooseProvider"/);
    expect(setup).toMatch(/<p id="api-status"[^>]*role="status"[^>]*aria-live="polite"/);
    expect(setup).toMatch(/<div id="key-help"/);
    expect(setup).toMatch(/<p class="privacy-note" data-i18n="welcomePrivacyNote"/);
    expect(setup.indexOf('id="key-help"')).toBeLessThan(setup.indexOf('class="privacy-note"'));
  });

  it('takes every string it marks for translation from keys in both locales', () => {
    const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
    expect(keys).toEqual(expect.arrayContaining(['welcomeSetupTitle', 'welcomeFeaturesTitle', 'featureScreenshot', 'featureScreenshotDesc', 'saveAndTestKey']));
    for (const key of keys) {
      expect(translations.en[key], `en.${key}`).toBeTruthy();
      expect(translations.fa[key], `fa.${key}`).toBeTruthy();
    }
  });

  it('hides every decorative icon from assistive technology', () => {
    for (const svg of html.match(/<svg[^>]*>/g)) expect(svg).toMatch(/aria-hidden="true"/);
  });
});

describe.each(['en', 'fa'])('welcome setup in %s', (lang) => {
  const tr = translations[lang];

  it('makes no request on load or when a provider is chosen, and follows the choice', async () => {
    await loadWelcome(lang);
    expect(document.querySelector('label[for="api-key"]').textContent).toBe(tr.anthropicApiKey);
    expect(document.querySelector('#key-help details').getAttribute('lang')).toBe(lang);

    radio('gemini').click();
    await vi.waitFor(() => expect(document.querySelector('label[for="api-key"]').textContent).toBe(tr.googleApiKey));
    expect(keyInput().placeholder).toMatch(/…$/);
    expect(document.querySelector('#key-help a').getAttribute('href')).toBe('https://aistudio.google.com/apikey');
    expect(testCalls()).toHaveLength(0);
    expect(status().textContent).toBe('');
  });

  it('a malformed key: localized message, focus back in the field, no request, nothing stored', async () => {
    await loadWelcome(lang);
    keyInput().value = 'wrong-key';
    saveButton().click();

    await vi.waitFor(() => expect(status().dataset.state).toBe('error'));
    const expected = tr.keyTestFailed.replace('{reason}', tr.keyFormatInvalid.replace('{provider}', 'Claude').replace('{prefixes}', 'sk-ant-'));
    expect(status().textContent).toBe(expected);
    expect(status().querySelector('bdi[dir="ltr"]').textContent).toBe('sk-ant-');
    expect(document.activeElement).toBe(keyInput());
    expect(testCalls()).toHaveLength(0);
    expect(store.has(STORAGE_KEYS.apiKey)).toBe(false);
  });

  it('a key the provider rejects is never stored and keyWorks stays false', async () => {
    await loadWelcome(lang);
    testResult = { ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' };
    keyInput().value = '"sk-ant-wrong"';
    saveButton().click();

    await vi.waitFor(() => expect(status().dataset.state).toBe('error'));
    expect(status().textContent).toBe(tr.keyTestFailed.replace('{reason}', tr.keyRejected));
    expect(testCalls()).toEqual([[{ action: ACTIONS.TEST_API_KEY, provider: 'claude', key: 'sk-ant-wrong' }]]);
    expect(store.has(STORAGE_KEYS.apiKey)).toBe(false);
    expect(store.has(STORAGE_KEYS.selectedProvider)).toBe(false);
    expect(page.keyWorks).toBe(false);
    expect(document.activeElement).toBe(keyInput());
  });

  it('a rejected replacement leaves the stored key alone and turns keyWorks off', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    expect(page.keyWorks).toBe(true);
    testResult = { ok: false, code: 'INVALID_API_KEY' };
    keyInput().value = 'sk-ant-revoked';
    saveButton().click();

    await vi.waitFor(() => expect(status().dataset.state).toBe('error'));
    expect(store.get(STORAGE_KEYS.apiKey)).toBe('sk-ant-stored');
    expect(page.keyWorks).toBe(false);
  });

  it('a good key: tested before it is stored, then stored with the provider, keyWorks on', async () => {
    await loadWelcome(lang);
    expect(page.keyWorks).toBe(false);
    let storedAtTest = 'unset';
    chrome.runtime.sendMessage.mockImplementation(async () => {
      storedAtTest = store.get(STORAGE_KEYS.apiKey);
      return testResult;
    });
    keyInput().value = 'sk-ant-good';
    saveButton().click();

    await vi.waitFor(() => expect(status().dataset.state).toBe('ok'));
    expect(status().textContent).toBe(tr.keyTestOk.replace('{model}', 'claude-haiku-5-5').replace('{ms}', '812'));
    expect(status().querySelector('bdi[dir="ltr"]').textContent).toBe('claude-haiku-5-5');
    expect(storedAtTest).toBeUndefined();
    expect(store.get(STORAGE_KEYS.apiKey)).toBe('sk-ant-good');
    expect(store.get(STORAGE_KEYS.selectedProvider)).toBe('claude');
    expect(testCalls()).toEqual([[{ action: ACTIONS.TEST_API_KEY, provider: 'claude', key: 'sk-ant-good' }]]);
    expect(page.keyWorks).toBe(true);
    expect(saveButton().disabled).toBe(false);
  });

  it('a test that reaches no verdict stores the key and says it is untested', async () => {
    await loadWelcome(lang);
    testResult = { ok: false, code: 'NETWORK', message: 'Check your internet connection.' };
    keyInput().value = 'sk-ant-offline';
    saveButton().click();

    await vi.waitFor(() => expect(status().dataset.state).toBe('info'));
    expect(status().textContent).toBe(tr.keySavedUntested.replace('{reason}', tr.errorNetwork));
    expect(store.get(STORAGE_KEYS.apiKey)).toBe('sk-ant-offline');
  });

  it('tests the chosen provider, and Enter in the field is Save & test', async () => {
    await loadWelcome(lang);
    radio('openai').click();
    await vi.waitFor(() => expect(document.querySelector('label[for="api-key"]').textContent).toBe(tr.openaiApiKey));
    testResult = { ok: true, model: 'gpt-5-nano', ms: 300 };
    keyInput().value = 'sk-openai-good';
    keyInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await vi.waitFor(() => expect(status().dataset.state).toBe('ok'));
    expect(testCalls()).toEqual([[{ action: ACTIONS.TEST_API_KEY, provider: 'openai', key: 'sk-openai-good' }]]);
    expect(store.get(STORAGE_KEYS.openaiApiKey)).toBe('sk-openai-good');
    expect(store.get(STORAGE_KEYS.selectedProvider)).toBe('openai');
    expect(store.has(STORAGE_KEYS.apiKey)).toBe(false);
  });

  it('an empty field asks for a key and keeps focus there', async () => {
    await loadWelcome(lang);
    saveButton().click();
    await vi.waitFor(() => expect(status().textContent).toBe(tr.pleaseEnterApiKey));
    expect(document.activeElement).toBe(keyInput());
    expect(testCalls()).toHaveLength(0);
  });

  it('locks Save & test while a test runs', async () => {
    await loadWelcome(lang);
    let finish;
    chrome.runtime.sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    keyInput().value = 'sk-ant-slow';
    saveButton().click();

    await vi.waitFor(() => expect(testCalls()).toHaveLength(1));
    expect(saveButton().disabled).toBe(true);
    expect(status().textContent).toBe(tr.keyTesting);
    saveButton().click();
    expect(testCalls()).toHaveLength(1);

    finish({ ok: true, model: 'claude-haiku-5-5', ms: 300 });
    await vi.waitFor(() => expect(status().dataset.state).toBe('ok'));
    expect(saveButton().disabled).toBe(false);
  });

  it('keyWorks starts true when the selected provider has a stored key, and follows the provider', async () => {
    await loadWelcome(lang, {
      [STORAGE_KEYS.selectedProvider]: 'gemini',
      [STORAGE_KEYS.geminiApiKey]: 'AIzaStoredKey'
    });
    expect(radio('gemini').checked).toBe(true);
    expect(keyInput().value).toBe('AIzaStoredKey');
    expect(page.keyWorks).toBe(true);

    radio('claude').click();
    await vi.waitFor(() => expect(page.keyWorks).toBe(false));
    expect(keyInput().value).toBe('');

    radio('gemini').click();
    await vi.waitFor(() => expect(page.keyWorks).toBe(true));
    expect(testCalls()).toHaveLength(0);
  });

  it('reveal keeps one name and says the state with aria-pressed', async () => {
    await loadWelcome(lang);
    const button = revealButton();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe(tr.revealKey);
    button.click();
    expect(keyInput().type).toBe('text');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe(tr.revealKey);
    expect(button.getAttribute('title')).toBe(tr.hideKey);
    button.click();
    expect(keyInput().type).toBe('password');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('title')).toBe(tr.revealKey);
  });

  it('puts the page in the UI language and direction', async () => {
    await loadWelcome(lang);
    expect(document.documentElement.dir).toBe(lang === 'fa' ? 'rtl' : 'ltr');
    expect(document.querySelector('.privacy-note').textContent).toBe(tr.welcomePrivacyNote);
    expect(document.querySelector('[data-i18n="featureScreenshot"]').textContent).toBe(tr.featureScreenshot);
    expect(keyInput().getAttribute('dir')).toBe('ltr');
  });
});
