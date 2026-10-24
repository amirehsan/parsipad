/**
 * Sites where ParsiPad stays quiet: no selection toolbar, no hover translate.
 * Kept free of imports because the content script loads it unbundled from the
 * extension root, where lib/constants.js is deliberately not web-accessible.
 * MUTED_SITES_KEY therefore repeats STORAGE_KEYS.mutedSites, and
 * tests/muted-sites.test.js asserts the two stay equal.
 */

export const MUTED_SITES_KEY = 'muted_sites';

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
// Host with an optional port and an optional path, query or fragment. Anything
// else (userinfo, "mailto:" style schemes, a bare port) is not a pasted host.
const BARE_HOST = /^[^\s/?#:@]+(:\d+)?([/?#].*)?$/;
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Reduce what people paste (a URL or a bare host) to a comparable host.
 * Lowercases, drops the port, path, query and one trailing dot, and strips a
 * leading "www." when a dotted host remains. Dotted IPv4 hosts are hosts and
 * are kept. Returns null for anything without a dot, with inner whitespace,
 * or with a scheme other than http(s).
 * @param {string} input
 * @returns {string | null}
 */
export function normalizeHost(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;

  const scheme = SCHEME.exec(text);
  if (scheme) {
    if (!/^https?$/i.test(scheme[1])) return null;
  } else if (!BARE_HOST.test(text)) {
    return null;
  }

  let hostname;
  try {
    hostname = new URL(scheme ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }

  hostname = hostname.toLowerCase().replace(/\.$/, '');
  if (!HOSTNAME.test(hostname)) return null;
  if (hostname.startsWith('www.') && hostname.indexOf('.', 4) !== -1) {
    hostname = hostname.slice(4);
  }
  return hostname;
}

/**
 * Whether a page's hostname is covered by the list: the host itself or any of
 * its subdomains, never a host that merely ends with the same letters.
 * @param {string[]} list Normalized hosts, as stored.
 * @param {string} hostname Usually location.hostname.
 * @returns {boolean}
 */
export function isHostMuted(list, hostname) {
  if (!Array.isArray(list) || list.length === 0) return false;
  const host = normalizeHost(hostname);
  if (!host) return false;
  return list.some((entry) => typeof entry === 'string' && (host === entry || host.endsWith(`.${entry}`)));
}

/** @returns {Promise<string[]>} */
export async function getMutedSites() {
  const stored = await chrome.storage.local.get(MUTED_SITES_KEY);
  const list = stored[MUTED_SITES_KEY];
  return Array.isArray(list) ? list.filter((entry) => typeof entry === 'string') : [];
}

/**
 * Add a site; the list stays unique and sorted.
 * @param {string} input
 * @returns {Promise<string | null>} The stored host, or null for invalid input.
 */
export async function addMutedSite(input) {
  const host = normalizeHost(input);
  if (!host) return null;
  const list = await getMutedSites();
  if (!list.includes(host)) {
    list.push(host);
    list.sort();
    await chrome.storage.local.set({ [MUTED_SITES_KEY]: list });
  }
  return host;
}

/** @param {string} host */
export async function removeMutedSite(host) {
  const list = await getMutedSites();
  const next = list.filter((entry) => entry !== host);
  if (next.length !== list.length) {
    await chrome.storage.local.set({ [MUTED_SITES_KEY]: next });
  }
}
