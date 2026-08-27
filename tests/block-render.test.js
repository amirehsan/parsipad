// tests/block-render.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderSkeleton, setPartText, setPartError, addFooter, dismissBlock, clearPartsFrom,
  hasRendered, activeBlockIds, sweepDetached, clearAllRendered, renderedTextFor
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

describe('index alignment when a part is disconnected before render', () => {
  // renderedTextFor reads through the closed shadow root, so the alignment
  // test below can assert where translated content actually landed rather
  // than only that a call did not throw. The other tests in this block still
  // do not depend on content placement.
  it('keeps part indices aligned when a part detaches before render', () => {
    document.body.innerHTML = `<div id="w"><p id="a">${LONG} A</p><p id="b">${LONG} B</p><p id="c">${LONG} C</p></div>`;
    const parts = ['a', 'b', 'c'].map((id) => document.getElementById(id));
    parts[1].remove();
    renderSkeleton({ id: 'pp-b1', kind: 'section', anchor: parts[0], parts, truncated: false });

    setPartText('pp-b1', 0, 'A translated');
    setPartText('pp-b1', 2, 'C translated');

    // Index 2 must reach the third paragraph's slot, not the second surviving
    // one. Under a compacting filter, parts[2] is out of bounds and C's text is
    // dropped, while a write to index 1 would land under C instead.
    expect(renderedTextFor('pp-b1', 0)).toBe('A translated');
    expect(renderedTextFor('pp-b1', 2)).toBe('C translated');

    // Index 1 is the hole. Writing there must reach nothing at all.
    setPartText('pp-b1', 1, 'must not appear');
    expect(renderedTextFor('pp-b1', 1)).toBeNull();
    expect(renderedTextFor('pp-b1', 2)).toBe('C translated');
  });

  it('writes each part independently without disturbing its neighbours', () => {
    document.body.innerHTML = `<div id="w"><p id="a">${LONG} A</p><p id="b">${LONG} B</p></div>`;
    const parts = ['a', 'b'].map((id) => document.getElementById(id));
    renderSkeleton({ id: 'pp-b1', kind: 'section', anchor: parts[0], parts, truncated: false });

    setPartText('pp-b1', 0, 'first');
    setPartText('pp-b1', 1, 'second');
    expect(renderedTextFor('pp-b1', 0)).toBe('first');
    expect(renderedTextFor('pp-b1', 1)).toBe('second');

    // A later write replaces only its own part, which is what streaming does.
    setPartText('pp-b1', 0, 'first, revised');
    expect(renderedTextFor('pp-b1', 0)).toBe('first, revised');
    expect(renderedTextFor('pp-b1', 1)).toBe('second');
  });

  it('dismisses cleanly when a slot is a hole', () => {
    document.body.innerHTML = `<div id="w"><p id="a">${LONG} A</p><p id="b">${LONG} B</p></div>`;
    const parts = ['a', 'b'].map((id) => document.getElementById(id));
    parts[1].remove();
    const before = document.getElementById('w').outerHTML;
    renderSkeleton({ id: 'pp-b1', kind: 'section', anchor: parts[0], parts, truncated: false });

    expect(() => dismissBlock('pp-b1')).not.toThrow();
    expect(document.getElementById('w').outerHTML).toBe(before);
    expect(activeBlockIds()).toEqual([]);
  });

  it('prunes a slot whose host and source are both gone, keeping the rest aligned', () => {
    document.body.innerHTML = `<div id="w"><p id="a">${LONG} A</p><p id="b">${LONG} B</p></div>`;
    const parts = ['a', 'b'].map((id) => document.getElementById(id));
    renderSkeleton({ id: 'pp-b1', kind: 'section', anchor: parts[0], parts, truncated: false });

    // Second paragraph and its translation both torn out by a re-render.
    document.getElementById('b').nextElementSibling.remove();
    document.getElementById('b').remove();
    sweepDetached();

    // The block survives on its remaining live part rather than being dropped.
    expect(activeBlockIds()).toEqual(['pp-b1']);
    expect(document.querySelectorAll('[data-parsipad-translation]').length).toBe(1);
  });

  it('addFooter is inert for an unknown block and safe for a valid one', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    expect(() => addFooter('pp-nope', { truncated: false, partCount: 0 })).not.toThrow();

    renderSkeleton(blockOf(['p']));
    expect(() => addFooter('pp-b1', { truncated: true, partCount: 7 })).not.toThrow();
    expect(activeBlockIds()).toEqual(['pp-b1']);
  });

  it('setPartText is inert for an unknown block or an out-of-range index', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(() => setPartText('pp-nope', 0, 'x')).not.toThrow();
    expect(() => setPartText('pp-b1', 9, 'x')).not.toThrow();
    expect(document.querySelectorAll('[data-parsipad-translation]').length).toBe(1);
  });

  it('drops a block whose parts are all cleared', () => {
    document.body.innerHTML = `<div id="w"><p id="a">${LONG} A</p><p id="b">${LONG} B</p></div>`;
    const parts = ['a', 'b'].map((id) => document.getElementById(id));
    renderSkeleton({ id: 'pp-b1', kind: 'section', anchor: parts[0], parts, truncated: false });

    clearPartsFrom('pp-b1', 0);

    expect(hasRendered('pp-b1')).toBe(false);
    expect(activeBlockIds()).toEqual([]);
    expect(document.querySelectorAll('[data-parsipad-translation]').length).toBe(0);
  });
});
