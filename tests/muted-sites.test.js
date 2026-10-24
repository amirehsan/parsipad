import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MUTED_SITES_KEY, normalizeHost, isHostMuted, addMutedSite, getMutedSites, removeMutedSite
} from '../lib/muted-sites.js';
import { STORAGE_KEYS } from '../lib/constants.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.chrome = {
    storage: {
      local: {
        get: async (k) => ({ [k]: store.get(k) }),
        set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); }
      }
    }
  };
});
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('muted sites', () => {
  it('normalizes what people paste', () => {
    expect(normalizeHost('https://www.Example.com/path?q=1')).toBe('example.com');
    expect(normalizeHost('docs.example.com')).toBe('docs.example.com');
    expect(normalizeHost('not a host')).toBeNull();
    expect(normalizeHost('chrome://extensions')).toBeNull();
    expect(normalizeHost('')).toBeNull();
  });

  it('handles case, dots, ports, paths, spaces, schemes and bare words', () => {
    expect(normalizeHost('EXAMPLE.COM')).toBe('example.com');
    expect(normalizeHost('example.com.')).toBe('example.com');
    expect(normalizeHost('example.com:8080')).toBe('example.com');
    expect(normalizeHost('https://example.com:8443/a/b?q=1#frag')).toBe('example.com');
    expect(normalizeHost('example.com/path')).toBe('example.com');
    expect(normalizeHost('  example.com  ')).toBe('example.com');
    expect(normalizeHost('exam ple.com')).toBeNull();
    expect(normalizeHost('ftp://example.com')).toBeNull();
    expect(normalizeHost('mailto:a@example.com')).toBeNull();
    expect(normalizeHost('javascript:alert(1)')).toBeNull();
    expect(normalizeHost('localhost')).toBeNull();
    expect(normalizeHost('example')).toBeNull();
    expect(normalizeHost('http://localhost:3000')).toBeNull();
  });

  it('keeps an IPv4 host and strips only one leading www', () => {
    expect(normalizeHost('192.168.1.10:3000')).toBe('192.168.1.10');
    expect(normalizeHost('www.www.example.com')).toBe('www.example.com');
    expect(normalizeHost('www.com')).toBe('www.com');
  });

  it('rejects non-strings', () => {
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(42)).toBeNull();
  });

  it('mutes the host and its subdomains only', () => {
    const list = ['example.com'];
    expect(isHostMuted(list, 'example.com')).toBe(true);
    expect(isHostMuted(list, 'www.example.com')).toBe(true);
    expect(isHostMuted(list, 'docs.example.com')).toBe(true);
    expect(isHostMuted(list, 'notexample.com')).toBe(false);
    expect(isHostMuted(list, 'example.com.evil.org')).toBe(false);
  });

  it('treats a www entry as the whole site and tolerates odd input', () => {
    // Adding www.example.com stores example.com, which covers every subdomain.
    expect(isHostMuted(['example.com'], 'docs.example.com')).toBe(true);
    expect(isHostMuted([], 'example.com')).toBe(false);
    expect(isHostMuted(undefined, 'example.com')).toBe(false);
    expect(isHostMuted(['example.com'], '')).toBe(false);
    expect(isHostMuted(['example.com'], 'localhost')).toBe(false);
  });

  it('stores a unique sorted list', async () => {
    expect(await addMutedSite('www.zeta.org')).toBe('zeta.org');
    await addMutedSite('alpha.com');
    await addMutedSite('https://alpha.com/x');
    expect(await addMutedSite('nope')).toBeNull();
    expect(await getMutedSites()).toEqual(['alpha.com', 'zeta.org']);
    await removeMutedSite('alpha.com');
    expect(await getMutedSites()).toEqual(['zeta.org']);
  });

  it('reads a missing or corrupt stored value as an empty list', async () => {
    expect(await getMutedSites()).toEqual([]);
    store.set(MUTED_SITES_KEY, 'example.com');
    expect(await getMutedSites()).toEqual([]);
  });

  it('keeps the storage key in step with STORAGE_KEYS', () => {
    expect(MUTED_SITES_KEY).toBe(STORAGE_KEYS.mutedSites);
    expect(MUTED_SITES_KEY).toBe('muted_sites');
  });

  it('has no imports, so the content script can load it unbundled', () => {
    expect(read('lib/muted-sites.js')).not.toMatch(/^\s*import\s/m);
  });

  it('both in-page features honour the list', () => {
    expect(read('content/blocks/index.js')).toMatch(/isHostMuted\(/);
    const main = read('content/main.js');
    expect(main).toMatch(/from '\.\.\/lib\/muted-sites\.js'/);
    const body = main.slice(main.indexOf('function handleTextSelection'));
    expect(body.slice(0, 200)).toMatch(/if \(siteMuted\) return;/);
    expect(main).toMatch(/changes\[MUTED_SITES_KEY\]/);
  });
});
