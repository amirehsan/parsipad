/**
 * Flashcard practice: the session size and the deck a session deals.
 *
 * The deck is drawn from favorites only. Grammar lessons are not a
 * front-and-back pair, and an entry with an empty side has nothing to ask or
 * nothing to reveal, so both are left out.
 *
 * @typedef {object} PracticeCard
 * @property {string|number} id - The favorite's id
 * @property {'translation'|'dictionary'|'polish'} kind
 * @property {string} front - What was saved from
 * @property {string} back - What was saved
 * @property {'en'|'fa'} frontLang
 * @property {'en'|'fa'} backLang
 */
import { toFavoriteEntries } from './library-model.js';
import { containsPersian } from './language-detect.js';

/** How many cards a session deals. */
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

function langOf(text) {
  return containsPersian(text) ? 'fa' : 'en';
}

/**
 * Shuffle a copy of the list (Fisher-Yates), drawing from rng.
 * @template T
 * @param {T[]} list
 * @param {() => number} rng - Returns a number in [0, 1)
 * @returns {T[]}
 */
function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deal a practice session from stored favorites.
 * @param {Array} favorites - As stored, legacy shapes included
 * @param {{ size?: number, rng?: () => number }} [options] - Size is clamped
 *   with clampSessionSize; rng drives the shuffle
 * @returns {PracticeCard[]}
 */
export function buildDeck(favorites, { size = PRACTICE_SIZE.default, rng = Math.random } = {}) {
  const cards = toFavoriteEntries(favorites)
    .filter(entry => entry.kind !== 'grammar' && entry.original.trim() && entry.result.trim())
    .map(entry => ({
      id: entry.id,
      kind: entry.kind,
      front: entry.original,
      back: entry.result,
      frontLang: langOf(entry.original),
      backLang: langOf(entry.result)
    }));
  return shuffle(cards, rng).slice(0, clampSessionSize(size));
}
