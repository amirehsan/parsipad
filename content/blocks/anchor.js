/**
 * Decide where the hover icon goes, given real measurements.
 *
 * Pure: no DOM reference of any kind, so the placement rules are unit-testable
 * without a document. Mirrors the contract of content/placement.js, which does
 * the same job for the floating box.
 *
 * All reasoning is in viewport coordinates, because the icon host is
 * position: fixed and never needs the scroll offset.
 */

export const ICON_GUTTER = 6;
export const ICON_PADDING = 4;

/**
 * Clamp that degrades to `min` when the range is empty, rather than returning
 * a `max` that sits outside the viewport. Matters on narrow viewports where
 * the icon is wider than the space available.
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * @param {Object} input
 * @param {{top: number, left: number, right: number, bottom: number}} input.block - viewport coordinates
 * @param {{width: number, height: number}} input.icon
 * @param {{width: number, height: number}} input.viewport
 * @param {'ltr'|'rtl'} [input.dir]
 * @param {number} [input.gutter] - space between the block edge and the icon
 * @param {number} [input.padding] - minimum space to keep from the viewport edges
 * @returns {{top: number, left: number, placement: 'outside'|'inset'}}
 */
export function computeIconPosition({
  block,
  icon,
  viewport,
  dir = 'ltr',
  gutter = ICON_GUTTER,
  padding = ICON_PADDING
}) {
  // Centre on the block's top edge rather than sitting inside it. Block-level
  // elements almost always have vertical margin even when they have no
  // horizontal gutter, so this reliably lands in whitespace instead of on top
  // of the first line of text.
  const top = clamp(block.top - icon.height / 2, padding, viewport.height - icon.height - padding);

  let left;
  let placement;

  if (dir === 'rtl') {
    if (viewport.width - block.right >= icon.width + gutter) {
      left = block.right + gutter;
      placement = 'outside';
    } else {
      left = block.right - icon.width;
      placement = 'inset';
    }
  } else if (block.left >= icon.width + gutter) {
    left = block.left - icon.width - gutter;
    placement = 'outside';
  } else {
    left = block.left;
    placement = 'inset';
  }

  return {
    top,
    left: clamp(left, padding, viewport.width - icon.width - padding),
    placement
  };
}
