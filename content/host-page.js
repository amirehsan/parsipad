/**
 * Helpers that read from, or register against, the host page itself.
 *
 * These are shared by every ParsiPad surface that mounts a Shadow DOM host
 * on a third-party page: the floating box, the selection popup, the page
 * progress overlay, and block translate. Keeping them in one module means
 * one theme observer serves all of them, rather than each surface starting
 * its own.
 */

// Every Shadow DOM host we own. The theme observer iterates over this to
// re-apply data-theme when the host page toggles between dark and light.
const themedHosts = new Set();
let hostThemeObserver = null;

/**
 * Read the host page's effective background color and pick "dark" or "light".
 * Uses Y luminance > 0.5 = light, otherwise dark. Transparent backgrounds
 * fall back to "light" (most pages without an explicit background are white).
 *
 * @returns {'light' | 'dark'}
 */
export function detectHostTheme() {
  try {
    const target = document.body || document.documentElement;
    if (!target) return 'light';
    const bg = getComputedStyle(target).backgroundColor;
    const match = bg.match(/(\d+(?:\.\d+)?)/g);
    if (!match || match.length < 3) return 'light';
    const [r, g, b, a = '1'] = match.map(Number);
    if (a < 0.1) return 'light';
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5 ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Stamp data-theme on a Shadow DOM host (or any element). Tracks the host so
 * future runtime theme changes on the page propagate automatically.
 */
export function applyHostTheme(host) {
  if (!host) return;
  host.setAttribute('data-theme', detectHostTheme());
  themedHosts.add(host);
  ensureHostThemeObserver();
}

/**
 * Start one MutationObserver that watches the page's <html> and <body> for
 * class/style mutations (Twitter, YouTube, GitHub toggle dark mode by adding
 * classes here). On any change, refresh every known host's data-theme.
 */
function ensureHostThemeObserver() {
  if (hostThemeObserver) return;
  hostThemeObserver = new MutationObserver(() => {
    const theme = detectHostTheme();
    for (const host of themedHosts) {
      // host may have been removed from the DOM; drop dangling refs.
      if (!host.isConnected) {
        themedHosts.delete(host);
        continue;
      }
      host.setAttribute('data-theme', theme);
    }
  });
  const opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] };
  if (document.documentElement) hostThemeObserver.observe(document.documentElement, opts);
  if (document.body) hostThemeObserver.observe(document.body, opts);
}

/**
 * Register the bundled Vazirmatn faces on the host document.
 *
 * Font faces resolve against the document's font set, so a @font-face
 * declared only inside a shadow root is not a reliable way to load Persian
 * type. Everything that renders Persian on a host page depends on this
 * running first.
 *
 * Idempotent, and loads the woff2 from the extension's own bundle via
 * chrome.runtime.getURL so no third-party request is made.
 */
export function ensurePersianFontLoaded() {
  const styleId = 'parsipad-persian-font';
  if (document.getElementById(styleId)) return;

  const face = (weight) => {
    const url = chrome.runtime.getURL(`fonts/vazirmatn-arabic-${weight}-normal.woff2`);
    return `@font-face { font-family: 'Vazirmatn'; font-weight: ${weight}; font-display: swap; src: url('${url}') format('woff2'); }`;
  };

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = [400, 500, 600, 700].map(face).join('\n');
  document.head.appendChild(style);
}
