/**
 * Extract the facts gate.js judges, from a real element.
 *
 * Split out from resolve.js so section.js can use it too without the two
 * forming an import cycle, and so gate.js can stay entirely DOM-free.
 *
 * Everything here walks childNodes itself rather than reading innerText.
 * innerText forces layout, and this runs on the hover path.
 */

import { containsLetters } from './gate.js';

const NON_TEXT_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE']);

/**
 * The element's prose, with element boundaries preserved.
 *
 * Two problems with textContent, both real on Wikipedia. It includes the
 * contents of <style> and <script>, and Wikipedia inlines TemplateStyles
 * blocks inside article content, so a naive read hands the model a stylesheet
 * and counts it as words when gating. And it concatenates children with no
 * separator, so a separator-free list reads as one run-together word.
 */
function collectText(el, parts) {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue);
    } else if (node.nodeType === Node.ELEMENT_NODE && !NON_TEXT_TAGS.has(node.tagName)) {
      parts.push(' ');
      collectText(node, parts);
      parts.push(' ');
    }
  }
  return parts;
}

/**
 * @param {Element} el
 * @returns {string} prose with runs of whitespace collapsed
 */
export function elementText(el) {
  return collectText(el, []).join('').replace(/\s+/g, ' ').trim();
}

/**
 * @param {Element} el
 * @returns {{textLength: number, linkTextLength: number, wordCount: number,
 *            hasLetters: boolean, classId: string}}
 */
export function describeElement(el) {
  const trimmed = elementText(el);

  // An element that is itself a link contributes all of its text to the link
  // total. Without this a single long anchor reads as a clean paragraph,
  // because querySelectorAll('a') does not match the element it is called on.
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  const selfIsLink = el.tagName === 'A' || role === 'link';

  let linkTextLength = 0;
  if (selfIsLink) {
    linkTextLength = trimmed.length;
  } else if (typeof el.querySelectorAll === 'function') {
    for (const anchor of el.querySelectorAll('a, [role="link"]')) {
      // A link nested inside another link-like element is already counted in
      // that ancestor's textContent; summing both counts the inner text twice
      // and can push linkTextLength above textLength. The el.contains bound
      // matters: a link-like ancestor OUTSIDE el must not suppress a real count.
      const outer = anchor.parentElement?.closest('a, [role="link"]');
      if (outer && el.contains(outer)) continue;
      linkTextLength += elementText(anchor).length;
    }
  }

  // className is an SVGAnimatedString on SVG elements, not a string.
  const className = typeof el.className === 'string' ? el.className : '';
  const id = typeof el.id === 'string' ? el.id : '';

  return {
    textLength: trimmed.length,
    linkTextLength,
    wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
    hasLetters: containsLetters(trimmed),
    classId: `${className} ${id}`.trim()
  };
}
