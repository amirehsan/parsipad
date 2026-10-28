// Which selections Replace can write back to, and where they are.
//
// The selection toolbar once skipped everything editable (see
// selection-report.js, whose rule the side panel still uses). Replace needs
// the toolbar in exactly the fields it can write to, so this module answers
// a narrower question: is this selection in a field or editor that a
// generated text can be written into, and where. Pure DOM reads only.

/**
 * Input types whose text Replace can rewrite. Missing `type` counts as text.
 * Not email: the platform exposes no selection on it (selectionStart is
 * null), so the selected text could never be located.
 */
export const ACCEPTED_INPUT_TYPES = ['text', 'search', 'url'];

// An editable region. A contenteditable="false" element is not one itself,
// but closest() walks past it, so an island nested inside an editor still
// counts as part of that editor.
const EDITABLE_REGION = '[contenteditable]:not([contenteditable="false"])';

/**
 * @typedef {{ kind: 'field', element: HTMLInputElement | HTMLTextAreaElement, start: number, end: number, text: string }} FieldTarget
 * @typedef {{ kind: 'rich', element: HTMLElement, range: Range, text: string }} RichTarget
 */

/**
 * The element that really has focus: document.activeElement stops at a
 * shadow host, so walk down through every open root.
 * @param {Element | null} element
 * @returns {Element | null}
 */
function deepestActiveElement(element) {
  let current = element;
  while (current && current.shadowRoot && current.shadowRoot.activeElement) {
    current = current.shadowRoot.activeElement;
  }
  return current;
}

/**
 * A custom element with no reachable shadow root may hide a field behind a
 * closed root. It cannot be read or written, so it is never a target.
 * @param {Element} element
 * @returns {boolean}
 */
function isOpaqueCustomElement(element) {
  return String(element.localName || '').includes('-') && !element.shadowRoot;
}

/**
 * @param {Element} element
 * @returns {boolean}
 */
function isAcceptedField(element) {
  const tag = String(element.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = String(element.getAttribute('type') || 'text').toLowerCase();
  return ACCEPTED_INPUT_TYPES.includes(type);
}

/**
 * @param {Element} focused
 * @returns {FieldTarget | null}
 */
function captureField(focused) {
  if (!isAcceptedField(focused) || focused.readOnly || focused.disabled) return null;
  const value = String(focused.value ?? '');
  let start = focused.selectionStart;
  let end = focused.selectionEnd;
  if (typeof start !== 'number' || typeof end !== 'number' || start >= end) return null;
  // Whitespace the user dragged over at either end is not part of what
  // Replace rewrites, so the offsets shrink to the trimmed text.
  while (start < end && /\s/.test(value[start])) start += 1;
  while (end > start && /\s/.test(value[end - 1])) end -= 1;
  if (start >= end) return null;
  return { kind: 'field', element: focused, start, end, text: value.slice(start, end) };
}

/**
 * @param {Selection | null} selection
 * @returns {RichTarget | null}
 */
function captureRich(selection) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const node = selection.anchorNode;
  if (!node) return null;
  const element = node.nodeType === 1 ? node : node.parentElement;
  const editor = element && element.closest(EDITABLE_REGION);
  if (!editor) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  return { kind: 'rich', element: editor, range: selection.getRangeAt(0).cloneRange(), text };
}

/**
 * The place a generated text could be written back to, or null.
 * @param {Selection | null} selection
 * @param {Element | null} activeElement
 * @returns {FieldTarget | RichTarget | null}
 */
export function captureEditableTarget(selection, activeElement) {
  const focused = deepestActiveElement(activeElement);
  if (focused) {
    if (isAcceptedField(focused)) return captureField(focused);
    if (isOpaqueCustomElement(focused)) return null;
    const tag = String(focused.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT') return null;
  }
  return captureRich(selection);
}

/**
 * Where to anchor a toolbar or box for the target: the field itself (a
 * selection inside a text control has no range rectangle), or the range.
 * @param {FieldTarget | RichTarget} target
 * @returns {DOMRect}
 */
export function targetRect(target) {
  return target.kind === 'field'
    ? target.element.getBoundingClientRect()
    : target.range.getBoundingClientRect();
}
