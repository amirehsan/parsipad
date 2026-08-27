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

/**
 * Colours for the feature's own controls, as alpha overlays so they hold up on
 * any background rather than only on the one the palette was designed against.
 */
export function chromeColors(background) {
  return isDarkBackground(background)
    ? { text: 'rgba(255, 255, 255, 0.74)', border: 'rgba(255, 255, 255, 0.30)', hover: 'rgba(255, 255, 255, 0.10)' }
    : { text: 'rgba(0, 0, 0, 0.66)', border: 'rgba(0, 0, 0, 0.24)', hover: 'rgba(0, 0, 0, 0.06)' };
}
