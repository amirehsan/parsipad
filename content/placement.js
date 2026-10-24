/**
 * Decide where the floating box goes, given real measurements.
 *
 * Pure: no DOM reference of any kind, so the placement rules are
 * unit-testable without a document. All reasoning happens in viewport
 * space; the scroll offset is added only at the very end to produce page
 * coordinates.
 *
 * Whichever side it lands on, the box finishes inside the viewport, within
 * the padding: a selection longer than the viewport, or scrolled out of
 * view, would otherwise carry it off-screen, and re-placing it would only
 * repeat that. A box taller than the viewport keeps its top edge visible.
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
 *   when only that fits, and otherwise stays above
 * @param {'start'|'center'} [input.align] - 'start' lines the box up with the
 *   selection's left edge; 'center' centres it on the selection's middle
 *   (the left edge when `right` is absent). Both are clamped to the viewport.
 * @returns {{top: number, left: number, placement: 'below'|'above'}}
 */
export function computeBoxPosition({
  selection, box, viewport, scroll, gap, padding, prefer = 'below', align = 'start'
}) {
  const spaceBelow = viewport.height - selection.bottom;
  const spaceAbove = selection.top;
  const fitsBelow = spaceBelow >= box.height + gap;
  const fitsAbove = spaceAbove >= box.height + gap;

  const placement = prefer === 'above'
    ? (fitsAbove || !fitsBelow ? 'above' : 'below')
    : (!fitsBelow && spaceAbove > spaceBelow ? 'above' : 'below');

  const wantedTop = placement === 'above'
    ? selection.top - box.height - gap
    : selection.bottom + gap;
  const maxTop = viewport.height - box.height - padding;
  const top = Math.max(Math.min(wantedTop, maxTop), padding);

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
