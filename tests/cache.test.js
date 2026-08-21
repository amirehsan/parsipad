import { describe, it, expect, beforeEach, vi } from 'vitest';

function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return data.has(key) ? { [key]: data.get(key) } : {};
          return {};
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) data.set(k, v);
        },
        async remove(key) {
          data.delete(key);
        }
      }
    }
  };
  return data;
}

describe('translationCache', () => {
  let translationCache;

  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    ({ translationCache } = await import('../lib/cache.js'));
    await translationCache.clear();
  });

  it('stores and returns the whole result object', async () => {
    const parts = ['claude', 'word', 'en-fa', '', 'charge'];
    const result = { translation: 'هزینه', mode: 'word', direction: 'en-fa', senses: [{ pos: 'noun', meaning: 'هزینه', example: { src: 'a', tgt: 'b' } }] };
    await translationCache.set(parts, result);
    expect(await translationCache.get(parts)).toEqual(result);
  });

  it('does not collide when two long texts share the same prefix', async () => {
    const prefix = 'a'.repeat(200);
    await translationCache.set(['claude', 'text', 'en-fa', '', `${prefix} apples`], { translation: 'A' });
    await translationCache.set(['claude', 'text', 'en-fa', '', `${prefix} zebras`], { translation: 'B' });
    expect((await translationCache.get(['claude', 'text', 'en-fa', '', `${prefix} apples`])).translation).toBe('A');
    expect((await translationCache.get(['claude', 'text', 'en-fa', '', `${prefix} zebras`])).translation).toBe('B');
  });

  it('separates providers, modes and context hashes', async () => {
    await translationCache.set(['claude', 'word', 'en-fa', 'ctx1', 'charge'], { translation: 'اتهام' });
    expect(await translationCache.get(['gemini', 'word', 'en-fa', 'ctx1', 'charge'])).toBeNull();
    expect(await translationCache.get(['claude', 'sentence', 'en-fa', 'ctx1', 'charge'])).toBeNull();
    expect(await translationCache.get(['claude', 'word', 'en-fa', 'ctx2', 'charge'])).toBeNull();
    expect((await translationCache.get(['claude', 'word', 'en-fa', 'ctx1', 'charge'])).translation).toBe('اتهام');
  });

  it('returns null for expired entries', async () => {
    const parts = ['claude', 'word', 'en-fa', '', 'old'];
    await translationCache.set(parts, { translation: 'x' });
    const raw = await translationCache.loadCache();
    const [hash] = Object.keys(raw);
    raw[hash].timestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await translationCache.saveCache(raw);
    expect(await translationCache.get(parts)).toBeNull();
  });

  it('reports stats and clears', async () => {
    await translationCache.set(['claude', 'word', 'en-fa', '', 'a'], { translation: 'x' });
    expect((await translationCache.getStats()).size).toBe(1);
    await translationCache.clear();
    expect((await translationCache.getStats()).size).toBe(0);
  });
});
