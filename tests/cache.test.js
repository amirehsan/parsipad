import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome.storage.local stub backed by an in-memory object.
// Must be installed before importing the cache module so the singleton picks it up.
function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') {
            return data.has(key) ? { [key]: data.get(key) } : {};
          }
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
  let store;
  let translationCache;

  beforeEach(async () => {
    store = installChromeStub();
    vi.resetModules();
    ({ translationCache } = await import('../lib/cache.js'));
    await translationCache.clear();
    store.clear();
  });

  it('does not collide when two long texts share the same prefix', async () => {
    const prefix = 'a'.repeat(200);
    const textA = prefix + ' ends with apples';
    const textB = prefix + ' ends with zebras';

    await translationCache.set(textA, 'TRANSLATION A', 'en-fa', 'claude', 'auto');
    await translationCache.set(textB, 'TRANSLATION B', 'en-fa', 'claude', 'auto');

    const a = await translationCache.get(textA, 'claude', 'auto');
    const b = await translationCache.get(textB, 'claude', 'auto');

    expect(a?.translation).toBe('TRANSLATION A');
    expect(b?.translation).toBe('TRANSLATION B');
  });

  it('does not return one provider\'s cached output to another provider', async () => {
    const text = 'Hello world';
    await translationCache.set(text, 'CLAUDE OUTPUT', 'en-fa', 'claude', 'auto');

    const claudeHit = await translationCache.get(text, 'claude', 'auto');
    const geminiMiss = await translationCache.get(text, 'gemini', 'auto');

    expect(claudeHit?.translation).toBe('CLAUDE OUTPUT');
    expect(geminiMiss).toBeNull();
  });

  it('produces a stable 64-char hex key for the same input', async () => {
    const k1 = await translationCache.hashKey('hello', 'claude', 'auto');
    const k2 = await translationCache.hashKey('hello', 'claude', 'auto');
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('persists corrections / alternatives / examples / nuance and returns them on hit', async () => {
    const rich = {
      corrections: [{ original: 'whit', corrected: 'white' }],
      alternatives: ['snowy', 'pale'],
      examples: [{ source: 'white wall', target: 'دیوار سفید' }],
      nuance: 'Refers to a neutral color.'
    };
    await translationCache.set('whit', 'سفید', 'en-fa', 'claude', 'auto', rich);

    const hit = await translationCache.get('whit', 'claude', 'auto');
    expect(hit?.translation).toBe('سفید');
    expect(hit?.corrections).toEqual(rich.corrections);
    expect(hit?.alternatives).toEqual(rich.alternatives);
    expect(hit?.examples).toEqual(rich.examples);
    expect(hit?.nuance).toBe(rich.nuance);
  });

  it('omits rich fields from the stored entry when not provided', async () => {
    await translationCache.set('long sentence with no rich context', 'جمله بلند', 'en-fa', 'claude', 'auto');
    const hit = await translationCache.get('long sentence with no rich context', 'claude', 'auto');
    expect(hit?.translation).toBe('جمله بلند');
    expect(hit?.corrections).toBeUndefined();
    expect(hit?.alternatives).toBeUndefined();
    expect(hit?.examples).toBeUndefined();
    expect(hit?.nuance).toBeUndefined();
  });
});
