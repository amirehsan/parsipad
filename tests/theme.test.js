import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyThemeToRoot, resolveTheme } from '../lib/theme.js';
import fs from 'fs';
import path from 'path';

/**
 * The bug this guards against shipped on five pages at once.
 *
 * lib/design-tokens.css matches `:root.dark, :root[data-theme='dark']`, and
 * lib/theme-boot.js sets both before first paint. Five pages then applied
 * theme changes by writing only `data-theme`. Going dark worked; going back
 * to light did not, because the `.dark` class left over from boot kept
 * `:root.dark` matching and every token stayed dark. The page simply refused
 * to return to light.
 */

/** A stand-in for documentElement: enough surface to record both writes. */
function fakeRoot() {
  const attrs = {};
  const classes = new Set();
  return {
    setAttribute: (k, v) => { attrs[k] = v; },
    getAttribute: (k) => attrs[k],
    classList: {
      toggle: (name, on) => { on ? classes.add(name) : classes.delete(name); },
      contains: (name) => classes.has(name)
    }
  };
}

const setSystemPrefersDark = (dark) => {
  globalThis.window = { matchMedia: vi.fn(() => ({ matches: dark })) };
};

beforeEach(() => setSystemPrefersDark(false));

describe('applyThemeToRoot', () => {
  it('writes both conventions when going dark', () => {
    const root = fakeRoot();
    applyThemeToRoot('dark', root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('clears both conventions when going light', () => {
    // The whole bug in one assertion: the class has to come off, not just
    // the attribute.
    const root = fakeRoot();
    applyThemeToRoot('dark', root);
    applyThemeToRoot('light', root);
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('recovers a page booted with both set by theme-boot', () => {
    // theme-boot.js runs first and sets both. A later toggle to light has to
    // undo both of them.
    const root = fakeRoot();
    root.setAttribute('data-theme', 'dark');
    root.classList.toggle('dark', true);

    applyThemeToRoot('light', root);

    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('survives being toggled repeatedly', () => {
    const root = fakeRoot();
    for (const theme of ['dark', 'light', 'dark', 'light', 'dark']) {
      applyThemeToRoot(theme, root);
      const isDark = theme === 'dark';
      expect(root.getAttribute('data-theme')).toBe(theme);
      expect(root.classList.contains('dark')).toBe(isDark);
    }
  });

  it('returns the theme it actually applied', () => {
    expect(applyThemeToRoot('dark', fakeRoot())).toBe('dark');
    expect(applyThemeToRoot('light', fakeRoot())).toBe('light');
  });
});

describe('resolveTheme', () => {
  it('follows the system preference for "system"', () => {
    setSystemPrefersDark(true);
    expect(resolveTheme('system')).toBe('dark');
    setSystemPrefersDark(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('applies "system" in both conventions too', () => {
    setSystemPrefersDark(true);
    const root = fakeRoot();
    applyThemeToRoot('system', root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('treats anything unrecognised as light rather than throwing', () => {
    expect(resolveTheme(undefined)).toBe('light');
    expect(resolveTheme('sepia')).toBe('light');
  });
});

describe('every page applies theme the same way', () => {
  const root = path.resolve(__dirname, '..');
  const PAGES = [
    'newtab/newtab.js', 'popup/popup.js', 'favorites/favorites.js',
    'history/history.js', 'analytics/analytics.js',
    'settings/settings.js', 'grammar/grammar.js', 'welcome/welcome.js'
  ];

  /**
   * The bug arrived twice, in mirror image, because the pages were split
   * across two conventions:
   *
   *   five wrote only data-theme  -> could not return to light
   *   three toggled only .dark    -> could not return to light either
   *
   * Both halves look correct in isolation, and both are broken the moment
   * theme-boot has set the other one. Fixing one half and not the other is
   * exactly what happened, so the guard is structural: no page reaches for a
   * convention directly, they all go through the one helper.
   */
  it.each(PAGES)('%s routes through applyThemeToRoot', (page) => {
    const src = fs.readFileSync(path.join(root, page), 'utf8');
    expect(src).toContain('applyThemeToRoot');
  });

  it.each(PAGES)('%s never writes a convention directly', (page) => {
    const src = fs.readFileSync(path.join(root, page), 'utf8');
    expect(src).not.toMatch(/documentElement\.setAttribute\(\s*['"]data-theme['"]/);
    expect(src).not.toMatch(/classList\.(toggle|add|remove)\(\s*['"]dark['"]/);
  });

  it('leaves theme-boot as the one deliberate exception', () => {
    // It is a classic script that must run in <head> before any module loads,
    // so it cannot import the helper and keeps its own copy on purpose.
    const boot = fs.readFileSync(path.join(root, 'lib/theme-boot.js'), 'utf8');
    expect(boot).toContain("setAttribute('data-theme'");
    expect(boot).toContain("classList.toggle('dark'");
  });
});
