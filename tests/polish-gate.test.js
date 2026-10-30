import { describe, it, expect } from 'vitest';
import { POLISH_MIN_WORDS, countWords, isTooShortToPolish } from '../lib/polish-gate.js';

describe('polish gate', () => {
  it('asks for three words', () => {
    expect(POLISH_MIN_WORDS).toBe(3);
  });

  it('counts whitespace-separated words, ignoring edges and blank runs', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('thanks')).toBe(1);
    expect(countWords('  thanks   alot \n')).toBe(2);
    expect(countWords('hi\nthere\tfriend')).toBe(3);
    expect(countWords(undefined)).toBe(0);
  });

  // One or two words have no register to shift: the three cards came back
  // near-identical and the round trip was paid for nothing.
  it('turns away one or two words and lets three through', () => {
    expect(isTooShortToPolish('thanks')).toBe(true);
    expect(isTooShortToPolish('thanks alot')).toBe(true);
    expect(isTooShortToPolish('thanks a lot')).toBe(false);
    expect(isTooShortToPolish(null)).toBe(true);
  });
});
