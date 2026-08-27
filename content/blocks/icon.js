/**
 * The hover icon.
 *
 * There is exactly one, for the page's whole lifetime. It is moved and toggled,
 * never recreated, which is why duplicate icons are not defended against so much
 * as made unrepresentable, and why the render cost is constant rather than
 * proportional to the number of blocks on the page.
 *
 * The host is position: fixed and never enters the page's own DOM tree beyond
 * being appended to <body>.
 */

import { applyHostTheme } from '../host-page.js';
import { computeIconPosition } from './anchor.js';
import { getBlockIconStyles, ICON_SIZE } from './styles.js';

export { ICON_SIZE };

const TRANSLATE_PATH =
  'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129';

let host = null;
let activateHandler = null;
let currentBlock = null;

function build() {
  if (host) return;

  host = document.createElement('div');
  host.setAttribute('data-parsipad-icon', '');
  host.setAttribute('data-visible', 'false');
  host.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';
  applyHostTheme(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = getBlockIconStyles();
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pp-block-icon';
  button.setAttribute('aria-label', 'Translate this block to Persian');

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', TRANSLATE_PATH);
  svg.appendChild(path);
  button.appendChild(svg);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activateHandler && currentBlock) activateHandler(currentBlock);
  });

  shadow.appendChild(button);
  document.body.appendChild(host);
}

/**
 * True for our own icon host, so the resolver can skip it without importing
 * this module's internals.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isIconElement(node) {
  return Boolean(host) && (node === host || (node?.nodeType === Node.ELEMENT_NODE && host.contains(node)));
}

/**
 * Move the icon to a block and show it.
 *
 * @param {{id: string, anchor: Element}} block
 * @param {(block: object) => void} onActivate
 */
export function showIconFor(block, onActivate) {
  build();
  currentBlock = block;
  activateHandler = onActivate;
  repositionIcon();
  host.setAttribute('data-visible', 'true');
}

/** Recompute the icon's position against its current block. */
export function repositionIcon() {
  if (!host || !currentBlock?.anchor?.isConnected) return;

  const rect = currentBlock.anchor.getBoundingClientRect();
  const { top, left } = computeIconPosition({
    block: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
    icon: { width: ICON_SIZE, height: ICON_SIZE },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    dir: getComputedStyle(currentBlock.anchor).direction === 'rtl' ? 'rtl' : 'ltr'
  });

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
}

/** Hide without removing, so the next show is a move rather than a build. */
export function hideIcon() {
  if (!host) return;
  host.setAttribute('data-visible', 'false');
  currentBlock = null;
}

/** The block the icon currently points at, or null. */
export function currentIconBlock() {
  return currentBlock;
}

/** Tear down completely. Used on SPA navigation and by tests. */
export function destroyIcon() {
  if (host) host.remove();
  host = null;
  currentBlock = null;
  activateHandler = null;
}
