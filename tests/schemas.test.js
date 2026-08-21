import { describe, it, expect } from 'vitest';
import { WORD_SCHEMA, SENTENCE_SCHEMA, GRAMMAR_POINTS_SCHEMA, schemaForMode, coerceResult, coerceGrammarPoints, LIMITS } from '../lib/translation/schemas.js';
import { withAdditionalPropertiesFalse, withPropertyOrdering } from '../lib/providers/schema-adapters.js';

const ALLOWED_KEYWORDS = new Set(['type', 'properties', 'required', 'enum', 'items', 'description']);

function collectKeywords(schema, found = new Set()) {
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties') {
      Object.values(value).forEach(v => collectKeywords(v, found));
    } else if (key === 'items') {
      collectKeywords(value, found);
    } else {
      found.add(key);
    }
  }
  return found;
}

describe('canonical schemas', () => {
  it.each([['word', WORD_SCHEMA], ['sentence', SENTENCE_SCHEMA], ['grammar', GRAMMAR_POINTS_SCHEMA]])('%s uses only the shared keyword subset', (_name, schema) => {
    for (const k of collectKeywords(schema)) expect(ALLOWED_KEYWORDS.has(k), `keyword ${k}`).toBe(true);
  });
  it('lists every property as required and puts translation first', () => {
    for (const schema of [WORD_SCHEMA, SENTENCE_SCHEMA]) {
      expect(schema.required).toEqual(Object.keys(schema.properties));
      expect(Object.keys(schema.properties)[0]).toBe('translation');
    }
  });
  it('maps modes to schemas', () => {
    expect(schemaForMode('word')).toBe(WORD_SCHEMA);
    expect(schemaForMode('phrase')).toBe(WORD_SCHEMA);
    expect(schemaForMode('sentence')).toBe(SENTENCE_SCHEMA);
    expect(schemaForMode('text')).toBeNull();
    expect(schemaForMode('batch')).toBeNull();
  });
});

describe('coerceResult', () => {
  it('throws PARSE_FAILED without a translation', () => {
    expect(() => coerceResult('word', {})).toThrow(/could not be read/);
    expect(() => coerceResult('word', { translation: '  ' })).toThrowError(expect.objectContaining({ code: 'PARSE_FAILED' }));
  });
  it('defaults and caps word results', () => {
    const senses = Array.from({ length: 8 }, (_, i) => ({ pos: 'noun', meaning: `m${i}`, example: { src: 's', tgt: 't' } }));
    const out = coerceResult('word', { translation: ' هزینه ', register: 'weird', senses, synonyms: ['a', 'b', 'c', 'd', 'e', 'f', 7], antonyms: ['x', 'y', 'z', 'w'] });
    expect(out.translation).toBe('هزینه');
    expect(out.register).toBe('neutral');
    expect(out.senses).toHaveLength(LIMITS.senses);
    expect(out.synonyms).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out.antonyms).toEqual(['x', 'y', 'z']);
    expect(out.pronunciation).toBe('');
    expect(out.detectedSource).toBe('');
  });
  it('drops senses without a meaning', () => {
    const out = coerceResult('phrase', { translation: 'x', senses: [{ pos: 'noun' }, { meaning: 'ok' }] });
    expect(out.senses).toEqual([{ pos: '', meaning: 'ok', example: { src: '', tgt: '' } }]);
  });
  it('coerces sentence alternatives and labels', () => {
    const out = coerceResult('sentence', { translation: 'x', detectedSource: 'fa-latn', alternatives: [{ text: 'a', label: 'colloquial' }, { text: 'b', label: 'nope' }, { text: '' }, { text: 'c' }, { text: 'd' }] });
    expect(out.detectedSource).toBe('fa-latn');
    expect(out.alternatives).toEqual([{ text: 'a', label: 'colloquial' }, { text: 'b', label: 'other sense' }, { text: 'c', label: 'other sense' }]);
    expect(out.note).toBe('');
  });
  it('returns only the base fields for text mode', () => {
    expect(coerceResult('text', { translation: 'hi', senses: [] })).toEqual({ translation: 'hi', detectedSource: '', normalized: '', correction: '' });
  });
});

describe('coerceGrammarPoints', () => {
  it('caps and filters points', () => {
    const points = Array.from({ length: 6 }, (_, i) => ({ point: `p${i}`, explanation: `e${i}` }));
    expect(coerceGrammarPoints({ grammar: [...points, { point: '' }] })).toHaveLength(LIMITS.grammar);
    expect(coerceGrammarPoints({})).toEqual([]);
  });
});

describe('schema adapters', () => {
  it('adds additionalProperties false to every object', () => {
    const out = withAdditionalPropertiesFalse(WORD_SCHEMA);
    expect(out.additionalProperties).toBe(false);
    expect(out.properties.senses.items.additionalProperties).toBe(false);
    expect(out.properties.senses.items.properties.example.additionalProperties).toBe(false);
    expect(WORD_SCHEMA.additionalProperties).toBeUndefined();
  });
  it('adds propertyOrdering matching property order', () => {
    const out = withPropertyOrdering(WORD_SCHEMA);
    expect(out.propertyOrdering[0]).toBe('translation');
    expect(out.properties.senses.items.propertyOrdering).toEqual(['pos', 'meaning', 'example']);
    expect(out.additionalProperties).toBeUndefined();
  });
  it('shares no mutable structure with the canonical schema', () => {
    const a = withAdditionalPropertiesFalse(WORD_SCHEMA);
    const b = withPropertyOrdering(WORD_SCHEMA);
    expect(a.required).not.toBe(WORD_SCHEMA.required);
    expect(a.required).toEqual(WORD_SCHEMA.required);
    expect(a.required).not.toBe(b.required);
    expect(a.properties.detectedSource.enum).not.toBe(WORD_SCHEMA.properties.detectedSource.enum);
    expect(a.properties.detectedSource.enum).toEqual(WORD_SCHEMA.properties.detectedSource.enum);
    a.required.push('injected');
    a.properties.detectedSource.enum.push('injected');
    expect(WORD_SCHEMA.required).not.toContain('injected');
    expect(WORD_SCHEMA.properties.detectedSource.enum).not.toContain('injected');
  });
});
