import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  toTile, toTiles, hostLabel, tileInitial, faviconUrl, isLinkableUrl,
  getTopSites, hasTopSitesPermission, TOP_SITES_LIMIT
} from '../lib/top-sites.js';

beforeEach(() => {
  globalThis.chrome = {
    runtime: { getURL: (path) => `chrome-extension://abc${path}` },
    permissions: { contains: vi.fn(async () => true) },
    topSites: { get: vi.fn(async () => []) }
  };
});

describe('hostLabel', () => {
  it('drops the www prefix so the label reads as the site name', () => {
    expect(hostLabel('https://www.github.com/a/b')).toBe('github.com');
  });

  it('keeps a subdomain that is not www, since it identifies the site', () => {
    expect(hostLabel('https://news.ycombinator.com/')).toBe('news.ycombinator.com');
  });

  it('returns empty for something that is not a url', () => {
    expect(hostLabel('not a url')).toBe('');
    expect(hostLabel('')).toBe('');
  });
});

describe('tileInitial', () => {
  it('prefers the title over the host', () => {
    expect(tileInitial({ title: 'GitHub', url: 'https://x.com' })).toBe('G');
  });

  it('falls back to the host when the title is blank', () => {
    expect(tileInitial({ title: '   ', url: 'https://www.example.com' })).toBe('E');
  });

  it('does not slice a multi-byte character in half', () => {
    // [0] on a string containing an astral character returns half a surrogate
    // pair, which renders as a replacement glyph.
    expect(tileInitial({ title: '😀 Fun', url: 'https://x.com' })).toBe('😀');
    expect(tileInitial({ title: 'پارسی', url: 'https://x.com' })).toBe('پ');
  });

  it('never returns empty, so a tile always has something to show', () => {
    expect(tileInitial({})).toBe('?');
  });
});

describe('toTile', () => {
  it('uses the host as the label when the site has no title', () => {
    expect(toTile({ url: 'https://www.example.com/x' })).toMatchObject({
      title: 'example.com', host: 'example.com'
    });
  });

  it('rejects a url a tile cannot open', () => {
    // Checking for a host is not enough: new URL('chrome://newtab').hostname
    // is 'newtab', so browser-internal pages pass a host test and would be
    // rendered as if they were sites.
    expect(toTile({ url: 'chrome://newtab' })).toBeNull();
    expect(toTile({ url: 'file:///Users/me/notes.txt' })).toBeNull();
    expect(toTile({ url: 'javascript:alert(1)' })).toBeNull();
    expect(toTile({ url: '' })).toBeNull();
    expect(toTile(null)).toBeNull();
  });

  it('accepts ordinary web pages', () => {
    expect(isLinkableUrl('https://example.com')).toBe(true);
    expect(isLinkableUrl('http://example.com')).toBe(true);
  });
});

describe('toTiles', () => {
  it('collapses repeats of the same host', () => {
    // Chrome lists deep links separately, so one busy site can otherwise fill
    // the row with identical favicons.
    const tiles = toTiles([
      { url: 'https://github.com/one', title: 'One' },
      { url: 'https://github.com/two', title: 'Two' },
      { url: 'https://example.com/', title: 'Example' }
    ]);
    expect(tiles.map(t => t.host)).toEqual(['github.com', 'example.com']);
  });

  it('keeps the first of a repeated host, which is the most visited one', () => {
    const tiles = toTiles([
      { url: 'https://github.com/one', title: 'One' },
      { url: 'https://github.com/two', title: 'Two' }
    ]);
    expect(tiles[0].title).toBe('One');
  });

  it('caps the count', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ url: `https://s${i}.com/`, title: `S${i}` }));
    expect(toTiles(many)).toHaveLength(TOP_SITES_LIMIT);
    expect(toTiles(many, 4)).toHaveLength(4);
  });

  it('survives a malformed reply instead of throwing on the new tab page', () => {
    expect(toTiles(null)).toEqual([]);
    expect(toTiles([null, { url: '' }, 'nonsense'])).toEqual([]);
  });
});

describe('faviconUrl', () => {
  it('asks the browser for the icon rather than a remote service', () => {
    // A remote favicon service would receive the user's most visited sites on
    // every new tab, which is exactly the data this feature displays privately.
    const url = faviconUrl('https://example.com/page?a=b');
    expect(url.startsWith('chrome-extension://abc/_favicon/')).toBe(true);
    expect(new URL(url).searchParams.get('pageUrl')).toBe('https://example.com/page?a=b');
  });

  it('encodes the page url so its query does not leak into the favicon query', () => {
    const url = faviconUrl('https://example.com/?size=999&pageUrl=evil');
    const params = new URL(url).searchParams;
    expect(params.get('size')).toBe('32');
    expect(params.get('pageUrl')).toBe('https://example.com/?size=999&pageUrl=evil');
  });
});

describe('getTopSites', () => {
  it('returns nothing when the optional permission is not granted', async () => {
    chrome.permissions.contains = vi.fn(async () => false);
    expect(await getTopSites()).toEqual([]);
    // It must not call the API it has no permission for.
    expect(chrome.topSites.get).not.toHaveBeenCalled();
  });

  it('shapes the reply when the permission is granted', async () => {
    chrome.topSites.get = vi.fn(async () => [{ url: 'https://www.example.com/', title: 'Example' }]);
    expect(await getTopSites()).toEqual([
      { url: 'https://www.example.com/', title: 'Example', host: 'example.com', initial: 'E' }
    ]);
  });

  it('degrades to an empty row if the API throws', async () => {
    chrome.topSites.get = vi.fn(async () => { throw new Error('nope'); });
    expect(await getTopSites()).toEqual([]);
  });
});

describe('hasTopSitesPermission', () => {
  it('reports false rather than throwing when the API is unavailable', async () => {
    chrome.permissions.contains = vi.fn(async () => { throw new Error('gone'); });
    expect(await hasTopSitesPermission()).toBe(false);
  });
});
