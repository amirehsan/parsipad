/**
 * Block translate: wiring, lifecycle, and the translation request itself.
 *
 * Detection needs no observer. Resolution runs on hover, against whatever is in
 * the DOM at that moment, so dynamic content and SPA navigation need no special
 * handling on the detection side. The one observer this feature owns exists only
 * to notice when a site re-render removes a translation we inserted, and it runs
 * only while at least one translation is on screen.
 */

import { requestTranslation } from '../../lib/translation/client.js';
import { isContextInvalidated } from '../../lib/translation/errors.js';
import { isMissingApiKeyResponse } from '../utils/text.js';
import { batchTextNodesForTranslation, parseNumberedTranslations } from '../utils/batch.js';
import { detectLanguage } from '../../lib/language-detect.js';
import { MUTED_SITES_KEY, isHostMuted } from '../../lib/muted-sites.js';
import { resolveBlock } from './resolve.js';
import { elementText } from './describe.js';
import { showIconFor, hideIcon, repositionIcon, destroyIcon, currentIconBlock, isIconElement } from './icon.js';
import {
  renderSkeleton, setPartText, setPartError, addFooter, clearPartsFrom,
  dismissBlock, hasRendered, activeBlockIds, sweepDetached, clearAllRendered
} from './render.js';
import { label, setUiLang, readsPersian } from './lang.js';

// How long the pointer must rest on a new block before the icon offers it.
// Entering a block is involuntary; only stopping on one is intent, and
// nothing about the block is resolved until this elapses.
const DWELL_MS = 450;
const HIDE_GRACE_MS = 320;
// How far outside its block the pointer may stray before the icon gives up.
// Generous on purpose: the icon straddles the block's corner, and a user
// travelling to it or pausing on the way must not lose it.
const NEAR_BLOCK_PADDING = 56;
const SWEEP_DEBOUNCE_MS = 300;
const MAX_CONCURRENT = 3;
// A leaf block taller than this is a container, not a passage. Resting on a
// post's padding rather than its text resolves the whole card, whose icon then
// lands wherever the card's visible corner happens to be, often a screen edge.
// Sections are exempt by construction: their anchor is the heading, which is
// small however long the section runs.
const MAX_LEAF_VIEWPORT_FRACTION = 0.6;

let deps = { onMissingApiKey: () => {} };
// What is live right now: the stored setting, unless this site is muted.
let enabled = true;
let storedEnabled = true;
let mutedSites = [];
let started = false;
// The stored setting is read asynchronously, so a toggle arriving before that
// read resolves would otherwise be clobbered by the stale stored value. Whoever
// sets the flag first wins.
let settingLoaded = false;
let mutedLoaded = false;
// Held so teardown can remove exactly the listener init added, rather than
// leaking one more live listener on every init/teardown cycle.
let storageListener = null;

let lastTarget = null;
let lastPointer = { x: 0, y: 0 };
let dwellTimer = null;
let dwellTarget = null;
let hideTimer = null;

let sweepObserver = null;
let sweepTimer = null;

const inFlight = new Map();
let activeCount = 0;

// Re-exported so content/main.js can join the icon to its existing Escape
// dismissal chain without importing from content/blocks/icon.js directly.
export { hideIcon as hideBlockIcon } from './icon.js';

// ------------------------------------------------------------------
// Hover
// ------------------------------------------------------------------

function onPointerMove(event) {
  if (!enabled) return;
  lastPointer = { x: event.clientX, y: event.clientY };
  // mouseover fires only on entering a new element, so a resting pointer
  // produces no further events at all; this guards the rare duplicate event
  // for the target already current.
  if (event.target === lastTarget) return;
  lastTarget = event.target;

  const target = event.target;

  // The pointer reached our own icon. Change nothing.
  if (isIconElement(target)) {
    clearHide();
    clearDwell();
    return;
  }

  // Still inside the block the icon is already armed for. Moving around within
  // a paragraph must not restart the dwell, or the icon would never settle.
  const armed = currentIconBlock()?.anchor;
  if (armed?.isConnected && armed.contains(target)) {
    clearHide();
    clearDwell();
    return;
  }

  // New territory. Nothing is resolved until the pointer actually rests here:
  // crossing a paragraph on the way somewhere else is not a request to
  // translate it, and resolving on every crossing is what made this both noisy
  // and expensive.
  clearDwell();
  dwellTarget = target;
  dwellTimer = setTimeout(onDwellElapsed, DWELL_MS);

  if (!nearCurrentBlock(lastPointer.x, lastPointer.y)) scheduleHide();
}

