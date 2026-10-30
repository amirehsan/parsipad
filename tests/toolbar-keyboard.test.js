// @vitest-environment happy-dom
// Drives the real content script: the selection toolbar's keyboard path,
// from a settled selection through Tab, the arrow keys, Escape and Tab out.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { translations } from '../lib/i18n.js';

// The toolbar lives in a closed shadow root; keep a handle on each root as
// it is attached so the test can see inside.
const roots = new Map();
const storageListeners = [];

beforeAll(async () => {
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    roots.set(this, root);
    return root;
  };
  const noop = () => {};
  globalThis.chrome = {
    runtime: { id: 'parsipad', onMessage: { addListener: noop }, sendMessage: () => Promise.resolve(), getURL: (p) => p },
    storage: {
      local: { get: () => Promise.resolve({ selection_popup_enabled: true }), set: () => Promise.resolve() },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };
  document.body.innerHTML = `
    <a id="before" href="#before">before</a>
    <p id="text">several words to select</p>
    <input id="field" type="text">
    <a id="after" href="#after">after</a>`;
  await import('../content/main.js');
  // Let the stored settings load.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.getSelection().removeAllRanges();
  document.activeElement?.blur?.();
  vi.useRealTimers();
});

const $ = (id) => document.getElementById(id);
const host = () => $('parsipad-selection-popup');
const root = () => roots.get(host());
const buttons = () => [...root().querySelectorAll('.selection-btn')];
const focusedButton = () => root().activeElement;

function selectWords(start = 0, end = 13) {
  const node = $('text').firstChild;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  vi.advanceTimersByTime(300);
}

