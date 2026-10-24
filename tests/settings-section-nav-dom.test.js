// tests/settings-section-nav-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/settings/settings.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SETTINGS_SECTIONS, setupSectionNav } from '../settings/sections.js';

/**
 * The section nav driven through the real Settings markup: the link of the
 * section the URL names is marked current and the page scrolls to it, old tab
 * names land on the section they became, a click marks its link at once, and
 * the observer marks the first section in view once nothing holds the label.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));

let scrolled;
let stripScrolls;
let observer;
let cleanup;

class FakeObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = [];
    observer = this;
  }
  observe(target) { this.targets.push(target); }
  disconnect() { this.targets = []; }
  /** Report the given sections as in the band and the rest as out of it. */
  report(ids) {
    this.callback(this.targets.map(target => ({ target, isIntersecting: ids.includes(target.id) })));
  }
}

function current() {
  return [...document.querySelectorAll('.settings-nav a[aria-current]')].map(a => a.getAttribute('href'));
}

function load(hash) {
  history.replaceState(null, '', `settings.html${hash}`);
  cleanup = setupSectionNav(document);
}

beforeEach(() => {
  document.body.innerHTML = bodyMarkup;
  scrolled = [];
  stripScrolls = [];
  observer = null;
  window.IntersectionObserver = FakeObserver;
  // Sections scroll the page; links scroll only the nav strip they sit in.
  Element.prototype.scrollIntoView = vi.fn(function (options) {
    if (this.matches('.settings-nav a')) stripScrolls.push([this.getAttribute('href'), options]);
    else scrolled.push(this.id);
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  delete window.IntersectionObserver;
  delete window.scrollY;
  delete window.innerHeight;
  delete document.documentElement.scrollHeight;
  delete document.querySelector('.settings-nav-list')?.scrollWidth;
});

/** Make the nav a strip wider than its box, as it is below 720px. */
function overflowStrip() {
  const list = document.querySelector('.settings-nav-list');
  Object.defineProperty(list, 'scrollWidth', { value: 900, configurable: true });
  Object.defineProperty(list, 'clientWidth', { value: 360, configurable: true });
}

/** Put the page at the given scroll offset in a 2000px document and an 800px window. */
function scrollPageTo(y) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

describe('settings section nav', () => {
  it('has one link per section, in page order', () => {
    const links = [...document.querySelectorAll('.settings-nav a')].map(a => a.getAttribute('href'));
    expect(links).toEqual(SETTINGS_SECTIONS.map(id => `#${id}`));
  });

  it('opens on AI provider & key without scrolling when the URL names nothing', () => {
    load('');
    expect(current()).toEqual(['#providers']);
    expect(scrolled).toEqual([]);
  });

  it('scrolls to the section the URL names and marks its link', () => {
    load('#shortcuts');
    expect(current()).toEqual(['#shortcuts']);
    expect(scrolled).toEqual(['shortcuts']);
  });

  it.each([
    ['#general', 'reading'],
    ['#more', 'about'],
    ['#data', 'data'],
    ['#nope', 'providers']
  ])('lands an old or unknown link %s on %s and rewrites the address', (hash, id) => {
    load(hash);
    expect(current()).toEqual([`#${id}`]);
    expect(scrolled).toEqual([id]);
    expect(location.hash).toBe(`#${id}`);
  });

  it('marks a clicked link at once and keeps it while the scroll runs', () => {
    load('');
    document.querySelector('.settings-nav a[href="#about"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(current()).toEqual(['#about']);
    // A short last section never reaches the top, so the sections the scroll
    // passes must not take the label from the one the reader asked for.
    observer.report(['shortcuts']);
    expect(current()).toEqual(['#about']);
  });

  it('follows the first section in view once the reader scrolls', () => {
    load('');
    observer.report(['reading', 'appearance']);
    expect(current()).toEqual(['#reading']);
    window.dispatchEvent(new Event('wheel'));
    observer.report(['data']);
    expect(current()).toEqual(['#data']);
  });

  it('keeps the label when no section is in the band', () => {
    load('');
    observer.report(['flashcards']);
    observer.report([]);
    expect(current()).toEqual(['#flashcards']);
  });

  it('lands a hash changed after load, an old one included', () => {
    load('');
    history.replaceState(null, '', 'settings.html#general');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(current()).toEqual(['#reading']);
    expect(location.hash).toBe('#reading');
    expect(scrolled).toEqual(['reading']);
  });

  it('brings the current link into view inside a scrolling strip', () => {
    overflowStrip();
    load('');
    window.dispatchEvent(new Event('wheel'));
    observer.report(['shortcuts']);
    expect(stripScrolls.at(-1)).toEqual(['#shortcuts', { block: 'nearest', inline: 'nearest' }]);
  });

  it('leaves the strip alone when the links fit, and when the label does not move', () => {
    load('');
    observer.report(['data']);
    expect(stripScrolls).toEqual([]);
    overflowStrip();
    observer.report(['data']);
    expect(stripScrolls).toEqual([]);
  });

  it('marks the last section once the page is scrolled to the bottom', () => {
    load('');
    window.dispatchEvent(new Event('wheel'));
    scrollPageTo(600);
    observer.report(['shortcuts']);
    expect(current()).toEqual(['#shortcuts']);
    scrollPageTo(1200);
    expect(current()).toEqual(['#about']);
    // The observer reporting the section at the top must not take it back.
    observer.report(['shortcuts']);
    expect(current()).toEqual(['#about']);
  });

  it('keeps a clicked section at the bottom of the page', () => {
    load('');
    document.querySelector('.settings-nav a[href="#shortcuts"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    scrollPageTo(1200);
    expect(current()).toEqual(['#shortcuts']);
  });

  it('works without IntersectionObserver', () => {
    delete window.IntersectionObserver;
    load('#more');
    expect(current()).toEqual(['#about']);
  });
});
