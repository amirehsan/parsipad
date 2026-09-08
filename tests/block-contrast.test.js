// tests/block-contrast.test.js
import { describe, it, expect } from 'vitest';
import {
  parseColor, relativeLuminance, contrastRatio, isDarkBackground, readableTextColor, chromeColors,
  overlay, boundaryColor, boundaryTextColor
} from '../content/blocks/contrast.js';

// The maintainer's actual report: a page using a medium grey rather than the
// near-black the fixed dark palette assumed.
const MID_GREY = { r: 58, g: 58, b: 58, a: 1 };

// The literal the dark palette used for --pp-border before this change, kept
// here (not imported) so the test still catches a regression back to it.
const OLD_FIXED_DARK_BORDER = { r: 0x33, g: 0x2e, b: 0x4a };

// A spread of backgrounds spanning both themes and both neutral and saturated
// hues, used to prove boundaryColor and boundaryTextColor rather than just
// sample them: near black and off white sit close to the two extremes, mid
// grey is the maintainer's own case, and mid blue and pale yellow confirm the
// search is not secretly grey-only.
const BOUNDARY_BACKGROUNDS = [
  ['near black', { r: 20, g: 20, b: 30 }],
  ['mid grey', { r: 58, g: 58, b: 58 }],
  ['off white', { r: 250, g: 250, b: 250 }],
  ['mid blue', { r: 40, g: 80, b: 160 }],
  ['pale yellow', { r: 250, g: 245, b: 200 }]
];

// None of the backgrounds above have a luminance near 0.18-0.4, so none of
// them would catch a regression back to picking the overlay target from
// isDarkBackground's threshold instead of comparing white and black
// directly. rgb(150, 150, 150) sits at luminance ~0.305: isDarkBackground
// still calls that dark (its threshold is 0.4) and would reach for white,
// but white cannot pass either bar there even fully opaque, while black
// clears both with room to spare.
const WHITE_BLIND_SPOT = { r: 150, g: 150, b: 150 };

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

describe('overlay', () => {
  it('is the background unchanged at alpha 0', () => {
    expect(overlay(MID_GREY, { r: 255, g: 255, b: 255 }, 0)).toEqual({ r: 58, g: 58, b: 58 });
  });

  it('is the target unchanged at alpha 1', () => {
    expect(overlay(MID_GREY, { r: 255, g: 255, b: 255 }, 1)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('is a linear blend in between', () => {
    expect(overlay({ r: 0, g: 0, b: 0 }, { r: 100, g: 100, b: 100 }, 0.5)).toEqual({ r: 50, g: 50, b: 50 });
  });
});

describe('boundaryColor', () => {
  // boundaryColor returns an rgba(...) string whose alpha still has to be
  // composited before it means anything: measuring the string's raw r/g/b
  // channels directly would compare pure white or pure black against the
  // background regardless of alpha, which clears any bar no matter what
  // alpha was actually chosen and so could never fail. Parse it and run it
  // back through overlay to measure what the page would actually render.
  it.each(BOUNDARY_BACKGROUNDS)('clears the 3:1 boundary bar on a %s background', (_name, bg) => {
    const parsed = parseColor(boundaryColor(bg));
    expect(contrastRatio(overlay(bg, parsed, parsed.a), bg)).toBeGreaterThanOrEqual(3);
  });

  it('scores the maintainer\'s case well above the old fixed literal', () => {
    const parsed = parseColor(boundaryColor(MID_GREY));
    const ratio = contrastRatio(overlay(MID_GREY, parsed, parsed.a), MID_GREY);
    expect(ratio).toBeGreaterThan(contrastRatio(OLD_FIXED_DARK_BORDER, MID_GREY));
  });

  it('clears 3:1 on a background isDarkBackground would misroute to white', () => {
    const parsed = parseColor(boundaryColor(WHITE_BLIND_SPOT));
    expect(parsed.r).toBe(0);
    expect(contrastRatio(overlay(WHITE_BLIND_SPOT, parsed, parsed.a), WHITE_BLIND_SPOT)).toBeGreaterThanOrEqual(3);
  });
});

describe('boundaryTextColor', () => {
  it.each(BOUNDARY_BACKGROUNDS)('clears the 4.5:1 text bar on a %s background', (_name, bg) => {
    const parsed = parseColor(boundaryTextColor(bg));
    expect(contrastRatio(overlay(bg, parsed, parsed.a), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('clears 4.5:1 on a background isDarkBackground would misroute to white', () => {
    const parsed = parseColor(boundaryTextColor(WHITE_BLIND_SPOT));
    expect(parsed.r).toBe(0);
    expect(contrastRatio(overlay(WHITE_BLIND_SPOT, parsed, parsed.a), WHITE_BLIND_SPOT)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('chromeColors', () => {
  it('derives a border that clears the 3:1 bar on the mid-grey background, not the old fixed literal', () => {
    const { border } = chromeColors(MID_GREY);
    expect(border).not.toBe('#332e4a');
    const parsed = parseColor(border);
    expect(contrastRatio(overlay(MID_GREY, parsed, parsed.a), MID_GREY)).toBeGreaterThanOrEqual(3);
  });

  it('derives footer text that clears the stricter 4.5:1 text bar on the same background', () => {
    const { text } = chromeColors(MID_GREY);
    const parsed = parseColor(text);
    expect(contrastRatio(overlay(MID_GREY, parsed, parsed.a), MID_GREY)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hover wash a fixed subtle overlay, since it carries no contrast bar to clear', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(chromeColors(MID_GREY).hover).toBe('rgba(255, 255, 255, 0.10)');
    expect(chromeColors(white).hover).toBe('rgba(0, 0, 0, 0.06)');
  });

  it('switches the solved target from white to black across the light/dark boundary', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(parseColor(chromeColors(MID_GREY).border).r).toBe(255);
    expect(parseColor(chromeColors(white).border).r).toBe(0);
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});
