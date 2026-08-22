/**
 * Surrounding-sentence capture for word, phrase and sentence selections.
 * sliceContext and sentenceAround are pure (tested);
 * captureSelectionContext reads the DOM.
 */

import { findTerminatorEnds } from '../lib/translation/mode.js';

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

/**
 * The single sentence containing the selection, recovered from the
 * context window captured around it.
 *
 * The window is up to 300 characters either side, which is more than one
 * sentence, so both edges are trimmed back to the nearest terminator:
 * the last one before the selection and the first one after it. What is
 * left is the sentence the user's word actually sits in, which is what
 * makes a sentence request worth sending.
 *
 * Returns undefined when there is nothing around the selection to
 * recover, so a caller can drop the affordance rather than offer one
 * that would send the word back on its own.
 *
 * @param {{before?: string, selection?: string, after?: string}} params
 * @returns {string|undefined}
 */
export function sentenceAround({ before = '', selection = '', after = '' } = {}) {
  const core = String(selection || '').trim();
  if (!core) return undefined;

  const lead = String(before || '');
  const tail = String(after || '');

  // The last terminator before the selection ends the previous sentence,
  // so this one starts just past it.
  const leadEnds = findTerminatorEnds(lead);
  const head = leadEnds.length > 0 ? lead.slice(leadEnds[leadEnds.length - 1]) : lead;

  // The first terminator after the selection ends this sentence, and the
  // terminator itself belongs to it.
  const tailEnds = findTerminatorEnds(tail);
  const rest = tailEnds.length > 0 ? tail.slice(0, tailEnds[0]) : tail;

  const sentence = `${head}${selection}${rest}`.replace(/\s+/g, ' ').trim();
  if (!sentence || sentence === core) return undefined;
  return sentence;
}
