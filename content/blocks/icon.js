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
import { label } from './lang.js';

export { ICON_SIZE };

const TRANSLATE_PATH =
  'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129';

let host = null;
let button = null;
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

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'pp-block-icon';

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
  // Refuse outright rather than showing and then being hidden from inside
  // repositionIcon, whose hideIcon() this function's trailing data-visible
  // write would clobber. The anchor can be gone by now: resolution happens in
  // index.js's dwell timer, DWELL_MS after the pointer event that captured the
  // target, and resolveBlock does not check isConnected, so a row pruned in
  // that window still resolves.
  if (!block?.anchor?.isConnected) {
    hideIcon();
    return;
  }

  build();
  // Set on every show rather than only at build time, which runs once per
  // page. Otherwise a language change mid-session would leave the label
  // stuck in whatever language was current the first time the icon appeared.
  button.setAttribute('aria-label', label('blockTranslateIconLabel'));
  currentBlock = block;
  activateHandler = onActivate;
  repositionIcon();
  // repositionIcon can itself decide to hide, now that it gives up when none
  // of the anchor is on screen (see its own comment): the page can have
  // scrolled the block away during the dwell wait. Only the trailing write
  // below would clobber that decision, so it must not run unconditionally.
  if (currentBlock) host.setAttribute('data-visible', 'true');
}

/** Recompute the icon's position against its current block. */
export function repositionIcon() {
  if (!host || !currentBlock) return;
  // The anchor was torn out from under us, most likely a virtualized list
  // recycling its rows. Hide rather than silently no-op, or the icon freezes on
  // screen pointing at nothing until the pointer happens to move again.
  if (!currentBlock.anchor.isConnected) {
    hideIcon();
    return;
  }

  const r = currentBlock.anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Anchor to the visible part of the block. Passing the raw rect for a block
  // scrolled half out of view lets computeIconPosition's clamp pin the icon to
  // a viewport edge, stranding it in a screen corner far from the block it
  // belongs to, where the pointer cannot reach it before the hover tolerance
  // expires.
  const visible = {
    top: Math.max(r.top, 0),
    left: Math.max(r.left, 0),
    right: Math.min(r.right, vw),
    bottom: Math.min(r.bottom, vh)
  };

  if (visible.bottom <= visible.top || visible.right <= visible.left) {
    hideIcon();
    return;
  }

  const { top, left } = computeIconPosition({
    block: visible,
    icon: { width: ICON_SIZE, height: ICON_SIZE },
    viewport: { width: vw, height: vh },
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
  button = null;
  currentBlock = null;
  activateHandler = null;
}
