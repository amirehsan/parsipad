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
 * The browser's own undo: the exact inverse of an insertText it performed,
 * blocks, spacing and length limits included. Only called when nothing has
 * changed since that insert, so the top of the undo stack is ours.
 * @param {Document} doc
 * @returns {boolean}
 */
function browserUndo(doc) {
  if (typeof doc.execCommand !== 'function') return false;
  try {
    return Boolean(doc.execCommand('undo', false, null));
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

  if (insertText(doc, text)) {
    // The browser may have kept less than the whole text (maxlength). What
    // it kept is the replacement; a changed value is the command's work.
    const kept = element.value.length - (before.length - (end - start));
    if (kept > 0 && element.value.slice(start, start + kept) === text.slice(0, kept)) {
      const inserted = { start, end: start + kept, byCommand: true };
      element.setSelectionRange(inserted.end, inserted.end);
      return inserted;
    }
  }

  // The field's own limit still applies when the value is set by hand.
  const room = element.maxLength >= 0 ? element.maxLength - (before.length - (end - start)) : Infinity;
  const fitted = room < text.length ? text.slice(0, Math.max(0, room)) : text;
  const inserted = { start, end: start + fitted.length };
  setNativeValue(element, before.slice(0, start) + fitted + before.slice(end));
  element.setSelectionRange(inserted.end, inserted.end);
  dispatchInput(element, fitted, win);
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

  // The value right after the insert: while it still reads this, the top of
  // the browser's undo stack is our insert and undoing it is exact.
  const snapshot = inserted.byCommand ? element.value : null;

  return {
    ok: true,
    undo: () => {
      if (!element.isConnected || element.readOnly || element.disabled) return false;
      if (snapshot !== null && element.value === snapshot) {
        element.focus({ preventScroll: true });
        if (browserUndo(doc) && element.value !== snapshot) {
          element.setSelectionRange(target.start, target.end);
          return true;
        }
      }
      if (String(element.value ?? '').slice(inserted.start, inserted.end) !== text.slice(0, inserted.end - inserted.start)) return false;
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

  // Where the insertion starts, remembered before the command: the browser
  // turns a newline into a block and runs of spaces into nbsp, so the text
  // never reads back verbatim and cannot be searched for afterwards.
  const marker = range.cloneRange();
  marker.collapse(true);

  if (selection && insertText(doc, text)) {
    // The editor owns the DOM from here. A framework editor (Draft.js,
    // Lexical, ProseMirror) takes the command in beforeinput and renders on
    // its next turn; inserting a node on top of that leaves two copies once
    // it renders, so nothing is written by hand after a successful command.
    // The inserted text runs from the marker to the caret the command left.
    const caret = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const around = caret || marker;
    around.byCommand = true;
    return around;
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

  // The editor right after the insert. The browser turned the text into
  // blocks and nbsp, so it cannot be located again for a re-insert; the
  // only exact way back is the browser's own undo, and only while nothing
  // else has changed. A framework editor that renders later will differ by
  // then, and its own Ctrl+Z is the route; this undo declines.
  const snapshot = inserted.byCommand ? element.innerHTML : null;

  return {
    ok: true,
    undo: () => {
      if (!element.isConnected) return false;
      if (snapshot !== null) {
        if (element.innerHTML !== snapshot) return false;
        element.focus({ preventScroll: true });
        return browserUndo(doc) && element.innerHTML !== snapshot;
      }
      if (!inserted.startContainer.isConnected || !inserted.endContainer.isConnected) return false;
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
