/**
 * Type size for a line of display text: the word on a practice card and on
 * the New Tab.
 *
 * A favourite can be a single word or a whole sentence, and display text has
 * no box to overflow into. One display size cannot serve both, so the length
 * picks a step and each page's stylesheet owns what each step measures.
 */

/** Largest to smallest. A page that uses these defines a --display-* for each. */
export const TEXT_SIZE_STEPS = Object.freeze(['xl', 'lg', 'md', 'sm']);

/** Upper bound, in characters, for each step above the smallest. */
const THRESHOLDS = Object.freeze([
  { max: 24, step: 'xl' },
  { max: 60, step: 'lg' },
  { max: 140, step: 'md' }
]);

/**
 * The step a piece of text should be set at.
 *
 * Length is counted in code points, not UTF-16 units. Persian is inside the
 * BMP so it counts the same either way, but an emoji in a saved phrase counts
 * as two units and would drop the whole line a size for no reason.
 *
 * @param {string|number} text - The text, or its length.
 * @returns {'xl'|'lg'|'md'|'sm'}
 */
export function textSizeStep(text) {
  const length = typeof text === 'number'
    ? text
    : [...String(text ?? '')].length;

  if (!Number.isFinite(length) || length < 0) return 'xl';
  const match = THRESHOLDS.find(t => length <= t.max);
  return match ? match.step : 'sm';
}

/**
 * One step smaller, stopping at the smallest.
 *
 * Text shown under a larger line (a practice card shows the original above
 * its translation) is set a step below it, so the two read as a hierarchy
 * rather than competing.
 *
 * @param {string} step
 * @returns {'xl'|'lg'|'md'|'sm'}
 */
export function stepBelow(step) {
  const i = TEXT_SIZE_STEPS.indexOf(step);
  if (i === -1) return 'sm';
  return TEXT_SIZE_STEPS[Math.min(i + 1, TEXT_SIZE_STEPS.length - 1)];
}
