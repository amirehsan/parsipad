import { describe, it, expect } from 'vitest';
import { normalizeInput, normalizeForMode, normalizePersian } from '../lib/translation/normalize.js';

describe('normalizeInput', () => {
  it('joins single line breaks inside a sentence', () => {
    expect(normalizeInput('the quick brown\nfox jumps')).toBe('the quick brown fox jumps');
  });
  it('keeps a break after terminal punctuation', () => {
    expect(normalizeInput('First sentence.\nSecond sentence.')).toBe('First sentence.\nSecond sentence.');
  });
  it('keeps paragraph breaks', () => {
    expect(normalizeInput('para one\n\npara two')).toBe('para one\n\npara two');
    expect(normalizeInput('para one\n\n\n\npara two')).toBe('para one\n\npara two');
  });
  it('keeps list items on their own lines', () => {
    expect(normalizeInput('- apples\n- pears')).toBe('- apples\n- pears');
    expect(normalizeInput('1. first\n2) second')).toBe('1. first\n2) second');
  });
  it('removes soft hyphens and zero-width characters between Latin letters', () => {
    expect(normalizeInput('hy\u00ADphen\u200Bated')).toBe('hyphenated');
    expect(normalizeInput('ab\u200Ccd')).toBe('abcd');
  });
  it('preserves the zero-width non-joiner in Persian', () => {
    expect(normalizeInput('می\u200Cروم')).toBe('می\u200Cروم');
  });
  it('drops standalone footnote markers', () => {
    expect(normalizeInput('text [12] continues [3]')).toBe('text continues');
  });
  it('collapses repeated spaces and normalizes CRLF', () => {
    expect(normalizeInput('a   b\r\nc')).toBe('a b c');
  });
  it('returns empty string for empty input', () => {
    expect(normalizeInput('')).toBe('');
    expect(normalizeInput(null)).toBe('');
  });
});

describe('normalizeForMode', () => {
  it('preserves [n] markers and one-item-per-line structure for batch', () => {
    const input = '[1] Library policies\n[2] They will charge you a fee.\n[3] Contact us';
    expect(normalizeForMode(input, 'batch')).toBe(input);
  });
  it('still converts CRLF, strips invisible characters and collapses spaces for batch', () => {
    const input = '[1]  a   b\r\n[2] hy\u00ADphen\u200Bated';
    expect(normalizeForMode(input, 'batch')).toBe('[1] a b\n[2] hyphenated');
  });
  it('trims each batch line without joining them', () => {
    expect(normalizeForMode('[1]  first  \n  [2] second  ', 'batch')).toBe('[1] first\n[2] second');
  });
  it('does not drop standalone bracketed numbers for batch', () => {
    const input = '[1] see note [2] below\n[2] the note itself';
    expect(normalizeForMode(input, 'batch')).toBe(input);
  });
  it('matches normalizeInput for a word', () => {
    const text = 'hello';
    expect(normalizeForMode(text, 'word')).toBe(normalizeInput(text));
  });
  it('matches normalizeInput for a sentence', () => {
    const text = 'First sentence.\nSecond sentence.';
    expect(normalizeForMode(text, 'sentence')).toBe(normalizeInput(text));
  });
  it('matches normalizeInput for a multi-paragraph text', () => {
    const text = 'para one\n\npara two\nkeeps flowing on the same line';
    expect(normalizeForMode(text, 'text')).toBe(normalizeInput(text));
  });
});

describe('normalizePersian', () => {
  it('maps Arabic Yeh and Kaf to Persian forms', () => {
    expect(normalizePersian('كتاب علي')).toBe('کتاب علی');
  });
  it('removes spaces before Persian punctuation', () => {
    expect(normalizePersian('سلام ، خوبی ؟')).toBe('سلام، خوبی؟');
  });
  it('maps Arabic-Indic digits only when asked', () => {
    expect(normalizePersian('١٢')).toBe('١٢');
    expect(normalizePersian('١٢', { persianDigits: true })).toBe('۱۲');
  });
  it('trims and collapses spaces', () => {
    expect(normalizePersian('  سلام   دنیا ')).toBe('سلام دنیا');
  });
});
