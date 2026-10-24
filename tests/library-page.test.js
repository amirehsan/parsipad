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
