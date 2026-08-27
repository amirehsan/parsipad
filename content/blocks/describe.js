/**
 * Extract the facts gate.js judges, from a real element.
 *
 * Split out from resolve.js so section.js can use it too without the two
 * forming an import cycle, and so gate.js can stay entirely DOM-free.
 *
 * Everything here reads textContent rather than innerText. innerText forces
 * layout, and this runs on the hover path.
 */

import { containsLetters } from './gate.js';

/**
 * Text for word counting, with element boundaries preserved.
 *
 * textContent concatenates children with no separator, so a separator-free
 * <ul><li>Point one</li><li>Point two</li></ul> flattens to "Point onePoint two"
 * and counts three words instead of four. Formatted markup escapes this because
 * the whitespace between tags survives; framework-rendered DOM does not, since
 * React strips whitespace between sibling elements.
 *
 * Undercounting drops candidates below MIN_WORDS and costs them an icon, which
 * is the false-negative direction this gate is deliberately tuned against.
 */
function spacedText(el) {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      out += ` ${node.textContent} `;
    }
  }
  return out.trim();
}

/**
 * @param {Element} el
 * @returns {{textLength: number, linkTextLength: number, wordCount: number,
 *            hasLetters: boolean, classId: string}}
 */
export function describeElement(el) {
  const trimmed = (el.textContent || '').trim();

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
      linkTextLength += (anchor.textContent || '').trim().length;
    }
  }

  // className is an SVGAnimatedString on SVG elements, not a string.
  const className = typeof el.className === 'string' ? el.className : '';
  const id = typeof el.id === 'string' ? el.id : '';

  const spaced = spacedText(el);

  return {
    textLength: trimmed.length,
    linkTextLength,
    wordCount: spaced ? spaced.split(/\s+/).length : 0,
    hasLetters: containsLetters(trimmed),
    classId: `${className} ${id}`.trim()
  };
}
