import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

/**
 * Harness for background/service-worker.js.
 *
 * The service worker registers chrome.runtime.onMessage, chrome.runtime.onConnect,
 * chrome.runtime.onInstalled, chrome.runtime.onStartup, chrome.contextMenus and
 * chrome.commands listeners as a side effect of being imported, so a full chrome
 * stub must exist in globalThis before the module is loaded. The stub below
 * records the registered handlers (rather than just swallowing them) so tests
 * can drive them directly: sendMessage() replays chrome.runtime.onMessage the
 * way the browser would, and connectPort() replays chrome.runtime.onConnect.
 *
 * lib/api.js is mocked so no provider is contacted; everything else (mode
 * classification, normalization, cache keying, history, result finalization,
 * i18n) runs for real, so these tests exercise the actual seams between
 * those modules rather than asserting a mock back to itself.
 */

vi.mock('../lib/api.js', () => ({
  translate: vi.fn(),
  explainGrammar: vi.fn(),
  polish: vi.fn(),
  translateImage: vi.fn(),
  regeneratePolishVariant: vi.fn(),
  getGrammarLesson: vi.fn(),
  testApiKey: vi.fn()
}));

import { translate, testApiKey, polish, regeneratePolishVariant } from '../lib/api.js';
import { getHistory } from '../lib/history.js';
import { translationCache } from '../lib/cache.js';
import { setLanguage } from '../lib/storage.js';
import { t } from '../lib/i18n.js';
import { errorI18nKey, ERROR_CODES, TranslationError } from '../lib/translation/errors.js';

const store = new Map();
let captured;

/**
 * Installs a chrome stub backed by an in-memory Map (same pattern as
 * tests/cache.test.js and tests/history.test.js), and records every
 * listener the service worker registers so tests can invoke them.
 */
function installChromeStub() {
  const listeners = {
    onMessage: null,
    onConnect: [],
    onInstalled: null,
    onClicked: null
  };

  globalThis.chrome = {
    runtime: {
      id: 'test-extension-id',
      onMessage: { addListener: (fn) => { listeners.onMessage = fn; } },
      onConnect: { addListener: (fn) => { listeners.onConnect.push(fn); } },
      onInstalled: { addListener: (fn) => { listeners.onInstalled = fn; } },
      onStartup: { addListener: () => {} },
      getURL: (path) => `chrome-extension://test-extension-id/${path}`,
      openOptionsPage: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => ({}))
    },
    storage: {
      local: {
        async get(keys) {
          if (keys === undefined || keys === null) return Object.fromEntries(store);
          if (typeof keys === 'string') return store.has(keys) ? { [keys]: store.get(keys) } : {};
          if (Array.isArray(keys)) {
            const out = {};
            for (const key of keys) {
              if (store.has(key)) out[key] = store.get(key);
            }
            return out;
          }
          return {};
        },
        async set(obj) {
          for (const [key, value] of Object.entries(obj)) store.set(key, value);
        },
        async remove(key) {
          if (Array.isArray(key)) key.forEach((k) => store.delete(k));
          else store.delete(key);
        }
      },
      onChanged: { addListener: () => {} }
    },
    i18n: { getMessage: () => '' },
    tabs: {
      create: vi.fn(async () => ({})),
      query: vi.fn(async () => []),
      sendMessage: vi.fn(async () => ({})),
      captureVisibleTab: vi.fn(async () => 'data:image/png;base64,')
    },
    scripting: { executeScript: vi.fn(async () => {}) },
    contextMenus: {
      create: vi.fn(),
      onClicked: { addListener: (fn) => { listeners.onClicked = fn; } }
    },
    sidePanel: {
      open: vi.fn().mockResolvedValue(undefined),
      setPanelBehavior: vi.fn().mockResolvedValue(undefined)
    },
    commands: {
      onCommand: { addListener: () => {} }
    },
    action: {
      onClicked: { addListener: () => {} }
    }
  };

  return listeners;
}

/**
 * Replays chrome.runtime.onMessage the way the browser would: calls the
 * captured handler and resolves with whatever it passes to sendResponse.
 */
function sendMessage(message, sender = {}) {
  return new Promise((resolve) => {
    captured.onMessage(message, sender, resolve);
  });
}