function key(target, name, init = {}) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, composed: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('selection toolbar keyboard path', () => {
  it('appears placed and labelled, with one tab stop, without taking focus', () => {
    $('before').focus();
    selectWords();
    expect(host()).not.toBeNull();
    expect(host().style.visibility).toBe('visible');
    expect(document.activeElement).toBe($('before'));
    expect(buttons().map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(['above', 'below']).toContain(root().querySelector('.selection-popup').dataset.placement);
    expect(root().querySelector('.selection-popup').getAttribute('aria-label')).toBe(translations.en.toolbarLabel);
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual([
      translations.en.toolbarTranslate, translations.en.toolbarPolishTooShort, translations.en.toolbarDictionarySingleWord
    ]);
  });

  it('takes Tab into its first button, then moves with the arrows, Home and End', () => {
    $('before').focus();
    selectWords();
    expect(key($('before'), 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host());
    expect(focusedButton()).toBe(buttons()[0]);

    expect(key(focusedButton(), 'ArrowRight').defaultPrevented).toBe(true);
    expect(focusedButton()).toBe(buttons()[1]);
    expect(buttons().map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    key(focusedButton(), 'End');
    expect(focusedButton()).toBe(buttons()[2]);
    key(focusedButton(), 'ArrowRight');
    expect(focusedButton()).toBe(buttons()[0]);
    key(focusedButton(), 'ArrowLeft');
    expect(focusedButton()).toBe(buttons()[2]);
    key(focusedButton(), 'Home');
    expect(focusedButton()).toBe(buttons()[0]);
    // Alt+Left is the browser's Back, not ours.
    expect(key(focusedButton(), 'ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
    expect(focusedButton()).toBe(buttons()[0]);
  });

  it('closes on Escape and hands focus back to the element it came from', () => {
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    key(focusedButton(), 'ArrowRight');
    key(focusedButton(), 'Escape');
    expect(host()).toBeNull();
    expect(document.activeElement).toBe($('before'));
  });

  it('hands focus back when a button is pressed, before the action runs', () => {
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    key(focusedButton(), 'End');
    // Dictionary is disabled for several words: the click only closes.
    focusedButton().click();
    expect(host()).toBeNull();
    expect(document.activeElement).toBe($('before'));
  });

  it('lets Tab leave, back where focus came from, and then passes the toolbar by', () => {
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    // Tab is not cancelled: focus is put back and the browser moves on from it.
    expect(key(focusedButton(), 'Tab').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe($('before'));
    expect(host()).not.toBeNull();
    // The next Tab is the page's own.
    expect(key($('before'), 'Tab').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe($('before'));
  });

  it('lets Shift+Tab leave onto the element focus came from', () => {
    $('before').focus();
    selectWords();
    key($('before'), 'Tab');
    expect(key(focusedButton(), 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($('before'));
  });

  it('leaves Tab alone with a modifier, in a text field, from the toolbar, or when the page took it', () => {
    $('before').focus();
    selectWords();
    expect(key($('before'), 'Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe($('before'));

    const field = $('field');
    expect(key(field, 'Tab').defaultPrevented).toBe(false);

    // Keydown from inside the closed root reaches the document as the host.
    expect(key(host(), 'Tab').defaultPrevented).toBe(false);

    const trap = (event) => event.preventDefault();
    window.addEventListener('keydown', trap, { capture: true });
    try {
      key($('before'), 'Tab');
      expect(document.activeElement).toBe($('before'));
    } finally {
      window.removeEventListener('keydown', trap, { capture: true });
    }
  });

  it('never swallows Tab when focus cannot move into the toolbar (an inert page behind a modal)', () => {
    $('before').focus();
    selectWords();
    const focus = HTMLButtonElement.prototype.focus;
    HTMLButtonElement.prototype.focus = () => {};
    try {
      expect(key($('before'), 'Tab').defaultPrevented).toBe(false);
      expect(document.activeElement).toBe($('before'));
    } finally {
      HTMLButtonElement.prototype.focus = focus;
    }
    // Not a trap: later Tabs are the page's own too.
    expect(key($('before'), 'Tab').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe($('before'));
  });

  it('leaves Tab alone in a text field inside a closed shadow root', () => {
    const widget = document.createElement('x-field');
    const closed = widget.attachShadow({ mode: 'closed' });
    const input = document.createElement('input');
    closed.appendChild(input);
    document.body.appendChild(widget);
    try {
      selectWords();
      input.focus();
      expect(host()).not.toBeNull();
      // Chrome reports the keydown to the document from the host, since the
      // root is closed (happy-dom would expose the input), so send it from there.
      expect(key(widget, 'Tab').defaultPrevented).toBe(false);
    } finally {
      widget.remove();
    }
  });

  it('does not take Tab once the selection is gone, before the toolbar is cleared away', () => {
    $('before').focus();
    selectWords();
    document.getSelection().removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    expect(host()).not.toBeNull();
    expect(key($('before'), 'Tab').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe($('before'));
  });

  it('does not take Tab for a different selection than the one it was built for', () => {
    $('before').focus();
    selectWords();
    const node = $('text').firstChild;
    const range = document.createRange();
    range.setStart(node, 8);
    range.setEnd(node, 23);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    expect(host()).not.toBeNull();
    expect(key($('before'), 'Tab').defaultPrevented).toBe(false);
  });

  it('on Escape with the box also open, returns focus to where Tab took it from', () => {
    // A box opened from a one-word selection, through the toolbar.
    $('after').focus();
    selectWords(0, 7);
    key($('after'), 'Tab');
    key(focusedButton(), 'End');
    focusedButton().click();
    const box = $('parsipad-host');
    expect(box).not.toBeNull();
    // Back on the page, a new selection and its toolbar, entered from #before.
    $('before').focus();
    selectWords();
    expect($('parsipad-host')).not.toBeNull();
    key($('before'), 'Tab');
    expect(document.activeElement).toBe(host());
    key(focusedButton(), 'Escape');
    expect(host()).toBeNull();
    expect($('parsipad-host')).toBeNull();
    expect(document.activeElement).toBe($('before'));
  });

  it('labels the toolbar in Persian when the interface language is Persian', () => {
    for (const listener of storageListeners) listener({ ui_language: { newValue: 'fa' } }, 'local');
    try {
      selectWords();
      expect(root().querySelector('.selection-popup').getAttribute('aria-label')).toBe(translations.fa.toolbarLabel);
      expect(buttons().map((b) => b.querySelector('.pp-tooltip').textContent)).toEqual([
        translations.fa.toolbarTranslate, translations.fa.toolbarPolishTooShort, translations.fa.toolbarDictionarySingleWord
      ]);
    } finally {
      for (const listener of storageListeners) listener({ ui_language: { newValue: 'en' } }, 'local');
    }
  });
});
