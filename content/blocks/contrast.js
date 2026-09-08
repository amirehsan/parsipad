/**
 * Colour maths for fitting the translation to whatever it is sitting on.
 *
 * Pure: callers measure with getComputedStyle and pass plain numbers in, so the
 * thresholds stay testable without a document.
 */

/** Parse a computed colour into {r, g, b, a}, or null if it is not usable. */
export function parseColor(value) {
  const parts = String(value || '').match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  const [r, g, b, a] = parts.map(Number);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  return { r, g, b, a: Number.isFinite(a) ? a : 1 };
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** True when the background is dark enough to want light text on it. */
export function isDarkBackground(bg) {
  return relativeLuminance(bg) < 0.4;
}

/**
 * The colour to render the translation in.
 *
 * Prefers the source block's own colour so the translation reads as part of the
 * page, and falls back to a plain high-contrast value when the source's colour
 * would not be legible against the measured background. WCAG AA for body text
 * is 4.5, which is the bar used here.
 */
export function readableTextColor(sourceColor, background) {
  const dark = isDarkBackground(background);
  const fallback = dark ? 'rgba(255, 255, 255, 0.94)' : 'rgba(0, 0, 0, 0.88)';
  if (!sourceColor || sourceColor.a < 0.6) return fallback;
  return contrastRatio(sourceColor, background) >= 4.5
    ? `rgb(${sourceColor.r}, ${sourceColor.g}, ${sourceColor.b})`
    : fallback;
}

/** Composite an overlay of the given alpha over an opaque background. */
export function overlay(background, target, alpha) {
  return {
    r: background.r + (target.r - background.r) * alpha,
    g: background.g + (target.g - background.g) * alpha,
    b: background.b + (target.b - background.b) * alpha
  };
}

/**
 * The lowest alpha, in steps of 0.04 from 0.28, at which the better-contrasting
 * of pure white or pure black over `background` clears `minRatio`.
 *
 * Solved rather than guessed: contrast is not linear in alpha, so one fixed
 * value cannot serve both a near-black page and a mid-grey one.
 *
 * The target is picked by comparing both directly rather than by
 * isDarkBackground's threshold. That threshold exists to choose an overall
 * theme bucket (see data-theme in render.js), not to guarantee the
 * highest-contrast single colour, and the two disagree for a background with
 * luminance roughly between 0.18 and 0.4: there, isDarkBackground calls it
 * dark and would reach for white, but white cannot clear 3:1 against a
 * background that light no matter how opaque it goes, while black clears it
 * with room to spare. Comparing both directly has no such gap: the two curves
 * cross at luminance ~0.179, and even there the winner still reaches ~4.58:1,
 * which is the global worst case across every possible background.
 *
 * Roughly seventeen steps of cheap arithmetic, run once per insertion, which
 * is irrelevant next to the getComputedStyle calls already happening there.
 */
function solveBoundaryAlpha(background, minRatio) {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const target = contrastRatio(white, background) >= contrastRatio(black, background) ? white : black;
  for (let alpha = 0.28; alpha <= 0.96; alpha += 0.04) {
    if (contrastRatio(overlay(background, target, alpha), background) >= minRatio) {
      return `rgba(${target.r}, ${target.g}, ${target.b}, ${alpha.toFixed(2)})`;
    }
  }
  // The loop above stops at 0.96. Solid black or white, whichever contrasts
  // better, is guaranteed at least ~4.58:1 against any background at all (the
  // crossover point described above is the global worst case for either
  // colour alone), so this always clears both bars this function is used
  // for. Reached only for backgrounds in a sliver right at that crossover,
  // where 0.96 falls just short of what 1.0 gives.
  return `rgba(${target.r}, ${target.g}, ${target.b}, 1)`;
}

/**
 * A boundary colour that clears WCAG's 3:1 bar for non-text UI (a border,
 * an icon outline) against this particular background.
 */
export function boundaryColor(background) {
  return solveBoundaryAlpha(background, 3);
}

/**
 * A boundary colour that clears WCAG AA's 4.5:1 bar for text against this
 * particular background. Same search as boundaryColor, aimed at the stricter
 * bar text is held to rather than the one for a graphical boundary.
 */
export function boundaryTextColor(background) {
  return solveBoundaryAlpha(background, 4.5);
}

/**
 * Colours for the feature's own controls. Text and border are solved against
 * the measured background so they hold up on any shade rather than only the
 * one the palette was designed against; the hover wash is left as a fixed
 * subtle overlay gated on isDarkBackground's theme bucket, since a hover
 * state has no contrast bar to clear and a light-on-dark or dark-on-light
 * wash reads fine either way.
 */
export function chromeColors(background) {
  return {
    text: boundaryTextColor(background),
    border: boundaryColor(background),
    hover: isDarkBackground(background) ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)'
  };
}
