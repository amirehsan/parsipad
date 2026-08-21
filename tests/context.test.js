import { describe, it, expect } from 'vitest';
import { sliceContext } from '../content/context.js';

const block = 'Library policies apply to everyone. They will charge you a fee for late returns, and a second charge applies after thirty days.';

describe('sliceContext', () => {
  it('returns text before and after the first occurrence at or after the anchor', () => {
    const ctx = sliceContext(block, 'charge', { maxChars: 30, anchorOffset: 0 });
    expect(ctx.before.endsWith('They will ')).toBe(true);
    expect(ctx.after.startsWith(' you a fee')).toBe(true);
    expect(ctx.before.length).toBeLessThanOrEqual(30);
    expect(ctx.after.length).toBeLessThanOrEqual(30);
  });
  it('uses the anchor offset to pick the right occurrence', () => {
    const second = block.indexOf('second');
    const ctx = sliceContext(block, 'charge', { maxChars: 40, anchorOffset: second });
    expect(ctx.before.endsWith('a second ')).toBe(true);
    expect(ctx.after.startsWith(' applies')).toBe(true);
  });
  it('cuts at word boundaries when the window is clipped', () => {
    const ctx = sliceContext(block, 'charge', { maxChars: 12, anchorOffset: 0 });
    expect(ctx.before).toBe('They will ');
    expect(ctx.after).toBe(' you a fee');
  });
  it('collapses whitespace and tolerates a missing selection', () => {
    expect(sliceContext('a\n\n  b  charge c', 'charge', { maxChars: 50 })).toEqual({ before: 'a b ', after: ' c' });
    expect(sliceContext(block, 'missing')).toBeUndefined();
    expect(sliceContext('', 'charge')).toBeUndefined();
  });
  it('returns undefined when the selection is the whole block', () => {
    expect(sliceContext('charge', 'charge')).toBeUndefined();
  });
});
