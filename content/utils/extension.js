/**
 * Calls into the extension that survive the extension being reloaded or
 * updated under an open page. Chrome leaves the old content script running
 * but cut off: from then on chrome.runtime.* can throw synchronously, before
 * any promise exists to catch. These wrappers turn that into a value the
 * caller can act on (show the reload state, drop the logo) instead of an
 * uncaught error that leaves the reader with no box at all.
 */

/**
 * Whether this content script can still reach its extension.
 * @returns {boolean}
 */
export function isContextAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * chrome.runtime.getURL, or an empty string once the extension is gone.
 * @param {string} path
 * @returns {string}
 */
export function extensionUrl(path) {
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return '';
  }
}

/**
 * Send a message nobody waits on (a click that opens Settings, an answer to
 * the rating ask). A failure, synchronous or not, is dropped: there is no
 * one left to tell.
 * @param {object} message
 * @returns {Promise<unknown>}
 */
export function notifyWorker(message) {
  try {
    return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}
