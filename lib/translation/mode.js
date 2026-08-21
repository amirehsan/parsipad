/**
 * Client-side mode router. Decides which translation job a piece of text is
 * (word, phrase, sentence, text). Batch is never inferred; page translation
 * passes it explicitly.
 */

export const MODES = Object.freeze({
  WORD: 'word',
  PHRASE: 'phrase',
  SENTENCE: 'sentence',
  TEXT: 'text',
  BATCH: 'batch'
});

const WORD_MAX_CHARS = 40;
const PHRASE_MAX_TOKENS = 6;
const PHRASE_MAX_CHARS = 60;
const SENTENCE_MAX_CHARS = 280;

// Leading and trailing punctuation that does not belong to the word itself.
const LEADING_PUNCT = /^[\s"'""''«»(\[{]+/;
const TRAILING_PUNCT = /[\s"'""''«»)\]}.!?؟…,;:،؛]+$/;
const ENDS_WITH_TERMINAL = /[.!?؟…]["'"'»)\]]*$/;
const TERMINATOR_RUN = /(\S*?)([.!?؟]+)(?=\s|$)/g;

/**
 * @param {string} text
 * @returns {string}
 */
export function stripEdgePunctuation(text) {
  return String(text || '').replace(LEADING_PUNCT, '').replace(TRAILING_PUNCT, '');
}

/**
 * Where each sentence ends: the offset just past every terminator run.
 *
 * A run of . ! ? or Arabic ? followed by whitespace or end of string,
 * except that a single dot after a one- or two-letter Latin token
 * (e.g., U.S., Dr) is an abbreviation rather than a terminator.
 *
 * Counting terminators and locating them are the same rule, so they read
 * it from here rather than each carrying a copy that could drift.
 *
 * @param {string} text
 * @returns {number[]} offsets, ascending
 */
export function findTerminatorEnds(text) {
  const source = String(text || '');
  const re = new RegExp(TERMINATOR_RUN.source, 'g');
  const ends = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    const before = match[1];
    const run = match[2];
    if (run === '.') {
      const lastLetters = before.split(/[^A-Za-z]+/).pop() || '';
      if (lastLetters.length >= 1 && lastLetters.length <= 2) continue;
    }
    ends.push(match.index + match[0].length);
  }
  return ends;
}

/**
 * @param {string} text
 * @returns {number}
 */
export function countSentenceTerminators(text) {
  return findTerminatorEnds(text).length;
}

/**
 * @param {string} text
 * @returns {'word' | 'phrase' | 'sentence' | 'text'}
 */
export function classifyMode(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return MODES.TEXT;
  if (/\n/.test(trimmed)) return MODES.TEXT;

  const core = stripEdgePunctuation(trimmed);
  const tokens = core ? core.split(/\s+/) : [];
  const terminators = countSentenceTerminators(trimmed);
  const endsWithTerminal = ENDS_WITH_TERMINAL.test(trimmed);

  if (tokens.length === 1 && core.length <= WORD_MAX_CHARS && countSentenceTerminators(core) === 0) {
    return MODES.WORD;
  }
  if (tokens.length <= PHRASE_MAX_TOKENS && trimmed.length <= PHRASE_MAX_CHARS && !endsWithTerminal && terminators === 0) {
    return MODES.PHRASE;
  }
  if (terminators <= 1 && trimmed.length <= SENTENCE_MAX_CHARS) {
    return MODES.SENTENCE;
  }
  return MODES.TEXT;
}
