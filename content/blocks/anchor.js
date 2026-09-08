/**
 * Decide where the hover icon goes, given real measurements.
 *
 * Pure: no DOM reference of any kind, so the placement rules are unit-testable
 * without a document. Mirrors the contract of content/placement.js, which does
 * the same job for the floating box.
 *
 * The icon straddles the block's top corner rather than sitting outside it
 * with a gap. That is not an aesthetic choice: a gap between the block and
 * the icon belongs to neither element, and every element the pointer crosses
 * while travelling through it restarts the hide timer. Pausing partway is
 * worse than crossing slowly, since a stationary pointer fires no further
 * events at all, so the timer simply expires underneath it. Straddling the
 * corner removes the gap entirely, so contiguity with the block, not
 * distance from it, is what keeps the icon reachable.
 *
 * All reasoning is in viewport coordinates, because the icon host is
 * position: fixed and never needs the scroll offset.
 */

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
 * @param {number} [input.padding] - minimum space to keep from the viewport edges
 * @returns {{top: number, left: number, placement: 'corner'}}
 */
export function computeIconPosition({
  block,
  icon,
  viewport,
  dir = 'ltr',
  padding = ICON_PADDING
}) {
  // Centre on the block's top edge rather than sitting inside it. Block-level
  // elements almost always have vertical margin even when they have no
  // horizontal gutter, so this reliably lands in whitespace instead of on top
  // of the first line of text.
  const top = clamp(block.top - icon.height / 2, padding, viewport.height - icon.height - padding);

  // Straddle the inline-end corner: the right edge in LTR, mirrored to the
  // left edge in RTL. Centring the icon on the corner itself, rather than
  // offsetting it outward, is what makes the block and the icon contiguous.
  const left = dir === 'rtl' ? block.left - icon.width / 2 : block.right - icon.width / 2;

  return {
    top,
    left: clamp(left, padding, viewport.width - icon.width - padding),
    placement: 'corner'
  };
}
