/**
 * Applying the stored theme to a page.
 *
 * Two conventions are in use: settings, grammar and welcome style dark with a
 * `.dark` class, the rest with `[data-theme]`. lib/design-tokens.css therefore
 * matches either one:
 *
 *   :root.dark, :root[data-theme='dark'] { ... }
 *
 * and lib/theme-boot.js sets BOTH before first paint so whichever a page uses
 * is correct from the start.
 *
 * That is exactly why a page cannot then flip only one of them. Setting
 * `data-theme` to light while the `.dark` class is still on the root leaves
 * `:root.dark` matching, every token stays dark, and the page simply refuses
 * to go back to light. Five pages had that bug: whichever convention a page
 * reads, theme changes have to write both.
 *
 * theme-boot.js keeps its own copy of this logic because it is a classic
 * script that has to run in <head> before any module loads, and cannot import.
 */

/**
 * Resolve 'system' to the theme it currently means.
 * @param {string} theme - 'light', 'dark' or 'system'.
 * @returns {'light'|'dark'}
 */
export function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

/**
 * Put a theme on the document, in both conventions.
 *
 * @param {string} theme - 'light', 'dark' or 'system'.
 * @param {HTMLElement} [root]
 * @returns {'light'|'dark'} The theme actually applied.
 */
export function applyThemeToRoot(theme, root = document.documentElement) {
  const effective = resolveTheme(theme);
  root.setAttribute('data-theme', effective);
  root.classList.toggle('dark', effective === 'dark');
  return effective;
}
