// tests/block-render.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderSkeleton, setPartText, setPartError, dismissBlock,
  hasRendered, activeBlockIds, sweepDetached, clearAllRendered
} from '../content/blocks/render.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function blockOf(ids, kind = 'leaf') {
  const parts = ids.map((id) => document.getElementById(id));
  return { id: 'pp-b1', kind, anchor: parts[0], parts, truncated: false };
}

beforeEach(() => {
  clearAllRendered();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
});

describe('the append-only guarantee', () => {
  it('leaves the source element byte-identical after a full render', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    const before = document.getElementById('p').outerHTML;

    const block = blockOf(['p']);
    renderSkeleton(block);
    setPartText('pp-b1', 0, 'ترجمه فارسی');

    expect(document.getElementById('p').outerHTML).toBe(before);
  });

  it('leaves every source element of a section byte-identical', () => {
    document.body.innerHTML = `<div id="w"><h2 id="h">Title</h2><p id="a">${LONG}</p><p id="b">${LONG}</p></div>`;
    const before = ['h', 'a', 'b'].map((id) => document.getElementById(id).outerHTML);

    const block = blockOf(['h', 'a', 'b'], 'section');
    renderSkeleton(block);
    setPartText('pp-b1', 0, 'یک');
    setPartText('pp-b1', 1, 'دو');
    setPartText('pp-b1', 2, 'سه');

    expect(['h', 'a', 'b'].map((id) => document.getElementById(id).outerHTML)).toEqual(before);
  });

  it('restores the parent exactly on dismiss', () => {
    document.body.innerHTML = `<div id="w"><p id="p">${LONG}</p></div>`;
    const before = document.getElementById('w').outerHTML;

    renderSkeleton(blockOf(['p']));
    setPartText('pp-b1', 0, 'ترجمه');
    dismissBlock('pp-b1');

    expect(document.getElementById('w').outerHTML).toBe(before);
  });
});

describe('renderSkeleton', () => {
  it('inserts one host immediately after each part', () => {
    document.body.innerHTML = `<div id="w"><p id="a">${LONG}</p><p id="b">${LONG}</p></div>`;
    renderSkeleton(blockOf(['a', 'b'], 'section'));

    expect(document.getElementById('a').nextElementSibling.hasAttribute('data-parsipad-translation')).toBe(true);
    expect(document.getElementById('b').nextElementSibling.hasAttribute('data-parsipad-translation')).toBe(true);
  });

  it('tags every host with the block id', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]').getAttribute('data-parsipad-translation')).toBe('pp-b1');
  });

  it('does not insert twice for the same block', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    renderSkeleton(blockOf(['p']));
    expect(document.querySelectorAll('[data-parsipad-translation]').length).toBe(1);
  });

  it('registers the Persian font', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(document.getElementById('parsipad-persian-font')).not.toBeNull();
  });

  it('spans the full row inside a flex parent', () => {
    document.body.innerHTML = `<div id="w" style="display: flex"><p id="p">${LONG}</p></div>`;
    renderSkeleton(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]').style.flexBasis).toBe('100%');
  });

  it('spans all columns inside a grid parent', () => {
    document.body.innerHTML = `<div id="w" style="display: grid"><p id="p">${LONG}</p></div>`;
    renderSkeleton(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]').style.gridColumn).toBe('1 / -1');
  });
});

describe('lifecycle', () => {
  it('tracks and reports active blocks', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(hasRendered('pp-b1')).toBe(true);
    expect(activeBlockIds()).toEqual(['pp-b1']);
  });

  it('re-inserts a translation a site re-render removed', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    setPartText('pp-b1', 0, 'ترجمه');

    document.querySelector('[data-parsipad-translation]').remove();
    sweepDetached();

    const restored = document.querySelector('[data-parsipad-translation]');
    expect(restored).not.toBeNull();
  });

  it('drops the record when the source element is gone too', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    document.body.innerHTML = '';
    sweepDetached();
    expect(activeBlockIds()).toEqual([]);
  });

  it('forgets the block after dismiss', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    dismissBlock('pp-b1');
    expect(hasRendered('pp-b1')).toBe(false);
    expect(activeBlockIds()).toEqual([]);
  });
});

describe('setPartError', () => {
  // The shadow root is closed, matching the floating box and selection popup,
  // so a test cannot reach the retry button. These assert the observable
  // contract instead: the node survives an error so the user can retry, and a
  // stale block id is inert rather than throwing.
  it('keeps the translation node on screen after an error', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    setPartError('pp-b1', 0, 'Something failed', vi.fn());

    expect(document.querySelector('[data-parsipad-translation]')).not.toBeNull();
    expect(activeBlockIds()).toEqual(['pp-b1']);
  });

  it('ignores an unknown block id without throwing', () => {
    expect(() => setPartError('pp-nope', 0, 'x', vi.fn())).not.toThrow();
  });

  it('ignores an out-of-range part index without throwing', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(() => setPartError('pp-b1', 7, 'x', vi.fn())).not.toThrow();
  });
});