function onDwellElapsed() {
  dwellTimer = null;
  const target = dwellTarget;
  dwellTarget = null;
  if (!target || !target.isConnected) return;

  const block = resolveCached(target);
  if (!block || hasRendered(block.id) || !isWorthOffering(block) || !isReasonablySized(block)) {
    scheduleHide();
    return;
  }

  clearHide();
  showIconFor(block, translateBlock);
}

/**
 * Whether this block is worth offering to translate at all.
 *
 * Text already in the reader's language is noise: on a Persian page it would
 * put an icon beside every paragraph for a reader who needs none of them.
 */
function isWorthOffering(block) {
  if (!readsPersian()) return true;
  const text = block.parts.map((el) => elementText(el)).join(' ');
  return detectLanguage(text) !== 'fa';
}

/**
 * Whether a leaf block's anchor is a passage rather than a container. A
 * section is always fine here: its anchor is the heading that introduces it,
 * not the run of content below, so its height says nothing about how much
 * that section holds.
 */
function isReasonablySized(block) {
  if (block.kind !== 'leaf') return true;
  const height = block.anchor.getBoundingClientRect().height;
  if (!height) return true;   // unmeasurable, do not punish it
  return height <= window.innerHeight * MAX_LEAF_VIEWPORT_FRACTION;
}

/**
 * True when the pointer is still within a tolerance of the block the icon is
 * armed for. Hovering the margin beside a paragraph, or the gap between the
 * text and the icon, resolves to no block at all; without this the hide timer
 * starts there and a moment's hesitation loses the icon.
 */
function nearCurrentBlock(x, y) {
  const anchor = currentIconBlock()?.anchor;
  if (!anchor?.isConnected) return false;
  const r = anchor.getBoundingClientRect();
  return x >= r.left - NEAR_BLOCK_PADDING && x <= r.right + NEAR_BLOCK_PADDING &&
         y >= r.top - NEAR_BLOCK_PADDING && y <= r.bottom + NEAR_BLOCK_PADDING;
}

// Only failed resolutions are cached. That is where the cost is: a hover that
// resolves reads a few hundred characters, while one that does not can walk 25
// ancestors calling describeElement on each of their children. Caching a
// successful Block would risk handing back a stale parts list after a
// re-render, which is a correctness risk the saving does not justify.
let missCache = new WeakMap();

function resolveCached(target) {
  if (missCache.has(target)) return null;
  const block = resolveBlock(target);
  if (!block) missCache.set(target, true);
  return block;
}

function scheduleHide() {
  if (hideTimer) return;
  // Grace period so the pointer can travel from the block to the icon without
  // the icon evaporating on the way.
  hideTimer = setTimeout(() => {
    hideTimer = null;
    hideIcon();
  }, HIDE_GRACE_MS);
}

function clearHide() {
  if (!hideTimer) return;
  clearTimeout(hideTimer);
  hideTimer = null;
}

function clearDwell() {
  if (dwellTimer) {
    clearTimeout(dwellTimer);
    dwellTimer = null;
  }
  dwellTarget = null;
}

// A hover resolved just before a teardown or navigation still fires one frame
// later otherwise, reaching showIconFor and rebuilding the icon host right
// after destroyIcon removed it.
function cancelPendingHover() {
  clearDwell();
  clearHide();
}

let repositionQueued = false;
function onViewportChange() {
  if (!currentIconBlock() || repositionQueued) return;
  repositionQueued = true;
  requestAnimationFrame(() => {
    repositionQueued = false;
    repositionIcon();
  });
}

// ------------------------------------------------------------------
// Reattach sweep
// ------------------------------------------------------------------

function ensureSweepObserver() {
  if (sweepObserver || activeBlockIds().length === 0) return;
  sweepObserver = new MutationObserver(() => {
    if (sweepTimer) return;
    sweepTimer = setTimeout(() => {
      sweepTimer = null;
      sweepDetached();
      stopSweepObserverIfIdle();
    }, SWEEP_DEBOUNCE_MS);
  });
  sweepObserver.observe(document.body, { childList: true, subtree: true });
}

