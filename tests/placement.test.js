// tests/placement.test.js
import { describe, it, expect } from 'vitest';
import { computeBoxPosition } from '../content/placement.js';

const viewport = { width: 1200, height: 800 };
const scroll = { x: 0, y: 0 };
const box = { width: 450, height: 400 };
const base = { box, viewport, scroll, gap: 8, padding: 12 };

describe('computeBoxPosition', () => {
  it('places the box below the selection when there is room', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 100, bottom: 120, left: 200 } });
    expect(r.placement).toBe('below');
    expect(r.top).toBe(128);
    expect(r.left).toBe(200);
  });

  it('flips above when there is not room below and more room above', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 700, bottom: 720, left: 200 } });
    expect(r.placement).toBe('above');
    expect(r.top).toBe(700 - 400 - 8);
  });

  it('uses the real box height when flipping, not a guess', () => {
    const tall = computeBoxPosition({ ...base, box: { width: 450, height: 600 }, selection: { top: 700, bottom: 720, left: 200 } });
    expect(tall.top).toBe(700 - 600 - 8);
  });

  it('clamps to the top padding rather than going off the top edge', () => {
    const r = computeBoxPosition({ ...base, box: { width: 450, height: 900 }, selection: { top: 700, bottom: 720, left: 200 } });
    expect(r.top).toBe(12);
  });

  it('clamps the right edge', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 100, bottom: 120, left: 1100 } });
    expect(r.left).toBe(1200 - 450 - 12);
  });

  it('clamps the left edge', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 100, bottom: 120, left: -50 } });
    expect(r.left).toBe(12);
  });

  it('falls back to the padding when the box is wider than the viewport', () => {
    const r = computeBoxPosition({ ...base, box: { width: 2000, height: 400 }, viewport: { width: 500, height: 800 }, selection: { top: 100, bottom: 120, left: 100 } });
    expect(r.left).toBe(12);
  });

  it('returns page coordinates by adding the scroll offset', () => {
    const r = computeBoxPosition({ ...base, scroll: { x: 30, y: 500 }, selection: { top: 100, bottom: 120, left: 200 } });
    expect(r.top).toBe(628);
    expect(r.left).toBe(230);
  });

  it('stays below when neither side has room, choosing the larger space', () => {
    const r = computeBoxPosition({ ...base, box: { width: 450, height: 700 }, selection: { top: 300, bottom: 320, left: 200 } });
    expect(r.placement).toBe('below');
  });
});
