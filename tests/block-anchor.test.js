// tests/block-anchor.test.js
import { describe, it, expect } from 'vitest';
import { computeIconPosition } from '../content/blocks/anchor.js';

const viewport = { width: 1200, height: 800 };
const icon = { width: 24, height: 24 };
const base = { icon, viewport, gutter: 6, padding: 4 };

describe('computeIconPosition', () => {
  it('sits outside the inline-start edge when the margin has room', () => {
    const r = computeIconPosition({ ...base, block: { top: 200, left: 300, right: 900, bottom: 260 } });
    expect(r.placement).toBe('outside');
    expect(r.left).toBe(300 - 24 - 6);
  });

  it('straddles the block top edge so it lands in the paragraph margin', () => {
    const r = computeIconPosition({ ...base, block: { top: 200, left: 300, right: 900, bottom: 260 } });
    expect(r.top).toBe(200 - 12);
  });

  it('falls back to flush with the edge when there is no room outside', () => {
    const r = computeIconPosition({ ...base, block: { top: 200, left: 8, right: 900, bottom: 260 } });
    expect(r.placement).toBe('inset');
    expect(r.left).toBe(8);
  });

  it('mirrors to the right edge in RTL', () => {
    const r = computeIconPosition({ ...base, dir: 'rtl', block: { top: 200, left: 300, right: 900, bottom: 260 } });
    expect(r.placement).toBe('outside');
    expect(r.left).toBe(900 + 6);
  });

  it('insets against the right edge in RTL when the margin is too narrow', () => {
    const r = computeIconPosition({ ...base, dir: 'rtl', block: { top: 200, left: 300, right: 1190, bottom: 260 } });
    expect(r.placement).toBe('inset');
    expect(r.left).toBe(1190 - 24);
  });

  it('clamps a block scrolled above the viewport to the top padding', () => {
    const r = computeIconPosition({ ...base, block: { top: -50, left: 300, right: 900, bottom: 20 } });
    expect(r.top).toBe(4);
  });

  it('clamps a block below the viewport to the bottom padding', () => {
    const r = computeIconPosition({ ...base, block: { top: 900, left: 300, right: 900, bottom: 960 } });
    expect(r.top).toBe(800 - 24 - 4);
  });

  it('degrades to the padding rather than a negative offset in a viewport narrower than the icon', () => {
    const r = computeIconPosition({
      ...base,
      viewport: { width: 20, height: 800 },
      block: { top: 200, left: 0, right: 20, bottom: 260 }
    });
    expect(r.left).toBe(4);
  });
});
