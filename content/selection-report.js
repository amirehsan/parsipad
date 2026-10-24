// Reports what the reader has selected on the page to the side panel.
//
// The text only ever travels over chrome.runtime.sendMessage to this
// extension's own pages. It is never logged, stored or sent anywhere else.

const MIN_REPORT_LENGTH = 2;
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA']);

/**
 * Turn the page selection into the text worth offering, or null.
 * Selections inside form fields and editable regions are skipped, which also
 * keeps anything typed into a password field out of the report.
 * @param {Selection | null} selection
 * @param {Element | null} activeElement
 * @returns {string | null}
 */
export function selectionToReport(selection, activeElement) {
  if (!selection) return null;
  if (activeElement) {
    if (EDITABLE_TAGS.has(String(activeElement.tagName).toUpperCase())) return null;
    if (activeElement.isContentEditable) return null;
  }
  const text = selection.toString().trim();
  return text.length >= MIN_REPORT_LENGTH ? text : null;
}

/**
 * Build a debounced handler that forwards a report only when it differs from
 * the last one sent. A null report (selection cleared) is ignored, so the
 * panel keeps offering the last real selection until the tab changes.
 * @param {(text: string) => void} send
 * @param {{ delay?: number }} [options]
 * @returns {(text: string | null) => void}
 */
export function createSelectionReporter(send, { delay = 300 } = {}) {
  let timer = null;
  let lastSent = null;
  return (text) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (text === null || text === lastSent) return;
      lastSent = text;
      send(text);
    }, delay);
  };
}
