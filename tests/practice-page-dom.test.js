// tests/practice-page-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/practice/practice.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * The Practice page driven through its own markup, with chrome.storage held
 * in memory: the deck it deals, moving between cards, flipping, copying, the
 * empty state and the side panel variant.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'practice/practice.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
const en = translations.en;

function seed() {
  return {
    favorites: [
      { id: 'f1', type: 'translation', originalText: 'apple', savedText: 'سیب', direction: 'en-fa' },
      { id: 'g1', type: 'grammar', originalText: 'I went home', savedText: '', lesson: { title: 'Past simple' } },
      { id: 'f2', type: 'dictionary', originalText: 'کتاب', savedText: 'book', direction: 'fa-en' }
    ]
  };
}

let store;
// Listeners each loaded copy of the page adds to document. A fresh import does
// not remove the last one's, so they are taken off before the next page loads.
const pageListeners = [];

function detachPage() {
  for (const [type, listener, options] of pageListeners.splice(0)) {
    document.removeEventListener(type, listener, options);
  }
}

function installChrome() {
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          const keys = Array.isArray(key) ? key : [key];
          const out = {};
          for (const k of keys) if (k in store) out[k] = structuredClone(store[k]);
          return out;
        }),
        set: vi.fn(async (items) => { Object.assign(store, structuredClone(items)); })
      }
    }
  };
}

async function openPractice(search = '', data = seed()) {
  store = data;
  installChrome();
  history.replaceState(null, '', `/practice/practice.html${search}`);
  detachPage();
  document.body.innerHTML = bodyMarkup;
  delete document.body.dataset.surface;
  vi.resetModules();
  await import('../practice/practice.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => {
    const ready = !document.getElementById('practice-deck').hidden || !document.getElementById('practice-empty').hidden;
    expect(ready).toBe(true);
  });
}

const $ = (selector) => document.querySelector(selector);
const front = () => $('#practice-front-text').textContent;
const progress = () => $('#practice-progress').textContent;
const status = () => $('#practice-status').textContent;
const press = (key, target = document.body, init = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  const addEventListener = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    pageListeners.push([type, listener, options]);
    addEventListener(type, listener, options);
  });
  // Shuffle draws j = i every time, so the deck keeps the stored order.
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});