/**
 * Replays chrome.runtime.onConnect for a named port. Every registered
 * onConnect handler is invoked (that is what the browser does); the ones
 * for a different port name check port.name and return without attaching
 * anything, so only the matching handler ends up wiring up the fake port.
 */
function connectPort(name) {
  const port = {
    name,
    _messageHandler: null,
    _disconnectHandlers: [],
    _posted: [],
    onMessage: { addListener: (fn) => { port._messageHandler = fn; } },
    onDisconnect: { addListener: (fn) => { port._disconnectHandlers.push(fn); } },
    postMessage: (msg) => { port._posted.push(msg); }
  };
  captured.onConnect.forEach((handler) => handler(port));
  return port;
}

beforeAll(async () => {
  captured = installChromeStub();
  await import('../background/service-worker.js');
  // Replay the install event so the menu items and panel behavior are registered.
  await captured.onInstalled({ reason: 'update' });
});

beforeEach(() => {
  store.clear();
  translate.mockReset();
});

describe('the New Tab settings survive an update', () => {
  it('leaves the New Tab keys and favorites alone on update', async () => {
    // 3.4.0 deleted these on every update while the page was gone. The page
    // is back, so a user who turned it off must stay off after the next one.
    store.set('newtab_enabled', false);
    store.set('newtab_panels', { bookmarks: false, recents: true });
    store.set('favorites', [{ id: 'keep' }]);

    await captured.onInstalled({ reason: 'update' });

    expect(store.get('newtab_enabled')).toBe(false);
    expect(store.get('newtab_panels')).toEqual({ bookmarks: false, recents: true });
    expect(store.get('favorites')).toEqual([{ id: 'keep' }]);
  });
});

describe('batch mode keeps its markers intact (the regression that shipped)', () => {
  it('sends translate the exact batch text, markers untouched, not run through the ordinary normalizer', async () => {
    translate.mockResolvedValue({ translation: 'ignored', truncated: false, detectedSource: 'en', inputTokens: 1, outputTokens: 1 });

    const batchText = '[1] node one\n[2] node two';
    await sendMessage({ action: 'TRANSLATE', text: batchText, sourceLang: 'auto', mode: 'batch' });

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].text).toBe(batchText);
  });
});

describe('mode routing', () => {
  beforeEach(() => {
    translate.mockResolvedValue({ translation: 'x', detectedSource: 'en', truncated: false, inputTokens: 1, outputTokens: 1 });
  });

  it('classifies a single word as word mode', async () => {
    const res = await sendMessage({ action: 'TRANSLATE', text: 'apple', sourceLang: 'auto' });
    expect(res.mode).toBe('word');
  });

  it('classifies a multi-sentence passage as text mode', async () => {
    const res = await sendMessage({
      action: 'TRANSLATE',
      text: 'This is one sentence. This is another sentence. And here is a third one.',
      sourceLang: 'auto'
    });
    expect(res.mode).toBe('text');
  });

  it('lets an explicit mode in the payload win over classification', async () => {
    const res = await sendMessage({ action: 'TRANSLATE', text: 'apple', sourceLang: 'auto', mode: 'sentence' });
    expect(res.mode).toBe('sentence');
  });
});

describe('cache keying', () => {
  it('keys on word plus context: different context misses, identical requests hit', async () => {
    translate.mockImplementation(async (req) => ({
      translation: `t:${req.context?.before || ''}`,
      senses: [],
      synonyms: [],
      antonyms: [],
      truncated: false,
      detectedSource: 'en',
      inputTokens: 1,
      outputTokens: 1
    }));

    const requestA = { action: 'TRANSLATE', text: 'charge', sourceLang: 'auto', context: { before: 'They will ', after: ' you a fee.' } };
    const requestB = { action: 'TRANSLATE', text: 'charge', sourceLang: 'auto', context: { before: 'Do not ', after: ' the battery.' } };

    const resA1 = await sendMessage(requestA);
    const resB1 = await sendMessage(requestB);
    expect(resA1.fromCache).toBe(false);
    expect(resB1.fromCache).toBe(false);
    expect(resA1.translation).not.toBe(resB1.translation);
    expect(translate).toHaveBeenCalledTimes(2);

    const resA2 = await sendMessage(requestA);
    expect(resA2.fromCache).toBe(true);
    expect(resA2.translation).toBe(resA1.translation);
    expect(translate).toHaveBeenCalledTimes(2);
  });
});

