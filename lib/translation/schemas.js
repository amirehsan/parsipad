import { TranslationError, ERROR_CODES } from './errors.js';

export const LIMITS = Object.freeze({ senses: 5, synonyms: 5, antonyms: 3, alternatives: 3, grammar: 4 });
export const REGISTERS = Object.freeze(['formal', 'neutral', 'informal', 'slang', 'technical']);
export const ALTERNATIVE_LABELS = Object.freeze(['more formal', 'colloquial', 'literal', 'other sense']);
export const SOURCES = Object.freeze(['en', 'fa', 'fa-latn', 'other']);
export const IMAGE_DIRECTIONS = Object.freeze(['en-fa', 'fa-en', 'unknown']);

const str = (description) => (description ? { type: 'string', description } : { type: 'string' });

const EXAMPLE_SCHEMA = {
  type: 'object',
  properties: {
    src: str('Short example in the headword language'),
    tgt: str('Its translation')
  },
  required: ['src', 'tgt']
};

const SENSE_SCHEMA = {
  type: 'object',
  properties: {
    pos: str('Part of speech'),
    meaning: str('Meaning in the target language'),
    example: EXAMPLE_SCHEMA
  },
  required: ['pos', 'meaning', 'example']
};

export const WORD_SCHEMA = {
  type: 'object',
  properties: {
    translation: str('Best rendering of the selection for this context'),
    detectedSource: { type: 'string', enum: [...SOURCES], description: 'Language the selection is actually written in' },
    normalized: str('Persian-script form when the source is Finglish, otherwise empty'),
    pronunciation: str('IPA between slashes for English headwords, otherwise empty'),
    pos: str('Primary part of speech, empty for phrases'),
    register: { type: 'string', enum: [...REGISTERS] },
    inContext: str('One sentence on why this sense fits the surrounding text, empty when no context was given'),
    senses: { type: 'array', description: 'Up to five distinct senses ordered by frequency', items: SENSE_SCHEMA },
    synonyms: { type: 'array', description: 'Up to five, same language as the headword', items: { type: 'string' } },
    antonyms: { type: 'array', description: 'Up to three, same language as the headword', items: { type: 'string' } },
    correction: str('Corrected source when it contained a real error, otherwise empty')
  },
  required: ['translation', 'detectedSource', 'normalized', 'pronunciation', 'pos', 'register', 'inContext', 'senses', 'synonyms', 'antonyms', 'correction']
};

export const SENTENCE_SCHEMA = {
  type: 'object',
  properties: {
    translation: str('Most natural rendering of the sentence'),
    detectedSource: { type: 'string', enum: [...SOURCES] },
    normalized: str('Persian-script form when the source is Finglish, otherwise empty'),
    register: { type: 'string', enum: [...REGISTERS] },
    alternatives: {
      type: 'array',
      description: 'Up to three alternatives in the target language',
      items: {
        type: 'object',
        properties: {
          text: str(),
          label: { type: 'string', enum: [...ALTERNATIVE_LABELS] }
        },
        required: ['text', 'label']
      }
    },
    note: str('One sentence about an idiom, cultural reference or ambiguity, otherwise empty'),
    correction: str('Corrected source when it contained a real error, otherwise empty')
  },
  required: ['translation', 'detectedSource', 'normalized', 'register', 'alternatives', 'note', 'correction']
};

export const GRAMMAR_POINTS_SCHEMA = {
  type: 'object',
  properties: {
    grammar: {
      type: 'array',
      description: 'Two to four grammar points about the English side',
      items: {
        type: 'object',
        properties: { point: str(), explanation: str() },
        required: ['point', 'explanation']
      }
    }
  },
  required: ['grammar']
};

/**
 * @param {string} mode
 * @returns {object | null}
 */
/**
 * Image OCR plus translation.
 *
 * `direction` is an enum rather than a free string because the floating box
 * prints it straight into the header badge: an unconstrained value reaches the
 * UI verbatim, so a model that answers "English to Persian" puts that in the
 * badge instead of "EN -> FA".
 */
