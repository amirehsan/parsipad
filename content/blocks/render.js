/**
 * Insert, fill, and remove the Persian that sits beneath a block.
 *
 * insertAdjacentElement('afterend', ...) is this feature's entire write
 * surface. Nothing here assigns to a text node the site owns, removes one of
 * its elements, or reorders anything. That is what makes the worst case benign:
 * a re-render can take our node away, which loses a translation, but it can
 * never leave the page corrupted or a translation stranded under the wrong post.
 *
 * tests/block-render.test.js asserts the source element's outerHTML is
 * byte-identical across a full render. Do not weaken that test.
 */

import { applyHostTheme, ensurePersianFontLoaded } from '../host-page.js';
import { getBlockTranslationStyles } from './styles.js';

/**
 * @typedef {Object} PartRecord
 * @property {Element} source
 * @property {HTMLElement} host
 * @property {ShadowRoot} shadow
 */

/** @type {Map<string, {block: object, parts: PartRecord[]}>} */
const rendered = new Map();

function mountHost(source, blockId) {
  const host = document.createElement('div');
  host.setAttribute('data-parsipad-translation', blockId);

  // A shadow root inherits nothing, so without bridging these the Persian in an
  // X post would render at the same size as the Persian in a Wikipedia
  // paragraph. One style read per insertion.
  const sourceStyle = getComputedStyle(source);
  host.style.setProperty('--pp-source-font-size', sourceStyle.fontSize);
  host.style.setProperty('--pp-source-line-height', sourceStyle.lineHeight);

  // An extra child of a flex or grid container tries to become a column.
  const parentDisplay = source.parentElement ? getComputedStyle(source.parentElement).display : '';
  if (parentDisplay === 'flex' || parentDisplay === 'inline-flex') {
    host.style.flexBasis = '100%';
    host.style.width = '100%';
  } else if (parentDisplay === 'grid' || parentDisplay === 'inline-grid') {
    host.style.gridColumn = '1 / -1';
  }

  applyHostTheme(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = getBlockTranslationStyles();
  shadow.appendChild(style);

  const wrapper = document.createElement('div');
  wrapper.className = 'pp-block-translation';
  wrapper.setAttribute('lang', 'fa');
  wrapper.setAttribute('dir', 'rtl');
  shadow.appendChild(wrapper);

  source.insertAdjacentElement('afterend', host);
  return { source, host, shadow };
}

function wrapperOf(record) {
  return record.shadow.querySelector('.pp-block-translation');
}

function showSkeleton(record) {
  const wrapper = wrapperOf(record);
  wrapper.textContent = '';
  const body = document.createElement('div');
  body.className = 'pp-block-body';
  for (let i = 0; i < 2; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'pp-block-skeleton';
    body.appendChild(bar);
  }
  wrapper.appendChild(body);
}

/**
 * Insert a loading placeholder after every part, immediately, before any
 * request goes out. A click always produces visible feedback and shows the user
 * where the answer will land.
 *
 * @param {{id: string, parts: Element[]}} block
 */
export function renderSkeleton(block) {
  if (rendered.has(block.id)) return;
  ensurePersianFontLoaded();

  const parts = block.parts
    .filter((source) => source.isConnected)
    .map((source) => {
      const record = mountHost(source, block.id);
      showSkeleton(record);
      return record;
    });

  if (parts.length > 0) rendered.set(block.id, { block, parts });
}

/**
 * Replace one part's content with translated text. Safe to call repeatedly
 * while a response streams.
 *
 * @param {string} blockId
 * @param {number} index
 * @param {string} text
 */
export function setPartText(blockId, index, text) {
  const record = rendered.get(blockId)?.parts[index];
  if (!record) return;

  const wrapper = wrapperOf(record);
  wrapper.textContent = '';
  const body = document.createElement('div');
  body.className = 'pp-block-body';
  body.textContent = text;
  wrapper.appendChild(body);
}

/**
 * Show a failure next to the block that failed, rather than in a corner toast.
 *
 * @param {string} blockId
 * @param {number} index
 * @param {string} message
 * @param {() => void} onRetry
 */
export function setPartError(blockId, index, message, onRetry) {
  const record = rendered.get(blockId)?.parts[index];
  if (!record) return;

  const wrapper = wrapperOf(record);
  wrapper.textContent = '';

  const error = document.createElement('div');
  error.className = 'pp-block-error';
  error.setAttribute('role', 'status');
  error.textContent = message;
  wrapper.appendChild(error);

  const footer = document.createElement('div');
  footer.className = 'pp-block-footer';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'pp-block-retry';
  retry.textContent = 'Retry';
  retry.addEventListener('click', (event) => {
    event.stopPropagation();
    if (onRetry) onRetry();
  });
  footer.appendChild(retry);
  wrapper.appendChild(footer);
}

/**
 * Add the footer row carrying the dismiss control, and the truncation note when
 * a section was capped.
 *
 * @param {string} blockId
 * @param {{truncated?: boolean, partCount?: number}} [options]
 */
export function addFooter(blockId, { truncated = false, partCount = 0 } = {}) {
  const entry = rendered.get(blockId);
  if (!entry) return;

  const last = entry.parts[entry.parts.length - 1];
  if (!last) return;

  const wrapper = wrapperOf(last);
  const footer = document.createElement('div');
  footer.className = 'pp-block-footer';

  if (truncated) {
    const note = document.createElement('span');
    note.textContent = `First ${partCount} parts`;
    footer.appendChild(note);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pp-block-dismiss';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', (event) => {
    event.stopPropagation();
    dismissBlock(blockId);
  });
  footer.appendChild(dismiss);
  wrapper.appendChild(footer);
}

/**
 * @param {string} blockId
 * @returns {boolean}
 */
export function hasRendered(blockId) {
  return rendered.has(blockId);
}

/** @returns {string[]} */
export function activeBlockIds() {
  return [...rendered.keys()];
}

/** Remove every host for a block and forget it. */
export function dismissBlock(blockId) {
  const entry = rendered.get(blockId);
  if (!entry) return;
  for (const record of entry.parts) record.host.remove();
  rendered.delete(blockId);
}

/**
 * Re-insert translations a site re-render removed, and drop the ones whose
 * source element is gone too.
 *
 * Deliberately ignores mutation records and sweeps our own small set instead:
 * one scroll on X produces hundreds of records, and inspecting them would cost
 * far more than this loop.
 */
export function sweepDetached() {
  for (const [blockId, entry] of rendered) {
    let live = 0;
    for (const record of entry.parts) {
      if (record.host.isConnected) {
        live += 1;
        continue;
      }
      if (record.source.isConnected) {
        record.source.insertAdjacentElement('afterend', record.host);
        live += 1;
      }
    }
    if (live === 0) rendered.delete(blockId);
  }
}

/** Drop everything. Used on SPA navigation and by tests. */
export function clearAllRendered() {
  for (const blockId of [...rendered.keys()]) dismissBlock(blockId);
  rendered.clear();
}
