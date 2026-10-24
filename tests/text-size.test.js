import { describe, it, expect } from 'vitest';
import { textSizeStep, stepBelow, TEXT_SIZE_STEPS } from '../lib/text-size.js';

describe('textSizeStep', () => {
  const of = n => textSizeStep('x'.repeat(n));

  it.each([
    [1, 'xl'], [24, 'xl'],
    [25, 'lg'], [60, 'lg'],
    [61, 'md'], [140, 'md'],
    [141, 'sm'], [1000, 'sm']
  ])('%i characters sets the %s step', (len, step) => {
    expect(of(len)).toBe(step);
  });

  it('counts code points, not UTF-16 units', () => {
    // 13 emoji read as 13 characters but occupy 26 UTF-16 units. Counting
    // units puts this over the 24 bound and drops a short phrase a whole size
    // for no reason the reader can see, so the two ways of counting have to
    // disagree here or this test proves nothing.
    const text = '😀'.repeat(13);
    expect([...text].length).toBe(13);
    expect(text.length).toBe(26);
    expect(textSizeStep(text)).toBe('xl');
  });

  it('measures Persian the same as Latin', () => {
    expect(textSizeStep('سیب')).toBe('xl');
    expect(textSizeStep('س'.repeat(70))).toBe('md');
  });

  it('accepts a length directly as well as a string', () => {
    expect(textSizeStep(24)).toBe('xl');
    expect(textSizeStep(141)).toBe('sm');
  });

  it('gives an empty or missing value the largest step, not a crash', () => {
    // Empty text is a rendering bug elsewhere; it should still lay out.
    expect(textSizeStep('')).toBe('xl');
    expect(textSizeStep(null)).toBe('xl');
    expect(textSizeStep(undefined)).toBe('xl');
  });

  it('only ever returns a step the stylesheet defines', () => {
    for (const n of [0, 1, 24, 25, 60, 61, 140, 141, 5000]) {
      expect(TEXT_SIZE_STEPS).toContain(of(n));
    }
  });
});

describe('stepBelow', () => {
  it('walks one size down and stops at the smallest', () => {
    expect(stepBelow('xl')).toBe('lg');
    expect(stepBelow('lg')).toBe('md');
    expect(stepBelow('md')).toBe('sm');
    expect(stepBelow('sm')).toBe('sm');
  });

  it('returns the smallest for an unknown step', () => {
    expect(stepBelow('enormous')).toBe('sm');
    expect(stepBelow(undefined)).toBe('sm');
  });
});
