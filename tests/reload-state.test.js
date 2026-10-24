// tests/reload-state.test.js
// When the extension is reloaded or updated, the content script already in
// an open page loses its connection for good: only reloading the page brings
// it back. Every box says so, in the reader's language, and offers that one
// fix.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { functionBody } from './helpers/source.js';

let renderReloadState;
beforeAll(async () => {
  const { Window } = await import('happy-dom');
  globalThis.document = new Window().document;
  ({ renderReloadState } = await import('../content/reload-state.js'));
});

describe('reload state', () => {
  it('explains and offers the one fix', () => {
    const c = document.createElement('div');
    const reload = vi.fn();
    renderReloadState(c, 'en', { reload });
    expect(c.querySelector('[role="alert"]').textContent).toMatch(/Reload the page/);
    const button = c.querySelector('button');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent).toBe(translations.en.blockTranslateReload);
    button.click();
    expect(reload).toHaveBeenCalled();
  });

  it('replaces what the container held', () => {
    const c = document.createElement('div');
    c.innerHTML = '<div class="parsipad-loading"></div>';
    renderReloadState(c, 'en', { reload: () => {} });
    expect(c.querySelector('.parsipad-loading')).toBeNull();
  });

  it('speaks Persian in a Persian box, right to left', () => {
    const c = document.createElement('div');
    renderReloadState(c, 'fa', { reload: () => {} });
    expect(c.querySelector('[role="alert"]').textContent).toBe(translations.fa.errorContextInvalidated);
    expect(c.querySelector('button').textContent).toBe(translations.fa.blockTranslateReload);
    expect(c.firstElementChild.getAttribute('dir')).toBe('rtl');
  });

  it('hides its icon from assistive technology', () => {
    const c = document.createElement('div');
    renderReloadState(c, 'en', { reload: () => {} });
    const svg = c.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('every box uses it', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
    for (const name of ['showError', 'showPolishError', 'showDictionaryError']) {
      expect(functionBody(js, name), name).toMatch(/renderReloadState\(/);
    }
  });
});
