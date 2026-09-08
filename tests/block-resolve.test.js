// tests/block-resolve.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBlock, isHardReject, ownsItsText } from '../content/blocks/resolve.js';
import { adapterFor } from '../content/blocks/adapters.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function mount(html) { document.body.innerHTML = html; }
function pick(id) { return document.getElementById(id); }

beforeEach(() => { document.body.innerHTML = ''; });

describe('adapterFor', () => {
  it.each(['x.com', 'www.x.com', 'twitter.com', 'mobile.twitter.com'])('matches %s', (host) => {
    expect(adapterFor(host)?.id).toBe('x');
  });

  it.each(['example.com', 'notx.com', 'x.com.evil.net'])('does not match %s', (host) => {
    expect(adapterFor(host)).toBeNull();
  });
});

describe('isHardReject', () => {
  it('rejects a nav element', () => {
    mount('<nav id="n"><a href="#">Home</a></nav>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects role=navigation', () => {
    mount('<div id="n" role="navigation">x</div>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects aria-hidden content', () => {
    mount('<div id="n" aria-hidden="true">x</div>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects code', () => {
    mount('<pre id="n">npm install</pre>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects a page-level footer', () => {
    mount('<footer id="f">Copyright</footer>');
    expect(isHardReject(pick('f'))).toBe(true);
  });

  it('allows a footer inside an article, where it holds real content', () => {
    mount('<article><footer id="f">Written by someone</footer></article>');
    expect(isHardReject(pick('f'))).toBe(false);
  });
});

describe('ownsItsText', () => {
  it('is false for a wrapper around a substantial child', () => {
    mount(`<div id="w"><div id="inner"><p>${LONG}</p></div></div>`);
    expect(ownsItsText(pick('w'))).toBe(false);
  });

  it('is true for the innermost element holding the text', () => {
    mount(`<div id="leaf">${LONG}</div>`);
    expect(ownsItsText(pick('leaf'))).toBe(true);
  });

  it('is true for a paragraph containing only a short inline link', () => {
    mount(`<p id="leaf">${LONG} <a href="#">src</a></p>`);
    expect(ownsItsText(pick('leaf'))).toBe(true);
  });
});

describe('resolveBlock with a heading beside bare-text prose', () => {
  it('resolves a container whose only element child is a heading', () => {
    mount('<div class="wrapper"><div class="text" id="text"><h2>Secure Your Spot On Our Schedule</h2>At Carolina Center for Eye Care, we provide the highest quality service to all our patients. Use the form below to request your appointment.</div></div>');
    expect(resolveBlock(pick('text')).anchor).toBe(pick('text'));
  });

  it('still lets a real block child claim the text from its parent', () => {
    mount(`<div id="outer"><h2>Title</h2><p id="p">${LONG}</p></div>`);
    expect(resolveBlock(pick('p')).anchor).toBe(pick('p'));
  });
});

describe('resolveBlock', () => {
  it('resolves a paragraph from a text node target inside it', () => {
    mount(`<main><p id="p">${LONG}</p></main>`);
    const block = resolveBlock(pick('p').firstChild);
    expect(block.kind).toBe('leaf');
    expect(block.anchor).toBe(pick('p'));
    expect(block.parts).toEqual([pick('p')]);
  });

  it('climbs from an inline span to the paragraph', () => {
    mount(`<main><p id="p">${LONG} <em id="e">emphasis</em></p></main>`);
    expect(resolveBlock(pick('e')).anchor).toBe(pick('p'));
  });

  it('resolves a heading to its section', () => {
    mount(`<main><h2 id="h">Title</h2><p>${LONG}</p></main>`);
    const block = resolveBlock(pick('h'));
    expect(block.kind).toBe('section');
    expect(block.anchor).toBe(pick('h'));
    expect(block.parts.length).toBe(2);
  });

  it('returns null inside a nav, without climbing past it', () => {
    mount(`<nav><ul><li id="li"><a href="#">A fairly long navigation label</a></li></ul></nav><p>${LONG}</p>`);
    expect(resolveBlock(pick('li'))).toBeNull();
  });

  it('returns null for a link list that is not wrapped in nav', () => {
    mount('<div id="d"><a href="#">Alpha beta</a> <a href="#">Gamma delta</a> <a href="#">Epsilon zeta</a></div>');
    expect(resolveBlock(pick('d'))).toBeNull();
  });

  it('returns null for a code block', () => {
    mount('<pre id="c"><code>const answer = compute(fortyTwo, options);</code></pre>');
    expect(resolveBlock(pick('c'))).toBeNull();
  });

  it('returns null for a bare count, the metadata around an X post', () => {
    mount('<div id="d">186</div>');
    expect(resolveBlock(pick('d'))).toBeNull();
  });

  it('returns null inside our own translation output', () => {
    mount(`<div data-parsipad-translation="pp-b1"><p id="p">${LONG}</p></div>`);
    expect(resolveBlock(pick('p'))).toBeNull();
  });

  it('resolves div soup to the innermost div that owns the text', () => {
    mount(`<div><div><div id="leaf">${LONG}</div></div></div>`);
    expect(resolveBlock(pick('leaf')).anchor).toBe(pick('leaf'));
  });

  it('resolves a div whose text is wrapped in a bare inline span', () => {
    mount(`<main><div id="wrap"><span id="inner">${LONG}</span></div></main>`);
    expect(resolveBlock(pick('inner')).anchor).toBe(pick('wrap'));
  });

  it('still lets a block-level child claim the text from its parent', () => {
    mount(`<main><div id="outer"><div id="leaf">${LONG}</div></div></main>`);
    expect(resolveBlock(pick('leaf')).anchor).toBe(pick('leaf'));
  });

  it('does not let a container swallow a list it merely holds', () => {
    mount(`
      <div id="box">
        <span><style>.mw-parser-output .itn-img{float:right;margin-left:0.5em}</style></span>
        <div class="itn-img">Dolly Parton in 1977</div>
        <ul>
          <li id="one">At least 335 people are killed and over a thousand are missing after flash flooding in Nepal.</li>
          <li id="two">American singer-songwriter and actress Dolly Parton dies at the age of 80 today.</li>
        </ul>
      </div>`);
    // The box is not a block: the list inside it holds the real content.
    expect(resolveBlock(pick('box'))).toBeNull();
    // Pointing at a news item gives that item.
    expect(resolveBlock(pick('one')).anchor).toBe(pick('one'));
  });

  it('gives the same id for repeated resolutions of one element', () => {
    mount(`<main><p id="p">${LONG}</p></main>`);
    expect(resolveBlock(pick('p')).id).toBe(resolveBlock(pick('p')).id);
  });

  it('gives different ids to different elements', () => {
    mount(`<main><p id="a">${LONG} one</p><p id="b">${LONG} two</p></main>`);
    expect(resolveBlock(pick('a')).id).not.toBe(resolveBlock(pick('b')).id);
  });

  it('never writes to the page while resolving', () => {
    mount(`<main><p id="p">${LONG}</p></main>`);
    const before = pick('p').outerHTML;
    resolveBlock(pick('p'));
    expect(pick('p').outerHTML).toBe(before);
  });

  it('uses an adapter selector in preference to the heuristic', () => {
    mount(`<article><div data-testid="tweetText" id="t"><span id="s">${LONG}</span></div></article>`);
    expect(resolveBlock(pick('s'), 'x.com').anchor).toBe(pick('t'));
  });

  it('honours an adapter reject over its block selector', () => {
    mount(`<article><div data-testid="tweetText" id="t">${LONG}<div role="group" id="g"><button>Reply</button></div></div></article>`);
    // #g sits inside the tweetText block. If block were consulted before
    // reject, this would resolve to #t and offer to translate the action bar
    // along with the post.
    expect(resolveBlock(pick('g'), 'x.com')).toBeNull();
    // and the post body itself still resolves
    expect(resolveBlock(pick('t'), 'x.com').anchor).toBe(pick('t'));
  });

  it('resolves nothing outside the adapter selector on an adapter site', () => {
    mount(`<article id="card"><div data-testid="tweetText" id="t">${LONG}</div><div id="meta">${LONG} counts and controls</div></article>`);
    // The post text still resolves.
    expect(resolveBlock(pick('t'), 'x.com').anchor).toBe(pick('t'));
    // The card around it does not, where before it resolved as an ARTICLE.
    expect(resolveBlock(pick('card'), 'x.com')).toBeNull();
    expect(resolveBlock(pick('meta'), 'x.com')).toBeNull();
    // And the generic path is untouched on a site with no adapter.
    expect(resolveBlock(pick('meta'), 'example.com')).not.toBeNull();
  });

  it('returns null for a null target', () => {
    expect(resolveBlock(null)).toBeNull();
  });
});
