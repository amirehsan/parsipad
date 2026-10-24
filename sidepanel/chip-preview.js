export const CHIP_PREVIEW_LENGTH = 120;

/**
 * The part of the selection shown on the chip: the first 120 characters, with
 * an ellipsis when there was more. The full text is what gets translated.
 * @param {string} text
 * @returns {string}
 */
export function chipPreview(text) {
  const chars = Array.from(text);
  if (chars.length <= CHIP_PREVIEW_LENGTH) return text;
  return chars.slice(0, CHIP_PREVIEW_LENGTH).join('') + '…';
}
