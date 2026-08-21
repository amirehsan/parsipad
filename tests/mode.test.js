import { describe, it, expect } from 'vitest';
import { classifyMode, countSentenceTerminators, stripEdgePunctuation } from '../lib/translation/mode.js';
import { getLanguageName } from '../lib/translation/languages.js';

describe('stripEdgePunctuation', () => {
  it('removes surrounding quotes and trailing terminators', () => {
    expect(stripEdgePunctuation('"Hello."')).toBe('Hello');
    expect(stripEdgePunctuation('(charge),')).toBe('charge');
    expect(stripEdgePunctuation('سلام.')).toBe('سلام');
  });
});

describe('countSentenceTerminators', () => {
  it('counts terminal runs followed by space or end', () => {
    expect(countSentenceTerminators('One. Two! Three?')).toBe(3);
    expect(countSentenceTerminators('سلام. خوبی؟')).toBe(2);
  });
  it('ignores abbreviation dots after one or two letters', () => {
    expect(countSentenceTerminators('e.g. apples and U.S. exports')).toBe(0);
    expect(countSentenceTerminators('We met Dr. Smith.')).toBe(1);
  });
  it('treats a run like ?! as one terminator', () => {
    expect(countSentenceTerminators('Really?! Yes.')).toBe(2);
  });
});

describe('classifyMode', () => {
  it('classifies single words, with or without punctuation', () => {
    expect(classifyMode('charge')).toBe('word');
    expect(classifyMode('Charge.')).toBe('word');
    expect(classifyMode('"می‌روم"')).toBe('word');
  });
  it('classifies short phrases without terminal punctuation', () => {
    expect(classifyMode('run the migration')).toBe('phrase');
    expect(classifyMode('as a matter of fact')).toBe('phrase');
    expect(classifyMode('e.g. apples')).toBe('phrase');
  });
  it('classifies a short unpunctuated clause as a phrase', () => {
    expect(classifyMode('من دیروز به بازار رفتم')).toBe('phrase');
  });
  it('classifies one sentence', () => {
    expect(classifyMode('They will charge you a fee for late returns.')).toBe('sentence');
    expect(classifyMode('Go home.')).toBe('sentence');
    expect(classifyMode('من دیروز بعد از ظهر به بازار بزرگ شهر رفتم')).toBe('sentence');
  });
  it('classifies multi-sentence or long input as text', () => {
    expect(classifyMode('One sentence. Another sentence.')).toBe('text');
    expect(classifyMode('a '.repeat(150).trim())).toBe('text');
    expect(classifyMode('line one\nline two')).toBe('text');
  });
  it('treats an over-long single token as a phrase, not a word', () => {
    expect(classifyMode('x'.repeat(41))).toBe('phrase');
  });
});

describe('getLanguageName', () => {
  it('maps codes to English names with a fallback', () => {
    expect(getLanguageName('fa')).toBe('Persian');
    expect(getLanguageName('ru')).toBe('Russian');
    expect(getLanguageName('xx')).toBe('the source language');
  });
});