function stopSweepObserverIfIdle() {
  if (activeBlockIds().length > 0 || !sweepObserver) return;
  sweepObserver.disconnect();
  sweepObserver = null;
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
}

// ------------------------------------------------------------------
// Translation
// ------------------------------------------------------------------

function textOf(el) {
  return elementText(el);
}

async function translateLeaf(block, controller) {
  // onDelta receives an incremental delta, not the running text, so it must be
  // accumulated here. Passing the raw chunk to setPartText, which clears the
  // wrapper before writing, replaces the visible text each time instead of
  // growing it.
  let streamed = '';
  const response = await requestTranslation(
    { text: textOf(block.parts[0]) },
    {
      signal: controller.signal,
      onDelta: (delta) => {
        streamed += delta;
        setPartText(block.id, 0, streamed);
      }
    }
  );
  return { response, apply: () => setPartText(block.id, 0, response.translation), failedAt: 0 };
}

async function translateSection(block, controller) {
  const items = block.parts.map((el) => ({ el, text: textOf(el) }));
  const batches = batchTextNodesForTranslation(items);

  let response = null;
  let offset = 0;
  for (const batch of batches) {
    if (controller.signal.aborted) break;
    const numbered = batch.map((item, index) => `[${index + 1}] ${item.text}`).join('\n');
    response = await requestTranslation(
      { text: numbered, mode: 'batch' },
      { signal: controller.signal }
    );
    if (response.error) return { response, apply: () => {}, failedAt: offset };

    const translations = parseNumberedTranslations(response.translation, batch.length);
    for (let i = 0; i < batch.length; i += 1) {
      setPartText(block.id, offset + i, translations[i] || batch[i].text);
    }
    offset += batch.length;
  }
  return { response: response || {}, apply: () => {} };
}

/**
 * Translate one block and render the result beneath it.
 *
 * @param {{id: string, kind: 'leaf'|'section', parts: Element[], truncated: boolean}} block
 */
export async function translateBlock(block) {
  if (!enabled || !block || hasRendered(block.id) || inFlight.has(block.id)) return;

  // Insert the placeholder before the request goes out, and before the
  // concurrency check, so the click always produces visible feedback even
  // when it is the one that gets capped.
  renderSkeleton(block);
  ensureSweepObserver();

  if (activeCount >= MAX_CONCURRENT) {
    // Spec section 8: a click always produces visible feedback. Silently
    // dropping it looks like the icon is broken.
    setPartError(block.id, 0, label('errorRateLimited'), () => {
      dismissBlock(block.id);
      translateBlock(block);
    });
    return;
  }

  const controller = new AbortController();
  inFlight.set(block.id, controller);
  activeCount += 1;

  let failedAt = 0;
  try {
    const result = block.kind === 'section'
      ? await translateSection(block, controller)
      : await translateLeaf(block, controller);
    const { response, apply } = result;
    failedAt = result.failedAt ?? 0;

    if (isMissingApiKeyResponse(response)) {
      dismissBlock(block.id);
      deps.onMissingApiKey();
      return;
    }
    if (response.errorCode === 'ABORTED') {
      dismissBlock(block.id);
      return;
    }
    if (response.error) {
      // The error belongs on the first part that actually failed. Putting it at
      // index 0 would overwrite a translation an earlier batch had already
      // delivered.
      setPartError(block.id, failedAt, response.error, () => {
        dismissBlock(block.id);
        translateBlock(block);
      });
      // Everything after the failure has a skeleton nothing will fill. Leaving
      // them spinning reads as a hang rather than an error.
      clearPartsFrom(block.id, failedAt + 1);
      return;
    }

    apply();
    addFooter(block.id, { truncated: block.truncated, partCount: block.parts.length });
  } catch (error) {
    if (controller.signal.aborted) {
      dismissBlock(block.id);
      return;
    }
    // Reloading the extension orphans the content scripts already in the
    // page. Chrome's own wording for that is unreadable and the retry it sits
    // next to can never succeed, so say what happened and offer the one thing
    // that fixes it.
    if (isContextInvalidated(error)) {
      setPartError(block.id, failedAt, label('errorContextInvalidated'), null, { reload: true });
      clearPartsFrom(block.id, failedAt + 1);
      return;
    }
    setPartError(block.id, failedAt, error?.message || 'Translation failed.', () => {
      dismissBlock(block.id);
      translateBlock(block);
    });
    clearPartsFrom(block.id, failedAt + 1);
  } finally {
    inFlight.delete(block.id);
    activeCount -= 1;
    stopSweepObserverIfIdle();
  }
}