describe('Persian output normalization', () => {
  // Arabic Kaf (U+0643) and Arabic Yeh (U+064A) are written as \uXXXX escapes
  // since they are visually indistinguishable from Persian Kaf (literal "ک")
  // and Persian Yeh (literal "ی") in most fonts. Every other letter below is
  // shared unchanged by both scripts and is written literally.
  it('normalizes Arabic Yeh and Kaf in word-mode results, including inside senses', async () => {
    translate.mockResolvedValue({
      translation: '\u0643تاب',
      pronunciation: '',
      pos: 'noun',
      register: 'neutral',
      inContext: '',
      senses: [{
        pos: 'noun',
        meaning: '\u064Aادداشت',
        example: { src: 'a notebook', tgt: 'ی\u0643 کتاب' }
      }],
      synonyms: [],
      antonyms: [],
      truncated: false,
      detectedSource: 'en',
      inputTokens: 1,
      outputTokens: 1
    });

    const res = await sendMessage({ action: 'TRANSLATE', text: 'notebook', sourceLang: 'auto' });

    expect(res.translation).toBe('کتاب');
    expect(res.senses[0].meaning).toBe('یادداشت');
    expect(res.senses[0].example.tgt).toBe('یک کتاب');
  });

  it('normalizes Arabic Yeh and Kaf inside sentence-mode alternatives', async () => {
    translate.mockResolvedValue({
      translation: 'سلام دن\u064Aا',
      register: 'neutral',
      alternatives: [{ text: '\u0643تاب من', label: 'formal' }],
      note: '',
      truncated: false,
      detectedSource: 'en',
      inputTokens: 1,
      outputTokens: 1
    });

    const res = await sendMessage({ action: 'TRANSLATE', text: 'Hello there, my friend.', sourceLang: 'auto' });

    expect(res.mode).toBe('sentence');
    expect(res.translation).toBe('سلام دنیا');
    expect(res.alternatives[0].text).toBe('کتاب من');
  });
});

describe('the Finglish path', () => {
  it('treats detectedSource fa-latn as the true direction and normalizes only the source side', async () => {
    translate.mockResolvedValue({
      // Arabic Yeh (U+064A) planted on both sides so the test can tell
      // whether normalization landed on the correct one.
      translation: 'good t\u064Ame',
      detectedSource: 'fa-latn',
      pronunciation: '',
      pos: 'phrase',
      register: 'neutral',
      inContext: '',
      correction: 'خوبم\u064A',
      senses: [],
      synonyms: [],
      antonyms: [],
      truncated: false,
      inputTokens: 1,
      outputTokens: 1
    });

    // No Persian characters here; the script detector alone would call this English.
    const res = await sendMessage({ action: 'TRANSLATE', text: 'khoobami', sourceLang: 'auto' });

    expect(res.direction).toBe('fa-en');
    // Target side is English: the raw Arabic Yeh survives untouched.
    expect(res.translation).toBe('good t\u064Ame');
    // Source side is Persian: the same Arabic Yeh gets normalized.
    expect(res.correction).toBe('خوبمی');
  });
});

