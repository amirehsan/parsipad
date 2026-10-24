/**
 * Roving tabindex for a row of controls (a toolbar, a radio group): the row
 * is one tab stop, and the arrow keys move between its items.
 *
 * No imports: the content script loads this file directly as a web
 * accessible resource.
 */

/**
 * Where focus goes from `current` after `key`, or null when the key is not
 * one the row handles (so Enter, Space and Tab keep their defaults).
 * Both arrow axes move, wrapping at the ends; Home and End jump to them.
 *
 * @param {number} current
 * @param {string} key - KeyboardEvent.key
 * @param {number} count - number of items in the row
 * @returns {number|null}
 */
export function rovingIndex(current, key, count) {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Make the item at `activeIndex` the row's only tab stop.
 *
 * @param {HTMLElement[]} items
 * @param {number} activeIndex
 */
export function applyRovingTabindex(items, activeIndex) {
  items.forEach((item, index) => {
    item.setAttribute('tabindex', index === activeIndex ? '0' : '-1');
  });
}
