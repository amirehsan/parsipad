/**
 * Pure content-quality predicates for block detection.
 *
 * Nothing here touches the DOM. Callers extract facts with describe.js and
 * pass them in, which keeps every threshold decision unit-testable without a
 * document, the same split used by content/placement.js and
 * lib/translation/mode.js.
 *
 * The gate is deliberately permissive. A false positive is an icon the user
 * ignores; a false negative is a feature that looks broken.
 */

export const GATE = Object.freeze({
  MIN_CHARS: 25,
  MIN_WORDS: 4,
  MAX_LINK_DENSITY: 0.6,
  OWNERSHIP_MIN_CHARS: 30
});

// Adapted from Mozilla Readability's unlikelyCandidates. Matched against the
// element's own class and id, on word-ish boundaries so "download" does not
// match "ad" and "navigation" does not match twice.
const UNLIKELY = /(^|[\s_-])(ads?|advert|banner|breadcrumbs?|combx|cookie|disqus|extra|foot(er)?|header|legends?|menu|meta|modal|nav(igation|bar)?|pag(er|ination)|popup|promo|related|scroll|shar(e|ing)|shopping|sidebar|skyscraper|social|sponsor|toolbar|widget)([\s_-]|$)/i;

// Readability's okMaybeItsACandidate: a content word outweighs an unlikely
// one, so class="main-nav-content" is not thrown away for containing "nav".
const MAYBE_OK = /(^|[\s_-])(article|body|column|content|entry|main|post|story|text|tweet)([\s_-]|$)/i;

/**
 * True if the text contains at least one letter in any script.
 *
 * This is what removes the metadata that would otherwise be everywhere: on an
 * X post, the reply count, repost count, view count and relative timestamp are
 * each separately hoverable, and none of them contains a letter.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsLetters(text) {
  return /\p{L}/u.test(String(text || ''));
}

/**
 * Share of the text that sits inside links. The single highest-value signal
 * for telling navigation from content: a nav list item is close to 1, a
 * paragraph with two citations is around 0.05.
 *
 * Empty text returns 1 so an empty candidate can never clear the threshold.
 *
 * @param {number} textLength
 * @param {number} linkTextLength
 * @returns {number}
 */
export function linkDensity(textLength, linkTextLength) {
  if (!textLength) return 1;
  return linkTextLength / textLength;
}

/**
 * @param {string} classId - the element's class and id, joined
 * @returns {boolean}
 */
export function isUnlikelyClassId(classId) {
  const value = String(classId || '');
  if (!value) return false;
  if (MAYBE_OK.test(value)) return false;
  return UNLIKELY.test(value);
}

/**
 * @param {{textLength?: number, linkTextLength?: number, wordCount?: number,
 *          hasLetters?: boolean, classId?: string}} facts
 * @returns {boolean}
 */
export function passesTextGate(facts) {
  const {
    textLength = 0,
    linkTextLength = 0,
    wordCount = 0,
    hasLetters = false,
    classId = ''
  } = facts || {};

  if (!hasLetters) return false;
  if (textLength < GATE.MIN_CHARS) return false;
  if (wordCount < GATE.MIN_WORDS) return false;
  if (linkDensity(textLength, linkTextLength) >= GATE.MAX_LINK_DENSITY) return false;
  if (isUnlikelyClassId(classId)) return false;
  return true;
}
