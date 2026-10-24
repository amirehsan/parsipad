// tests/library-page.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
describe('library page', () => {
  const html = read('library/library.html');
  const js = read('library/library.js');
  it('labels search and direction and uses real tabs', () => {
    expect(html).toMatch(/<label[^>]+for="library-search"/);
    expect(html).toMatch(/<input[^>]+type="search"[^>]+id="library-search"/);
    expect(html).toMatch(/<label[^>]+for="library-direction"/);
    expect((html.match(/role="tab"/g) || []).length).toBe(3);
    expect(html).toMatch(/role="status"/);
  });
  it('debounces search, keeps state in the URL and flushes deletes on leave', () => {
    expect(js).toMatch(/debounce\([^)]*,\s*200\)/);
    expect(js).toMatch(/history\.replaceState\(/);
    expect(js).toMatch(/addEventListener\('pagehide'/);
    expect(js).not.toMatch(/confirm\(t\('confirmDeleteItem'/);
  });
  it('opens the panel before any await in the handler', () => {
    const body = js.slice(js.indexOf('function openInPanel'));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    expect(fn).toMatch(/chrome\.sidePanel\.open\(/);
    expect(fn.indexOf('chrome.sidePanel.open(')).toBeLessThan(fn.indexOf('await') === -1 ? Infinity : fn.indexOf('await'));
  });
  it('redirects the old pages to the matching tab', () => {
    expect(read('history/history.html')).toMatch(/http-equiv="refresh"[^>]+url=\.\.\/library\/library\.html\?tab=history/);
    expect(read('favorites/favorites.html')).toMatch(/http-equiv="refresh"[^>]+url=\.\.\/library\/library\.html\?tab=favorites/);
    expect(exists('history/history.js')).toBe(false);
    expect(exists('favorites/favorites.js')).toBe(false);
  });
  it('no surface links to the old pages', () => {
    for (const f of ['popup/popup.js', 'popup/popup.html', 'sidepanel/sidepanel.html', 'sidepanel/panel.js', 'settings/settings.js']) {
      expect(read(f), f).not.toMatch(/history\/history\.html|favorites\/favorites\.html/);
    }
  });
});

describe('library page layout', () => {
  const html = read('library/library.html');
  const css = read('library/library.css');
  /** Declarations of the rule whose selector list is exactly `selector`, outside media queries. */
  const rule = (selector) => {
    const escaped = selector.replace(/[.[\]()"=:]/g, '\\$&').replace(/,\s*/g, ',\\s*');
    const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
  };
  const narrow = css.slice(css.indexOf('@media (max-width: 560px)'));
  const narrowBlock = narrow.slice(0, narrow.indexOf('\n}\n'));

  it('keeps the main landmark around the tabs and an inner tab panel', () => {
    expect(html).toMatch(/<main[^>]*>\s*<div class="[^"]*" role="tablist"/);
    expect(html).not.toMatch(/<main[^>]*role=/);
    expect(html).toMatch(/<div id="library-panel"[^>]*role="tabpanel"/);
    expect(html.indexOf('role="tabpanel"')).toBeLessThan(html.indexOf('</main>'));
  });

  it('lines every filter control up on one row of one height', () => {
    expect(rule('.lib-filters')).toMatch(/align-items:\s*flex-end/);
    expect(rule('.lib-filters .pp-input')).toMatch(/height:\s*var\(--lib-control-height\)/);
    expect(rule('.lib-filter-actions')).toMatch(/min-height:\s*var\(--lib-control-height\)/);
    expect(rule('.lib-filter-actions')).toMatch(/align-items:\s*center/);
    const actions = html.slice(html.indexOf('class="lib-filter-actions"'));
    expect(actions.indexOf('id="library-types"')).toBeGreaterThan(-1);
    expect(actions.indexOf('id="library-clear"')).toBeGreaterThan(actions.indexOf('id="library-types"'));
  });

  it('sizes Clear All like the type chips', () => {
    const shared = rule('.lib-chip,\n.lib-clear');
    expect(shared).toMatch(/min-height:/);
    expect(shared).toMatch(/font-size:/);
    expect(shared).toMatch(/padding:/);
    expect(html).not.toMatch(/id="library-clear"[^>]*pp-btn/);
    expect(rule('.lib-chip')).not.toMatch(/min-height|font-size|padding/);
  });

  it('separates the result column from the original with a divider on the side they meet', () => {
    expect(rule('.lib-pair > .lib-result')).toMatch(/border-left:\s*1px solid var\(--color-border\)/);
    expect(rule('.lib-pair > .lib-result')).toMatch(/padding-left:\s*var\(--space-stack-group\)/);
    const rtl = rule(':root[dir="rtl"] .lib-pair > .lib-result');
    expect(rtl).toMatch(/border-right:\s*1px solid var\(--color-border\)/);
    expect(rtl).toMatch(/border-left:\s*0/);
    expect(narrowBlock).toMatch(/\.lib-pair > \.lib-result[^{]*\{[^}]*border-(left|right):\s*0[^}]*border-top:\s*1px solid var\(--color-border\)/);
  });

  it('spaces with the semantic tokens or the two smallest steps only', () => {
    const steps = [...css.matchAll(/var\(--space-(\d+)\)/g)].map(m => Number(m[1]));
    for (const step of steps) expect([1, 2], `--space-${step}`).toContain(step);
  });
});
