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
import { isMissingApiKeyResponse } from '../utils/text.js';
import { batchTextNodesForTranslation, parseNumberedTranslations } from '../utils/batch.js';
import { resolveBlock } from './resolve.js';
import { showIconFor, hideIcon, repositionIcon, destroyIcon, currentIconBlock, isIconElement } from './icon.js';
import {
  renderSkeleton, setPartText, setPartError, addFooter, clearPartsFrom,
  dismissBlock, hasRendered, activeBlockIds, sweepDetached, clearAllRendered
} from './render.js';
import { label, setUiLang } from './lang.js';

const HIDE_GRACE_MS = 120;
const SWEEP_DEBOUNCE_MS = 300;
const MAX_CONCURRENT = 3;

let deps = { onMissingApiKey: () => {} };
let enabled = true;
let started = false;
// The stored setting is read asynchronously, so a toggle arriving before that
// read resolves would otherwise be clobbered by the stale stored value. Whoever
// sets the flag first wins.
let settingLoaded = false;
// Held so teardown can remove exactly the listener init added, rather than
// leaking one more live listener on every init/teardown cycle.
let storageListener = null;

let lastTarget = null;
let pendingTarget = null;
let rafHandle = 0;
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
  // The cheap early-out that makes this affordable: consecutive events over one
  // element share a target, so a resting pointer costs one comparison.
  if (event.target === lastTarget) return;
  lastTarget = event.target;
  pendingTarget = event.target;

  if (rafHandle) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = 0;
    const target = pendingTarget;
    pendingTarget = null;
    handleTarget(target);
  });
}

function handleTarget(target) {
  // The pointer landing on our own icon must not start the hide timer. The
  // icon never resolves to a block, so without this the grace period covers
  // the whole gesture instead of just the travel, and any click slower than
  // HIDE_GRACE_MS lands on an icon that has already forgotten its block.
  if (isIconElement(target)) {
    clearHide();
    return;
  }

  const block = resolveCached(target);

  if (!block) {
    scheduleHide();
    return;
  }

  // A translated block already shows its Persian; offering the icon again
  // would present an affordance that does nothing.
  if (hasRendered(block.id)) {
    scheduleHide();
    return;
  }

  clearHide();
  if (currentIconBlock()?.id === block.id) return;
  showIconFor(block, translateBlock);
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

// A hover resolved just before a teardown or navigation still fires one frame
// later otherwise, reaching showIconFor and rebuilding the icon host right
// after destroyIcon removed it.
function cancelPendingHover() {
  if (rafHandle) {
    cancelAnimationFrame(rafHandle);
    rafHandle = 0;
  }
  pendingTarget = null;
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
  return (el.textContent || '').trim();
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
  enabled = Boolean(value);
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

  chrome.storage.local.get(['block_translate_enabled', 'ui_language']).then((stored) => {
    setUiLang(stored.ui_language || 'en');
    if (settingLoaded) return;
    settingLoaded = true;
    enabled = stored.block_translate_enabled ?? true;
  }).catch(() => { settingLoaded = true; });

  storageListener = (changes, namespace) => {
    if (namespace !== 'local') return;
    if (changes.block_translate_enabled) {
      setEnabled(changes.block_translate_enabled.newValue ?? true);
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
  settingLoaded = false;
  setUiLang('en');
}