describe('an explicit source language', () => {
  const wordResult = (detectedSource) => ({
    translation: 'x',
    detectedSource,
    pronunciation: '',
    pos: 'noun',
    register: 'neutral',
    inContext: '',
    correction: '',
    senses: [],
    synonyms: [],
    antonyms: [],
    truncated: false,
    inputTokens: 1,
    outputTokens: 1
  });

  it('is not overruled by the model disagreeing about the source', async () => {
    // The swap control forces the opposite source. The model looks at the
    // text, decides it is English after all, and says so. That correction
    // exists for script-based mis-detection, not to reverse a choice the
    // user made by hand: honouring it here sent the request straight back
    // to the direction the user had just rejected, so swapping appeared to
    // do nothing at all.
    translate.mockResolvedValue(wordResult('en'));

    const res = await sendMessage({ action: 'TRANSLATE', text: 'charge', sourceLang: 'fa' });

    expect(res.direction).toBe('fa-en');
    expect(res.displayDirection).toBe('FA \u2192 EN');
  });

  it('still lets the model correct a source that was only guessed', async () => {
    translate.mockResolvedValue(wordResult('fa-latn'));

    const res = await sendMessage({ action: 'TRANSLATE', text: 'khoobam', sourceLang: 'auto' });

    expect(res.direction).toBe('fa-en');
  });

  it('sends the swapped direction to the provider, not the detected one', async () => {
    translate.mockResolvedValue(wordResult('en'));

    await sendMessage({ action: 'TRANSLATE', text: 'charge', sourceLang: 'fa' });

    expect(translate).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'fa-en',
      detectedByScript: false
    }));
  });

  it('caches the two directions separately, so swapping is not served the previous answer', async () => {
    translate.mockResolvedValue(wordResult('en'));
    const first = await sendMessage({ action: 'TRANSLATE', text: 'charge', sourceLang: 'auto' });

    translate.mockResolvedValue(wordResult('en'));
    const swapped = await sendMessage({ action: 'TRANSLATE', text: 'charge', sourceLang: 'fa' });

    expect(first.direction).toBe('en-fa');
    expect(swapped.direction).toBe('fa-en');
    expect(swapped.fromCache).toBe(false);
  });
});

describe('truncation', () => {
  it('returns and records a truncated result without caching it', async () => {
    translate.mockResolvedValue({
      translation: 'partial result',
      truncated: true,
      detectedSource: 'en',
      inputTokens: 1,
      outputTokens: 1
    });

    const res = await sendMessage({
      action: 'TRANSLATE',
      text: 'Some passage that gets cut off mid sentence and continues on and on',
      sourceLang: 'auto',
      mode: 'text'
    });

    expect(res.truncated).toBe(true);
    expect(res.translation).toBe('partial result');

    const history = await getHistory();
    expect(history[0].translation).toBe('partial result');

    const stats = await translationCache.getStats();
    expect(stats.size).toBe(0);
  });
});

describe('error localization', () => {
  it('localizes a TranslationError message into the interface language', async () => {
    await setLanguage('fa');
    translate.mockRejectedValue(new TranslationError(ERROR_CODES.UNSUPPORTED));

    const res = await sendMessage({ action: 'TRANSLATE', text: 'hello world', sourceLang: 'auto' });

    expect(res.errorCode).toBe('UNSUPPORTED');
    expect(res.error).toBe(t(errorI18nKey(ERROR_CODES.UNSUPPORTED), 'fa'));
  });

  it('keeps an unknown error message as-is instead of localizing it', async () => {
    translate.mockRejectedValue(new Error('a very specific provider failure'));

    const res = await sendMessage({ action: 'TRANSLATE', text: 'hello world', sourceLang: 'auto' });

    expect(res.errorCode).toBe('UNKNOWN');
    expect(res.error).toBe('a very specific provider failure');
  });
});

