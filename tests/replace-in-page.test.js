// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/compose"}
// Replace in the in-page Polish box and translation card: the button is
// there only when the text came from a field, writes the version back, and
// reports through the toast with Undo.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const roots = new Map();
const storageListeners = [];
const store = new Map([['selection_popup_enabled', true]]);
const sent = [];
const POLISH = { professional: 'Could you confirm the meeting?', conversational: 'Is the meeting still on?', concise: 'Meeting still on?', provider: 'Gemini' };
let translation = 'FA';
const regenerated = 'Would you confirm the meeting?';

function storageGet(keys) {
  const list = keys === null || keys === undefined ? [...store.keys()] : [].concat(keys);
  const out = {};
  for (const key of list) if (store.has(key)) out[key] = structuredClone(store.get(key));
  return Promise.resolve(out);
}

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
        if (message.action === 'CHECK_API_KEY') return Promise.resolve({ hasApiKey: true });
        if (message.action === 'POLISH') return Promise.resolve({ ...POLISH });
        if (message.action === 'REGENERATE_POLISH_VARIANT') return Promise.resolve({ text: regenerated });
        if (message.action === 'TRANSLATE') {
          return Promise.resolve({ success: true, translation, direction: 'en-fa', mode: 'text', provider: 'Gemini' });
        }
        if (message.action === 'CHECK_FAVORITE' || message.action === 'IS_FAVORITE') return Promise.resolve({ isFavorite: false });
        return Promise.resolve({});
      },
      connect: () => ({ onMessage: { addListener: () => {} }, onDisconnect: { addListener: () => {} }, postMessage: () => {}, disconnect: () => {} }),
      getURL: (p) => p
    },
    storage: {
      local: { get: storageGet, set: () => Promise.resolve() },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
  document.body.innerHTML = `
    <div id="page">
      <p id="text">several words to select</p>
      <textarea id="box">hi, is the meeting happening?</textarea>
    </div>`;
  await import('../content/main.js');
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  sent.length = 0;
  translation = 'FA';
  navigator.clipboard.writeText.mockClear();
  const box = document.getElementById('box');
  box.value = 'hi, is the meeting happening?';
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.getElementById('parsipad-selection-popup')?.remove();
  document.getElementById('parsipad-toast')?.remove();
  document.getSelection().removeAllRanges();
  document.activeElement?.blur?.();
  vi.useRealTimers();
});

const $ = (id) => document.getElementById(id);
const toolbar = () => $('parsipad-selection-popup');
const boxHost = () => $('parsipad-host');
const boxRoot = () => roots.get(boxHost());
const toastRoot = () => roots.get($('parsipad-toast'));
const BOX_RECT = { top: 100, bottom: 160, left: 40, right: 340, width: 300, height: 60 };

async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

// A mouse drag inside the field: the gesture ends on the field, and the
// selection settles.
function selectInField(el, start, end) {
  el.getBoundingClientRect = () => BOX_RECT;
  el.focus();
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }));
  el.setSelectionRange(start, end);
  document.dispatchEvent(new Event('selectionchange'));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0 }));
  vi.advanceTimersByTime(300);
}

function selectPageText() {
  // A mouse selection on page text takes focus out of the field first.
  document.activeElement?.blur?.();
  // The whole paragraph: Polish is dimmed below three words.
  const node = $('text').firstChild;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, node.textContent.length);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  vi.advanceTimersByTime(300);
}

async function pressToolbar(action) {
  const btn = roots.get(toolbar()).querySelector(`[data-action="${action}"]`);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  await settle();
}

const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

async function toastShown() {
  await settle();
  vi.advanceTimersByTime(100);
}

describe('Replace in the Polish box', () => {
  it('shows a Replace button per version only with a target', async () => {
    selectInField($('box'), 0, 29);
    await pressToolbar('polish');
    const buttons = [...boxRoot().querySelectorAll('.parsipad-polish-replace')];
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.textContent)).toEqual(['Replace', 'Replace', 'Replace']);
    expect(buttons.map((b) => b.dataset.version)).toEqual(['professional', 'conversational', 'concise']);
    click(boxRoot().querySelector('.parsipad-close'));

    selectPageText();
    await pressToolbar('polish');
    expect(boxRoot().querySelectorAll('.parsipad-polish-replace')).toHaveLength(0);
  });

  it('Replace writes the version into the textarea, closes the box and toasts with Undo', async () => {
    const box = $('box');
    selectInField(box, 7, 29);
    await pressToolbar('polish');
    click(boxRoot().querySelector('.parsipad-polish-replace[data-version="professional"]'));
    await toastShown();
    expect(box.value).toBe(`hi, is ${POLISH.professional}`);
    expect(boxHost()).toBeNull();
    expect(toastRoot().textContent).toContain('Replaced with the Professional version');
    expect(toastRoot().querySelector('.action').textContent).toBe('Undo');
  });

  it('Undo from the toast restores the original text', async () => {
    const box = $('box');
    selectInField(box, 7, 29);
    await pressToolbar('polish');
    click(boxRoot().querySelector('.parsipad-polish-replace[data-version="concise"]'));
    await toastShown();
    click(toastRoot().querySelector('.action'));
    expect(box.value).toBe('hi, is the meeting happening?');
  });

  it('replaces with the regenerated text', async () => {
    const box = $('box');
    selectInField(box, 7, 29);
    await pressToolbar('polish');
    click(boxRoot().querySelector('.parsipad-polish-regenerate[data-version="professional"]'));
    await settle();
    click(boxRoot().querySelector('.parsipad-polish-replace[data-version="professional"]'));
    await toastShown();
    expect(box.value).toBe(`hi, is ${regenerated}`);
  });

  it('copies and says so when the field is gone', async () => {
    const box = $('box');
    selectInField(box, 7, 29);
    await pressToolbar('polish');
    box.remove();
    click(boxRoot().querySelector('.parsipad-polish-replace[data-version="concise"]'));
    await toastShown();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(POLISH.concise);
    expect(toastRoot().textContent).toContain('Could not replace. Copied instead.');
    expect(toastRoot().querySelector('.action').hidden).toBe(true);
    expect(boxHost()).not.toBeNull();
    // Put the field back for the next test.
    $('page').appendChild(box);
  });
});

describe('Replace in the translation card', () => {
  it('replaces with the translation', async () => {
    const box = $('box');
    translation = 'سلام، جلسه برگزار می‌شود؟';
    selectInField(box, 0, 29);
    await pressToolbar('translate');
    const btn = boxRoot().querySelector('[data-action="cardReplace"]');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Replace');
    expect(btn.classList.contains('pp-card-action-primary')).toBe(true);
    click(btn);
    await toastShown();
    expect(box.value).toBe(translation);
    expect(toastRoot().textContent).toContain('Replaced with the translation');
  });

  it('no Replace without a translation', async () => {
    translation = '';
    selectInField($('box'), 0, 29);
    await pressToolbar('translate');
    expect(boxRoot().querySelector('[data-action="cardReplace"]')).toBeNull();
  });

  it('no Replace for page text', async () => {
    selectPageText();
    await pressToolbar('translate');
    expect(boxRoot().querySelector('[data-action="cardReplace"]')).toBeNull();
  });
});
