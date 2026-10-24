// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// The content script runs on every page, so a page script could dispatch
// its own keydown events. Only keys the user pressed may start a provider
// request (Alt+B) or move focus into the selection toolbar (Tab). happy-dom
// leaves isTrusted undefined on events, so the page's synthetic events are
// marked false here, as a browser marks them.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { loadContentScript } from './helpers/content-script.js';

let h;

beforeAll(async () => {
  h = await loadContentScript();
  h.enableToolbar();
});

beforeEach(() => {
  document.body.innerHTML = `
    <a id="before" href="#before">before</a>
    <p id="text">several words to select on this page</p>`;
  h.reset();
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.getSelection().removeAllRanges();
});

const $ = (id) => document.getElementById(id);
const toolbarHost = () => $('parsipad-selection-popup');

function key(target, init, { trusted }) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
  if (!trusted) Object.defineProperty(event, 'isTrusted', { value: false });
  target.dispatchEvent(event);
  return event;
}

async function selectWords() {
  const range = document.createRange();
  range.setStart($('text').firstChild, 0);
  range.setEnd($('text').firstChild, 13);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  await new Promise((resolve) => setTimeout(resolve, 350));
}

describe('keys a page script dispatches', () => {
  it('Alt+B from a page script is ignored; the user\'s Alt+B is taken', () => {
    $('text').setAttribute('tabindex', '0');
    $('text').focus();
    const fake = key($('text'), { key: 'b', code: 'KeyB', altKey: true }, { trusted: false });
    expect(fake.defaultPrevented).toBe(false);
    const real = key($('text'), { key: 'b', code: 'KeyB', altKey: true }, { trusted: true });
    expect(real.defaultPrevented).toBe(true);
  });

  it('Tab from a page script does not pull focus into the toolbar; the user\'s Tab does', async () => {
    $('before').focus();
    await selectWords();
    expect(toolbarHost()).not.toBeNull();
    const fake = key($('before'), { key: 'Tab' }, { trusted: false });
    expect(fake.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe($('before'));
    const real = key($('before'), { key: 'Tab' }, { trusted: true });
    expect(real.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toolbarHost());
  });
});
