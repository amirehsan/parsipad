// @vitest-environment happy-dom
// Drives the real content script: Polish on the selection toolbar is dimmed
// for one or two words, the way Dictionary is dimmed for more than one.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { translations } from '../lib/i18n.js';

// The toolbar lives in a closed shadow root; keep a handle on each root as
// it is attached so the test can see inside.
const roots = new Map();
const storageListeners = [];
const sent = [];

beforeAll(async () => {
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    roots.set(this, root);
    return root;
  };
  globalThis.chrome = {
    runtime: {
      id: 'parsipad',
      onMessage: { addListener: () => {} },
      sendMessage: (message) => {
        sent.push(message);
        if (message.action === 'POLISH') {
          return Promise.resolve({ professional: 'Thanks a lot.', conversational: 'Thanks so much.', concise: 'Thanks.' });
        }
        return Promise.resolve();
      },
      getURL: (p) => p
    },
    storage: {
      local: { get: () => Promise.resolve({ selection_popup_enabled: true }), set: () => Promise.resolve() },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };
  document.body.innerHTML = '<p id="two">thanks alot</p><p id="three">thanks a lot</p>';
  await import('../content/main.js');
  // Let the stored settings load.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  sent.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.getSelection().removeAllRanges();
  document.getElementById('parsipad-host')?.remove();
  vi.useRealTimers();
});

const host = () => document.getElementById('parsipad-selection-popup');
const polishButton = () => roots.get(host()).querySelector('.selection-btn[data-action="polish"]');

function selectAllOf(id) {
  const node = document.getElementById(id).firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, node.textContent.length);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  vi.advanceTimersByTime(300);
}

describe('Polish on the selection toolbar', () => {
  it('is dimmed for two words, says why, and only closes when pressed', () => {
    selectAllOf('two');
    const btn = polishButton();
    expect(btn.classList.contains('disabled')).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe(translations.en.toolbarPolishTooShort);
    expect(btn.querySelector('.pp-tooltip').textContent).toBe('Polish (three words or more)');
    btn.click();
    expect(host()).toBeNull();
    expect(sent.find((m) => m.action === 'POLISH')).toBeUndefined();
    expect(document.getElementById('parsipad-host')).toBeNull();
  });

  it('is live for three words and polishes them when pressed', () => {
    selectAllOf('three');
    const btn = polishButton();
    expect(btn.classList.contains('disabled')).toBe(false);
    expect(btn.hasAttribute('aria-disabled')).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe(translations.en.toolbarPolish);
    btn.click();
    expect(sent.find((m) => m.action === 'POLISH')).toMatchObject({ text: 'thanks a lot' });
    expect(document.getElementById('parsipad-host')).not.toBeNull();
  });

  it('says why in Persian when the interface language is Persian', () => {
    for (const listener of storageListeners) listener({ ui_language: { newValue: 'fa' } }, 'local');
    try {
      selectAllOf('two');
      expect(polishButton().getAttribute('aria-label')).toBe(translations.fa.toolbarPolishTooShort);
    } finally {
      for (const listener of storageListeners) listener({ ui_language: { newValue: 'en' } }, 'local');
    }
  });
});
