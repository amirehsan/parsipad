/**
 * ParsiPad content-script bootstrap.
 *
 * Chrome's manifest content_scripts run as classic scripts; top-level
 * `import` would throw a SyntaxError and tear down the whole script.
 * Instead, this bootstrap dynamically imports the real ES module entry,
 * which can then use normal `import` statements throughout.
 *
 * Dynamic import is cached per URL, so a second injection (e.g. via
 * chrome.scripting.executeScript after a popup ping) is effectively a
 * no-op — the module is fetched once and reused.
 */
(async () => {
  if (window.__parsipadBootstrapped) return;
  window.__parsipadBootstrapped = true;
  try {
    await import(chrome.runtime.getURL('content/main.js'));
  } catch (err) {
    console.error('[ParsiPad] content script failed to load:', err);
  }
})();
