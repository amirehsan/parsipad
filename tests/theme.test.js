import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyThemeToRoot, resolveTheme } from '../lib/theme.js';

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
