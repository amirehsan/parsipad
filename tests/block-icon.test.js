// tests/block-icon.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  showIconFor, hideIcon, destroyIcon, isIconElement, currentIconBlock, repositionIcon
} from '../content/blocks/icon.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function blockFor(el) {
  return { id: 'pp-b1', kind: 'leaf', anchor: el, parts: [el], truncated: false };
}

beforeEach(() => {
  destroyIcon();
  document.body.innerHTML = `<p id="p">${LONG}</p>`;
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
});

describe('the hover icon', () => {
  it('mounts exactly one host element', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    expect(document.querySelectorAll('[data-parsipad-icon]').length).toBe(1);
  });

  it('reuses that host across repeated shows rather than stacking them', () => {
    const block = blockFor(document.getElementById('p'));
    showIconFor(block, vi.fn());
    showIconFor(block, vi.fn());
    showIconFor(block, vi.fn());
    expect(document.querySelectorAll('[data-parsipad-icon]').length).toBe(1);
  });

  it('does not add the source element to the page', () => {
    const before = document.getElementById('p').outerHTML;
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    expect(document.getElementById('p').outerHTML).toBe(before);
  });

  it('positions the host with fixed positioning and the maximum z-index', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    const host = document.querySelector('[data-parsipad-icon]');
    expect(host.style.position).toBe('fixed');
    expect(host.style.zIndex).toBe('2147483647');
  });

  it('lets pointer events through the host but not the button', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    const host = document.querySelector('[data-parsipad-icon]');
    expect(host.style.pointerEvents).toBe('none');
  });

  it('hides without removing the host, so the next show is a move', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    hideIcon();
    const host = document.querySelector('[data-parsipad-icon]');
    expect(host).not.toBeNull();
    expect(host.getAttribute('data-visible')).toBe('false');
  });

  it('recognises its own host, so the resolver can skip it', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    expect(isIconElement(document.querySelector('[data-parsipad-icon]'))).toBe(true);
    expect(isIconElement(document.getElementById('p'))).toBe(false);
  });

  it('positions the host from the block rect', () => {
    const p = document.getElementById('p');
    p.getBoundingClientRect = () => ({ top: 300, left: 200, right: 800, bottom: 360, width: 600, height: 60 });
    showIconFor(blockFor(p), vi.fn());

    const host = document.querySelector('[data-parsipad-icon]');
    // Straddles the block's top edge: 300 - 24/2. Sits outside the inline-start
    // edge with room to spare: 200 - 24 - 6. Distinct values, so a swapped
    // top/left assignment fails here rather than passing by symmetry.
    expect(host.style.top).toBe('288px');
    expect(host.style.left).toBe('170px');
  });

  it('mirrors to the far edge when the block is right-to-left', () => {
    const p = document.getElementById('p');
    p.style.direction = 'rtl';
    p.getBoundingClientRect = () => ({ top: 300, left: 200, right: 800, bottom: 360, width: 600, height: 60 });
    showIconFor(blockFor(p), vi.fn());

    const host = document.querySelector('[data-parsipad-icon]');
    // Outside the right edge instead: 800 + 6. An inverted direction check
    // would give 170px here.
    expect(host.style.left).toBe('806px');
  });

  it('forgets its block on hide, so a later click cannot fire on a stale one', () => {
    const p = document.getElementById('p');
    showIconFor(blockFor(p), vi.fn());
    expect(currentIconBlock().id).toBe('pp-b1');

    hideIcon();
    expect(currentIconBlock()).toBeNull();
  });

  it('hides itself when its anchor is torn out of the page', () => {
    const p = document.getElementById('p');
    showIconFor(blockFor(p), vi.fn());
    expect(document.querySelector('[data-parsipad-icon]').getAttribute('data-visible')).toBe('true');

    p.remove();
    repositionIcon();

    expect(document.querySelector('[data-parsipad-icon]').getAttribute('data-visible')).toBe('false');
    expect(currentIconBlock()).toBeNull();
  });

  it('refuses to show for an anchor that is already detached', () => {
    const p = document.getElementById('p');
    p.remove();
    showIconFor(blockFor(p), vi.fn());

    const host = document.querySelector('[data-parsipad-icon]');
    // Either no host was built, or it was built and left hidden. What must not
    // happen is a visible icon with no block behind it, which looks live and
    // does nothing when clicked.
    expect(host === null || host.getAttribute('data-visible') === 'false').toBe(true);
    expect(currentIconBlock()).toBeNull();
  });
});
