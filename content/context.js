/**
 * Surrounding-sentence capture for word, phrase and sentence selections.
 * sliceContext is pure (tested); captureSelectionContext reads the DOM.
 */

const BLOCK_SELECTOR = 'p, li, td, th, dd, dt, blockquote, h1, h2, h3, h4, h5, h6, figcaption, pre, article, section, div';
const MAX_CONTEXT_CHARS = 300;
const MAX_SELECTION_FOR_CONTEXT = 280;

/**
 * @param {string} blockText
 * @param {string} selectedText
 * @param {{maxChars?: number, anchorOffset?: number}} [options]
 * @returns {{before: string, after: string} | undefined}
 */
export function sliceContext(blockText, selectedText, { maxChars = MAX_CONTEXT_CHARS, anchorOffset = 0 } = {}) {
  if (!blockText || !selectedText) return undefined;
  const text = String(blockText).replace(/\s+/g, ' ');
  const needle = String(selectedText).replace(/\s+/g, ' ').trim();
  if (!needle) return undefined;

  const start = Math.max(0, Math.min(anchorOffset, text.length));
  let idx = text.indexOf(needle, start);
  if (idx === -1) idx = text.indexOf(needle);
  if (idx === -1) return undefined;

  const beforeStart = Math.max(0, idx - maxChars);
  const afterEnd = Math.min(text.length, idx + needle.length + maxChars);
  let before = text.slice(beforeStart, idx);
  let after = text.slice(idx + needle.length, afterEnd);
  if (beforeStart > 0) before = before.replace(/^\S*\s/, '');
  if (afterEnd < text.length) after = after.replace(/\s\S*$/, '');

  if (!before && !after) return undefined;
  return { before, after };
}

function toElement(node) {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

/**
 * @param {Selection} selection
 * @returns {{before: string, after: string, pageLang: string, title: string} | undefined}
 */
export function captureSelectionContext(selection) {
  try {
    if (!selection || selection.rangeCount === 0) return undefined;
    const selected = selection.toString();
    if (!selected.trim() || selected.length > MAX_SELECTION_FOR_CONTEXT) return undefined;

    const range = selection.getRangeAt(0);
    const block = toElement(range.startContainer)?.closest(BLOCK_SELECTOR);
    const endElement = toElement(range.endContainer);
    if (!block || !endElement || !block.contains(endElement)) return undefined;

    const preRange = document.createRange();
    preRange.selectNodeContents(block);
    preRange.setEnd(range.startContainer, range.startOffset);
    const anchorOffset = preRange.toString().replace(/\s+/g, ' ').length;

    const slice = sliceContext(block.textContent || '', selected, { anchorOffset: Math.max(0, anchorOffset - 5) });
    const pageLang = (document.documentElement.lang || '').slice(0, 12);
    const title = (document.title || '').trim().slice(0, 120);
    if (!slice && !pageLang && !title) return undefined;
    return { before: slice?.before || '', after: slice?.after || '', pageLang, title };
  } catch {
    return undefined;
  }
}
