// tests/block-anchor.test.js
import { describe, it, expect } from 'vitest';
import { computeIconPosition } from '../content/blocks/anchor.js';

const viewport = { width: 1200, height: 800 };
const icon = { width: 24, height: 24 };
const base = { icon, viewport, padding: 4 };

// The fixture used for the corner-straddle assertions below. Its viewport is
// deliberately its own (1024x768) rather than the shared `base.viewport`,
// matching the geometry the expected numbers were computed against.
const cornerBlock = { top: 300, left: 200, right: 800, bottom: 360 };
const cornerViewport = { width: 1024, height: 768 };

describe('computeIconPosition', () => {
  it('straddles the block top edge so it lands in the paragraph margin', () => {
    const r = computeIconPosition({ ...base, viewport: cornerViewport, block: cornerBlock });
    expect(r.top).toBe(288);
  });

  it('straddles the inline-end corner in LTR', () => {
    const r = computeIconPosition({ ...base, viewport: cornerViewport, block: cornerBlock });
    expect(r.placement).toBe('corner');
    expect(r.left).toBe(788);
  });

  it('mirrors to the inline-start corner in RTL', () => {
    const r = computeIconPosition({ ...base, viewport: cornerViewport, dir: 'rtl', block: cornerBlock });
    expect(r.placement).toBe('corner');
    expect(r.left).toBe(188);
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
