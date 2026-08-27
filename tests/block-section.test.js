// tests/block-section.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { isHeading, headingRank, rowElementFor, resolveSection, SECTION_MAX_PARTS } from '../content/blocks/section.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function mount(html) {
  document.body.innerHTML = html;
  return document.body;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('isHeading and headingRank', () => {
  it('recognises h1 through h6', () => {
    mount('<h3 id="h">Title</h3>');
    expect(isHeading(document.getElementById('h'))).toBe(true);
    expect(headingRank(document.getElementById('h'))).toBe(3);
  });

  it('recognises role=heading and reads aria-level', () => {
    mount('<div id="h" role="heading" aria-level="4">Title</div>');
    expect(isHeading(document.getElementById('h'))).toBe(true);
    expect(headingRank(document.getElementById('h'))).toBe(4);
  });

  it('defaults role=heading with no aria-level to rank 2', () => {
    mount('<div id="h" role="heading">Title</div>');
    expect(headingRank(document.getElementById('h'))).toBe(2);
  });
});

describe('rowElementFor', () => {
  it('returns the heading itself when it has real siblings', () => {
    mount(`<div><h2 id="h">Title</h2><p>${LONG}</p></div>`);
    const h = document.getElementById('h');
    expect(rowElementFor(h)).toBe(h);
  });

  it('returns the wrapper when the heading is alone inside it', () => {
    mount(`<div><div class="mw-heading" id="w"><h2 id="h">Title</h2></div><p>${LONG}</p></div>`);
    expect(rowElementFor(document.getElementById('h'))).toBe(document.getElementById('w'));
  });

  it('returns the wrapper when its only other child is an edit link', () => {
    mount(`<div><div class="mw-heading" id="w"><h2 id="h">History</h2><span><a href="#">edit</a></span></div><p>${LONG}</p></div>`);
    expect(rowElementFor(document.getElementById('h'))).toBe(document.getElementById('w'));
  });
});

describe('resolveSection', () => {
  it('collects following siblings up to the next heading of equal rank', () => {
    mount(`
      <div>
        <h2 id="a">First</h2>
        <p>${LONG} one</p>
        <p>${LONG} two</p>
        <h2 id="b">Second</h2>
        <p>${LONG} three</p>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(3);
    expect(parts[0].id).toBe('a');
    expect(parts.some((p) => p.textContent.includes('three'))).toBe(false);
  });

  it('stops at a higher-rank heading but swallows a lower-rank one', () => {
    mount(`
      <div>
        <h3 id="a">Sub</h3>
        <p>${LONG} one</p>
        <h4 id="b">Deeper</h4>
        <p>${LONG} two</p>
        <h2 id="c">Next chapter</h2>
        <p>${LONG} three</p>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.map((p) => p.id).filter(Boolean)).toEqual(['a', 'b']);
    expect(parts.length).toBe(4);
  });

  it('treats a wrapping <section> as the unit when the heading opens it', () => {
    mount(`
      <section id="s">
        <h2 id="a">Title</h2>
        <p>${LONG} one</p>
        <p>${LONG} two</p>
      </section>
      <p>${LONG} outside</p>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(3);
    expect(parts.some((p) => p.textContent.includes('outside'))).toBe(false);
  });

  it('handles the Wikipedia heading wrapper', () => {
    mount(`
      <div>
        <div class="mw-heading"><h2 id="a">History</h2><span><a href="#">edit</a></span></div>
        <p>${LONG} one</p>
        <div class="mw-heading"><h2 id="b">Legacy</h2></div>
        <p>${LONG} two</p>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.some((p) => p.textContent.includes('one'))).toBe(true);
    expect(parts.some((p) => p.textContent.includes('two'))).toBe(false);
  });

  it('descends to inner paragraphs rather than taking a wrapper whole', () => {
    mount(`
      <div>
        <h2 id="a">Title</h2>
        <div><p>${LONG} one</p><p>${LONG} two</p></div>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(3);
    expect(parts[1].tagName).toBe('P');
  });

  it('keeps a short list as one part instead of splitting it', () => {
    // textContent concatenates list items without separators, so the <ul> reads
    // as "alpha onebeta twogamma threedelta four", 38 chars and 5 words, which
    // clears the floors, while no single <li> does.
    mount(`
      <div>
        <h2 id="a">Title</h2>
        <ul><li>alpha one</li><li>beta two</li><li>gamma three</li><li>delta four</li></ul>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(2);
    expect(parts[1].tagName).toBe('UL');
  });

  it('caps runaway sections and reports the truncation', () => {
    const paras = Array.from({ length: 60 }, (_, i) => `<p>${LONG} ${i}</p>`).join('');
    mount(`<div><h2 id="a">Title</h2>${paras}</div>`);
    const { parts, truncated } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBeLessThanOrEqual(SECTION_MAX_PARTS);
    expect(truncated).toBe(true);
  });

  it('reports no truncation for a section that fits', () => {
    mount(`<div><h2 id="a">Title</h2><p>${LONG}</p></div>`);
    expect(resolveSection(document.getElementById('a')).truncated).toBe(false);
  });

  it('stops at a same-rank heading buried after a deeper one', () => {
    mount(`
      <div>
        <h2 id="a">First</h2>
        <div id="mixed">
          <h6>tiny aside heading here now</h6>
          <p>${LONG} filler</p>
          <h2 id="next">Actually next section</h2>
          <p>${LONG} leaked</p>
        </div>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.some((p) => p.id === 'next')).toBe(false);
    expect(parts.some((p) => p.textContent.includes('leaked'))).toBe(false);
  });

  it('does not promote past a wrapper child holding real prose', () => {
    mount(`
      <div id="wrap">
        <h2 id="a">Title</h2>
        <span>short one</span><span>short two</span>
      </div>
      <p id="outside">${LONG}</p>`);
    expect(rowElementFor(document.getElementById('a')).id).toBe('a');
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.some((p) => p.id === 'outside')).toBe(false);
  });

  it('still promotes past a wrapper child that is entirely a link', () => {
    mount(`
      <div>
        <div class="mw-heading" id="w"><h2 id="a">History</h2><span><a href="#">edit this section</a></span></div>
        <p>${LONG}</p>
      </div>`);
    expect(rowElementFor(document.getElementById('a')).id).toBe('w');
  });
});
