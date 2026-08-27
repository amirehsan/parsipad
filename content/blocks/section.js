/**
 * Expand a heading into the section it introduces.
 *
 * A section is not a special kind of block; it is a list of the same leaf
 * elements a paragraph hover would produce. Rendering inserts one translation
 * after each, so a translated section comes out interleaved — every source
 * paragraph followed by its Persian — rather than as a wall of text at the end.
 */

import { passesTextGate } from './gate.js';
import { describeElement } from './describe.js';

export const SECTION_MAX_PARTS = 30;
export const SECTION_MAX_CHARS = 12000;

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isHeading(el) {
  if (!el || !el.tagName) return false;
  if (HEADING_TAGS.has(el.tagName)) return true;
  return typeof el.getAttribute === 'function' && el.getAttribute('role') === 'heading';
}

/**
 * Rank 1-6. role="heading" without aria-level defaults to 2, which is what a
 * section heading almost always is in practice.
 *
 * @param {Element} el
 * @returns {number}
 */
export function headingRank(el) {
  if (HEADING_TAGS.has(el.tagName)) return Number(el.tagName[1]);
  const level = Number(el.getAttribute('aria-level'));
  return Number.isFinite(level) && level >= 1 && level <= 6 ? level : 2;
}

function isContentful(el) {
  return passesTextGate(describeElement(el));
}

/**
 * The element the sibling walk starts from: the heading, or the wrapper that
 * holds nothing but the heading.
 *
 * Wikipedia emits <div class="mw-heading"><h2>…</h2><span><a>edit</a></span></div>,
 * so the heading has no siblings of its own and a naive walk finds nothing.
 * The rule is stated generically — a wrapper whose only other children fail the
 * gate — so it catches that markup without naming Wikipedia. An edit link fails
 * on link density.
 *
 * @param {Element} heading
 * @returns {Element}
 */
export function rowElementFor(heading) {
  const parent = heading.parentElement;
  if (!parent || parent === document.body) return heading;
  if (parent.tagName === 'SECTION' || parent.tagName === 'ARTICLE') return heading;

  const others = [...parent.children].filter(
    (child) => child !== heading && (child.textContent || '').trim()
  );
  if (others.every((child) => !isContentful(child))) return parent;
  return heading;
}

function containsHeadingOfRank(el, maxRank) {
  if (isHeading(el) && headingRank(el) <= maxRank) return true;
  if (typeof el.querySelector !== 'function') return false;
  const inner = el.querySelector(HEADING_SELECTOR);
  return Boolean(inner && headingRank(inner) <= maxRank);
}

/**
 * Gather the innermost translatable elements under root.
 *
 * A part is an element that clears the gate and has no child that also clears
 * it. That descends into a wrapper div holding two paragraphs, but keeps a list
 * of short items whole, because no individual <li> clears the floor while the
 * <ul> does.
 *
 * Headings are always parts and are never descended into, so subheadings inside
 * a section survive even though they are far too short to clear the gate.
 *
 * @param {Element} root
 * @param {Element[]} [out]
 * @returns {Element[]}
 */
export function collectParts(root, out = []) {
  // Overshoot the cap by one deliberately. capParts trims back to the cap and
  // reports truncation by comparing the two lengths, so a collector that
  // stopped at exactly the cap would make every capped section look complete.
  if (out.length > SECTION_MAX_PARTS) return out;

  if (isHeading(root)) {
    out.push(root);
    return out;
  }

  const candidates = [...root.children].filter(
    (child) => isHeading(child) || isContentful(child)
  );

  if (candidates.length === 0) {
    if (isContentful(root)) out.push(root);
    return out;
  }

  for (const child of candidates) {
    if (out.length > SECTION_MAX_PARTS) break;
    collectParts(child, out);
  }
  return out;
}

/**
 * Trim to the part and character caps so one click can never become a request
 * storm. Always keeps at least one part, even an oversized one.
 */
function capParts(parts) {
  const out = [];
  let chars = 0;
  for (const el of parts) {
    if (out.length >= SECTION_MAX_PARTS) break;
    const length = (el.textContent || '').trim().length;
    if (out.length > 0 && chars + length > SECTION_MAX_CHARS) break;
    out.push(el);
    chars += length;
  }
  return { parts: out, truncated: out.length < parts.length };
}

/**
 * @param {Element} heading
 * @returns {{parts: Element[], truncated: boolean}}
 */
export function resolveSection(heading) {
  const rank = headingRank(heading);
  const row = rowElementFor(heading);
  const container = row.parentElement;

  // HTML5 sectioning: the heading opens a <section> or <article>, so that
  // container is the unit and the sibling walk is unnecessary.
  if (
    container &&
    (container.tagName === 'SECTION' || container.tagName === 'ARTICLE') &&
    container.firstElementChild === row
  ) {
    const parts = [heading];
    for (const child of [...container.children].slice(1)) {
      collectParts(child, parts);
    }
    return capParts(parts);
  }

  const parts = [heading];
  let sibling = row.nextElementSibling;
  while (sibling && parts.length <= SECTION_MAX_PARTS) {
    if (containsHeadingOfRank(sibling, rank)) break;
    collectParts(sibling, parts);
    sibling = sibling.nextElementSibling;
  }
  return capParts(parts);
}
