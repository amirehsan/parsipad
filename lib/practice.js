/**
 * Flashcard practice: the deck a session deals. The session size rules live in
 * lib/practice-size.js and are re-exported here.
 *
 * The deck is drawn from favorites only. Grammar lessons are not a
 * front-and-back pair, and an entry with an empty side has nothing to ask or
 * nothing to reveal, so both are left out.
 *
 * A card shows what was saved (the translation, the polished text) and
 * flipping it reveals the original it was saved from.
 *
 * @typedef {object} PracticeCard
 * @property {string|number} id - The favorite's id
 * @property {'translation'|'dictionary'|'polish'} kind
 * @property {string} front - What was saved
 * @property {string} back - The original it was saved from
 * @property {'en'|'fa'} frontLang
 * @property {'en'|'fa'} backLang
 */
import { toFavoriteEntries } from './library-model.js';
import { getTextDirection } from './language-detect.js';
import { PRACTICE_SIZE, clampSessionSize } from './practice-size.js';

export { PRACTICE_SIZE, clampSessionSize };

/** The language most of the text is in, read the way the Library cards read it. */
function langOf(text) {
  return getTextDirection(text) === 'rtl' ? 'fa' : 'en';
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
      front: entry.result,
      back: entry.original,
      frontLang: langOf(entry.result),
      backLang: langOf(entry.original)
    }));
  return shuffle(cards, rng).slice(0, clampSessionSize(size));
}
