/**
 * Apply the stored theme before the page paints.
 *
 * Every extension page reads the theme from chrome.storage, which is async,
 * so the first paint happens on the default light palette and the theme
 * lands a couple of IPC hops later. That shows as a white flash when opening
 * a page in dark mode, and on a slow load it reads as the page having opened
 * in the wrong theme entirely.
 *
 * chrome.storage cannot be read synchronously, so setTheme mirrors the value
 * into localStorage, which can. This file is a classic script, not a module,
 * and is loaded in <head> without defer so it runs before the body exists.
 * An inline script would be simpler but Manifest V3's default policy forbids
 * one.
 *
 * Both conventions are set because the pages disagree: settings, grammar and
 * welcome style dark with a .dark class, the rest with [data-theme].
 */
(function () {
  try {
    const stored = localStorage.getItem('pp-theme') || 'system';
    const dark = stored === 'dark'
      || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.classList.toggle('dark', dark);
  } catch (e) {
    // A blocked or unavailable localStorage just means the page paints light
    // and the async path corrects it, which is the old behaviour.
  }
})();
