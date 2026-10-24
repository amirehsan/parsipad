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

describe('computeBoxPosition, preferring above and centred (the selection toolbar)', () => {
  const toolbar = { width: 150, height: 40 };
  const view = { width: 1000, height: 800 };
  const above = { box: toolbar, viewport: view, scroll, gap: 8, padding: 12, prefer: 'above', align: 'center' };

  it('prefers above and centers when asked, using the real size', () => {
    const r = computeBoxPosition({ selection: { top: 300, bottom: 320, left: 400, right: 500 }, box: { width: 150, height: 40 },
      viewport: { width: 1000, height: 800 }, scroll: { x: 0, y: 0 }, gap: 8, padding: 12, prefer: 'above', align: 'center' });
    expect(r).toEqual({ top: 252, left: 375, placement: 'above' });
  });

  it('flips below, still centred, when the selection is too near the top edge', () => {
    const r = computeBoxPosition({ ...above, selection: { top: 30, bottom: 50, left: 400, right: 500 } });
    expect(r).toEqual({ top: 58, left: 375, placement: 'below' });
  });

  it('stays above while it just fits', () => {
    const r = computeBoxPosition({ ...above, selection: { top: 48, bottom: 68, left: 400, right: 500 } });
    expect(r.placement).toBe('above');
    expect(r.top).toBe(12);
  });

  it('clamps a centred box at the left edge', () => {
    const r = computeBoxPosition({ ...above, selection: { top: 300, bottom: 320, left: 0, right: 20 } });
    expect(r.left).toBe(12);
  });

  it('clamps a centred box at the right edge', () => {
    const r = computeBoxPosition({ ...above, selection: { top: 300, bottom: 320, left: 980, right: 1000 } });
    expect(r.left).toBe(1000 - 150 - 12);
  });

  it('centres on the left edge when the selection has no right edge', () => {
    const r = computeBoxPosition({ ...above, selection: { top: 300, bottom: 320, left: 400 } });
    expect(r.left).toBe(400 - 75);
  });

  it('stays above, clamped to the top padding, when a selection fills the viewport', () => {
    const r = computeBoxPosition({ ...above, selection: { top: 20, bottom: 790, left: 100, right: 900 } });
    expect(r.placement).toBe('above');
    expect(r.top).toBe(12);
  });

  it('comes to rest inside the viewport when the selection is scrolled out below it', () => {
    const r = computeBoxPosition({ ...above, selection: { top: 1000, bottom: 1020, left: 400, right: 500 } });
    expect(r.top).toBe(800 - 40 - 12);
  });

  it('adds the scroll offset to the centred position', () => {
    const r = computeBoxPosition({ ...above, scroll: { x: 30, y: 500 }, selection: { top: 300, bottom: 320, left: 400, right: 500 } });
    expect(r).toEqual({ top: 752, left: 405, placement: 'above' });
  });

  it('never leaves the viewport, wherever the selection is', () => {
    for (const box of [toolbar, { width: 190, height: 46 }]) {
      for (let top = -1200; top <= 2000; top += 37) {
        for (const height of [16, 200, 760, 3000]) {
          for (let left = -300; left <= 1200; left += 113) {
            for (const width of [10, 400]) {
              const selection = { top, bottom: top + height, left, right: left + width };
              const r = computeBoxPosition({ ...above, box, selection });
              const where = JSON.stringify(selection);
              expect(r.top, where).toBeGreaterThanOrEqual(12);
              expect(r.top + box.height, where).toBeLessThanOrEqual(view.height - 12);
              expect(r.left, where).toBeGreaterThanOrEqual(12);
              expect(r.left + box.width, where).toBeLessThanOrEqual(view.width - 12);
            }
          }
        }
      }
    }
  });
});

describe('computeBoxPosition defaults (the floating box)', () => {
  it('keeps start alignment and the below preference when neither is given', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 100, bottom: 120, left: 200, right: 600 } });
    expect(r).toEqual({ top: 128, left: 200, placement: 'below' });
  });

  it('flips above instead of following a selection scrolled out below the viewport', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 900, bottom: 920, left: 200 } });
    expect(r.placement).toBe('above');
    expect(r.top).toBe(800 - 400 - 12);
  });

  it('keeps a box over a selection longer than the viewport on screen', () => {
    const r = computeBoxPosition({ ...base, box: { width: 400, height: 400 }, viewport: { width: 1000, height: 800 },
      selection: { top: -500, bottom: 3000, left: 200 } });
    expect(r).toEqual({ top: 12, left: 200, placement: 'above' });
  });

  it('comes down to the top padding when the selection is scrolled out above', () => {
    const r = computeBoxPosition({ ...base, selection: { top: -100, bottom: -80, left: 200 } });
    expect(r.placement).toBe('below');
    expect(r.top).toBe(12);
  });

  it('never leaves the viewport, wherever the selection is', () => {
    const view = { width: 1000, height: 800 };
    for (const box of [{ width: 400, height: 400 }, { width: 450, height: 600 }]) {
      for (let top = -1200; top <= 2000; top += 37) {
        for (const height of [16, 200, 760, 3500]) {
          for (let left = -300; left <= 1200; left += 113) {
            const selection = { top, bottom: top + height, left };
            const r = computeBoxPosition({ ...base, box, viewport: view, selection });
            const where = JSON.stringify(selection);
            expect(r.top, where).toBeGreaterThanOrEqual(12);
            expect(r.top + box.height, where).toBeLessThanOrEqual(view.height - 12);
            expect(r.left, where).toBeGreaterThanOrEqual(12);
            expect(r.left + box.width, where).toBeLessThanOrEqual(view.width - 12);
          }
        }
      }
    }
  });
});
