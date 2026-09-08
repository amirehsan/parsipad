// tests/block-describe.test.js
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { describeElement, elementText } from '../content/blocks/describe.js';

function el(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild;
}

describe('describeElement', () => {
  it('measures trimmed text length and word count', () => {
    const facts = describeElement(el('<p>  one two three four  </p>'));
    expect(facts.textLength).toBe(18);
    expect(facts.wordCount).toBe(4);
  });

  it('sums the text of descendant links', () => {
    const facts = describeElement(el('<p>alpha <a href="#">beta</a> gamma <a href="#">delta</a></p>'));
    expect(facts.linkTextLength).toBe(9);
  });

  it('counts an anchor element as entirely link text', () => {
    const facts = describeElement(el('<a href="#">a fairly long link caption here</a>'));
    expect(facts.linkTextLength).toBe(facts.textLength);
  });

  it('counts role=link the same as an anchor', () => {
    const facts = describeElement(el('<div role="link">a fairly long link caption here</div>'));
    expect(facts.linkTextLength).toBe(facts.textLength);
  });

  it('joins class and id for the class/id penalty', () => {
    const facts = describeElement(el('<div class="promo box" id="top-ad">x</div>'));
    expect(facts.classId).toContain('promo');
    expect(facts.classId).toContain('top-ad');
  });

  it('reports zero words for whitespace-only content', () => {
    const facts = describeElement(el('<p>   </p>'));
    expect(facts.wordCount).toBe(0);
    expect(facts.hasLetters).toBe(false);
  });

  it('survives an element with a non-string className', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(() => describeElement(svg)).not.toThrow();
    expect(describeElement(svg).classId).toBe('');
  });

  it('counts words across element boundaries in separator-free markup', () => {
    const facts = describeElement(el('<ul><li>Point one</li><li>Point two</li></ul>'));
    expect(facts.wordCount).toBe(4);
  });

  it('counts the same words whether or not the markup is formatted', () => {
    const minified = describeElement(el('<ul><li>Point one</li><li>Point two</li></ul>'));
    const formatted = describeElement(el('<ul>\n  <li>Point one</li>\n  <li>Point two</li>\n</ul>'));
    expect(minified.wordCount).toBe(formatted.wordCount);
  });

  it('counts a link nested in a link-like element only once', () => {
    const facts = describeElement(el('<section><div role="link">Big Sale <a href="/x">Read more</a></div></section>'));
    expect(facts.linkTextLength).toBe(facts.textLength);
  });

  it('never reports more link text than total text', () => {
    const facts = describeElement(el('<section><div role="link">Big Sale <a href="/x">Read more</a></div></section>'));
    expect(facts.linkTextLength).toBeLessThanOrEqual(facts.textLength);
  });

  it('still counts inner links when the element sits inside an unrelated anchor', () => {
    // The span sits inside an anchor it does not own, and contains a real
    // link of its own. Without the el.contains bound in describeElement, the
    // wrapping anchor would be found as an "outer" link and suppress the
    // inner one, reporting zero link text for something that is entirely a
    // link. Measured: 9 with the bound, 0 without it.
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<a href="/wrap"><span id="inner"><span role="link">real link</span></span></a>';
    const span = wrapper.querySelector('#inner');
    expect(describeElement(span).linkTextLength).toBe(9);
  });

  it('does not read an inline stylesheet as prose', () => {
    const host = el('<div><style>.a{float:right;margin-left:0.5em;margin-top:0.2em}</style><p>Real prose that a reader would want translated.</p></div>');
    const facts = describeElement(host);
    expect(facts.textLength).toBe('Real prose that a reader would want translated.'.length);
  });

  it('separates text across nested element boundaries, not just the top level', () => {
    const host = el('<div><span><b>Hello</b><i>World</i></span></div>');
    expect(describeElement(host).wordCount).toBe(2);
  });
});

describe('elementText', () => {
  it('excludes script text as well as style text', () => {
    const host = el('<div><script>doSomething();</script><p>Real prose here.</p></div>');
    expect(elementText(host)).toBe('Real prose here.');
  });
});