afterEach(() => {
  detachPage();
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('practice page: the deck', () => {
  it('deals favorites, not lessons, and shows the saved side of the first card', async () => {
    await openPractice();
    expect(progress()).toBe('Card 1 of 2');
    expect(front()).toBe('سیب');
    expect($('#practice-back-text').textContent).toBe('apple');
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('false');
    expect($('#practice-face-front').getAttribute('lang')).toBe('fa');
    expect($('#practice-face-front').getAttribute('dir')).toBe('rtl');
    expect($('#practice-face-back').getAttribute('lang')).toBe('en');
    expect($('#practice-face-back').getAttribute('dir')).toBe('ltr');
    expect($('#practice-face-back').getAttribute('aria-hidden')).toBe('true');
    // The hint on the Persian face is English, like the rest of the page.
    expect($('#practice-face-front .practice-hint').getAttribute('lang')).toBe('en');
    expect($('#practice-empty').hidden).toBe(true);
  });

  it('focuses nothing on load, so no ring sits on the card and reading starts at the top', async () => {
    await openPractice();
    expect(document.activeElement).toBe(document.body);
  });

  it('deals no more cards than the session size', async () => {
    const favorites = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, type: 'translation', originalText: `w${i}`, savedText: `t${i}` }));
    await openPractice('', { favorites, practice_session_size: 5 });
    expect(progress()).toBe('Card 1 of 5');
  });

  it('moves with Next and Prev, and stops at either end', async () => {
    await openPractice();
    expect($('#practice-prev').getAttribute('aria-disabled')).toBe('true');
    $('#practice-next').click();
    expect(front()).toBe('book');
    expect(progress()).toBe('Card 2 of 2');
    expect($('#practice-next').getAttribute('aria-disabled')).toBe('true');
    $('#practice-next').click();
    expect(progress()).toBe('Card 2 of 2');
    $('#practice-prev').click();
    expect(front()).toBe('سیب');
    await vi.waitFor(() => expect(status()).toBe('Card 1 of 2'));
  });

  it('moves with the arrow keys, but not while typing in a form control', async () => {
    await openPractice();
    press('ArrowRight');
    expect(progress()).toBe('Card 2 of 2');
    press('ArrowLeft');
    expect(progress()).toBe('Card 1 of 2');

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press('ArrowRight', input);
    expect(progress()).toBe('Card 1 of 2');
  });

  it('flips with the card button, announces the original, and a move turns it face up again', async () => {
    await openPractice('', { favorites: [seed().favorites[2], seed().favorites[0]] });
    expect(front()).toBe('book');
    $('#practice-card').click();
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('true');
    expect($('#practice-face-back').getAttribute('aria-hidden')).toBe('false');
    expect($('#practice-face-front').getAttribute('aria-hidden')).toBe('true');
    await vi.waitFor(() => expect(status()).toBe('کتاب'));
    // A Persian answer is spoken with a Persian voice even in the English interface.
    const spoken = $('#practice-status [lang]');
    expect(spoken.getAttribute('lang')).toBe('fa');
    expect(spoken.getAttribute('dir')).toBe('rtl');
    expect(spoken.textContent).toBe('کتاب');

    $('#practice-next').click();
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('false');
    expect($('#practice-face-front').getAttribute('aria-hidden')).toBe('false');
  });

  it('flips with Space from the page, with nothing focused, and announces the original', async () => {
    await openPractice();
    expect(document.activeElement).toBe(document.body);
    const event = press(' ');
    expect(event.defaultPrevented).toBe(true);
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => expect(status()).toBe('apple'));
  });

  it('flips with Enter from the page', async () => {
    await openPractice();
    press('Enter');
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('true');
    press('Enter');
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('false');
  });

  it('leaves Space on a focused button to that button, so one press never flips twice', async () => {
    await openPractice();
    $('#practice-next').focus();
    press(' ', $('#practice-next'));
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('false');

    // On the card itself the button's own activation flips, once.
    $('#practice-card').focus();
    press(' ', $('#practice-card'));
    press('Enter', $('#practice-card'));
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('false');
    $('#practice-card').click();
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('true');
  });

  it('leaves Space with a modifier, and Space in a form control, alone', async () => {
    await openPractice();
    press(' ', document.body, { shiftKey: true });
    press('Enter', document.body, { ctrlKey: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press(' ', input);
    expect($('#practice-card').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('practice page: copy', () => {
  it('copies the face that is showing, from the button and the c key', async () => {
    await openPractice();
    $('#practice-copy').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('سیب'));
    await vi.waitFor(() => expect(status()).toBe(en.libraryCopied));
    // Interface messages carry no language of their own.
    expect($('#practice-status [lang]')).toBeNull();

    $('#practice-card').click();
    press('c');
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('apple'));
    press('C');
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(3);
  });

  it('copies with the c key on a Persian keyboard layout, where the key is ز', async () => {
    await openPractice();
    press('ز', document.body, { code: 'KeyC' });
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('سیب'));
    press('ز', document.body, { code: 'KeyC', metaKey: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press('ز', input, { code: 'KeyC' });
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('leaves Ctrl+C and Cmd+C to the browser', async () => {
    await openPractice();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('says so when the clipboard refuses', async () => {
    await openPractice();
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    $('#practice-copy').click();
    await vi.waitFor(() => expect(status()).toBe(en.libraryCopyFailed));
  });
});

describe('practice page: empty deck and surfaces', () => {
  it('points to the Library when no favorite can be practiced', async () => {
    await openPractice('', { favorites: [seed().favorites[1]] });
    expect($('#practice-empty').hidden).toBe(false);
    expect($('#practice-deck').hidden).toBe(true);
    expect($('#practice-empty-text').textContent).toBe(en.practiceEmpty);
    expect($('#practice-empty-link').getAttribute('href')).toBe('../library/library.html?tab=favorites');
    expect($('#practice-empty-link').textContent).toBe(en.practiceEmptyLink);
  });

  it('offers a way back to the side panel only inside it', async () => {
    await openPractice();
    expect($('#practice-back').hidden).toBe(true);
    expect(document.body.dataset.surface).toBeUndefined();

    await openPractice('?surface=panel');
    expect(document.body.dataset.surface).toBe('panel');
    expect($('#practice-back').hidden).toBe(false);
    expect($('#practice-back').getAttribute('href')).toBe('../sidepanel/sidepanel.html');
  });

  it('opens the Library in a tab from the panel rather than inside it', async () => {
    await openPractice('?surface=panel', { favorites: [] });
    expect($('#practice-empty-link').getAttribute('target')).toBe('_blank');
  });

  it('mirrors the arrow keys in the Persian interface: ArrowLeft is the next card', async () => {
    await openPractice('', { ...seed(), ui_language: 'fa' });
    press('ArrowLeft');
    expect(front()).toBe('book');
    press('ArrowRight');
    expect(front()).toBe('سیب');
  });

  it('speaks Persian with Latin digits in the counter', async () => {
    await openPractice('', { ...seed(), ui_language: 'fa' });
    expect(progress()).toBe(translations.fa.practiceProgress.replace('{n}', '1').replace('{total}', '2'));
    expect(document.documentElement.dir).toBe('rtl');
  });
});
