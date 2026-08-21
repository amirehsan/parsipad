import { describe, it, expect, beforeEach, vi } from 'vitest';

function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return data.has(key) ? { [key]: data.get(key) } : {}; },
        async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, v); },
        async remove(key) { data.delete(key); }
      }
    }
  };
}

describe('translation history', () => {
  let history;

  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    history = await import('../lib/history.js');
    await history.clearHistory();
  });

  it('stores structured entries capped at 4000 characters', async () => {
    const long = 'x'.repeat(5000);
    await history.addToHistory({ original: long, translation: long, direction: 'en-fa', mode: 'text', result: { translation: long, note: 'n' } });
    const [entry] = await history.getHistory();
    expect(entry.original).toHaveLength(4000);
    expect(entry.translation).toHaveLength(4000);
    expect(entry.mode).toBe('text');
    expect(entry.result.note).toBe('n');
    expect(entry.direction).toBe('en-fa');
  });

  it('accepts the legacy positional signature', async () => {
    await history.addToHistory('hello', 'سلام', 'en-fa');
    const [entry] = await history.getHistory();
    expect(entry).toMatchObject({ original: 'hello', translation: 'سلام', direction: 'en-fa' });
    expect(entry.mode).toBeUndefined();
  });

  it('moves a repeated original to the top instead of duplicating', async () => {
    await history.addToHistory({ original: 'one', translation: '1', direction: 'en-fa' });
    await history.addToHistory({ original: 'two', translation: '2', direction: 'en-fa' });
    await history.addToHistory({ original: 'ONE', translation: '1b', direction: 'en-fa' });
    const list = await history.getHistory();
    expect(list.map(e => e.original)).toEqual(['ONE', 'two']);
  });
});
