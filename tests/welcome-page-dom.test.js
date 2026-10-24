// tests/welcome-page-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/welcome/welcome.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ACTIONS, STORAGE_KEYS } from '../lib/constants.js';
import { translations } from '../lib/i18n.js';
import { WELCOME_SAMPLE } from '../welcome/finish.js';

/**
 * The Welcome page driven through its own markup and welcome.js, with
 * chrome.storage held in memory. Save & test tests the typed key before it is
 * stored, exactly as Settings does: a malformed key sends nothing, a key the
 * provider rejects is never stored, a pass stores it and sets keyWorks, and a
 * test that reaches no verdict stores it and says it is untested. keyWorks
 * starts true when a key is already stored, and nothing is sent without a
 * click. After a rejection keyWorks follows whether a key is stored, since the
 * background translates with the stored key.
 *
 * The try-it step translates one English sample through the worker, only on
 * a click and only while keyWorks holds, and writes the Persian result rtl. A
 * failed sample shows the localized error and a next step. Done is the one
 * finishing control: it stores a typed but unsaved key through the same
 * test-before-store path, always marks onboarding complete, then returns to
 * Settings at About when Settings opened the page, and closes the tab
 * otherwise.
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
const translateCalls = () => chrome.runtime.sendMessage.mock.calls.filter(([msg]) => msg?.action === ACTIONS.TRANSLATE);
const tryButton = () => document.getElementById('try-it-btn');
const tryResult = () => document.getElementById('try-it-result');
const doneButton = () => document.getElementById('done-btn');

/**
 * Answer TRANSLATE with translateResponse (or let it reject) and every other
 * message with testResult.
 * @param {object|Error|Promise} translateResponse
 */
function answerTranslate(translateResponse) {
  chrome.runtime.sendMessage.mockImplementation(async (msg) => {
    if (msg?.action !== ACTIONS.TRANSLATE) return testResult;
    if (translateResponse instanceof Error) throw translateResponse;
    return translateResponse;
  });
}

beforeEach(() => {
  const addEventListener = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    pageListeners.push([type, listener, options]);
    addEventListener(type, listener, options);
  });
  testResult = { ok: true, model: 'claude-haiku-5-5', ms: 812 };
});

