/**
 * Polish rewrites a text in three registers. Below three words there is no
 * register to shift: "thanks alot" came back as three near-identical cards,
 * and the user paid for the round trip. Dictionary and Translate cover a
 * word or two better. One rule, in one place: the service worker enforces
 * it for every caller, and the selection toolbar reads it to dim its button
 * before anything is sent.
 */

export const POLISH_MIN_WORDS = 3;

/**
 * Whitespace-separated words, with blank edges and runs ignored.
 * @param {unknown} text
 * @returns {number}
 */
export function countWords(text) {
  const trimmed = String(text ?? '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function isTooShortToPolish(text) {
  return countWords(text) < POLISH_MIN_WORDS;
}
