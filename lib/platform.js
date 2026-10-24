/**
 * Everything that differs between Chrome and Firefox, in one place.
 *
 * The same source builds both packages, and nearly every chrome.* call works
 * unchanged in Firefox. What does not: the side panel (Firefox has a
 * sidebar instead), the store a rating goes to, and the browser's own pages,
 * which each browser names and guards differently. Callers ask this module
 * rather than checking the browser themselves.
 *
 * The browser is told apart by the extension's own address, not the user
 * agent: Firefox serves extension pages from moz-extension://. That works in
 * every context, content scripts included, where Firefox offers no
 * runtime.getBrowserInfo.
 */

import { STORE_REVIEWS_URL, AMO_REVIEWS_URL } from './constants.js';

/**
 * Whether this is the Firefox build. False, never a throw, when the
 * extension context is gone, as in a content script orphaned by a reload.
 * @returns {boolean}
 */
export function isFirefox() {
  try {
    return globalThis.chrome.runtime.getURL('').startsWith('moz-extension://');
  } catch {
    return false;
  }
}

/**
 * Open the side panel in Chrome, or the sidebar in Firefox. Both browsers
 * only allow this inside the user's click, so the browser API is called
 * before anything is awaited, and callers must not await anything first
 * either.
 * @param {{windowId?: number, tabId?: number}} [target] - Chrome needs one; Firefox opens in the current window
 * @returns {Promise<boolean>} false when the browser has no sidebar API
 */
export async function openSidebar({ windowId, tabId } = {}) {
  const sidePanel = globalThis.chrome?.sidePanel;
  if (sidePanel) {
    await sidePanel.open(tabId !== undefined ? { tabId } : { windowId });
    return true;
  }
  const sidebarAction = globalThis.browser?.sidebarAction;
  if (sidebarAction) {
    await sidebarAction.open();
    return true;
  }
  return false;
}

/**
 * Where a rating is left: the store this copy was installed from.
 * @returns {string}
 */
export function storeReviewsUrl() {
  return isFirefox() ? AMO_REVIEWS_URL : STORE_REVIEWS_URL;
}

/**
 * Open the browser's keyboard shortcut settings for extensions. Chrome lets
 * the tabs API open its page; Firefox refuses about:addons there but has an
 * API of its own for it.
 * @returns {Promise<void>}
 */
export async function openShortcutSettings() {
  if (isFirefox()) {
    await globalThis.browser.commands.openShortcutSettings();
    return;
  }
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

/**
 * The browser's own New Tab. chrome://newtab would land back on ParsiPad's
 * override, so Chrome's real page is named directly. Firefox's equivalent is
 * Firefox Home.
 * @returns {string}
 */
export function browserNewTabUrl() {
  return isFirefox() ? 'about:home' : 'chrome://new-tab-page/';
}
