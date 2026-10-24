/**
 * Decide where the floating box goes, given real measurements.
 *
 * Pure: no DOM reference of any kind, so the placement rules are
 * unit-testable without a document. All reasoning happens in viewport
 * space; the scroll offset is added only at the very end to produce page
 * coordinates.
 *
 * Only the part of the selection inside the viewport anchors the box. A
 * selection that runs past an edge, or was scrolled out of view, would
 * otherwise carry the box off-screen with it.
 *
 * @param {Object} input
 * @param {{top: number, bottom: number, left: number, right?: number}} input.selection - viewport coordinates
 * @param {{width: number, height: number}} input.box - the box's real measured size
 * @param {{width: number, height: number}} input.viewport
 * @param {{x: number, y: number}} input.scroll
 * @param {number} input.gap - space to keep between the selection and the box
 * @param {number} input.padding - minimum space to keep from the viewport edges
 * @param {'below'|'above'} [input.prefer] - 'below' (the reading box) stays
 *   below unless only the space above is larger and below does not fit;
 *   'above' (the selection toolbar) goes above whenever it fits there, below
 *   when only that fits, and otherwise stays above at the top padding, so a
 *   selection filling the viewport cannot push it off the bottom
 * @param {'start'|'center'} [input.align] - 'start' lines the box up with the
 *   selection's left edge; 'center' centres it on the selection's middle
 *   (the left edge when `right` is absent). Both are clamped to the viewport.
 * @returns {{top: number, left: number, placement: 'below'|'above'}}
 */
export function computeBoxPosition({
  selection, box, viewport, scroll, gap, padding, prefer = 'below', align = 'start'
}) {
  const visibleTop = Math.min(Math.max(selection.top, 0), viewport.height);
  const visibleBottom = Math.min(Math.max(selection.bottom, 0), viewport.height);
  const spaceBelow = viewport.height - visibleBottom;
  const spaceAbove = visibleTop;
  const fitsBelow = spaceBelow >= box.height + gap;
  const fitsAbove = spaceAbove >= box.height + gap;

  const placement = prefer === 'above'
    ? (fitsAbove || !fitsBelow ? 'above' : 'below')
    : (!fitsBelow && spaceAbove > spaceBelow ? 'above' : 'below');

  const top = placement === 'above'
    ? Math.max(visibleTop - box.height - gap, padding)
    : visibleBottom + gap;

  const wanted = align === 'center'
    ? (selection.left + (selection.right ?? selection.left)) / 2 - box.width / 2
    : selection.left;
  const maxLeft = viewport.width - box.width - padding;
  const left = maxLeft >= padding
    ? Math.min(Math.max(wanted, padding), maxLeft)
    : padding;

  return {
    top: top + scroll.y,
    left: left + scroll.x,
    placement
  };
}