describe('TEST_API_KEY', () => {
  it('returns the outcome and records health', async () => {
    testApiKey.mockResolvedValue({ ok: true, model: 'm', ms: 50 });

    const r = await sendMessage({ action: 'TEST_API_KEY', provider: 'claude', key: 'sk-ant-x' });

    expect(testApiKey).toHaveBeenCalledWith('claude', 'sk-ant-x');
    expect(r.ok).toBe(true);
    expect(store.get('provider_health').claude.ok).toBe(true);
    expect(store.get('provider_health').claude.ms).toBe(50);
  });

  it('records a failed test with its code', async () => {
    testApiKey.mockResolvedValue({ ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' });

    const r = await sendMessage({ action: 'TEST_API_KEY', provider: 'gemini', key: 'AIza-bad' });

    expect(r).toMatchObject({ ok: false, code: 'INVALID_API_KEY' });
    expect(store.get('provider_health').gemini).toMatchObject({ ok: false, code: 'INVALID_API_KEY' });
  });

  it('does not record health for a provider it does not know', async () => {
    testApiKey.mockResolvedValue({ ok: false, code: 'UNKNOWN', message: 'Unknown provider: nope' });

    await sendMessage({ action: 'TEST_API_KEY', provider: 'nope', key: 'k' });

    expect(store.get('provider_health')?.nope).toBeUndefined();
  });
});

describe('the stream port (translate-stream)', () => {
  it('forwards deltas and ends with done', async () => {
    translate.mockImplementation(async (req) => {
      req.onDelta?.('Hello');
      req.onDelta?.(' world');
      return { translation: 'Hello world', truncated: false, detectedSource: 'en', inputTokens: 1, outputTokens: 1 };
    });

    const port = connectPort('translate-stream');
    await port._messageHandler({ type: 'start', text: 'Hi there, how are you today my friend?', sourceLang: 'auto', mode: 'text' });

    const deltas = port._posted.filter((m) => m.type === 'delta');
    expect(deltas.map((m) => m.text)).toEqual(['Hello', ' world']);

    const last = port._posted[port._posted.length - 1];
    expect(last.type).toBe('done');
    expect(last.result.translation).toBe('Hello world');
  });

  it('aborts the in-flight request when the port disconnects', async () => {
    let capturedSignal;
    translate.mockImplementation((req) => {
      capturedSignal = req.signal;
      return new Promise((_resolve, reject) => {
        req.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const port = connectPort('translate-stream');
    const handled = port._messageHandler({ type: 'start', text: 'Hi there, how are you today my friend?', sourceLang: 'auto', mode: 'text' });

    await vi.waitFor(() => {
      if (!capturedSignal) throw new Error('translate has not been called yet');
    });

    expect(capturedSignal.aborted).toBe(false);
    port._disconnectHandlers.forEach((fn) => fn());
    expect(capturedSignal.aborted).toBe(true);

    await handled;

    const last = port._posted[port._posted.length - 1];
    expect(last.type).toBe('error');
    expect(last.code).toBe('ABORTED');
  });
});

describe('review prompt', () => {
  const DAY = 86400000;

  function seedEligible() {
    store.set('review_usage', { installedAt: Date.now() - 10 * DAY, successes: 20, activeDays: ['2026-10-01', '2026-10-02'] });
    store.set('review_schedule', { shownCount: 0, lastShownAt: null, snoozedUntil: null });
    store.set('review_answer', { rated: false, optedOut: false });
  }

  it('answers false on a fresh install', async () => {
    expect((await sendMessage({ action: 'REVIEW_PROMPT_STATE' })).show).toBe(false);
  });

  it('answers true once per eligibility window and records the show', async () => {
    seedEligible();
    expect((await sendMessage({ action: 'REVIEW_PROMPT_STATE' })).show).toBe(true);
    expect(store.get('review_schedule').shownCount).toBe(1);
    expect((await sendMessage({ action: 'REVIEW_PROMPT_STATE' })).show).toBe(false);
  });

  it('a response ends or snoozes the prompt', async () => {
    seedEligible();
    await sendMessage({ action: 'REVIEW_PROMPT_RESPONSE', response: 'never' });
    expect(store.get('review_answer').optedOut).toBe(true);
  });

  it('a successful translation counts toward the threshold', async () => {
    translate.mockResolvedValue({ translation: 'سلام', detectedSource: 'en', inputTokens: 1, outputTokens: 1 });
    await sendMessage({ action: 'TRANSLATE', text: 'hello', sourceLang: 'auto', mode: 'word' });
    expect(store.get('review_usage').successes).toBe(1);
  });
});

describe('side panel', () => {
  it('OPEN_SIDE_PANEL opens the panel for the sender tab', async () => {
    await sendMessage({ action: 'OPEN_SIDE_PANEL' }, { tab: { id: 42 } });
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
  });

  it('OPEN_SIDE_PANEL prefers an explicit tabId over the sender tab', async () => {
    await sendMessage({ action: 'OPEN_SIDE_PANEL', tabId: 7 }, { tab: { id: 42 } });
    expect(chrome.sidePanel.open).toHaveBeenLastCalledWith({ tabId: 7 });
  });

  it('SELECTION_CHANGED is acknowledged rather than rejected as unknown', async () => {
    const res = await sendMessage({ action: 'SELECTION_CHANGED', text: 'hello' }, { tab: { id: 1 } });
    expect(res).toEqual({ ok: true });
  });

  it('registers a context menu item that opens the panel', () => {
    const ids = chrome.contextMenus.create.mock.calls.map(c => c[0].id);
    expect(ids).toContain('parsipad-open-side-panel');
  });

  it('keeps the toolbar icon on the popup', () => {
    expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it("OPEN_SIDE_PANEL opens Firefox's sidebar where there is no side panel", async () => {
    const { sidePanel, runtime } = chrome;
    const getURL = runtime.getURL;
    delete chrome.sidePanel;
    runtime.getURL = (path) => `moz-extension://test-extension-id/${path}`;
    globalThis.browser = { sidebarAction: { open: vi.fn(async () => {}) } };
    try {
      const res = await sendMessage({ action: 'OPEN_SIDE_PANEL' }, { tab: { id: 42 } });
      expect(res).toEqual({ success: true });
      expect(browser.sidebarAction.open).toHaveBeenCalledTimes(1);
    } finally {
      chrome.sidePanel = sidePanel;
      runtime.getURL = getURL;
      delete globalThis.browser;
    }
  });

  it('opens the panel from the context menu before awaiting anything', async () => {
    chrome.sidePanel.open.mockClear();
    const pending = captured.onClicked({ menuItemId: 'parsipad-open-side-panel' }, { id: 5 });
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 5 });
    await pending;
  });
});

describe('OPEN_OPTIONS', () => {
  it('opens Settings at a named section in a new tab', async () => {
    await sendMessage({ action: 'OPEN_OPTIONS', section: 'reading' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://test-extension-id/settings/settings.html#reading' });
    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it('opens the options page when no section, or an unknown one, is named', async () => {
    chrome.tabs.create.mockClear();
    chrome.runtime.openOptionsPage.mockClear();
    await sendMessage({ action: 'OPEN_OPTIONS' });
    await sendMessage({ action: 'OPEN_OPTIONS', section: 'javascript:alert(1)' });
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});

describe('polish', () => {
  beforeEach(() => {
    polish.mockReset();
    regeneratePolishVariant.mockReset();
  });

  // Persian text passed the local gate, so it cost a paid round trip before
  // the model answered that Polish takes English only, and the error then
  // said ParsiPad supports Persian and English, which was true but no help.
  it('turns Persian text away before calling the provider, with the English-only message', async () => {
    const res = await sendMessage({ action: 'POLISH', text: 'سلام، می‌توانیم جلسه را به پنجشنبه منتقل کنیم؟' });
    expect(polish).not.toHaveBeenCalled();
    expect(res.errorCode).toBe('POLISH_ENGLISH_ONLY');
    expect(res.error).toMatch(/English/);
  });

  // Two words have no register to shift: the three cards came back nearly
  // the same and the round trip was paid for nothing.
  it('turns one or two words away before calling the provider, and says what to use instead', async () => {
    for (const text of ['thanks', 'thanks alot', '  thanks   alot  ']) {
      const res = await sendMessage({ action: 'POLISH', text });
      expect(res.errorCode).toBe('POLISH_TOO_SHORT');
      expect(res.error).toBe(t(errorI18nKey('POLISH_TOO_SHORT'), 'en'));
    }
    expect(polish).not.toHaveBeenCalled();
  });

  it('answers two Persian words with the English-only message, which says more', async () => {
    const res = await sendMessage({ action: 'POLISH', text: 'سلام دوست' });
    expect(res.errorCode).toBe('POLISH_ENGLISH_ONLY');
    expect(polish).not.toHaveBeenCalled();
  });

  it('polishes English text and answers with the three versions', async () => {
    polish.mockResolvedValue({ professional: 'A', conversational: 'B', concise: 'C', inputTokens: 1, outputTokens: 2 });
    const res = await sendMessage({ action: 'POLISH', text: 'thanks for help yesterday' });
    expect(polish).toHaveBeenCalledWith('thanks for help yesterday');
    expect(res).toMatchObject({ professional: 'A', conversational: 'B', concise: 'C' });
    expect(res).not.toHaveProperty('corrections');
  });

  it('passes the rejected version through to Regenerate', async () => {
    regeneratePolishVariant.mockResolvedValue({ text: 'New', inputTokens: 1, outputTokens: 2 });
    const res = await sendMessage({ action: 'REGENERATE_POLISH_VARIANT', text: 'thanks for help', variant: 'professional', previous: 'Old' });
    expect(regeneratePolishVariant).toHaveBeenCalledWith('thanks for help', 'professional', 'Old');
    expect(res.text).toBe('New');
  });
});
