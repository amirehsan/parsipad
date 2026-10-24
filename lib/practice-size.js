/**
 * How many cards a practice session deals. Kept apart from lib/practice.js,
 * with no imports, so lib/storage.js can clamp the stored size without
 * pulling in the deck code and everything it reads.
 */

export const PRACTICE_SIZE = Object.freeze({ min: 5, max: 30, default: 10 });

/**
 * A session size the page can deal: a whole number within PRACTICE_SIZE.
 * Numeric strings are read as numbers, since a range input reports a string;
 * anything else that is not a finite number gives the default.
 * @param {*} n
 * @returns {number}
 */
export function clampSessionSize(n) {
  const value = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
  if (typeof value !== 'number' || !Number.isFinite(value)) return PRACTICE_SIZE.default;
  return Math.min(PRACTICE_SIZE.max, Math.max(PRACTICE_SIZE.min, Math.round(value)));
}
