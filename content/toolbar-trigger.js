// Decides when the selection toolbar should look at the selection again.
//
// Mouse, touch and keyboard all end a selection differently. A mouse drag
// ends in pointerup. A touch long-press ends in pointercancel (the browser
// takes the gesture over), and dragging the selection handles afterwards
// sends only selectionchange. Keyboard selection sends only selectionchange.
// One trigger covers all three: during a pointer gesture it waits for the
// pointer to lift; otherwise it waits for selectionchange to settle.
//
// No imports, so the content script can load it unbundled.

/**
 * @param {{ evaluate: () => void, hide: () => void, delay?: number }} options
 *   evaluate looks at the current selection and shows, moves or hides the
 *   toolbar; hide removes the toolbar at once.
 * @returns {{ onPointerDown(): void, onPointerUp(): void, onSelectionChange(): void }}
 */
export function createToolbarTrigger({ evaluate, hide, delay = 250 }) {
  let timer = null;
  let pointerActive = false;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      evaluate();
    }, delay);
  };

  return {
    // A new gesture starts: hide the toolbar and ignore selectionchange
    // until the pointer lifts, so a drag does not rebuild it on every move.
    onPointerDown() {
      pointerActive = true;
      cancel();
      hide();
    },
    // pointerup, or pointercancel after a touch long-press.
    onPointerUp() {
      pointerActive = false;
      schedule();
    },
    // Keyboard selection and touch selection handles.
    onSelectionChange() {
      if (!pointerActive) schedule();
    }
  };
}

/**
 * What the toolbar on screen was built for: the trimmed text and where the
 * selection sits in the viewport.
 * @param {string} text
 * @param {{ top: number, left: number, width: number, height: number }} rect
 */
export function selectionAnchor(text, rect) {
  return { text, top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * True when two anchors describe the same text in the same place, so the
 * toolbar already on screen can stay as it is instead of being rebuilt.
 * @param {ReturnType<typeof selectionAnchor> | null} a
 * @param {ReturnType<typeof selectionAnchor> | null} b
 * @returns {boolean}
 */
export function isSameAnchor(a, b) {
  if (!a || !b) return false;
  return a.text === b.text && a.top === b.top && a.left === b.left &&
    a.width === b.width && a.height === b.height;
}
