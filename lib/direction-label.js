/**
 * The one place a stored translation direction becomes the label a person
 * reads.
 *
 * Directions are stored in more than one shape: language detection writes
 * 'en-fa' (and 'ru-fa' when other languages are translated into Persian),
 * the grammar flow writes 'en-to-fa', and favorites saved by older versions
 * hold an already formatted 'EN → FA'. Each page used to format these on its
 * own, and two printed the stored value as is.
 */

const CODE = /^[a-z]{2,3}$/;

/**
 * Split a stored direction into its two language codes.
 * @param {string | undefined} direction
 * @returns {[string, string] | null} lowercase codes, or null when the value
 *   is not a pair of two different language codes.
 */
function directionPair(direction) {
  const parts = String(direction || '')
    .trim()
    .toLowerCase()
    .split(/\s*(?:-to-|→|-)\s*/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const [from, to] = parts;
  if (!CODE.test(from) || !CODE.test(to) || from === to) return null;
  return [from, to];
}

/**
 * @param {string | undefined} direction
 * @returns {string} 'EN → FA' style label, or '' when the value is not a
 *   pair of two different language codes.
 */
export function directionLabel(direction) {
  const pair = directionPair(direction);
  return pair ? `${pair[0].toUpperCase()} → ${pair[1].toUpperCase()}` : '';
}

/**
 * The canonical, comparable form of a stored direction, so filters and URLs
 * do not depend on which shape a page happened to store.
 * @param {string | undefined} direction - Any shape directionLabel accepts
 * @returns {string} 'en-fa' style key, or '' when the value is not a pair of
 *   two different language codes.
 */
export function directionKey(direction) {
  const pair = directionPair(direction);
  return pair ? `${pair[0]}-${pair[1]}` : '';
}
