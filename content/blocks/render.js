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

  // Index-aligned with block.parts, holes and all. The caller batches over the
  // original array and calls setPartText with those indices, so compacting here
  // would shift every later part down: a translation meant for one paragraph
  // would land under the next, and the last would fall out of bounds. That is
  // the misattribution this module exists to prevent, scoped to one block.
  const parts = block.parts.map((source) => {
    if (!source.isConnected) return null;
    const record = mountHost(source, block.id);
    showSkeleton(record);
    return record;
  });

  if (parts.some(Boolean)) rendered.set(block.id, { block, parts });
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
 * The translated text currently rendered for one part, or null when that slot
 * holds no record or nothing has been written to it yet.
 *
 * This exists because the shadow root is closed, so nothing outside this module
 * can observe what was rendered or which paragraph it landed under. Without it
 * the index-alignment guarantee in renderSkeleton is unobservable, and a change
 * that reintroduced array compaction would put a translation under the wrong
 * paragraph with no test able to fail.
 *
 * Reading is all it offers. The root stays closed, so a host page script still
 * cannot reach our UI.
 *
 * @param {string} blockId
 * @param {number} index
 * @returns {string | null}
 */
export function renderedTextFor(blockId, index) {
  const record = rendered.get(blockId)?.parts[index];
  if (!record) return null;
  return record.shadow.querySelector('.pp-block-body')?.textContent ?? null;
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

  // The last part actually on screen. Blindly taking the final slot would
  // anchor the dismiss control to a hole, or to a record already swept out,
  // leaving a visible translation the user has no way to dismiss.
  const last = [...entry.parts].reverse().find((record) => record && record.host.isConnected);
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
  for (const record of entry.parts) {
    if (record) record.host.remove();
  }
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
    entry.parts.forEach((record, index) => {
      if (!record) return;
      if (record.host.isConnected) {
        live += 1;
        return;
      }
      if (record.source.isConnected) {
        record.source.insertAdjacentElement('afterend', record.host);
        live += 1;
        return;
      }
      // Both gone. Clear the slot so the dead record is not retained, but keep
      // the hole so the surviving indices stay aligned.
      entry.parts[index] = null;
    });
    if (live === 0) rendered.delete(blockId);
  }
}

/**
 * Remove the hosts for every part from `index` onward, leaving holes so the
 * surviving indices stay aligned.
 *
 * A failed batch leaves later parts holding a skeleton nothing will ever fill.
 * Without this they spin indefinitely, which reads to a user as a hang rather
 * than as the error it is.
 */
export function clearPartsFrom(blockId, index) {
  const entry = rendered.get(blockId);
  if (!entry) return;
  for (let i = index; i < entry.parts.length; i += 1) {
    const record = entry.parts[i];
    if (!record) continue;
    record.host.remove();
    entry.parts[i] = null;
  }
}

/** Drop everything. Used on SPA navigation and by tests. */
export function clearAllRendered() {
  for (const blockId of [...rendered.keys()]) dismissBlock(blockId);
  rendered.clear();
}
