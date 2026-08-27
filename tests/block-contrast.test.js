// tests/block-contrast.test.js
import { describe, it, expect } from 'vitest';
import {
  parseColor, relativeLuminance, contrastRatio, isDarkBackground, readableTextColor, chromeColors
} from '../content/blocks/contrast.js';

// The maintainer's actual report: a page using a medium grey rather than the
// near-black the fixed dark palette assumed.
const MID_GREY = { r: 58, g: 58, b: 58, a: 1 };

// The literal the dark palette used for --pp-border before this change, kept
// here (not imported) so the test still catches a regression back to it.
const OLD_FIXED_DARK_BORDER = { r: 0x33, g: 0x2e, b: 0x4a };

describe('parseColor', () => {
  it('reads an rgb() triplet', () => {
    expect(parseColor('rgb(58, 58, 58)')).toEqual({ r: 58, g: 58, b: 58, a: 1 });
  });

  it('reads an rgba() quadruplet, alpha included', () => {
    expect(parseColor('rgba(20, 30, 40, 0.5)')).toEqual({ r: 20, g: 30, b: 40, a: 0.5 });
  });

  it('returns null for a value with no numbers', () => {
    expect(parseColor('transparent')).toBeNull();
  });

  it('returns null for empty or missing input', () => {
    expect(parseColor('')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor(null)).toBeNull();
  });
});

describe('isDarkBackground', () => {
  it('reports a near-black background as dark and a near-white one as light', () => {
    expect(isDarkBackground({ r: 10, g: 10, b: 15 })).toBe(true);
    expect(isDarkBackground({ r: 250, g: 250, b: 250 })).toBe(false);
  });

  it('reports the maintainer\'s mid-grey page background as dark', () => {
    expect(isDarkBackground(MID_GREY)).toBe(true);
  });
});

describe('contrastRatio', () => {
  it('computes the WCAG ratio for black on white as 21', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });

  it('is 1 for identical colours', () => {
    expect(contrastRatio(MID_GREY, MID_GREY)).toBeCloseTo(1, 5);
  });

  it('scores the old fixed dark border poorly against the mid-grey background', () => {
    // #332e4a on rgb(58, 58, 58): both are dark, so the border all but
    // disappears. This is the bug report: "the Dismiss control is nearly
    // invisible." Comfortably below the WCAG non-text minimum of 3.
    expect(contrastRatio(OLD_FIXED_DARK_BORDER, MID_GREY)).toBeLessThan(1.5);
  });
});

describe('readableTextColor', () => {
  it('keeps the source colour when it is legible against the background', () => {
    const nearBlack = { r: 20, g: 20, b: 20, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(readableTextColor(nearBlack, white)).toBe('rgb(20, 20, 20)');
  });

  it('falls back to a light colour for an illegible source colour on a dark background', () => {
    // Barely lighter than the background itself: legible to nothing.
    const almostTheBackground = { r: 70, g: 70, b: 75, a: 1 };
    expect(contrastRatio(almostTheBackground, MID_GREY)).toBeLessThan(4.5);
    expect(readableTextColor(almostTheBackground, MID_GREY)).toBe('rgba(255, 255, 255, 0.94)');
  });

  it('treats a nearly transparent source colour as unusable', () => {
    // Legible-looking numbers, but alpha this low means the rendered colour on
    // the page was mostly whatever sat behind it, not this value.
    const mostlyTransparent = { r: 20, g: 20, b: 20, a: 0.4 };
    expect(readableTextColor(mostlyTransparent, MID_GREY)).toBe('rgba(255, 255, 255, 0.94)');
  });

  it('falls back for a missing source colour rather than throwing', () => {
    expect(readableTextColor(null, MID_GREY)).toBe('rgba(255, 255, 255, 0.94)');
  });
});

describe('chromeColors', () => {
  it('derives the dark border as an alpha overlay, never the old fixed literal', () => {
    const { border } = chromeColors(MID_GREY);
    expect(border).toBe('rgba(255, 255, 255, 0.30)');
    expect(border).not.toBe('#332e4a');
  });

  it('switches to the dark-on-light set for a light background', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const chrome = chromeColors(white);
    expect(chrome.text).toBe('rgba(0, 0, 0, 0.66)');
    expect(chrome.border).toBe('rgba(0, 0, 0, 0.24)');
    expect(chrome.hover).toBe('rgba(0, 0, 0, 0.06)');
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});