afterEach(() => {
  history.replaceState(null, '', '/welcome/welcome.html');
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

  it('orders the page hero, setup, try-it, features, with Done as the one finishing control', () => {
    const order = ['class="hero-section"', 'id="setup"', 'id="try-it"', 'id="features"'].map((m) => html.indexOf(m));
    for (const index of order) expect(index).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const tryIt = html.slice(html.indexOf('<section id="try-it"'), html.indexOf('<section id="features"'));
    expect(tryIt).toMatch(/<h2[^>]*data-i18n="welcomeTryTitle"/);
    expect(tryIt).toMatch(/<p id="try-it-source"[^>]*lang="en"[^>]*dir="ltr"/);
    expect(tryIt).toMatch(/<button type="button" id="try-it-btn"[^>]*disabled/);
    expect(tryIt).toMatch(/<p id="try-it-result"[^>]*lang="fa"[^>]*dir="rtl"[^>]*aria-live="polite"/);
    expect(tryIt).toMatch(/<button type="button" id="done-btn"/);
    expect(html).not.toMatch(/id="start-btn"|startUsing|welcomeSkip/);
    expect(translations.en.welcomeTryAgainHint).toBe('Check the key above, then try again.');
    expect(translations.en.translating).toBe('Translating…');
    expect(translations.fa.translating).toMatch(/[^.]…$/);
    expect(translations.en.welcomeFinishing).toMatch(/…$/);
    expect(translations.fa.welcomeFinishing).toMatch(/…$/);
    expect(translations.en.welcomeSkip).toBeUndefined();
    expect(translations.en.startUsing).toBeUndefined();
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

  it('a rejected replacement leaves the stored key alone, and keyWorks stays on for it', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    expect(page.keyWorks).toBe(true);
    testResult = { ok: false, code: 'INVALID_API_KEY' };
    keyInput().value = 'sk-ant-revoked';
    saveButton().click();

    await vi.waitFor(() => expect(status().dataset.state).toBe('error'));
    expect(store.get(STORAGE_KEYS.apiKey)).toBe('sk-ant-stored');
    // The background translates with the stored key, so the sample still can
    expect(page.keyWorks).toBe(true);
    expect(tryButton().disabled).toBe(false);
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

describe.each(['en', 'fa'])('welcome try-it and Done in %s', (lang) => {
  const tr = translations[lang];
  const uiDir = lang === 'fa' ? 'rtl' : 'ltr';

  it('shows the English sample, keeps Translate off without a working key, and sends nothing on load', async () => {
    await loadWelcome(lang);
    const source = document.getElementById('try-it-source');
    expect(source.textContent).toBe(WELCOME_SAMPLE);
    expect(source.getAttribute('lang')).toBe('en');
    expect(source.getAttribute('dir')).toBe('ltr');
    expect(tryButton().disabled).toBe(true);
    expect(tryButton().textContent.trim()).toBe(tr.welcomeTryTranslate);
    expect(doneButton().textContent.trim()).toBe(tr.welcomeDone);

    testResult = { ok: false, code: 'INVALID_API_KEY' };
    keyInput().value = 'sk-ant-wrong';
    saveButton().click();
    await vi.waitFor(() => expect(status().dataset.state).toBe('error'));
    expect(tryButton().disabled).toBe(true);

    testResult = { ok: true, model: 'claude-haiku-5-5', ms: 300 };
    keyInput().value = 'sk-ant-good';
    saveButton().click();
    await vi.waitFor(() => expect(tryButton().disabled).toBe(false));
    expect(translateCalls()).toHaveLength(0);
  });

  it('a successful Translate writes the Persian result rtl, busy while it runs', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    expect(tryButton().disabled).toBe(false);
    expect(translateCalls()).toHaveLength(0);
    let finish;
    chrome.runtime.sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    tryButton().click();

    await vi.waitFor(() => expect(translateCalls()).toHaveLength(1));
    expect(translateCalls()[0]).toEqual([{ action: ACTIONS.TRANSLATE, text: WELCOME_SAMPLE }]);
    // Busy, yet still focusable so keyboard focus is not dropped
    expect(tryButton().disabled).toBe(false);
    expect(tryButton().getAttribute('aria-disabled')).toBe('true');
    expect(tryButton().getAttribute('aria-busy')).toBe('true');
    expect(tryButton().textContent.trim()).toBe(tr.translating);
    tryButton().click();
    expect(translateCalls()).toHaveLength(1);

    finish({ translation: 'جلسه به بعدازظهر پنجشنبه منتقل شد.', direction: 'en-fa' });
    await vi.waitFor(() => expect(tryResult().textContent).toBe('جلسه به بعدازظهر پنجشنبه منتقل شد.'));
    expect(tryResult().getAttribute('lang')).toBe('fa');
    expect(tryResult().getAttribute('dir')).toBe('rtl');
    expect(tryResult().getAttribute('aria-live')).toBe('polite');
    expect(tryResult().dataset.state).toBe('ok');
    expect(tryButton().disabled).toBe(false);
    expect(tryButton().hasAttribute('aria-busy')).toBe(false);
    expect(tryButton().hasAttribute('aria-disabled')).toBe(false);
    expect(tryButton().textContent.trim()).toBe(tr.welcomeTryTranslate);
  });

  it('a rejected sample shows the localized error and the next step, in the UI language', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-revoked' });
    answerTranslate({ error: 'Invalid API key. Please check settings.', errorCode: 'INVALID_API_KEY' });
    tryButton().click();

    await vi.waitFor(() => expect(tryResult().dataset.state).toBe('error'));
    expect(tryResult().textContent).toBe(`${tr.errorInvalidApiKey} ${tr.welcomeTryAgainHint}`);
    expect(tryResult().getAttribute('lang')).toBe(lang);
    expect(tryResult().getAttribute('dir')).toBe(uiDir);
    expect(tryButton().disabled).toBe(false);
  });

  it('a missing key also points at the key field', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    answerTranslate({ error: 'API key not set.', errorCode: 'API_KEY_NOT_SET' });
    tryButton().click();
    await vi.waitFor(() => expect(tryResult().dataset.state).toBe('error'));
    expect(tryResult().textContent).toBe(`${tr.errorApiKeyNotSet} ${tr.welcomeTryAgainHint}`);
  });

  it('a failure that says nothing about the key shows its own message alone', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    const cases = [
      [{ error: 'Provider said no.', errorCode: 'UNKNOWN' }, 'Provider said no.'],
      [new Error('Could not establish connection. Receiving end does not exist.'), tr.errorUnknown],
      [new Error('Failed to fetch'), tr.errorNetwork],
      [{ error: 'x', errorCode: 'TIMEOUT' }, tr.errorTimeout],
      [{ error: 'x', errorCode: 'RATE_LIMITED' }, tr.errorRateLimited],
      [{ error: 'x', errorCode: 'PARSE_FAILED' }, tr.errorParseFailed],
      [{ error: 'x', errorCode: 'SERVER_ERROR' }, tr.errorServerError]
    ];
    for (const [answer, expected] of cases) {
      answerTranslate(answer);
      tryButton().click();
      await vi.waitFor(() => expect(tryResult().textContent).toBe(expected));
      expect(tryResult().dataset.state).toBe('error');
    }
  });

  it('clears the last result when a Translate starts, so the same error is announced again', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    answerTranslate({ error: 'x', errorCode: 'RATE_LIMITED' });
    tryButton().click();
    await vi.waitFor(() => expect(tryResult().textContent).toBe(tr.errorRateLimited));

    let finish;
    chrome.runtime.sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    tryButton().click();
    await vi.waitFor(() => expect(translateCalls()).toHaveLength(2));
    expect(tryResult().textContent).toBe('');
    expect(tryResult().dataset.state).toBe('');
    finish({ error: 'x', errorCode: 'RATE_LIMITED' });
    await vi.waitFor(() => expect(tryResult().textContent).toBe(tr.errorRateLimited));
  });

  it('clears the result when the provider or the key changes', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    answerTranslate({ translation: 'جلسه منتقل شد.' });
    tryButton().click();
    await vi.waitFor(() => expect(tryResult().dataset.state).toBe('ok'));

    radio('gemini').click();
    await vi.waitFor(() => expect(tryResult().textContent).toBe(''));
    expect(tryResult().dataset.state).toBe('');

    radio('claude').click();
    await vi.waitFor(() => expect(tryButton().disabled).toBe(false));
    tryButton().click();
    await vi.waitFor(() => expect(tryResult().dataset.state).toBe('ok'));
    testResult = { ok: true, model: 'claude-haiku-5-5', ms: 300 };
    keyInput().value = 'sk-ant-other';
    saveButton().click();
    await vi.waitFor(() => expect(status().dataset.state).toBe('ok'));
    expect(tryResult().textContent).toBe('');
    expect(tryResult().dataset.state).toBe('');
  });

  it('a double Done click finishes once', async () => {
    history.replaceState(null, '', '/welcome/welcome.html?from=settings');
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    const assign = vi.spyOn(location, 'assign').mockImplementation(() => {});
    doneButton().click();
    doneButton().click();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(assign).toHaveBeenCalledTimes(1);
    const onboardingWrites = chrome.storage.local.set.mock.calls.filter(([items]) => STORAGE_KEYS.onboardingComplete in items);
    expect(onboardingWrites).toHaveLength(1);
    // Leaving for Settings, the button stays busy so it is not pressed again
    expect(doneButton().getAttribute('aria-busy')).toBe('true');
  });

  it('Done shows it is busy while a typed key is tested, and is itself again if the tab stays open', async () => {
    await loadWelcome(lang);
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    let finish;
    chrome.runtime.sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    keyInput().value = 'sk-ant-typed';
    doneButton().click();

    await vi.waitFor(() => expect(testCalls()).toHaveLength(1));
    expect(doneButton().getAttribute('aria-busy')).toBe('true');
    expect(doneButton().getAttribute('aria-disabled')).toBe('true');
    expect(doneButton().textContent.trim()).toBe(tr.welcomeFinishing);
    expect(close).not.toHaveBeenCalled();

    finish({ ok: true, model: 'claude-haiku-5-5', ms: 300 });
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(doneButton().hasAttribute('aria-busy')).toBe(false);
    expect(doneButton().hasAttribute('aria-disabled')).toBe(false);
    expect(doneButton().textContent.trim()).toBe(tr.welcomeDone);
  });

  it('Done while a Save & test is pending waits for it and does not test the key twice', async () => {
    await loadWelcome(lang);
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    let finish;
    chrome.runtime.sendMessage.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    keyInput().value = 'sk-ant-pending';
    saveButton().click();
    await vi.waitFor(() => expect(testCalls()).toHaveLength(1));

    doneButton().click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(close).not.toHaveBeenCalled();
    expect(store.has(STORAGE_KEYS.onboardingComplete)).toBe(false);

    finish({ ok: true, model: 'claude-haiku-5-5', ms: 300 });
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(testCalls()).toHaveLength(1);
    expect(store.get(STORAGE_KEYS.apiKey)).toBe('sk-ant-pending');
    expect(store.get(STORAGE_KEYS.onboardingComplete)).toBe(true);
  });

  it('Done from Settings marks onboarding complete and returns to Settings at About', async () => {
    history.replaceState(null, '', '/welcome/welcome.html?from=settings');
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-stored' });
    const assign = vi.spyOn(location, 'assign').mockImplementation(() => {});
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    doneButton().click();

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('../settings/settings.html#about'));
    expect(store.get(STORAGE_KEYS.onboardingComplete)).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it('Done from anywhere else marks onboarding complete and closes the tab, even after a failed sample', async () => {
    await loadWelcome(lang, { [STORAGE_KEYS.apiKey]: 'sk-ant-revoked' });
    const assign = vi.spyOn(location, 'assign').mockImplementation(() => {});
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    answerTranslate({ error: 'Invalid API key. Please check settings.', errorCode: 'INVALID_API_KEY' });
    tryButton().click();
    await vi.waitFor(() => expect(tryResult().dataset.state).toBe('error'));

    doneButton().click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(store.get(STORAGE_KEYS.onboardingComplete)).toBe(true);
    expect(assign).not.toHaveBeenCalled();
  });

  it('Done tests a typed but unsaved key before storing it, then finishes', async () => {
    await loadWelcome(lang);
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    let storedAtTest = 'unset';
    chrome.runtime.sendMessage.mockImplementation(async () => {
      storedAtTest = store.get(STORAGE_KEYS.apiKey);
      return testResult;
    });
    keyInput().value = 'sk-ant-typed';
    doneButton().click();

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(testCalls()).toEqual([[{ action: ACTIONS.TEST_API_KEY, provider: 'claude', key: 'sk-ant-typed' }]]);
    expect(storedAtTest).toBeUndefined();
    expect(store.get(STORAGE_KEYS.apiKey)).toBe('sk-ant-typed');
    expect(store.get(STORAGE_KEYS.selectedProvider)).toBe('claude');
    expect(store.get(STORAGE_KEYS.onboardingComplete)).toBe(true);
    expect(translateCalls()).toHaveLength(0);
  });

  it('Done never stores a rejected or malformed typed key, and still finishes', async () => {
    await loadWelcome(lang);
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    testResult = { ok: false, code: 'INVALID_API_KEY' };
    keyInput().value = 'sk-ant-rejected';
    doneButton().click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(store.has(STORAGE_KEYS.apiKey)).toBe(false);
    expect(store.get(STORAGE_KEYS.onboardingComplete)).toBe(true);

    await loadWelcome(lang);
    const closeAgain = vi.spyOn(window, 'close').mockImplementation(() => {});
    keyInput().value = 'not-a-key';
    doneButton().click();
    await vi.waitFor(() => expect(closeAgain).toHaveBeenCalledTimes(1));
    expect(testCalls()).toHaveLength(0);
    expect(store.has(STORAGE_KEYS.apiKey)).toBe(false);
    expect(store.get(STORAGE_KEYS.onboardingComplete)).toBe(true);
  });

  it('Done still leaves the page when storage fails', async () => {
    await loadWelcome(lang);
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    chrome.storage.local.set.mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    keyInput().value = 'sk-ant-typed';
    doneButton().click();

    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(warn).toHaveBeenCalled();
  });
});
