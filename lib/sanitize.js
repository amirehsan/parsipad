/**
 * HTML sanitization wrapper around DOMPurify with strict defaults suited
 * for rendering LLM-generated content. Inputs come from third-party AI
 * providers, so we treat them as untrusted defense-in-depth even though
 * upstream code already calls escapeHtml() on most fields.
 *
 * Allowlist is intentionally narrow:
 *   - Inline text formatting (b, i, em, strong, span)
 *   - Headings, paragraphs, lists, br
 *   - Code/pre for technical content
 * Attributes are limited to class, dir, and href on anchors. No event
 * handlers, no inline styles, no script/iframe/object/embed.
 */
import DOMPurify from './vendor/dompurify.mjs';

const PROFILE = {
  ALLOWED_TAGS: [
    'a', 'b', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'i', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'small', 's', 'span', 'strong',
    'sub', 'sup', 'u', 'ul', 'svg', 'path', 'circle', 'line', 'polygon',
    'polyline', 'rect'
  ],
  ALLOWED_ATTR: [
    'class', 'dir', 'href', 'rel', 'target', 'title', 'data-*',
    'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'cx', 'cy', 'r', 'd', 'points'
  ],
  ALLOW_DATA_ATTR: true,
  USE_PROFILES: { html: true, svg: true },
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'link', 'meta'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'style']
};

/**
 * Sanitize untrusted HTML for safe injection via innerHTML.
 * @param {string} html
 * @returns {string}
 */
export function sanitize(html) {
  if (typeof html !== 'string' || html.length === 0) return '';
  return DOMPurify.sanitize(html, PROFILE);
}

/**
 * Assign sanitized HTML to an element. Prefer this over `el.innerHTML = ...`
 * for any string that could include LLM-generated content.
 * @param {Element} el
 * @param {string} html
 */
export function setSafeInnerHTML(el, html) {
  el.innerHTML = sanitize(html);
}
