/**
 * Turn the element under the pointer into a Block, or nothing.
 *
 * Resolution is lazy: it runs when the user hovers, walking up from the event
 * target. There is no index of the page, so there is nothing to build,
 * invalidate, or deduplicate, and a virtualized timeline that recycles its rows
 * cannot leave us holding a stale reference.
 */

import { GATE, passesTextGate } from './gate.js';
import { describeElement } from './describe.js';
import { isHeading, resolveSection } from './section.js';
import { adapterFor } from './adapters.js';

const MAX_WALK = 25;

// Reaching one of these abandons the walk rather than skipping a level: if the
// pointer is inside a nav, nothing above it is a valid block either.
const HARD_REJECT_TAGS = new Set([
  'NAV', 'ASIDE', 'CODE', 'PRE', 'KBD', 'SAMP',
  'SVG', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO', 'OBJECT', 'EMBED',
  'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SCRIPT', 'STYLE', 'NOSCRIPT'
]);

const HARD_REJECT_ROLES = new Set([
  'navigation', 'banner', 'contentinfo', 'search',
  'toolbar', 'tablist', 'menu', 'menubar', 'dialog', 'alert'
]);

const BLOCK_TAGS = new Set([
  'P', 'LI', 'BLOCKQUOTE', 'DD', 'DT', 'FIGCAPTION', 'TD', 'TH',
  'ARTICLE', 'SECTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
]);

const BLOCK_ROLES = new Set(['article', 'listitem', 'paragraph', 'heading', 'note']);

const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'list-item', 'table-cell', 'flow-root']);

// Our own surfaces, which must never resolve to a block. Without the
// translation guard the user could translate a translation.
const OWN_UI = '[data-parsipad-translation], [data-parsipad-icon], #parsipad-host, #parsipad-selection-popup';

// Block identity lives here rather than in a data attribute on the page.
// Marking the source element would be a mutation, and the append-only
// guarantee in tests/block-render.test.js would rightly fail on it.
const idByAnchor = new WeakMap();
let nextId = 0;

function blockIdFor(anchor) {
  let id = idByAnchor.get(anchor);
  if (!id) {
    id = `pp-b${++nextId}`;
    idByAnchor.set(anchor, id);
  }
  return id;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isHardReject(el) {
  if (HARD_REJECT_TAGS.has(el.tagName)) return true;

  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  if (role && HARD_REJECT_ROLES.has(role)) return true;
  if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return true;
  if (el.isContentEditable) return true;

  // <header> and <footer> are page chrome only at page level. The spec allows
  // both inside <article>, where they carry real content.
  if (el.tagName === 'HEADER' || el.tagName === 'FOOTER') {
    return el.closest('article, section, [role="article"]') === null;
  }

  return false;
}

/**
 * True when the element is the innermost one holding its text, rather than a
 * wrapper around children that each hold their own.
 *
 * This is what makes div soup resolvable: X has no <p> tags, so the only way
 * to find the post body generically is to find the div nothing else inside
 * claims.
 *
 * @param {Element} el
 * @returns {boolean}
 */
export function ownsItsText(el) {
  for (const child of el.children) {
    // Only a child that could itself be a block may claim the text. An inline
    // <span> wrapping a whole paragraph is never a candidate, so letting it
    // disqualify the parent strands the text: the div is rejected for not
    // owning it and the span is rejected for being inline, and nothing at all
    // resolves.
    //
    // Tag first: it is a set lookup, and a child that could never be a block
    // cannot claim the text regardless of what it contains. Checking it before
    // describeElement avoids reading the subtree twice for every inline child
    // that was going to be skipped anyway.
    if (!BLOCK_TAGS.has(child.tagName) && child.tagName !== 'DIV') continue;
    const facts = describeElement(child);
    if (facts.textLength < GATE.OWNERSHIP_MIN_CHARS) continue;
    if (passesTextGate(facts)) return false;
  }
  return true;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isCandidate(el) {
  if (BLOCK_TAGS.has(el.tagName)) return true;

  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  if (role && BLOCK_ROLES.has(role)) return true;

  if (el.tagName !== 'DIV' && el.tagName !== 'SPAN') return false;

  // Ordered so the style read comes last. Every wrapper on the climb fails the
  // textContent-only ownership check, so getComputedStyle runs about once per
  // resolution rather than once per ancestor.
  if (!ownsItsText(el)) return false;
  return BLOCK_DISPLAYS.has(getComputedStyle(el).display);
}

function makeBlock(kind, anchor, parts, truncated) {
  return { id: blockIdFor(anchor), kind, anchor, parts, truncated };
}

/**
 * @param {EventTarget|Node|null} target
 * @param {string} [hostname] - injectable for tests; defaults to the real host
 * @returns {{id: string, kind: 'leaf'|'section', anchor: Element,
 *            parts: Element[], truncated: boolean}|null}
 */
export function resolveBlock(target, hostname = location.hostname) {
  if (!target) return null;

  // Text nodes are the common mouseover target inside a paragraph.
  let el = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
  if (el.closest(OWN_UI)) return null;

  const adapter = adapterFor(hostname);
  if (adapter) {
    if (adapter.reject && el.closest(adapter.reject)) return null;
    const hit = adapter.block && el.closest(adapter.block);
    if (hit) return makeBlock('leaf', hit, [hit], false);
  }

  let steps = 0;
  while (el && el !== document.body && steps < MAX_WALK) {
    if (isHardReject(el)) return null;
    if (isHeading(el)) {
      const { parts, truncated } = resolveSection(el);
      return makeBlock('section', el, parts, truncated);
    }
    if (isCandidate(el) && passesTextGate(describeElement(el))) {
      return makeBlock('leaf', el, [el], false);
    }
    el = el.parentElement;
    steps += 1;
  }

  return null;
}
