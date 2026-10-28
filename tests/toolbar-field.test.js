// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/compose"}
// The selection toolbar inside text boxes the user can edit, and the replace
// target it hands to the box. Source checks pin the interface; the behaviour
// tests drive the real content script.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { functionBody } from './helpers/source.js';

const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
const i18n = fs.readFileSync(path.resolve(__dirname, '../lib/i18n.js'), 'utf8');
const readme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');

describe('toolbar in fields (source)', () => {
  it('listens for selectionchange in the capture phase, for text controls in Firefox', () => {
    expect(js).toMatch(/addEventListener\('selectionchange', toolbarTrigger\.onSelectionChange, \{ capture: true \}\)/);
  });

  it('keeps one replace target and clears it on close and on navigation', () => {
    expect(js).toMatch(/let currentReplaceTarget = null;/);
    expect(functionBody(js, 'closeFloatingBox')).toMatch(/currentReplaceTarget = null;[\s\S]*removeFloatingBox\(\);/);
    expect(functionBody(js, 'installSpaNavigationListener')).toMatch(/currentReplaceTarget = null;/);
    // User dismissals close through closeFloatingBox; the close buttons are two of them.
    expect(js.match(/closeBtn\.addEventListener\('click', closeFloatingBox\)/g)).toHaveLength(3);
    expect(functionBody(js, 'handleDocumentClick')).toMatch(/closeFloatingBox\(\)/);
  });

  it('the context menu and shortcut paths capture the target when the message arrives', () => {
    const cases = js.slice(js.indexOf("case 'SHOW_TRANSLATION':"), js.indexOf("case 'TRANSLATE_SELECTION':") + 700);
    expect(cases.match(/currentReplaceTarget = captureEditableTarget\(window\.getSelection\(\), document\.activeElement\);/g)).toHaveLength(3);
    expect(cases).toMatch(/currentReplaceTarget\?\.text/);
  });

  it('the Settings hint and README say the toolbar appears in text boxes', () => {
    expect(i18n).toMatch(/selectionToolbarHint: '[^']*Also appears in text boxes you are typing in, so Polish and Translate can replace what you selected\.'/);
    expect(i18n).toMatch(/selectionToolbarHint: '[^']*در کادرهای متنی که در آن می\\u200cنویسید هم نمایش داده می\\u200cشود تا ویرایش و ترجمه بتوانند متن انتخاب\\u200cشده را جایگزین کنند\.'/);
    expect(i18n).not.toMatch(/Never appears inside text fields/);
    expect(readme).toMatch(/and in text boxes you type in, where Replace puts the result back/);
    expect(readme).not.toMatch(/never appears inside text fields/);
  });
});

const roots = new Map();
const storageListeners = [];
const store = new Map([['selection_popup_enabled', true]]);
const sent = [];

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
        // Translate answers with a minimal result so the box renders.
        if (message.action === 'TRANSLATE') {
          return Promise.resolve({ success: true, translation: 'FA', direction: 'en-fa', mode: 'text', provider: 'Gemini' });
        }
        return Promise.resolve();
      },
      connect: () => ({ onMessage: { addListener: () => {} }, onDisconnect: { addListener: () => {} }, postMessage: () => {}, disconnect: () => {} }),
      getURL: (p) => p
    },
    storage: {
      local: { get: storageGet, set: () => Promise.resolve() },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };
  document.body.innerHTML = `
    <div id="page">
      <p id="text">several words to select</p>
      <textarea id="box">hello world, this is a reply</textarea>
      <input id="secret" type="password" value="hunter2 hunter2">
    </div>`;
  await import('../content/main.js');
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  sent.length = 0;
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.getElementById('parsipad-selection-popup')?.remove();
  document.getSelection().removeAllRanges();
  document.activeElement?.blur?.();
  vi.useRealTimers();
});

const $ = (id) => document.getElementById(id);
const toolbar = () => $('parsipad-selection-popup');
const BOX_RECT = { top: 100, bottom: 160, left: 40, right: 340, width: 300, height: 60 };

// A mouse drag inside the field: the gesture ends on the field, and the
// selection settles.
function selectInField(el, start, end, { pointer = true } = {}) {
  el.getBoundingClientRect = () => BOX_RECT;
  el.focus();
  if (pointer) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 }));
  el.setSelectionRange(start, end);
  document.dispatchEvent(new Event('selectionchange'));
  if (pointer) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', button: 0 }));
  vi.advanceTimersByTime(300);
}

describe('toolbar in fields', () => {
  it('shows the toolbar for a selection inside a textarea', () => {
    selectInField($('box'), 0, 5);
    expect(toolbar()).not.toBeNull();
  });

  it('anchors the toolbar to the field box', () => {
    selectInField($('box'), 0, 5);
    const host = toolbar();
    // Placed above the field: its bottom edge sits above the field's top.
    const top = parseFloat(host.style.top);
    expect(top).toBeLessThan(BOX_RECT.top);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('needs a pointer gesture: a keyboard or programmatic selection in a field shows nothing', () => {
    // Shift+Arrow while typing, or a site selecting a field's contents on
    // focus, both arrive as bare selectionchange events.
    selectInField($('box'), 0, 5, { pointer: false });
    expect(toolbar()).toBeNull();
  });

  it('keeps the toolbar when the selection settles again after the gesture', () => {
    selectInField($('box'), 0, 5);
    const host = toolbar();
    document.dispatchEvent(new Event('selectionchange'));
    vi.advanceTimersByTime(300);
    expect(toolbar()).toBe(host);
  });

  it('stays hidden for a password field', () => {
    selectInField($('secret'), 0, 7);
    expect(toolbar()).toBeNull();
  });

  it('Translate from a field toolbar carries the field text', () => {
    selectInField($('box'), 6, 11);
    const translate = roots.get(toolbar()).querySelector('[data-action="translate"]');
    translate.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    const request = sent.find((m) => m.action === 'TRANSLATE');
    expect(request).toBeDefined();
    expect(request.text).toBe('world');
    // The page's Selection sits on the field's parent in Chrome, so its
    // surrounding block is not the context of what was typed.
    expect(request.context).toBeUndefined();
  });
});
