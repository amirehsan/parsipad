/**
 * Write generated text into the place it came from, and take it back.
 *
 * Targets come from content/editable-target.js (a field with offsets, or a
 * rich editor with a range). The insertion goes through the browser's own
 * editing command wherever it exists, so the site sees the same beforeinput
 * and input events typing would send (a React-controlled box updates) and
 * the browser's undo stack stays whole. Where the command is missing or
 * declines, the value is set through the element's native setter and the
 * events are dispatched by hand.
 *
 * Nothing here guesses: a replacement whose original text cannot be found
 * exactly once is refused, and so is an undo whose inserted text has moved.
 */

/**
 * @typedef {{ kind: 'field', element: HTMLInputElement | HTMLTextAreaElement, start: number, end: number, text: string }} FieldTarget
 * @typedef {{ kind: 'rich', element: HTMLElement, range: Range, text: string }} RichTarget
 * @typedef {{ ok: true, undo: () => boolean } | { ok: false }} ReplaceResult
 */

const FAILED = Object.freeze({ ok: false });

/**
 * Where `text` sits in `value`: at the remembered offsets, or at its single
 * occurrence if the field changed under the user, or nowhere.
 * @param {string} value
 * @param {number} start
 * @param {number} end
 * @param {string} text
 * @returns {{ start: number, end: number } | null}
 */
function locate(value, start, end, text) {
  if (value.slice(start, end) === text) return { start, end };
  const first = value.indexOf(text);
  if (first === -1 || value.indexOf(text, first + 1) !== -1) return null;
  return { start: first, end: first + text.length };
}

/**
 * The editing command, when the document has one. Returns false when it is
 * missing, throws, or reports failure.
 * @param {Document} doc
 * @param {string} text
 * @returns {boolean}
 */
function insertText(doc, text) {
  if (typeof doc.execCommand !== 'function') return false;
  try {
    return Boolean(doc.execCommand('insertText', false, text));
  } catch {
    return false;
  }
}

/**
 * @param {EventTarget} element
 * @param {string} text
 * @param {Window} win
 */
function dispatchInput(element, text, win) {
  const EventCtor = typeof win.InputEvent === 'function' ? win.InputEvent : win.Event;
  element.dispatchEvent(new EventCtor('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
}

/**
 * Set a field's value the way a framework cannot intercept: through the
 * prototype's own setter rather than an instance override.
 * @param {HTMLInputElement | HTMLTextAreaElement} element
 * @param {string} value
 */
function setNativeValue(element, value) {
  const proto = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * Replace `[start, end)` of a field with `text`. Returns the new offsets of
 * the inserted text, or null when the field refused.
 * @param {HTMLInputElement | HTMLTextAreaElement} element
 * @param {number} start
 * @param {number} end
 * @param {string} text
 * @param {Document} doc
 * @returns {{ start: number, end: number } | null}
 */
function writeField(element, start, end, text, doc) {
  const win = doc.defaultView || globalThis;
  const before = element.value;
  element.focus({ preventScroll: true });
  element.setSelectionRange(start, end);

  const inserted = { start, end: start + text.length };
  if (insertText(doc, text) && element.value.slice(start, inserted.end) === text) {
    element.setSelectionRange(inserted.end, inserted.end);
    return inserted;
  }

  setNativeValue(element, before.slice(0, start) + text + before.slice(end));
  element.setSelectionRange(inserted.end, inserted.end);
  dispatchInput(element, text, win);
  element.dispatchEvent(new win.Event('change', { bubbles: true }));
  return inserted;
}

/**
 * @param {FieldTarget} target
 * @param {string} text
 * @param {Document} doc
 * @returns {ReplaceResult}
 */
function replaceInField(target, text, doc) {
  const { element } = target;
  if (!element || !element.isConnected || element.readOnly || element.disabled) return FAILED;
  const at = locate(String(element.value ?? ''), target.start, target.end, target.text);
  if (!at) return FAILED;

  const inserted = writeField(element, at.start, at.end, text, doc);
  if (!inserted) return FAILED;

  return {
    ok: true,
    undo: () => {
      if (!element.isConnected || element.readOnly || element.disabled) return false;
      if (String(element.value ?? '').slice(inserted.start, inserted.end) !== text) return false;
      const restored = writeField(element, inserted.start, inserted.end, target.text, doc);
      if (!restored) return false;
      element.setSelectionRange(restored.start, restored.end);
      return true;
    }
  };
}

/**
 * Put `text` where `range` is, inside `editor`. Returns a range around the
 * inserted text, or null.
 * @param {HTMLElement} editor
 * @param {Range} range
 * @param {string} text
 * @param {Document} doc
 * @returns {Range | null}
 */
function writeRich(editor, range, text, doc) {
  const win = doc.defaultView || globalThis;
  const selection = win.getSelection ? win.getSelection() : null;
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  editor.focus({ preventScroll: true });

  if (selection && insertText(doc, text)) {
    const after = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    if (after && (editor.textContent || '').includes(text)) {
      // The command leaves the caret after the insertion; back it up over
      // the inserted text to describe where it sits.
      const around = after.cloneRange();
      if (around.startContainer.nodeType === 3 && around.startOffset >= text.length) {
        around.setStart(around.startContainer, around.startOffset - text.length);
        return around;
      }
    }
    // The command ran but the result cannot be located; fall through only
    // if nothing was inserted.
    if ((editor.textContent || '').includes(text)) return null;
  }

  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  const around = doc.createRange();
  around.selectNodeContents(node);
  if (selection) {
    selection.removeAllRanges();
    const caret = around.cloneRange();
    caret.collapse(false);
    selection.addRange(caret);
  }
  dispatchInput(editor, text, win);
  return around;
}

/**
 * @param {RichTarget} target
 * @param {string} text
 * @param {Document} doc
 * @returns {ReplaceResult}
 */
function replaceInRich(target, text, doc) {
  const { element, range } = target;
  if (!element || !element.isConnected || !range) return FAILED;
  const { startContainer, endContainer } = range;
  if (!startContainer.isConnected || !endContainer.isConnected) return FAILED;
  if (!element.contains(startContainer) || !element.contains(endContainer)) return FAILED;

  const inserted = writeRich(element, range, text, doc);
  if (!inserted) return FAILED;

  return {
    ok: true,
    undo: () => {
      if (!element.isConnected || !inserted.startContainer.isConnected || !inserted.endContainer.isConnected) return false;
      if (inserted.toString() !== text) return false;
      return Boolean(writeRich(element, inserted, target.text, doc));
    }
  };
}

/**
 * Write `text` over the target's selected text.
 * @param {FieldTarget | RichTarget} target
 * @param {string} text
 * @param {Document} [doc]
 * @returns {ReplaceResult}
 */
export function applyReplacement(target, text, doc = document) {
  if (!target || typeof text !== 'string') return FAILED;
  if (target.kind === 'field') return replaceInField(target, text, doc);
  if (target.kind === 'rich') return replaceInRich(target, text, doc);
  return FAILED;
}

/**
 * Replace a field's whole value through the same editing path, so the
 * browser's own undo can bring the old value back.
 * @param {HTMLInputElement | HTMLTextAreaElement} element
 * @param {string} text
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function replaceWholeValue(element, text, doc = document) {
  if (!element || !element.isConnected || element.readOnly || element.disabled) return false;
  const length = String(element.value ?? '').length;
  return Boolean(writeField(element, 0, length, text, doc));
}
