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

import { ensurePersianFontLoaded } from '../host-page.js';
import { getBlockTranslationStyles } from './styles.js';
import { label } from './lang.js';
import { parseColor, isDarkBackground, readableTextColor, chromeColors } from './contrast.js';

/**
 * @typedef {Object} PartRecord
 * @property {Element} source
 * @property {HTMLElement} host
 * @property {ShadowRoot} shadow
 * @property {number} sourceLength - source.textContent, trimmed, at mount
 *   time. Lets the reattach sweep tell a genuinely detached source from one a
 *   virtualized list has repurposed for different data.
 */

/** @type {Map<string, {block: object, parts: PartRecord[]}>} */
const rendered = new Map();

/**
 * The colour actually behind an element.
 *
 * Most elements are transparent, so the visible background belongs to some
 * ancestor. Walking up for the first opaque one is what lets a block on a dark
 * card get dark-card treatment even when the page as a whole is light.
 */
function backgroundBehind(el) {
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const colour = parseColor(getComputedStyle(node).backgroundColor);
    if (colour && colour.a >= 0.1) return colour;
    node = node.parentElement;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

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

  // Not applyHostTheme: that reads document.body once for the whole page and
  // would overwrite data-theme with that page-level guess on the next host-page
  // mutation, clobbering the per-block reading below. A block sitting on a card
  // of a different shade than the page needs its own measurement.
  const background = backgroundBehind(source);
  const chrome = chromeColors(background);
  host.setAttribute('data-theme', isDarkBackground(background) ? 'dark' : 'light');
  host.style.setProperty('--pp-source-color', readableTextColor(parseColor(sourceStyle.color), background));
  host.style.setProperty('--pp-chrome-text', chrome.text);
  host.style.setProperty('--pp-chrome-border', chrome.border);
  host.style.setProperty('--pp-chrome-hover', chrome.hover);

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
  return { source, host, shadow, sourceLength: (source.textContent || '').trim().length };
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
 * holds no record. A slot that has a record but has not been written to yet
 * (immediately after renderSkeleton, before any setPartText call) reads back
 * as the empty string, not null, because showSkeleton already builds a
 * .pp-block-body. Only the absence of a record itself is null.
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
 * @param {{reload?: boolean}} [options] - reload offers the page a refresh
 *   instead of a retry, for a failure that retrying cannot clear.
 */
export function setPartError(blockId, index, message, onRetry, { reload = false } = {}) {
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
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'pp-block-retry';
  action.textContent = label(reload ? 'blockTranslateReload' : 'blockTranslateRetry');
  action.addEventListener('click', (event) => {
    event.stopPropagation();
    // A content script cut off from its extension cannot reach the background
    // at all, so a retry here would raise the same error every time.
    if (reload) {
      window.location.reload();
      return;
    }
    if (onRetry) onRetry();
  });
  footer.appendChild(action);
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
    note.textContent = label('blockTranslateTruncated').replace('{count}', partCount);
    footer.appendChild(note);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pp-block-dismiss';
  dismiss.textContent = label('blockTranslateDismiss');
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
      if (record.source.isConnected &&
          (record.source.textContent || '').trim().length === record.sourceLength) {
        record.source.insertAdjacentElement('afterend', record.host);
        live += 1;
        return;
      }
      // Either the source is gone, or it is still present but now holds
      // different text, which is what a virtualized list does when it
      // repurposes a node for different data. Reattaching there would put
      // this translation under content it does not belong to, so clear the
      // slot. The hole is kept so the surviving indices stay aligned.
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
  // Nothing visible left. Drop the entry rather than leaving hasRendered true
  // for a block with no UI, which would make a later hover silently do nothing.
  if (!entry.parts.some(Boolean)) rendered.delete(blockId);
}

/** Drop everything. Used on SPA navigation and by tests. */
export function clearAllRendered() {
  for (const blockId of [...rendered.keys()]) dismissBlock(blockId);
  rendered.clear();
}
