// tests/settings-switches-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/settings/settings.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { STORAGE_KEYS } from '../lib/constants.js';

/**
 * The boolean settings became native switches (a checkbox with role="switch"
 * and its own label and hint) instead of a hidden checkbox under a painted
 * slider. The ids did not change, so the real settings.js still loads, checks
 * and saves each one. Driven through the real markup and script here, in both
 * interface languages.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

const SWITCHES = {
  'block-translate-toggle': STORAGE_KEYS.blockTranslate,
  'selection-popup-toggle': STORAGE_KEYS.selectionPopup,
  'translate-other-languages-toggle': STORAGE_KEYS.translateOtherLanguages,
  'confirm-page-translate-toggle': STORAGE_KEYS.confirmPageTranslate,
  'dict-en-to-fa': STORAGE_KEYS.dictionaryEnToFa,
  'dict-fa-to-en': STORAGE_KEYS.dictionaryFaToEn
};

let store;

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
      sendMessage: vi.fn(async () => ({}))
    },
    tabs: { create: vi.fn() },
    commands: { getAll: vi.fn(async () => []) }
  };
}

async function loadSettings(lang) {
  store = new Map([[STORAGE_KEYS.language, lang]]);
  globalThis.chrome = fakeChrome();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../settings/settings.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // init() stamps the version just before it wires the listeners.
  await vi.waitFor(() => expect(document.getElementById('about-version').textContent).toBe('0.0.0-test'));
}

beforeEach(() => {
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  delete globalThis.chrome;
});

describe.each(['en', 'fa'])('settings switches in %s', (lang) => {
  beforeEach(() => loadSettings(lang));

  it('each switch has its own visible label and a hint it is described by', () => {
    const labels = new Set();
    for (const id of Object.keys(SWITCHES)) {
      const box = document.getElementById(id);
      expect(box.getAttribute('role'), id).toBe('switch');
      const label = document.querySelector(`label[for="${id}"]`);
      const hint = document.getElementById(box.getAttribute('aria-describedby'));
      expect(label.textContent.trim(), id).not.toBe('');
      expect(hint.textContent.trim(), id).not.toBe('');
      expect(hint.textContent, id).not.toBe(label.textContent);
      labels.add(label.textContent);
    }
    expect(labels.size).toBe(Object.keys(SWITCHES).length);
  });

  it.each(Object.entries(SWITCHES))('turning %s over saves it through settings.js', async (id, key) => {
    const box = document.getElementById(id);
    const before = box.checked;
    box.click();
    expect(box.checked).toBe(!before);
    await vi.waitFor(() => expect(store.get(key)).toBe(!before));
    document.querySelector(`label[for="${id}"]`).click();
    expect(box.checked).toBe(before);
    await vi.waitFor(() => expect(store.get(key)).toBe(before));
  });
});
