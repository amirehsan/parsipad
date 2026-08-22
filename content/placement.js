/**
 * Decide where the floating box goes, given real measurements.
 *
 * Pure: no DOM reference of any kind, so the placement rules are
 * unit-testable without a document. All reasoning happens in viewport
 * space; the scroll offset is added only at the very end to produce page
 * coordinates.
 *
 * @param {Object} input
 * @param {{top: number, bottom: number, left: number}} input.selection - viewport coordinates
 * @param {{width: number, height: number}} input.box - the box's real measured size
 * @param {{width: number, height: number}} input.viewport
 * @param {{x: number, y: number}} input.scroll
 * @param {number} input.gap - space to keep between the selection and the box
 * @param {number} input.padding - minimum space to keep from the viewport edges
 * @returns {{top: number, left: number, placement: 'below'|'above'}}
 */
export function computeBoxPosition({ selection, box, viewport, scroll, gap, padding }) {
  const spaceBelow = viewport.height - selection.bottom;
  const spaceAbove = selection.top;
  const fitsBelow = spaceBelow >= box.height + gap;

  let placement = 'below';
  let top;

  if (!fitsBelow && spaceAbove > spaceBelow) {
    placement = 'above';
    top = Math.max(selection.top - box.height - gap, padding);
  } else {
    top = selection.bottom + gap;
  }

  const maxLeft = viewport.width - box.width - padding;
  const left = maxLeft >= padding
    ? Math.min(Math.max(selection.left, padding), maxLeft)
    : padding;

  return {
    top: top + scroll.y,
    left: left + scroll.x,
    placement
  };
}
