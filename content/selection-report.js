// Reports what the reader has selected on the page to the side panel.
//
// The text only ever travels over chrome.runtime.sendMessage to this
// extension's own pages. It is never logged, stored or sent anywhere else.

const MIN_REPORT_LENGTH = 2;
// The chip shows 120 characters and the textarea takes at most this many, so a
// select-all on a long page never pushes megabytes through messaging.
export const MAX_REPORT_LENGTH = 2000;
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
  if (text.length < MIN_REPORT_LENGTH) return null;
  return text.length > MAX_REPORT_LENGTH ? text.slice(0, MAX_REPORT_LENGTH) : text;
}

/**
 * Build a debounced handler for raw selectionchange events. The handler takes
 * a getter and calls it only when the timer fires, so a drag-select or
 * select-all does not build the selection string on every event. The report is
 * forwarded only when it differs from the last one sent. A null report
 * (selection cleared, or moved into a field) forgets the last one, so
 * selecting the same text again is sent again.
 * @param {(text: string) => void} send
 * @param {{ delay?: number }} [options]
 * @returns {(getReport: () => string | null) => void}
 */
export function createSelectionReporter(send, { delay = 300 } = {}) {
  let timer = null;
  let lastSent = null;
  return (getReport) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const text = getReport();
      if (text === null) {
        lastSent = null;
        return;
      }
      if (text === lastSent) return;
      lastSent = text;
      send(text);
    }, delay);
  };
}
