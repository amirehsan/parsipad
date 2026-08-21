/**
 * Cache key composition for translation results.
 * Order: provider | mode | direction | contextHash | text.
 */

async function sha256Hex(value) {
  const buffer = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{before?: string, after?: string} | undefined} context
 * @returns {Promise<string>} '' when there is no surrounding context
 */
export async function hashContext(context) {
  const before = context?.before || '';
  const after = context?.after || '';
  if (!before && !after) return '';
  return sha256Hex(`${before}|${after}`);
}

/**
 * @param {{provider: string, mode: string, direction: string, text: string, contextHash?: string}} params
 * @returns {string[]}
 */
export function buildCacheKeyParts({ provider, mode, direction, text, contextHash = '' }) {
  return [provider, mode, direction, contextHash || '', text];
}
