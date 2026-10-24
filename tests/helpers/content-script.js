// The real content script (content/main.js) under happy-dom, with the
// service worker mocked. Shared by the tests that drive a whole-page
// translation end to end. This file sits outside the tests/**/*.test.js
// include in vitest.config.js, so it is never collected as a test file.

/**
 * The default answer to a batch: each "[n] text" line comes back as
 * "[n] FA:text".
 * @param {{text: string}} msg
 * @returns {{type: 'done', result: {translation: string}}}
 */
export function translateLines(msg) {
  const lines = msg.text.split('\n').map((line) => line.replace(/^\[(\d+)\] (.*)$/, '[$1] FA:$2'));
  return { type: 'done', result: { translation: lines.join('\n') } };
}

/**
 * Mock chrome.*, load the content script once, and return handles on what
 * it does. Call from beforeAll; call `reset()` from beforeEach.
 *
 * - `roots`: every shadow root attached, by host, so a test can see inside
 *   the closed ones (the overlay, the toast, the page toggle).
 * - `sent`: every chrome.runtime.sendMessage.
 * - `ports`: every batch port, in order; `port.started` is the request.
 * - `answer(msg, port)`: how a batch port answers; returns the message to
 *   send ({ type: 'done' | 'error', ... }), or a promise of it. Defaults to
 *   translateLines.
 * - `missingKey`: CHECK_API_KEY answers no key.
 * - `respond(message)`: answers any other sendMessage; returning undefined
 *   falls through to the default (a promise of undefined).
 * - `invalidated`: the extension was reloaded or updated under the page, so
 *   chrome.runtime.id, getURL, sendMessage and connect throw, as they can in
 *   an orphaned content script.
 * - `enableToolbar()`: turn the selection toolbar on, as Settings would.
 * - `keyCheckGate`: when set, CHECK_API_KEY waits for it.
 * - `onMessage(message)`: deliver a message as the service worker would,
 *   and return what the content script answered.
 * - `setUiLanguage(lang)`: as a change in Settings would.
 */
export async function loadContentScript() {
  const harness = {
    roots: new Map(),
    store: new Map(),
    storageListeners: [],
    sent: [],
    ports: [],
    answer: translateLines,
    missingKey: false,
    keyCheckGate: null,
    respond: null,
    invalidated: false,
    listener: null,
    onMessage(message) {
      let response;
      harness.listener(message, { id: 'parsipad' }, (r) => { response = r; });
      return response;
    },
    setUiLanguage(lang) {
      for (const fn of harness.storageListeners) fn({ ui_language: { newValue: lang } }, 'local');
    },
    enableToolbar() {
      for (const fn of harness.storageListeners) fn({ selection_popup_enabled: { newValue: true } }, 'local');
    },
    reset() {
      harness.sent.length = 0;
      harness.ports.length = 0;
      harness.answer = translateLines;
      harness.missingKey = false;
      harness.keyCheckGate = null;
      harness.respond = null;
      harness.invalidated = false;
      harness.store.clear();
    }
  };

  const storageGet = (keys) => {
    const list = keys === null || keys === undefined ? [...harness.store.keys()] : [].concat(keys);
    const out = {};
    for (const k of list) if (harness.store.has(k)) out[k] = structuredClone(harness.store.get(k));
    return Promise.resolve(out);
  };
  const storageSet = (items) => {
    const changes = {};
    for (const [k, value] of Object.entries(items)) {
      changes[k] = { oldValue: harness.store.get(k), newValue: structuredClone(value) };
      harness.store.set(k, structuredClone(value));
    }
    for (const fn of harness.storageListeners) fn(changes, 'local');
    return Promise.resolve();
  };

  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    harness.roots.set(this, root);
    return root;
  };

  const orphaned = () => new Error('Extension context invalidated.');

  globalThis.chrome = {
    runtime: {
      get id() {
        if (harness.invalidated) throw orphaned();
        return 'parsipad';
      },
      onMessage: { addListener: (fn) => { harness.listener = fn; } },
      sendMessage: (message) => {
        if (harness.invalidated) throw orphaned();
        harness.sent.push(message);
        const answered = harness.respond?.(message);
        if (answered !== undefined) return Promise.resolve(answered);
        if (message.action === 'CHECK_API_KEY') {
          const reply = { hasApiKey: !harness.missingKey };
          return harness.keyCheckGate ? harness.keyCheckGate.then(() => reply) : Promise.resolve(reply);
        }
        return Promise.resolve();
      },
      // Batches stream over a port; every one is recorded and answered.
      connect: () => {
        if (harness.invalidated) throw orphaned();
        const listeners = [];
        const port = {
          started: null,
          disconnected: false,
          onMessage: { addListener: (fn) => listeners.push(fn) },
          onDisconnect: { addListener: () => {} },
          postMessage: (msg) => {
            port.started = msg;
            Promise.resolve(harness.answer(msg, port)).then((reply) => {
              if (port.disconnected || !reply) return;
              for (const fn of listeners) fn(reply);
            });
          },
          disconnect: () => { port.disconnected = true; }
        };
        harness.ports.push(port);
        return port;
      },
      getURL: (p) => {
        if (harness.invalidated) throw orphaned();
        return p;
      }
    },
    storage: {
      local: { get: storageGet, set: storageSet },
      onChanged: { addListener: (fn) => harness.storageListeners.push(fn) }
    }
  };

  await import('../../content/main.js');
  await new Promise((resolve) => setTimeout(resolve, 0));
  return harness;
}
