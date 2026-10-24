// @vitest-environment happy-dom
// tests/page-confirm.test.js
// The dialog a whole-page translation shows before its first request, and
// the paragraph count it names. The last check pins where handleTranslatePage
// asks; tests/page-confirm-flow.test.js drives that path in the real script.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { functionBody } from './helpers/source.js';
import { confirmPageTranslation, countParagraphs } from '../content/page-confirm.js';

const writes = [];
beforeEach(() => {
  writes.length = 0;
  globalThis.chrome = { storage: { local: { set: async (items) => { writes.push(items); } } } };
  document.body.innerHTML = '<button id="before">before</button><div id="root"></div>';
});
afterEach(() => {
  document.body.innerHTML = '';
});

const opts = { count: 42, costText: '<$0.01', providerName: 'Claude', lang: 'en' };
const $ = (id) => document.getElementById(id);
const key = (target, name, init = {}) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, composed: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const parts = (root) => {
  const dialog = root.querySelector('[role="dialog"]');
  return {
    dialog,
    go: dialog.querySelector('[data-action="go"]'),
    cancel: dialog.querySelector('[data-action="cancel"]'),
    dontAsk: dialog.querySelector('input[type="checkbox"]')
  };
};

describe('page confirmation', () => {
  it('names the count, cost and provider and focuses Translate', async () => {
    const root = $('root');
    const p = confirmPageTranslation(root, opts);
    const { dialog } = parts(root);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = root.querySelector('#' + dialog.getAttribute('aria-labelledby'));
    expect(title.textContent).toBe(translations.en.pageConfirmTitle);
    expect(dialog.textContent).toMatch(/42/);
    expect(dialog.textContent).toMatch(/Claude/);
    expect(dialog.textContent).toContain('<$0.01');
    expect(document.activeElement.textContent).toBe('Translate page');
    key(dialog, 'Escape');
    expect(await p).toEqual({ go: false, dontAsk: false });
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('labels every control through t(), reusing cancel and dontAskAgain', () => {
    const root = $('root');
    confirmPageTranslation(root, { ...opts, lang: 'fa' });
    const { go, cancel, dontAsk } = parts(root);
    expect(go.textContent).toBe(translations.fa.pageConfirmGo);
    expect(cancel.textContent).toBe(translations.fa.cancel);
    expect(dontAsk.closest('label').textContent.trim()).toBe(translations.fa.dontAskAgain);
  });

  it('reads Persian right to left with the cost and provider as ltr runs', () => {
    const root = $('root');
    confirmPageTranslation(root, { ...opts, lang: 'fa' });
    const { dialog } = parts(root);
    const body = root.querySelector('#' + dialog.getAttribute('aria-describedby'));
    expect(body.getAttribute('dir')).toBe('rtl');
    expect(body.getAttribute('lang')).toBe('fa');
    const runs = [...body.querySelectorAll('bdi')];
    expect(runs.map((r) => r.textContent)).toEqual(['<$0.01', 'Claude']);
    for (const run of runs) expect(run.getAttribute('dir')).toBe('ltr');
    expect(body.textContent).toBe(
      translations.fa.pageConfirmBody.replace('{count}', '42').replace('{cost}', '<$0.01').replace('{provider}', 'Claude')
    );
    // In-page UI is not mirrored: only the text runs right to left.
    expect(dialog.getAttribute('dir')).toBeNull();
  });

  it('Translate resolves go, and with Don\'t ask again stores confirm_page_translate false', async () => {
    const root = $('root');
    let p = confirmPageTranslation(root, opts);
    parts(root).go.click();
    expect(await p).toEqual({ go: true, dontAsk: false });
    expect(writes).toEqual([]);

    p = confirmPageTranslation(root, opts);
    const { go, dontAsk } = parts(root);
    dontAsk.click();
    go.click();
    expect(await p).toEqual({ go: true, dontAsk: true });
    expect(writes).toEqual([{ confirm_page_translate: false }]);
  });

  it('Cancel resolves no go and stores nothing, even with the box ticked', async () => {
    const root = $('root');
    const p = confirmPageTranslation(root, opts);
    const { cancel, dontAsk } = parts(root);
    dontAsk.click();
    cancel.click();
    expect(await p).toEqual({ go: false, dontAsk: false });
    expect(writes).toEqual([]);
  });

  it('keeps its Escape from reaching the page', async () => {
    const root = $('root');
    let seen = 0;
    const listener = (event) => { if (event.key === 'Escape') seen += 1; };
    document.addEventListener('keydown', listener);
    try {
      const p = confirmPageTranslation(root, opts);
      key(parts(root).go, 'Escape');
      expect(await p).toEqual({ go: false, dontAsk: false });
      expect(seen).toBe(0);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('gives focus back to where it was when it closes', async () => {
    $('before').focus();
    const root = $('root');
    const p = confirmPageTranslation(root, opts);
    expect(document.activeElement).toBe(parts(root).go);
    parts(root).cancel.click();
    await p;
    expect(document.activeElement).toBe($('before'));
  });

  it('traps Tab among its three controls', () => {
    const root = $('root');
    confirmPageTranslation(root, opts);
    const { go, cancel, dontAsk } = parts(root);
    expect(document.activeElement).toBe(go);
    let event = key(go, 'Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dontAsk);
    key(dontAsk, 'Tab');
    expect(document.activeElement).toBe(cancel);
    key(cancel, 'Tab');
    expect(document.activeElement).toBe(go);
    event = key(go, 'Tab', { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
    key(cancel, 'Tab', { shiftKey: true });
    key(dontAsk, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(go);
  });

  it('resolves no go when its root leaves the page', async () => {
    const root = $('root');
    const p = confirmPageTranslation(root, opts);
    root.remove();
    expect(await p).toEqual({ go: false, dontAsk: false });
    expect(writes).toEqual([]);
  });

  it('mounts inside a shadow root and resolves when the host is removed', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const p = confirmPageTranslation(shadow, opts);
    expect(shadow.activeElement).toBe(parts(shadow).go);
    host.remove();
    expect(await p).toEqual({ go: false, dontAsk: false });
  });
});

describe('countParagraphs', () => {
  it('counts the distinct block containers, not the text nodes', () => {
    document.body.innerHTML = `
      <h1>Title</h1>
      <p>One <a href="#">link</a> and <em>more</em> text.</p>
      <ul><li>first <b>item</b></li><li>second</li></ul>
      <div>loose <span>div</span> text</div>
      <table><tr><td>cell <i>a</i></td><th>head</th></tr></table>`;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim()) textNodes.push({ node, text: node.textContent, parent: node.parentElement });
    }
    expect(textNodes.length).toBeGreaterThan(8);
    // h1, p, both li, td and th; the div and the span inside it each count
    // once, as neither sits in a block container.
    const span = document.querySelector('span');
    expect(countParagraphs(textNodes)).toBe(new Set([
      document.querySelector('h1'), document.querySelector('p'),
      ...document.querySelectorAll('li'), document.querySelector('div'), span,
      document.querySelector('td'), document.querySelector('th')
    ]).size);
  });

  it('is zero for no text', () => {
    expect(countParagraphs([])).toBe(0);
  });
});

describe('handleTranslatePage', () => {
  it('asks before the first batch request', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
    const body = functionBody(js, 'handleTranslatePage');
    expect(body.indexOf('confirmPageTranslation(')).toBeGreaterThan(-1);
    expect(body.indexOf('confirmPageTranslation(')).toBeLessThan(body.indexOf('requestTranslation('));
  });
});
