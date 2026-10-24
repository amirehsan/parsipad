// What to tell the reader when the side panel cannot capture the page.
//
// chrome.tabs.captureVisibleTab needs the activeTab grant, and Chrome gives
// that grant for a toolbar click, a keyboard shortcut or a context menu item,
// but not for a click inside a side panel. The shortcut and the right-click
// item both start from the page, so they work where the panel button cannot.
import { t } from '../lib/i18n.js';

/**
 * Whether the worker's reply to CAPTURE_SCREENSHOT carries no capture.
 * @param {{ error?: string, screenshotDataUrl?: string } | undefined} response
 * @returns {boolean}
 */
export function screenshotCaptureFailed(response) {
  return !response || Boolean(response.error) || !response.screenshotDataUrl;
}

/**
 * The notice shown after a failed capture, naming the bound shortcut when
 * Chrome has one.
 * @param {string} lang
 * @param {string} [shortcut] The screenshot command's real binding, if any
 * @returns {string}
 */
export function screenshotGuidance(lang, shortcut) {
  if (!shortcut) return t('screenshotNeedsAccess', lang);
  return t('screenshotNeedsAccessShortcut', lang).replace('{shortcut}', shortcut);
}
