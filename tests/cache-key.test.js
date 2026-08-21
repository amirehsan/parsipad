import { describe, it, expect } from 'vitest';
import { buildCacheKeyParts, hashContext } from '../lib/translation/cache-key.js';

describe('cache key', () => {
  it('orders parts as provider, mode, direction, contextHash, text', () => {
    expect(buildCacheKeyParts({ provider: 'claude', mode: 'word', direction: 'en-fa', text: 'charge', contextHash: 'abc' }))
      .toEqual(['claude', 'word', 'en-fa', 'abc', 'charge']);
    expect(buildCacheKeyParts({ provider: 'claude', mode: 'text', direction: 'en-fa', text: 'long' }))
      .toEqual(['claude', 'text', 'en-fa', '', 'long']);
  });
  it('hashes context only when there is some', async () => {
    expect(await hashContext(undefined)).toBe('');
    expect(await hashContext({ before: '', after: '' })).toBe('');
    const a = await hashContext({ before: 'they will ', after: ' you' });
    const b = await hashContext({ before: 'a bad ', after: ' of luck' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