export const IMAGE_SCHEMA = {
  type: 'object',
  properties: {
    extractedText: str('Text visible in the image, verbatim, keeping line breaks'),
    translation: str('The extracted text rendered in the other language'),
    direction: { type: 'string', enum: [...IMAGE_DIRECTIONS] },
    unsupported: { type: 'boolean', description: 'True when the visible text is neither Persian nor English' }
  },
  // Every property is required, including `unsupported`. Strict schema modes
  // reject a key that is not required and forbid extra keys, so an optional
  // flag would be impossible for the model to send: it has to be asked for
  // explicitly on every reply or the branch that reads it is unreachable.
  required: ['extractedText', 'translation', 'direction', 'unsupported']
};

export function schemaForMode(mode) {
  if (mode === 'word' || mode === 'phrase') return WORD_SCHEMA;
  if (mode === 'sentence') return SENTENCE_SCHEMA;
  return null;
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const strings = (v, cap) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, cap) : []);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/**
 * Normalize a parsed model reply into the result contract for a mode.
 * @param {string} mode
 * @param {unknown} obj
 * @returns {object}
 */
export function coerceResult(mode, obj) {
  const translation = text(obj?.translation);
  if (!translation) throw new TranslationError(ERROR_CODES.PARSE_FAILED);

  const base = {
    translation,
    detectedSource: oneOf(obj.detectedSource, SOURCES, ''),
    normalized: text(obj.normalized),
    correction: text(obj.correction)
  };

  if (mode === 'word' || mode === 'phrase') {
    const senses = (Array.isArray(obj.senses) ? obj.senses : [])
      .filter(s => s && text(s.meaning))
      .map(s => ({ pos: text(s.pos), meaning: text(s.meaning), example: { src: text(s.example?.src), tgt: text(s.example?.tgt) } }))
      .slice(0, LIMITS.senses);
    return {
      ...base,
      pronunciation: text(obj.pronunciation),
      pos: text(obj.pos),
      register: oneOf(obj.register, REGISTERS, 'neutral'),
      inContext: text(obj.inContext),
      senses,
      synonyms: strings(obj.synonyms, LIMITS.synonyms),
      antonyms: strings(obj.antonyms, LIMITS.antonyms)
    };
  }

  if (mode === 'sentence') {
    const alternatives = (Array.isArray(obj.alternatives) ? obj.alternatives : [])
      .filter(a => a && text(a.text))
      .map(a => ({ text: text(a.text), label: oneOf(a.label, ALTERNATIVE_LABELS, 'other sense') }))
      .slice(0, LIMITS.alternatives);
    return {
      ...base,
      register: oneOf(obj.register, REGISTERS, 'neutral'),
      alternatives,
      note: text(obj.note)
    };
  }

  return base;
}

/**
 * @param {unknown} obj
 * @returns {Array<{point: string, explanation: string}>}
 */
export function coerceGrammarPoints(obj) {
  const list = Array.isArray(obj?.grammar) ? obj.grammar : [];
  return list
    .filter(p => p && text(p.point) && text(p.explanation))
    .map(p => ({ point: text(p.point), explanation: text(p.explanation) }))
    .slice(0, LIMITS.grammar);
}

/**
 * Normalize a parsed image reply.
 *
 * Unlike coerceResult this does not throw on an empty translation: an image
 * with no legible text is a real outcome, and the prompt asks for empty
 * strings in that case. It is the caller's job to decide what to show.
 *
 * @param {unknown} obj
 * @returns {{extractedText: string, translation: string, direction: string}}
 */
export function coerceImageResult(obj) {
  return {
    extractedText: text(obj?.extractedText),
    translation: text(obj?.translation),
    direction: oneOf(obj?.direction, IMAGE_DIRECTIONS, 'unknown')
  };
}
