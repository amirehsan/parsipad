// tests/history-clear-all.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * Dictionary lookups (Alt+D, right-click) are still recorded, but the popup's
 * dictionary history and its Clear All are gone. The Library's History Clear
 * All under the All type is the one place that clears them, so it must keep
 * doing so. tests/library-page-dom.test.js drives the same guarantee through
 * the page.
 */
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'library/library.js'), 'utf8');
const body = js.slice(js.indexOf('async function handleClearAll'), js.indexOf('\n}\n', js.indexOf('async function handleClearAll')));

describe('Library clear all', () => {
  it('clears dictionary history along with translations and polishes', () => {
    expect(js).toMatch(/import \{[^}]*\bclearDictionaryHistory\b[^}]*\} from '\.\.\/lib\/history\.js'/);
    const all = body.slice(body.indexOf("} else if (state.type === 'all') {"), body.indexOf('} else {', body.indexOf("} else if (state.type === 'all') {")));
    expect(all).toMatch(/await clearHistory\(\)/);
    expect(all).toMatch(/await clearPolishHistory\(\)/);
    expect(all).toMatch(/await clearDictionaryHistory\(\)/);
  });

  it('asks first, in words that name every kind of history', () => {
    expect(body.indexOf('confirm(')).toBeGreaterThan(-1);
    expect(body.indexOf('confirm(')).toBeLessThan(body.indexOf('clearHistory()'));
    expect(body).toMatch(/'confirmClearAllHistory'/);
    expect(body).toMatch(/'confirmClearShownHistory'/);
    expect(body).toMatch(/'confirmClearFavorites'/);
    for (const key of ['confirmClearAllHistory', 'confirmClearShownHistory', 'confirmClearFavorites']) {
      expect(translations.en[key], `en.${key}`).toBeTruthy();
      expect(translations.fa[key], `fa.${key}`).toBeTruthy();
    }
    expect(translations.en.confirmClearAllHistory).toMatch(/dictionary/i);
  });

  it('closes pending undo windows before clearing', () => {
    expect(body.indexOf('undoQueue.flush()')).toBeGreaterThan(-1);
    expect(body.indexOf('undoQueue.flush()')).toBeLessThan(body.indexOf('clearHistory()'));
  });
});
