/**
 * Type size for the word on the New Tab page.
 *
 * A favourite can be a single word or a whole sentence, and the hero has no
 * box to overflow into: it sits on the page background with the dock below
 * it. One display size cannot serve both, so the length picks a step and the
 * stylesheet owns what each step measures.
 */

/** Largest to smallest. The stylesheet defines a --display-* for each. */
export const HERO_STEPS = Object.freeze(['xl', 'lg', 'md', 'sm']);

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
export function heroSizeStep(text) {
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
 * The flipped side of the card shows the original text above its translation,
 * so it is set a step below the front to keep the two lines in a hierarchy
 * rather than competing.
 *
 * @param {string} step
 * @returns {'xl'|'lg'|'md'|'sm'}
 */
export function stepBelow(step) {
  const i = HERO_STEPS.indexOf(step);
  if (i === -1) return 'sm';
  return HERO_STEPS[Math.min(i + 1, HERO_STEPS.length - 1)];
}
