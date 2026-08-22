/**
 * Most-visited tiles for the New Tab page.
 *
 * Chrome does not give extensions a picture of a page: there is no thumbnail
 * API, and `chrome.topSites` returns nothing but a url and a title. A tile is
 * therefore built from the favicon plus the site's own name, which is what
 * Chrome's own New Tab does. Everything here is pure except getTopSites, so
 * the shaping can be tested without a browser.
 */

export const TOP_SITES_PERMISSION = Object.freeze({ permissions: ['topSites'] });

/** Default number of tiles. Two rows of five at the widest breakpoint. */
export const TOP_SITES_LIMIT = 10;

/**
 * Local favicon for a page, served by the browser from its own cache.
 *
 * This deliberately avoids the usual shortcut of hitting a remote favicon
 * service: that would hand a list of the user's most visited sites to a third
 * party on every new tab, which is precisely the data this feature is meant to
 * display privately.
 *
 * @param {string} pageUrl
 * @param {number} [size]
 * @returns {string}
 */
export function faviconUrl(pageUrl, size = 32) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

/**
 * The part of a host worth showing: no www, no trailing dot.
 * @param {string} rawUrl
 * @returns {string}
 */
export function hostLabel(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

/**
 * Fallback glyph for a tile whose favicon fails to load.
 * @param {{title?: string, url?: string}} site
 * @returns {string}
 */
export function tileInitial(site) {
  const source = (site?.title || '').trim() || hostLabel(site?.url || '');
  // Use the code point rather than [0] so an emoji or a Persian character is
  // not sliced in half.
  return source ? [...source][0].toUpperCase() : '?';
}

/**
 * Whether a url is something a tile can show and open.
 *
 * The test is the protocol, not the presence of a host: `chrome://newtab`
 * parses fine and reports a hostname of "newtab", so a host check alone lets
 * browser-internal pages through as if they were sites.
 *
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isLinkableUrl(rawUrl) {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Shape one chrome.topSites entry into what a tile renders.
 * @param {{url: string, title?: string}} site
 * @returns {{url: string, title: string, host: string, initial: string} | null}
 */
export function toTile(site) {
  const url = typeof site?.url === 'string' ? site.url.trim() : '';
  if (!url || !isLinkableUrl(url)) return null;

  const host = hostLabel(url);
  if (!host) return null;

  const title = (typeof site.title === 'string' ? site.title.trim() : '') || host;
  return { url, title, host, initial: tileInitial({ title, url }) };
}

/**
 * Shape a topSites reply into tiles: drop what cannot be rendered, collapse
 * repeats of the same host, and cap the count.
 *
 * @param {Array<{url: string, title?: string}>} sites
 * @param {number} [limit]
 * @returns {Array<{url: string, title: string, host: string, initial: string}>}
 */
export function toTiles(sites, limit = TOP_SITES_LIMIT) {
  if (!Array.isArray(sites)) return [];
  const seen = new Set();
  const out = [];
  for (const site of sites) {
    const tile = toTile(site);
    // Chrome lists deep links separately, so the same host can appear several
    // times. A wall of identical favicons is not a useful shortcut row.
    if (!tile || seen.has(tile.host)) continue;
    seen.add(tile.host);
    out.push(tile);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Whether the user has granted the optional topSites permission.
 * @returns {Promise<boolean>}
 */
export async function hasTopSitesPermission() {
  try {
    return await chrome.permissions.contains(TOP_SITES_PERMISSION);
  } catch {
    return false;
  }
}

/**
 * Ask for the optional topSites permission. Must be called from a user
 * gesture, which is why this is wired to the chip click rather than to page
 * load.
 * @returns {Promise<boolean>}
 */
export async function requestTopSitesPermission() {
  try {
    return await chrome.permissions.request(TOP_SITES_PERMISSION);
  } catch {
    return false;
  }
}

/**
 * Most visited sites, already shaped into tiles. Empty when the permission
 * has not been granted, so callers do not need to branch twice.
 * @param {number} [limit]
 * @returns {Promise<Array<{url: string, title: string, host: string, initial: string}>>}
 */
export async function getTopSites(limit = TOP_SITES_LIMIT) {
  if (!await hasTopSitesPermission()) return [];
  try {
    return toTiles(await chrome.topSites.get(), limit);
  } catch {
    return [];
  }
}