// ------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------

/**
 * Translate the block holding the keyboard focus, falling back to whatever sits
 * at the centre of the viewport. This is the non-pointer path; the hover icon is
 * invisible to keyboard and touch users without it.
 */
export function translateFocusedBlock() {
  const focused = document.activeElement;
  const fallback = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  const block = resolveBlock(focused && focused !== document.body ? focused : fallback);
  if (block) translateBlock(block);
}

/** Whether block translate is currently active. */
export function isBlockTranslateEnabled() {
  return enabled;
}

/** @param {boolean} value */
export function setEnabled(value) {
  settingLoaded = true;
  storedEnabled = Boolean(value);
  applyEnabled();
}

/** Recompute the live state from the stored setting and the muted list. */
function applyEnabled() {
  enabled = storedEnabled && !isHostMuted(mutedSites, location.hostname);
  if (enabled) return;
  hideIcon();
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
  activeCount = 0;
  clearAllRendered();
  stopSweepObserverIfIdle();
}

/** Drop everything a page transition invalidates. */
export function resetForNavigation() {
  cancelPendingHover();
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
  activeCount = 0;
  clearAllRendered();
  stopSweepObserverIfIdle();
  hideIcon();
  lastTarget = null;
  // A miss cached against a pre-navigation element must not suppress a
  // resolution on whatever the SPA has put in its place.
  missCache = new WeakMap();
}

/**
 * @param {{onMissingApiKey: () => void}} dependencies
 */
export function initBlockTranslate(dependencies = {}) {
  deps = { onMissingApiKey: () => {}, ...dependencies };
  if (started) return;
  started = true;

  document.addEventListener('mouseover', onPointerMove, { passive: true });
  // scroll does not bubble, so a window-level listener only ever sees the
  // document scrolling. Capture-phase on document sees every element's scroll
  // too, since the capture phase reaches every ancestor regardless of bubbling.
  document.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('parsipad:locationchange', resetForNavigation);
  window.addEventListener('popstate', resetForNavigation);

  chrome.storage.local.get(['block_translate_enabled', MUTED_SITES_KEY, 'ui_language']).then((stored) => {
    setUiLang(stored.ui_language || 'en');
    // Each key yields to a change that already arrived for it.
    if (!settingLoaded) {
      settingLoaded = true;
      storedEnabled = stored.block_translate_enabled ?? true;
    }
    if (!mutedLoaded) {
      mutedLoaded = true;
      mutedSites = Array.isArray(stored[MUTED_SITES_KEY]) ? stored[MUTED_SITES_KEY] : [];
    }
    applyEnabled();
  }).catch(() => { settingLoaded = true; mutedLoaded = true; });

  storageListener = (changes, namespace) => {
    if (namespace !== 'local') return;
    if (changes.block_translate_enabled) {
      setEnabled(changes.block_translate_enabled.newValue ?? true);
    }
    if (changes[MUTED_SITES_KEY]) {
      mutedLoaded = true;
      mutedSites = Array.isArray(changes[MUTED_SITES_KEY].newValue) ? changes[MUTED_SITES_KEY].newValue : [];
      applyEnabled();
    }
    if (changes.ui_language) {
      setUiLang(changes.ui_language.newValue || 'en');
    }
  };
  chrome.storage.onChanged.addListener(storageListener);
}

/** Remove every listener and surface. Used by tests. */
export function teardownBlockTranslate() {
  document.removeEventListener('mouseover', onPointerMove);
  document.removeEventListener('scroll', onViewportChange, { capture: true });
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('parsipad:locationchange', resetForNavigation);
  window.removeEventListener('popstate', resetForNavigation);
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }
  cancelPendingHover();
  resetForNavigation();
  destroyIcon();
  started = false;
  enabled = true;
  storedEnabled = true;
  mutedSites = [];
  settingLoaded = false;
  mutedLoaded = false;
  setUiLang('en');
}
