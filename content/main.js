/**
 * ParsiPad Content Script
 * Handles text selection detection and floating translation box
 */

import { escapeHtml, isMissingApiKeyError, isMissingApiKeyResponse } from './utils/text.js';
import {
  getPageConfirmStyles,
  getPageProgressStyles,
  getPageToggleStyles,
  getScreenshotStyles,
  getSelectionPopupStyles,
  getStyles,
  themeVars
} from './styles/index.js';
import { t } from '../lib/i18n.js';
import { getTextDirection, detectLanguage } from '../lib/language-detect.js';
import { requestTranslation } from '../lib/translation/client.js';
import { ERROR_CODES, errorI18nKey, isContextInvalidated, toTranslationError } from '../lib/translation/errors.js';
import { renderReloadState } from './reload-state.js';
import { captureSelectionContext, sentenceAround } from './context.js';
import { computeBoxPosition } from './placement.js';
import { renderCard, injectCardStyles } from '../shared/card/index.js';
import { canSpeak, speak, cancelSpeech } from '../shared/speech.js';
import { applySourceOverride } from '../shared/source-override.js';
import { batchTextNodesForTranslation, parseNumberedTranslations } from './utils/batch.js';
import { createPageRun, markBatch, failedIndexes, unfinishedIndexes, summarizeRun, summaryMessageKey } from './utils/page-run.js';
import { applyHostTheme, ensurePersianFontLoaded } from './host-page.js';
import { selectionToReport, createSelectionReporter, isEditableSelection, MAX_REPORT_LENGTH } from './selection-report.js';
import { createToolbarTrigger, selectionAnchor, isSameAnchor } from './toolbar-trigger.js';
import { MUTED_SITES_KEY, isHostMuted, normalizeHost, addMutedSite, removeMutedSite } from '../lib/muted-sites.js';
import { rovingIndex, applyRovingTabindex } from '../lib/roving.js';
import { confirmPageTranslation, countParagraphs, CONFIRM_PAGE_TRANSLATE_KEY } from './page-confirm.js';
import {
  estimateTranslationCost,
  formatEstimateUsd,
  PROVIDER_NAMES,
  SELECTED_PROVIDER_KEY,
  DEFAULT_PROVIDER_ID
} from '../lib/cost-estimate.js';
import { initBlockTranslate, translateFocusedBlock, hideBlockIcon, isBlockTranslateEnabled } from './blocks/index.js';

// Re-injection guard: skip if the script has already run in this isolated world.
// Without this, chrome.scripting.executeScript on an already-injected tab throws
// "Identifier 'X' has already been declared" and the action fails silently.
if (window.__parsipadContentLoaded) {
  // No-op; existing instance handles messages.
} else {
  window.__parsipadContentLoaded = true;

// State
let floatingBox = null;
let shadowRoot = null;
let selectionPopup = null;
let selectionPopupShadow = null;
let selectionPopupEnabled = false;
// True when this page's host is on the muted-sites list. Loaded on init and
// kept current by the chrome.storage.onChanged listener below. mutedLoaded
// turns true at the first write (a change, a mute from the toolbar, or the
// initial load), so the initial load never overwrites a newer value.
let siteMuted = false;
let mutedLoaded = false;
// Cached user-language preference for translating floating-box copy. Read once
// on init and kept fresh by the chrome.storage.onChanged listener below.
let userLang = 'en';
// What the selection toolbar on screen was built for (text and range
// rectangle), so a selectionchange that moves nothing does not rebuild it.
let selectionPopupAnchor = null;
// The keyboard path through the toolbar: the element focused when Tab moved
// focus in, which gets it back when the toolbar closes or Tab leaves it, and
// whether focus has already left this toolbar, after which Tab passes it by.
let selectionPopupReturnFocus = null;
let selectionPopupFocusLeft = false;
let currentPolishOriginalText = null; // Store original text for regeneration
let currentTranslationData = null; // Store current translation for favorites
let currentDictionaryData = null; // Store current dictionary result for favorites
// The selection the current box is anchored to, in viewport coordinates.
// Kept so the box can be placed again once its real size is known, and
// again if streamed content grows it past the bottom edge.
let boxSelectionRect = null;
// Once a user opens the other meanings, keep them open for the rest of the
// page's life rather than making them reopen it on every lookup.
let sensesExpandedForSession = false;
// The card currently on screen, and the context the selection came from.
// The card is where grammar points and the sentence highlight are appended
// after the fact; the context is what a sentence request is built from.
let currentCardEl = null;
let currentSelectionContext = null;
// Focus moves into the box when it opens and back out when it closes, so
// keyboard users are not dropped back at the top of the page.
let previouslyFocused = null;
let boxNeedsFocus = false;
// The correction the user last made with the swap control, as the pair it
// was made against. See shared/source-override.js for why it is a pair and
// not just a language.
let manualSourceOverride = null;
// Whether what is on screen is already in favourites. Tracked here so a
// re-render, after a swap or a sentence expansion, draws the save control
// in the right state instead of flashing unsaved and correcting itself.
let translationIsSaved = false;

// Screenshot selection state
let screenshotOverlay = null;
let screenshotShadow = null;

// Page translation state
let pageTranslationState = null;
let pageProgressOverlay = null;
let pageProgressShadow = null;
let pageToggleButton = null;
let pageToggleShadow = null;
let pageTranslationAbortController = null;
// Aborted when the floating box closes, so a translation nobody will see
// stops streaming, and stops being billed, at once.
let boxAbortController = null;


/**
 * Initialize the content script
 */
function init() {
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessage);

  // Listen for clicks outside to close the box
  document.addEventListener('click', handleDocumentClick);

  // Listen for Escape key to close the box
  document.addEventListener('keydown', handleKeyDown);

  // Selection toolbar: one trigger for mouse, touch and keyboard selection.
  // A gesture that starts on the toolbar or the floating box does not hide
  // the toolbar, so a toolbar button is not removed before its click lands.
  // A touch long-press ends in pointercancel rather than pointerup, so both
  // end the gesture. The capture phase sees the pointer lift even on a page
  // that stops its propagation, so the trigger is never left waiting.
  const toolbarTrigger = createToolbarTrigger({
    evaluate: evaluateSelection,
    hide: removeSelectionPopup
  });
  document.addEventListener('pointerdown', (event) => {
    // Only the primary button selects text. A right-click opens a menu, and
    // on macOS its release goes to the menu rather than the page.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    toolbarTrigger.onPointerDown(isPointerOnOwnUi(event));
  }, { capture: true });
  document.addEventListener('pointerup', toolbarTrigger.onPointerUp, { capture: true });
  document.addEventListener('pointercancel', toolbarTrigger.onPointerUp, { capture: true });
  document.addEventListener('selectionchange', toolbarTrigger.onSelectionChange);

  // Tell the side panel what is selected so it can offer a one-click translate
  const reportSelection = createSelectionReporter((text) => {
    // Rejects when no panel is listening or the extension was reloaded under
    // this page; neither is worth surfacing.
    try {
      // Action name literal: content modules cannot import ACTIONS (lib/constants.js)
      chrome.runtime.sendMessage({ action: 'SELECTION_CHANGED', text }).catch(() => {});
    } catch {
      // Extension context invalidated
    }
  });
  document.addEventListener('selectionchange', () => {
    reportSelection(() => selectionToReport(document.getSelection(), document.activeElement));
  });

  // Load selection popup setting
  loadSelectionPopupSetting();
  loadMutedSites();
  loadUserLang();

  // Listen for storage changes to update settings + UI language
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    if (changes.selection_popup_enabled) {
      selectionPopupEnabled = changes.selection_popup_enabled.newValue ?? false;
    }
    if (changes.ui_language) {
      userLang = changes.ui_language.newValue || 'en';
    }
    if (changes[MUTED_SITES_KEY]) {
      mutedLoaded = true;
      siteMuted = isHostMuted(changes[MUTED_SITES_KEY].newValue, location.hostname);
      if (siteMuted) removeSelectionPopup();
    }
  });

  // Block translate owns its own hover, storage and observer wiring; it needs
  // only the toast, which lives here.
  initBlockTranslate({ onMissingApiKey: showMissingApiKeyToast });

  // Reset page translation state on SPA navigation. SPAs swap content via
  // pushState/replaceState without firing a full page load, so the old
  // TextNode refs become stale and the toggle button points at nothing.
  installSpaNavigationListener();
}

/**
 * Patch history pushState/replaceState to emit a navigation event and listen
 * for popstate; on a route change put the original text back and reset
 * stale page-translation state.
 */
function installSpaNavigationListener() {
  // A route is its origin, path and query. A hash change, or the same-URL
  // replaceState many sites call as the reader scrolls, is the same page,
  // and resetting on it would silently revert a translated page.
  const routeOf = () => location.origin + location.pathname + location.search;
  let lastRoute = routeOf();

  const handleNav = () => {
    const route = routeOf();
    if (route === lastRoute) return;
    lastRoute = route;

    // A running translation is discarded: its run sees it no longer owns
    // pageTranslationState and stops without applying or saying anything.
    if (pageTranslationAbortController) {
      pageTranslationAbortController.abort();
      pageTranslationAbortController = null;
    }

    // Put back the text of nodes the SPA kept; restorePageOriginals skips
    // the ones it took away.
    if (pageTranslationState?.isShowingTranslated) {
      restorePageOriginals();
    }
    // A summary's Retry failed would act on the page that is gone.
    pageTranslationState?.closeSummary?.();

    if (pageProgressOverlay) {
      hidePageProgressOverlay();
    }
    if (pageToggleButton) {
      pageToggleButton.remove();
      pageToggleButton = null;
      pageToggleShadow = null;
    }
    pageTranslationState = null;
  };

  window.addEventListener('popstate', handleNav);

  const wrap = (method) => {
    const original = history[method];
    if (!original || original.__parsipadPatched) return;
    const patched = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('parsipad:locationchange'));
      return result;
    };
    patched.__parsipadPatched = true;
    history[method] = patched;
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('parsipad:locationchange', handleNav);

  // The Navigation API is shared DOM state, so it reports a pushState the
  // page makes in its own world, which the patch above (in this isolated
  // world) never sees. The patch and popstate stay for browsers without it;
  // handleNav's route comparison ignores the duplicate events.
  if (typeof window.navigation?.addEventListener === 'function') {
    window.navigation.addEventListener('currententrychange', handleNav);
  }
}

/**
 * Handle messages from background script
 */
function handleMessage(message, sender, sendResponse) {
  // Only accept messages from this extension's own service worker/popup.
  // sender.id is undefined for messages from web pages and differs for other extensions.
  if (sender?.id && sender.id !== chrome.runtime.id) {
    return;
  }
  switch (message.action) {
    case 'PING':
      // Service worker checking if content script is loaded
      sendResponse({ success: true });
      return true;

    case 'GET_SELECTION':
      // The side panel pulls the current selection when it opens or the tab
      // changes; the push path alone misses text selected beforehand.
      // Action name literal: content modules cannot import ACTIONS (lib/constants.js)
      sendResponse({ text: selectionToReport(document.getSelection(), document.activeElement) });
      return false;

    case 'SHOW_TRANSLATION':
      // Context menu triggered - translate the text
      translateAndShow(message.text);
      break;

    case 'SHOW_POLISH':
      // Context menu triggered - polish the text
      polishAndShow(message.text);
      break;

    case 'TRANSLATE_SELECTION':
      // Keyboard shortcut triggered - get current selection
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (selectedText) {
        translateAndShow(selectedText);
      }
      break;

    case 'SHOW_DICTIONARY':
      // Context menu triggered - look up word
      dictionaryAndShow(message.word);
      break;

    case 'DICTIONARY_SELECTION':
      // Keyboard shortcut (Alt+D) triggered - get current selection
      const dictSelection = window.getSelection();
      const selectedWord = dictSelection?.toString().trim();
      if (selectedWord && selectedWord.split(/\s+/).length === 1) {
        dictionaryAndShow(selectedWord);
      }
      break;

    case 'TRANSLATE_PAGE':
      // Translate entire page
      handleTranslatePage();
      break;

    case 'CANCEL_PAGE_TRANSLATION':
      // Stop page translation, keeping what finished
      stopPageTranslation();
      break;

    case 'TOGGLE_PAGE_TRANSLATION':
      // Toggle between original and translated
      handleTogglePageTranslation();
      break;

    case 'GET_PAGE_TRANSLATION_STATE':
      // Return current page translation state
      sendResponse({
        isTranslated: pageTranslationState?.isTranslated || false,
        isTranslating: pageTranslationState?.isTranslating || false,
        isShowingTranslated: pageTranslationState?.isShowingTranslated || false
      });
      return true;

    case 'START_SCREENSHOT_SELECT':
      startScreenshotSelection(message.screenshotDataUrl);
      break;
  }

  sendResponse({ success: true });
  return true;
}

/**
 * Translate text and show floating box. Long selections stream into the box.
 */
async function translateAndShow(text, { sourceLang } = {}) {
  if (!text || text.trim().length === 0) {
    return;
  }

  const resolved = applySourceOverride({
    detected: detectLanguage(text),
    chosen: sourceLang,
    override: manualSourceOverride
  });
  manualSourceOverride = resolved.override;
  const requestedSourceLang = resolved.sourceLang;

  const selection = window.getSelection();
  // Both reads happen before the box exists: taking focus clears the
  // selection, and neither the rectangle nor the context survives that.
  const selectionRect = captureSelectionRect(selection);
  const context = captureSelectionContext(selection);
  currentSelectionContext = context;

  createFloatingBox(selectionRect);
  showLoading();
  placeFloatingBox();

  boxAbortController?.abort();
  boxAbortController = new AbortController();

  let streamed = '';
  try {
    const response = await requestTranslation({ text, sourceLang: requestedSourceLang, context }, {
      signal: boxAbortController.signal,
      onDelta: (delta) => {
        streamed += delta;
        showStreamingText(streamed);
      }
    });

    if (response.errorCode === 'ABORTED') {
      // User-initiated cancel or a dropped port; not an error the user
      // needs to be told about. Stop quietly, same as page translation.
      return;
    }

    if (response.error) {
      showError(response);
    } else {
      showTranslation(response, text);
    }
  } catch (error) {
    showError(error);
  }
}

/**
 * Render partial streamed text in place of the loading skeleton.
 */
function showStreamingText(text) {
  if (!shadowRoot) return;
  const content = shadowRoot.querySelector('.parsipad-content');
  let textEl = content.querySelector('.parsipad-text');
  if (!textEl) {
    content.replaceChildren();
    textEl = document.createElement('div');
    textEl.className = 'parsipad-text';
    content.appendChild(textEl);
  }
  textEl.setAttribute('dir', getTextDirection(text));
  textEl.textContent = text;

  keepFloatingBoxInViewport();
}

/**
 * Polish text and show floating box with 3 versions
 */
async function polishAndShow(text) {
  if (!text || text.trim().length === 0) {
    return;
  }

  // Store original text for regeneration
  currentPolishOriginalText = text;

  // Capture the selection rectangle before the box takes focus and clears it.
  const selectionRect = captureSelectionRect(window.getSelection());

  // Create or update the polish floating box
  createPolishBox(selectionRect);
  showPolishLoading();
  placeFloatingBox();

  try {
    // Send polish request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'POLISH',
      text: text
    });

    if (response.error) {
      showPolishError(response);
    } else {
      showPolishResults(response);
    }
  } catch (error) {
    showPolishError(error);
  }
}

const BOX_GAP = 8;
const BOX_VIEWPORT_PADDING = 12;
// Where an unanchored box goes: the keyboard and context-menu paths can
// reach a box with no live selection to sit under.
const UNANCHORED_BOX_OFFSET = 100;

/**
 * The selection's rectangle in viewport coordinates, in the shape
 * computeBoxPosition expects. Null when nothing is selected.
 *
 * Captured before the box is created, because taking focus clears the
 * selection and the rectangle is unrecoverable after that.
 *
 * @param {Selection|null} selection
 * @returns {{top: number, bottom: number, left: number}|null}
 */
function captureSelectionRect(selection) {
  if (!selection || selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, left: rect.left };
}

/**
 * Place the box now that it has been rendered and can be measured.
 *
 * The box is created hidden precisely so this can happen: measuring real
 * content beats the height estimate the old placement guessed with, which
 * is what used to leave a tall result hanging off the bottom of the
 * viewport until a separate clamping pass nudged it back.
 *
 * Safe to call more than once. Every renderer calls it after its content
 * lands, since the content is what determines the size.
 */
function placeFloatingBox() {
  if (!floatingBox) return;

  if (!boxSelectionRect) {
    floatingBox.style.top = `${window.scrollY + UNANCHORED_BOX_OFFSET}px`;
    floatingBox.style.left = `${window.scrollX + UNANCHORED_BOX_OFFSET}px`;
    floatingBox.style.visibility = 'visible';
    focusBoxOnce();
    return;
  }

  const rect = floatingBox.getBoundingClientRect();
  const { top, left } = computeBoxPosition({
    selection: boxSelectionRect,
    box: { width: rect.width, height: rect.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    gap: BOX_GAP,
    padding: BOX_VIEWPORT_PADDING
  });

  floatingBox.style.top = `${top}px`;
  floatingBox.style.left = `${left}px`;
  floatingBox.style.visibility = 'visible';
  focusBoxOnce();
}

/**
 * Move focus into the box the first time it becomes visible.
 *
 * Deferred to here rather than done at creation because a hidden element
 * cannot take focus, and placement is the moment it stops being hidden.
 * Scrolling is suppressed: the box was just positioned against the
 * selection, so the viewport is already where it should be.
 */
function focusBoxOnce() {
  if (!boxNeedsFocus || !shadowRoot) return;
  const box = shadowRoot.querySelector('.parsipad-box');
  if (!box) return;
  boxNeedsFocus = false;
  box.focus({ preventScroll: true });
}

/**
 * Re-place the box only if growing content has pushed it off the bottom.
 *
 * Streaming calls this on every delta, so re-placing unconditionally would
 * slide the text upward while the user is reading it.
 */
function keepFloatingBoxInViewport() {
  if (!floatingBox) return;
  const rect = floatingBox.getBoundingClientRect();
  if (rect.bottom <= window.innerHeight - BOX_VIEWPORT_PADDING) return;
  placeFloatingBox();
}

/**
 * The shared opening moves for every floating box: drop whatever box is
 * on screen, remember what this one is anchored to, and build a host that
 * is laid out but not yet painted.
 *
 * @param {{top: number, bottom: number, left: number}|null} selectionRect
 * @returns {HTMLElement} the host element, not yet in the document
 */
function createBoxHost(selectionRect) {
  // Ordered: closing the old box hands focus back to whatever it took it
  // from, and only then is the element this box will return to captured.
  removeFloatingBox();
  previouslyFocused = document.activeElement;
  boxNeedsFocus = true;
  boxSelectionRect = selectionRect || null;

  const host = document.createElement('div');
  host.id = 'parsipad-host';
  host.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    z-index: 2147483647;
  `;
  return host;
}

/**
 * Create the floating translation box with Shadow DOM
 */
function createFloatingBox(selectionRect) {
  // Persian type in the box relies on faces registered on the host document.
  ensurePersianFontLoaded();

  const host = createBoxHost(selectionRect);

  // Create shadow root for style isolation
  shadowRoot = host.attachShadow({ mode: 'closed' });

  applyHostTheme(host);
  // Inject styles
  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);
  // The card brings its own rules; the box's shell styles above stay as they are.
  injectCardStyles(shadowRoot, document);

  // Create box structure
  const box = document.createElement('div');
  box.className = 'parsipad-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'ParsiPad translation');
  // Focusable by script but not in the tab order: focus is moved here when
  // the box opens and handed back when it closes.
  box.setAttribute('tabindex', '-1');
  box.innerHTML = `
    <div class="parsipad-header">
      <div class="parsipad-logo">
        <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="" class="parsipad-logo-icon" aria-hidden="true">
        <span class="parsipad-logo-text">ParsiPad</span>
      </div>
      <div class="parsipad-badges">
        <span class="parsipad-badge"></span>
        <span class="parsipad-provider-badge"></span>
      </div>
      <button class="parsipad-close" type="button" title="Close" aria-label="Close translation">×</button>
    </div>
    <div class="parsipad-content" aria-live="polite" aria-atomic="true">
      <div class="parsipad-text"></div>
    </div>
    <div class="parsipad-review-slot"></div>
    <div class="parsipad-footer">
      <span class="parsipad-cache-badge"></span>
      <div class="parsipad-footer-actions">
        <button class="parsipad-favorite" type="button" title="Add to favorites" aria-label="Add to favorites" aria-pressed="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button class="parsipad-copy" type="button" aria-label="Copy translation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy
        </button>
      </div>
    </div>
  `;

  shadowRoot.appendChild(box);
  document.body.appendChild(host);

  floatingBox = host;

  // Set up event listeners
  const closeBtn = shadowRoot.querySelector('.parsipad-close');
  closeBtn.addEventListener('click', removeFloatingBox);

  const copyBtn = shadowRoot.querySelector('.parsipad-copy');
  copyBtn.addEventListener('click', handleCopy);

  const favBtn = shadowRoot.querySelector('.parsipad-favorite');
  favBtn.addEventListener('click', handleTranslationFavorite);

  // Prevent clicks inside box from closing it
  box.addEventListener('click', (e) => e.stopPropagation());

  const headerEl = shadowRoot.querySelector('.parsipad-header');
  enableDrag(host, headerEl);
}

function enableDrag(host, header) {
  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let startLeft = 0;
  let dragging = false;

  header.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;

    const rect = host.getBoundingClientRect();
    startTop = rect.top + window.scrollY;
    startLeft = rect.left + window.scrollX;
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;

    header.classList.add('parsipad-dragging');
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const width = host.offsetWidth;

    const minLeft = window.scrollX - (width - 40);
    const maxLeft = window.scrollX + window.innerWidth - 40;
    const minTop = window.scrollY;
    const maxTop = window.scrollY + window.innerHeight - 36;

    const newLeft = Math.min(Math.max(startLeft + dx, minLeft), maxLeft);
    const newTop = Math.min(Math.max(startTop + dy, minTop), maxTop);

    host.style.left = `${newLeft}px`;
    host.style.top = `${newTop}px`;
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('parsipad-dragging');
  };

  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);
}

/**
 * Show loading state in the floating box
 */
function showLoading() {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-content');
  content.innerHTML = `
    <div class="parsipad-loading" role="status" aria-label="Translating">
      <div class="parsipad-skeleton"></div>
      <div class="parsipad-skeleton"></div>
      <div class="parsipad-skeleton"></div>
    </div>
  `;

  // Hide footer during loading
  const footer = shadowRoot.querySelector('.parsipad-footer');
  footer.style.display = 'none';
}

/**
 * Format direction for display (e.g., 'ru-fa' -> 'RU → FA')
 * @param {string} direction - Direction string like 'en-fa' or 'fa-en'
 * @returns {string} - Formatted display string
 */
function formatDirectionBadge(direction) {
  const parts = direction.split('-');
  if (parts.length === 2) {
    return `${parts[0].toUpperCase()} → ${parts[1].toUpperCase()}`;
  }
  return direction.toUpperCase();
}

/**
 * The card's Listen handler, or null when there is nothing speakable.
 *
 * Returning null omits the control entirely, which is how a Persian
 * result ends up with no Listen button without the card needing to know
 * why. The card decides which side of the pair to speak and hands the
 * text over, so the choice is made once, in the card.
 *
 * @param {Object} result
 * @returns {Function|null}
 */
function buildListenHandler(result) {
  const spoken = result.direction && result.direction.startsWith('en')
    ? result.sourceText
    : result.translation;
  if (!canSpeak(spoken)) return null;
  return (text) => speak(text || spoken);
}

/**
 * The card's Sentence handler, or null when there is no sentence to grow into.
 *
 * Only a word or a phrase has anywhere to expand to, and only if the
 * captured context actually holds a sentence around it. Returning null
 * omits the control, so the affordance never appears where activating it
 * would just resend the same words.
 *
 * @param {Object} result
 * @param {string} originalText
 * @returns {Function|null}
 */
function buildSentenceHandler(result, originalText) {
  if (result.mode !== 'word' && result.mode !== 'phrase') return null;

  const context = currentSelectionContext;
  const sentence = sentenceAround({
    before: context && context.before,
    selection: originalText,
    after: context && context.after
  });
  if (!sentence) return null;

  return async () => {
    showLoading();
    placeFloatingBox();

    boxAbortController?.abort();
    boxAbortController = new AbortController();

    try {
      const response = await requestTranslation({
        text: sentence,
        sourceLang: applySourceOverride({
          detected: detectLanguage(sentence),
          override: manualSourceOverride
        }).sourceLang,
        mode: 'sentence',
        context
      }, { signal: boxAbortController.signal });

      if (response.errorCode === 'ABORTED') return;

      if (response.error) {
        showError(response);
        return;
      }

      showTranslation(response, sentence);
      highlightInSource(originalText);
    } catch (error) {
      showError(error);
    }
  };
}

/**
 * Mark the originating word inside the sentence card's source line.
 *
 * Only the source side is highlighted. Where the word landed in the
 * Persian cannot be derived reliably from the English, and a highlight on
 * the wrong word is worse than none at all.
 *
 * @param {string} word
 */
function highlightInSource(word) {
  const needle = (word || '').trim();
  if (!currentCardEl || !needle) return;

  const textEl = currentCardEl.querySelector('.pp-card-source-text');
  if (!textEl) return;

  const source = textEl.textContent || '';
  const at = source.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return;

  const mark = document.createElement('mark');
  mark.className = 'parsipad-source-match';
  mark.textContent = source.slice(at, at + needle.length);

  textEl.replaceChildren(
    document.createTextNode(source.slice(0, at)),
    mark,
    document.createTextNode(source.slice(at + needle.length))
  );
}

/**
 * The slot the grammar block renders into, created on first use and
 * placed above the card's footer so the actions stay at the bottom.
 * @returns {HTMLElement|null}
 */
function grammarSlot() {
  if (!currentCardEl) return null;

  const existing = currentCardEl.querySelector('.parsipad-grammar-slot');
  if (existing) return existing;

  const slot = document.createElement('div');
  slot.className = 'parsipad-grammar-slot';
  const footerEl = currentCardEl.querySelector('.pp-card-footer');
  if (footerEl) currentCardEl.insertBefore(slot, footerEl);
  else currentCardEl.appendChild(slot);
  return slot;
}

/**
 * Put a grammar failure in the grammar slot and nowhere else.
 * @param {HTMLElement} slot
 * @param {string} message
 */
function showGrammarError(slot, message) {
  const err = document.createElement('div');
  err.className = 'parsipad-grammar-error';
  err.textContent = message;
  slot.replaceChildren(err);
  keepFloatingBoxInViewport();
}

/**
 * The card's Explain handler, or null for a single word.
 *
 * The lesson costs extra tokens, so the request only fires on an explicit
 * click. Whatever comes back, and whatever goes wrong, lands in the
 * grammar slot: the translation the user is already reading is never
 * touched.
 *
 * @param {Object} result
 * @param {string} originalText
 * @returns {Function|null}
 */
function buildGrammarHandler(result, originalText) {
  const source = originalText || result.sourceText || '';
  if (!source || source.trim().split(/\s+/).length < 2) return null;

  return async () => {
    const slot = grammarSlot();
    if (!slot) return;

    const loading = document.createElement('div');
    loading.className = 'parsipad-grammar-empty';
    loading.setAttribute('role', 'status');
    loading.textContent = t('loadingLesson', userLang) || 'Loading...';
    slot.replaceChildren(loading);
    keepFloatingBoxInViewport();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'EXPLAIN_GRAMMAR',
        source,
        translation: result.translation,
        direction: result.direction
      });

      if (response && response.error) {
        showGrammarError(slot, response.error);
        return;
      }

      renderInlineGrammar(slot, (response && response.grammar) || [], source, result.translation, result.direction);
      keepFloatingBoxInViewport();
    } catch (error) {
      showGrammarError(slot, (error && error.message) || 'Failed to load grammar.');
    }
  };
}

/**
 * Show translation result.
 *
 * Everything inside the content area is the card's business now. What
 * stays here is what belongs to the host rather than to the card: the
 * favourites record, the box's own header badge, placement, and the
 * callbacks that reach Chrome.
 */
function showTranslation(result, originalText) {
  if (!shadowRoot) return;

  const { translation, direction, displayDirection, provider } = result;
  const directionLabel = displayDirection || formatDirectionBadge(direction);

  // A new result is not known to be saved until checkTranslationFavoriteStatus
  // says otherwise, and it must not inherit the last result's state.
  translationIsSaved = false;

  // Store translation data for favorites
  currentTranslationData = {
    type: 'translation',
    originalText: originalText,
    savedText: translation,
    direction: directionLabel,
    provider: provider
  };

  // The card's pill carries the direction now, so the shell badge would only
  // repeat it two lines higher. The element stays because the screenshot
  // result still renders through the shell and sets its own.
  const badge = shadowRoot.querySelector('.parsipad-badge');
  badge.textContent = '';

  const content = shadowRoot.querySelector('.parsipad-content');
  currentCardEl = renderCard(result, {
    lang: userLang,
    doc: document,
    provider,
    sensesExpanded: sensesExpandedForSession,
    onToggleSenses: (open) => { sensesExpandedForSession = open; },
    onListen: buildListenHandler(result),
    onCopy: (text) => handleCardCopy(text),
    onSave: () => handleTranslationFavorite(),
    isSaved: translationIsSaved,
    onTranslateSentence: buildSentenceHandler(result, originalText),
    onExplainGrammar: buildGrammarHandler(result, originalText),
    onSwapDirection: (nextSourceLang) => translateAndShow(originalText, { sourceLang: nextSourceLang }),
    onOpenSettings: () => chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' })
  });
  content.replaceChildren(currentCardEl);

  // The card carries its own actions and provider indicator, so the box's
  // footer would only repeat them. The element stays in the shell because
  // the screenshot result still renders through it.
  const footer = shadowRoot.querySelector('.parsipad-footer');
  footer.style.display = 'none';

  placeFloatingBox();

  // Check if already favorited
  checkTranslationFavoriteStatus();
  maybeShowReviewLine(currentCardEl);
}

/**
 * One quiet rating ask under a translation, when the service worker says it
 * is time. The worker records the show when it answers, so a second box in
 * the same window does not ask again, and so every check that could skip
 * the line runs before the question is sent: a skeleton on screen or a card
 * that has been replaced means no ask at all. The line goes in its own slot
 * below the content area, outside the live region, so a later skeleton or
 * result does not wipe it. "Rate" opens the store in a new tab from the
 * worker; "Later" snoozes.
 * @param {HTMLElement} card - the translation card the line is for
 */
async function maybeShowReviewLine(card) {
  if (!shadowRoot || !card || card !== currentCardEl) return;
  const content = shadowRoot.querySelector('.parsipad-content');
  const slot = shadowRoot.querySelector('.parsipad-review-slot');
  if (!content || !slot) return;
  if (content.querySelector('.parsipad-loading')) return;
  if (slot.querySelector('.parsipad-review-line')) return;

  let show = false;
  try {
    ({ show } = await chrome.runtime.sendMessage({ action: 'REVIEW_PROMPT_STATE' }));
  } catch (error) {
    return;
  }
  if (!show || !slot.isConnected) return;

  const line = document.createElement('div');
  line.className = 'parsipad-review-line';

  const rate = document.createElement('button');
  rate.type = 'button';
  rate.className = 'parsipad-review-rate';
  rate.textContent = t('rateParsipad', userLang);

  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'parsipad-review-later';
  later.textContent = t('later', userLang);

  const answer = (response) => {
    line.remove();
    chrome.runtime.sendMessage({ action: 'REVIEW_PROMPT_RESPONSE', response }).catch(() => {});
  };
  rate.addEventListener('click', () => answer('rated'));
  later.addEventListener('click', () => answer('later'));

  line.append(rate, later);
  slot.appendChild(line);
  placeFloatingBox();
}

/**
 * Render the grammar points returned by EXPLAIN_GRAMMAR plus a "Learn More"
 * button that launches the full lesson page (via OPEN_GRAMMAR_PAGE).
 */
function renderInlineGrammar(slot, points, originalText, translation, direction) {
  slot.replaceChildren();

  if (!Array.isArray(points) || points.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'parsipad-grammar-empty';
    empty.textContent = t('noGrammarPoints', userLang) || 'No grammar points returned for this text.';
    slot.appendChild(empty);
    return;
  }

  const header = document.createElement('div');
  header.className = 'parsipad-grammar-header';
  header.textContent = t('grammarExplanation', userLang) || 'Grammar Notes';
  slot.appendChild(header);

  // Grammar content is always English (audience: Persian speakers studying
  // English), so the list always renders LTR even when the user is on a
  // Persian translation direction. Same principle as the alternatives list.
  const list = document.createElement('ol');
  list.className = 'parsipad-grammar-list';
  list.setAttribute('dir', 'ltr');
  points.forEach(p => {
    if (!p) return;
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'parsipad-grammar-point-title';
    title.textContent = p.point || p.title || '';
    const body = document.createElement('div');
    body.className = 'parsipad-grammar-point-body';
    body.textContent = p.explanation || '';
    li.append(title, body);
    list.appendChild(li);
  });
  slot.appendChild(list);

  // "Learn More with Examples" -> opens grammar.html via background.
  const learnMore = document.createElement('button');
  learnMore.type = 'button';
  learnMore.className = 'parsipad-grammar-learn-more';
  learnMore.textContent = t('learnMore', userLang) || 'Learn More with Examples';
  learnMore.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'OPEN_GRAMMAR_PAGE',
      original: originalText,
      translation,
      direction
    });
  });
  slot.appendChild(learnMore);
}

// Failures the reader has to act on (the key, the connection, the provider)
// take the red tone; the rest (nothing to translate, a language ParsiPad does
// not cover, a reply that was cut off) stay the friendly amber. Chosen by
// code, so a localized message is toned the same as its English original.
const PP_DESTRUCTIVE_ERROR_CODES = new Set([
  ERROR_CODES.INVALID_API_KEY,
  ERROR_CODES.API_KEY_NOT_SET,
  ERROR_CODES.NETWORK,
  ERROR_CODES.TIMEOUT,
  ERROR_CODES.RATE_LIMITED,
  ERROR_CODES.SERVER_ERROR
]);

// The info icon every box error carries; decorative, the text says it all.
const PP_ERROR_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
`;

/**
 * What a box says about a failure. Every known code is said in the reader's
 * language; only a message with no known code (a provider's own words) is
 * shown as it came. An extension reloaded under the page is recognized by
 * its code or, when it arrives without one, by Chrome's message.
 * @param {unknown} errorOrResponse - a service worker or stream response
 *   ({ error, errorCode }), or what a catch caught
 * @returns {{code: string, message: string, untranslated: boolean}}
 */
function describeBoxError(errorOrResponse) {
  const isResponse = errorOrResponse !== null && typeof errorOrResponse === 'object' && !(errorOrResponse instanceof Error);
  const raw = isResponse ? errorOrResponse.error : errorOrResponse;
  const rawMessage = typeof raw === 'string' ? raw : (typeof raw?.message === 'string' ? raw.message : '');
  const reported = isResponse && Object.hasOwn(ERROR_CODES, errorOrResponse.errorCode) ? errorOrResponse.errorCode : ERROR_CODES.UNKNOWN;

  let code = reported === ERROR_CODES.UNKNOWN ? toTranslationError(raw ?? '').code : reported;
  if (reported === ERROR_CODES.CONTEXT_INVALIDATED || isContextInvalidated(rawMessage)) {
    code = ERROR_CODES.CONTEXT_INVALIDATED;
  } else if (code === ERROR_CODES.UNKNOWN && isMissingApiKeyError(rawMessage)) {
    code = ERROR_CODES.API_KEY_NOT_SET;
  }

  if (code === ERROR_CODES.UNKNOWN && rawMessage.trim()) {
    return { code, message: rawMessage, untranslated: true };
  }
  return { code, message: t(errorI18nKey(code), userLang), untranslated: false };
}

/**
 * Put a failure into a box's content area: the icon, the message as text,
 * and for a missing key a button to Settings. Text the reader's language
 * did not produce carries dir="auto", so English inside a Persian box keeps
 * its own direction.
 * @param {HTMLElement} content
 * @param {{code: string, message: string, untranslated: boolean}} error
 * @param {{role?: string}} [options] - a role for a box whose content area
 *   is not a live region of its own
 */
function renderBoxError(content, { code, message, untranslated }, { role } = {}) {
  const errorEl = document.createElement('div');
  errorEl.className = PP_DESTRUCTIVE_ERROR_CODES.has(code) ? 'parsipad-error is-destructive' : 'parsipad-error';
  errorEl.setAttribute('dir', userLang === 'fa' ? 'rtl' : 'ltr');
  if (role) errorEl.setAttribute('role', role);
  errorEl.innerHTML = PP_ERROR_ICON;

  const body = document.createElement('div');
  const text = document.createElement('div');
  if (untranslated) text.setAttribute('dir', 'auto');
  text.textContent = message;
  body.appendChild(text);

  if (code === ERROR_CODES.API_KEY_NOT_SET) {
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'parsipad-open-settings';
    settings.textContent = t('openSettings', userLang);
    settings.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' });
    });
    body.appendChild(settings);
  }

  errorEl.appendChild(body);
  content.replaceChildren(errorEl);
}

/**
 * Show error state inside the floating box. Default tone is informational
 * (amber); real failures (network, key, provider) upgrade to destructive
 * (red). A missing key adds an "Open Settings" button, and an extension
 * reloaded under the page offers to reload it instead.
 * @param {unknown} errorOrResponse - a service worker or stream response
 *   ({ error, errorCode }), or what a catch caught
 */
function showError(errorOrResponse) {
  if (!shadowRoot) return;
  const content = shadowRoot.querySelector('.parsipad-content');
  const error = describeBoxError(errorOrResponse);
  if (error.code === ERROR_CODES.CONTEXT_INVALIDATED) {
    renderReloadState(content, userLang);
  } else {
    renderBoxError(content, error);
  }

  // Hide footer on error
  const footer = shadowRoot.querySelector('.parsipad-footer');
  footer.style.display = 'none';

  placeFloatingBox();
}

// The one in-page toast. A new toast replaces the one on screen.
const TOAST_ID = 'parsipad-toast';
// How long a toast stays when the pointer and focus are elsewhere.
const TOAST_DURATION_MS = 10000;
// A live region is announced when its text changes, not when it arrives
// already holding text, so the toast enters the page empty and says its
// message this long after. Long enough for the browser to have put the empty
// region in the accessibility tree first.
const TOAST_LIVE_REGION_DELAY_MS = 100;
// The toast on screen: its host, where focus goes back to, and how to take it
// away without moving focus (when a new toast replaces it).
let activeToast = null;

/**
 * The toast, for news when no floating box is on screen (page translation,
 * block translate, a mute from the toolbar).
 *
 * Its message is a live region: role="status" for news, role="alert" for a
 * problem the user has to fix. It enters the page empty and the message is
 * filled in after TOAST_LIVE_REGION_DELAY_MS, so it is announced. It closes
 * itself after TOAST_DURATION_MS of being shown, a timer that pauses while
 * the pointer or focus is inside it and resumes with what was left, so an
 * Undo does not vanish under the user's hand. Escape closes it. When it
 * closes or is replaced while holding focus, focus goes back to where it was
 * before the toast took it. Text is set with textContent; a message that
 * needs markup is passed as DOM nodes.
 *
 * @param {Object} [options]
 * @param {string|Node} [options.message] - what to say
 * @param {boolean} [options.withSettings] - offer the settings shortcut
 * @param {{label: string, onClick: () => void, focus?: boolean}} [options.action] -
 *   one button that closes the toast and runs onClick; it is described by
 *   the message, and with focus, focus moves to it (for a keyboard user)
 *   once the message is in
 * @param {'status'|'alert'} [options.role]
 * @param {boolean} [options.persist] - never close on a timer: stays until
 *   the user acts on it or closes it, for an action that would otherwise
 *   be lost (Retry failed)
 * @returns {() => void} closes this toast, if it is still the one on screen
 */
function showToast({
  message = t('apiKeyNotConfigured', userLang),
  withSettings = true,
  action = null,
  role = 'status',
  persist = false
} = {}) {
  // Where focus goes back to: if the toast being replaced holds focus, where
  // that one would have sent it; otherwise wherever focus is now.
  const previous = activeToast;
  const previousHadFocus = Boolean(previous && document.activeElement === previous.host);
  const returnFocus = previousHadFocus ? previous.returnFocus : document.activeElement;
  previous?.dispose();
  document.getElementById(TOAST_ID)?.remove();

  const host = document.createElement('div');
  host.id = TOAST_ID;
  host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  applyHostTheme(host);
  if (userLang === 'fa') ensurePersianFontLoaded();
  // Static markup only; every piece of text is set below with textContent.
  root.innerHTML = `
    <style>
      ${themeVars()}
      :host { all: initial; }
      .toast {
        font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        line-height: 1.4;
        /* The inverse of the page surfaces, as the toolbar tooltips are. */
        background: var(--pp-text);
        color: var(--pp-bg);
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: var(--pp-shadow-card);
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 360px;
      }
      .toast button {
        background: var(--pp-accent);
        color: var(--pp-on-accent);
        border: 0;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
        white-space: nowrap;
      }
      .toast button:hover {
        background: var(--pp-accent-strong);
      }
      .toast button:focus-visible {
        outline: 2px solid var(--pp-bg);
        outline-offset: 2px;
      }
      .toast button.close {
        background: transparent;
        padding: 4px;
        color: inherit;
        opacity: 0.75;
      }
      .toast button.close:hover {
        opacity: 1;
      }
    </style>
    <div class="toast">
      <span class="message" id="parsipad-toast-message"></span>
      <button class="action" type="button" hidden></button>
      <button class="open" type="button" hidden></button>
      <button class="close" type="button">×</button>
    </div>
  `;

  const box = root.querySelector('.toast');
  const messageEl = root.querySelector('.message');
  messageEl.setAttribute('role', role);
  // In-page UI is not mirrored, but Persian text still reads right to left.
  messageEl.setAttribute('dir', userLang === 'fa' ? 'rtl' : 'ltr');
  const closeBtn = root.querySelector('.close');
  closeBtn.setAttribute('aria-label', t('cardClose', userLang));

  const restoreFocus = () => {
    if (returnFocus && returnFocus !== document.body && returnFocus.isConnected) returnFocus.focus();
  };

  // The auto-close timer runs from the moment the message is shown, and
  // only while neither the pointer nor focus is inside.
  let shown = false;
  let fillTimer = null;
  let closeTimer = null;
  let remaining = TOAST_DURATION_MS;
  let runningSince = 0;
  let pointerInside = false;
  let focusInside = false;

  const pause = () => {
    if (closeTimer === null) return;
    clearTimeout(closeTimer);
    closeTimer = null;
    remaining = Math.max(0, remaining - (Date.now() - runningSince));
  };
  const resume = () => {
    if (persist || !shown || closeTimer !== null || pointerInside || focusInside) return;
    runningSince = Date.now();
    closeTimer = setTimeout(close, remaining);
  };
  const dispose = () => {
    clearTimeout(fillTimer);
    clearTimeout(closeTimer);
    closeTimer = null;
    host.remove();
    if (activeToast?.host === host) activeToast = null;
  };
  const close = () => {
    if (!host.isConnected) return;
    const hadFocus = document.activeElement === host;
    dispose();
    if (hadFocus) restoreFocus();
  };

  box.addEventListener('pointerenter', () => { pointerInside = true; pause(); });
  box.addEventListener('pointerleave', () => { pointerInside = false; resume(); });
  box.addEventListener('focusin', () => { focusInside = true; pause(); });
  box.addEventListener('focusout', (event) => {
    if (box.contains(event.relatedTarget)) return;
    focusInside = false;
    resume();
  });
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // Handled: the page and the floating box should not also act on it.
    event.stopPropagation();
    close();
  });

  const actionBtn = root.querySelector('.action');
  if (action) {
    actionBtn.textContent = action.label;
    actionBtn.hidden = false;
    // Focus on Undo reads the sentence it undoes.
    actionBtn.setAttribute('aria-describedby', messageEl.id);
    actionBtn.addEventListener('click', () => {
      close();
      action.onClick();
    });
  }

  const openBtn = root.querySelector('.open');
  if (withSettings) {
    openBtn.textContent = t('openSettings', userLang);
    openBtn.hidden = false;
    openBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' });
      close();
    });
  }
  closeBtn.addEventListener('click', close);

  document.body.appendChild(host);
  activeToast = { host, returnFocus, dispose };
  // The toast it replaced held focus; give it back rather than leave it on
  // <body> (this toast's action may take it once its message is in).
  if (previousHadFocus) restoreFocus();

  fillTimer = setTimeout(() => {
    if (typeof message === 'string') {
      messageEl.textContent = message;
    } else {
      messageEl.append(message);
    }
    shown = true;
    resume();
    if (action?.focus) actionBtn.focus();
  }, TOAST_LIVE_REGION_DELAY_MS);

  return close;
}

/**
 * The missing-API-key case, which is the toast's original and most common
 * caller. Kept as its own name so the call sites still read as intent. An
 * alert: nothing translates until the user fixes it.
 */
function showMissingApiKeyToast() {
  showToast({ message: t('apiKeyNotConfigured', userLang), withSettings: true, role: 'alert' });
}

/**
 * The toast's message with the host as its own left-to-right run, so a
 * Persian sentence does not reorder the dots of a domain. Built with DOM
 * nodes: the host is never parsed as markup.
 * @param {string} template - a translated string containing {host}
 * @param {string} hostName
 * @returns {DocumentFragment}
 */
function messageWithHost(template, hostName) {
  const fragment = document.createDocumentFragment();
  const [before, after = ''] = template.split('{host}');
  const run = document.createElement('bdi');
  run.setAttribute('dir', 'ltr');
  run.textContent = hostName;
  fragment.append(before, run, after);
  return fragment;
}

/**
 * Mute ParsiPad on this site, from the selection toolbar. The list stores a
 * normalized host (example.com for www.example.com), and the toast names and
 * Undo removes exactly that host. Undo is offered only when this press added
 * it. Settings and block translate pick the
 * change up through chrome.storage.onChanged.
 * @param {{fromKeyboard: boolean}} options - focus moves to Undo when the
 *   button was pressed from the keyboard
 */
async function muteThisSite({ fromKeyboard }) {
  let result = null;
  try {
    result = await addMutedSite(location.hostname);
  } catch {
    // Extension context invalidated: nothing was stored, so nothing to undo.
    return;
  }
  if (!result) return;
  const { host: mutedHost, added } = result;
  mutedLoaded = true;
  siteMuted = true;
  removeSelectionPopup();
  showToast({
    message: messageWithHost(t('mutedOnSite', userLang), mutedHost),
    withSettings: false,
    // Undo only what this press added: a host that was already listed was
    // muted elsewhere (Settings, another tab), and Undo must not unmute it.
    action: added ? {
      label: t('libraryUndo', userLang),
      focus: fromKeyboard,
      onClick: () => {
        removeMutedSite(mutedHost).catch(() => {});
      }
    } : null
  });
}

/**
 * Handle copy button click
 */
async function handleCopy() {
  if (!shadowRoot) return;

  const textEl = shadowRoot.querySelector('.parsipad-text');
  if (!textEl) return;

  const text = textEl.textContent;

  try {
    await navigator.clipboard.writeText(text);

    // Visual feedback
    const copyBtn = shadowRoot.querySelector('.parsipad-copy');
    copyBtn.classList.add('copied');
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Copied!
    `;

    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy
      `;
    }, 1500);
  } catch (error) {
    // Silently handle copy errors
  }
}

/**
 * Copy from the card's own Copy control, which hands over the text it
 * rendered rather than making the host dig it back out of the DOM.
 * @param {string} text
 */
async function handleCardCopy(text) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    // Silently handle copy errors, same as the box footer's Copy control.
    return;
  }

  const btn = shadowRoot && shadowRoot.querySelector('[data-action="cardCopy"]');
  if (!btn) return;

  const label = btn.textContent;
  btn.textContent = t('copied', userLang);
  setTimeout(() => { btn.textContent = label; }, 1500);
}

/**
 * The control that toggles the current result in and out of favourites:
 * the card's Save action, or the box footer's star when what is on screen
 * is not a card (the screenshot result still is not).
 * @returns {HTMLElement|null}
 */
function favoriteControl() {
  if (!shadowRoot) return null;
  return shadowRoot.querySelector('[data-action="cardSave"]')
    || shadowRoot.querySelector('.parsipad-favorite');
}

/**
 * Reflect the favourite state on whichever control is showing. The star in
 * the box footer also swaps its fill; the card's Save is a plain text
 * button, so aria-pressed is the whole of its state.
 * @param {HTMLElement} btn
 * @param {boolean} favorited
 */
function setFavoriteState(btn, favorited) {
  translationIsSaved = favorited;
  if (!btn) return;

  btn.setAttribute('aria-pressed', favorited ? 'true' : 'false');

  if (!btn.classList.contains('parsipad-favorite')) return;

  btn.classList.toggle('favorited', favorited);
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="${favorited ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  `;
}

/**
 * Check if current translation is already favorited
 */
async function checkTranslationFavoriteStatus() {
  if (!shadowRoot || !currentTranslationData) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_FAVORITE',
      originalText: currentTranslationData.originalText,
      savedText: currentTranslationData.savedText
    });

    if (response.isFavorite) {
      setFavoriteState(favoriteControl(), true);
    }
  } catch (error) {
    // Silently handle errors
  }
}

/**
 * Handle favorite button click for translation
 */
async function handleTranslationFavorite() {
  if (!shadowRoot || !currentTranslationData) return;

  const favBtn = favoriteControl();
  if (!favBtn) return;

  const isFavorited = favBtn.getAttribute('aria-pressed') === 'true';

  try {
    if (isFavorited) {
      await chrome.runtime.sendMessage({
        action: 'REMOVE_FAVORITE',
        originalText: currentTranslationData.originalText,
        savedText: currentTranslationData.savedText
      });
    } else {
      await chrome.runtime.sendMessage({
        action: 'ADD_FAVORITE',
        item: currentTranslationData
      });
    }
  } catch (error) {
    // Silently handle errors
    return;
  }

  setFavoriteState(favBtn, !isFavorited);
}

/**
 * Remove the floating box
 */
function removeFloatingBox() {
  boxAbortController?.abort();
  boxAbortController = null;
  boxSelectionRect = null;
  currentCardEl = null;
  currentSelectionContext = null;
  boxNeedsFocus = false;
  cancelSpeech();

  const returnTo = previouslyFocused;
  previouslyFocused = null;
  if (returnTo && typeof returnTo.focus === 'function' && document.contains(returnTo)) {
    returnTo.focus({ preventScroll: true });
  }
  if (floatingBox) {
    floatingBox.remove();
    floatingBox = null;
    shadowRoot = null;
  }
  // Clear stored data
  currentTranslationData = null;
  currentDictionaryData = null;
}

/**
 * Create the floating polish box with Shadow DOM
 */
function createPolishBox(selectionRect) {
  const host = createBoxHost(selectionRect);

  // Create shadow root for style isolation
  shadowRoot = host.attachShadow({ mode: 'closed' });

  applyHostTheme(host);
  // Inject styles (includes polish styles)
  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);

  // Create box structure for polish results
  const box = document.createElement('div');
  box.className = 'parsipad-box parsipad-polish-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'ParsiPad polish');
  box.setAttribute('tabindex', '-1');
  box.innerHTML = `
    <div class="parsipad-header">
      <div class="parsipad-logo">
        <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="ParsiPad" class="parsipad-logo-icon">
        <span class="parsipad-logo-text">ParsiPad</span>
      </div>
      <div class="parsipad-badges">
        <span class="parsipad-badge parsipad-badge-polish">Polish</span>
        <span class="parsipad-provider-badge"></span>
      </div>
      <button class="parsipad-close" type="button" title="Close" aria-label="Close polish">×</button>
    </div>
    <div class="parsipad-polish-content">
      <!-- Polish cards will be inserted here -->
    </div>
  `;

  shadowRoot.appendChild(box);
  document.body.appendChild(host);

  floatingBox = host;

  // Set up event listeners
  const closeBtn = shadowRoot.querySelector('.parsipad-close');
  closeBtn.addEventListener('click', removeFloatingBox);

  // Prevent clicks inside box from closing it
  box.addEventListener('click', (e) => e.stopPropagation());

  // Match the translation box: header is a drag handle.
  const headerEl = shadowRoot.querySelector('.parsipad-header');
  enableDrag(host, headerEl);
}

/**
 * Show loading state in the polish box
 */
function showPolishLoading() {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-polish-content');
  content.innerHTML = `
    <div class="parsipad-polish-card">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Professional</span>
      </div>
      <div class="parsipad-loading">
        <div class="parsipad-skeleton"></div>
        <div class="parsipad-skeleton"></div>
      </div>
    </div>
    <div class="parsipad-polish-card">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Conversational</span>
      </div>
      <div class="parsipad-loading">
        <div class="parsipad-skeleton"></div>
        <div class="parsipad-skeleton"></div>
      </div>
    </div>
    <div class="parsipad-polish-card">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Concise</span>
      </div>
      <div class="parsipad-loading">
        <div class="parsipad-skeleton"></div>
      </div>
    </div>
  `;
}

/**
 * Show polish results
 */
function showPolishResults(result) {
  if (!shadowRoot) return;

  const { professional, conversational, concise, provider } = result;

  // Update provider badge
  const providerBadge = shadowRoot.querySelector('.parsipad-provider-badge');
  if (providerBadge && provider) {
    providerBadge.textContent = provider;
    providerBadge.className = `parsipad-provider-badge parsipad-provider-${provider.toLowerCase()}`;
  }

  // Store polish data for favorites
  const polishData = {
    originalText: currentPolishOriginalText,
    provider: provider,
    variants: { professional, conversational, concise }
  };

  const content = shadowRoot.querySelector('.parsipad-polish-content');
  content.innerHTML = `
    <div class="parsipad-polish-card" data-variant="professional">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Professional</span>
        <div class="parsipad-polish-actions">
          <button class="parsipad-polish-favorite" data-version="professional" type="button" title="Add to favorites" aria-label="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-polish-regenerate" data-version="professional" type="button" title="Regenerate" aria-label="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="parsipad-polish-copy" data-version="professional" type="button" title="Copy" aria-label="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="parsipad-polish-text">${escapeHtml(professional)}</div>
    </div>
    <div class="parsipad-polish-card" data-variant="conversational">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Conversational</span>
        <div class="parsipad-polish-actions">
          <button class="parsipad-polish-favorite" data-version="conversational" type="button" title="Add to favorites" aria-label="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-polish-regenerate" data-version="conversational" type="button" title="Regenerate" aria-label="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="parsipad-polish-copy" data-version="conversational" type="button" title="Copy" aria-label="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="parsipad-polish-text">${escapeHtml(conversational)}</div>
    </div>
    <div class="parsipad-polish-card" data-variant="concise">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Concise</span>
        <div class="parsipad-polish-actions">
          <button class="parsipad-polish-favorite" data-version="concise" type="button" title="Add to favorites" aria-label="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-polish-regenerate" data-version="concise" type="button" title="Regenerate" aria-label="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="parsipad-polish-copy" data-version="concise" type="button" title="Copy" aria-label="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="parsipad-polish-text">${escapeHtml(concise)}</div>
    </div>
  `;

  // Add copy handlers
  content.querySelectorAll('.parsipad-polish-copy').forEach(btn => {
    btn.addEventListener('click', () => handlePolishCopy(btn, result));
  });

  // Add regenerate handlers
  content.querySelectorAll('.parsipad-polish-regenerate').forEach(btn => {
    btn.addEventListener('click', () => handlePolishRegenerate(btn));
  });

  // Add favorite handlers
  content.querySelectorAll('.parsipad-polish-favorite').forEach(btn => {
    btn.addEventListener('click', () => handlePolishFavorite(btn, polishData));
  });

  // Check favorite status for each variant
  checkPolishFavoriteStatus(polishData);

  placeFloatingBox();
}

/**
 * Handle copy for polish versions
 */
async function handlePolishCopy(btn, result) {
  const version = btn.dataset.version;
  const text = result[version];

  try {
    await navigator.clipboard.writeText(text);

    // Visual feedback
    btn.classList.add('copied');
    const originalSvg = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = originalSvg;
    }, 1500);
  } catch (error) {
    // Silently handle copy errors
  }
}

/**
 * Handle regenerate for a specific polish variant
 */
async function handlePolishRegenerate(btn) {
  if (!currentPolishOriginalText || !shadowRoot) return;

  const variant = btn.dataset.version;
  const card = shadowRoot.querySelector(`.parsipad-polish-card[data-variant="${variant}"]`);
  if (!card) return;

  // Show loading state on the button
  btn.classList.add('loading');
  btn.disabled = true;

  // Show skeleton in the text area
  const textEl = card.querySelector('.parsipad-polish-text');
  const originalText = textEl.textContent;
  textEl.innerHTML = `
    <div class="parsipad-loading">
      <div class="parsipad-skeleton" style="width: 90%;"></div>
      <div class="parsipad-skeleton" style="width: 70%;"></div>
    </div>
  `;

  try {
    // Send regenerate request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'REGENERATE_POLISH_VARIANT',
      text: currentPolishOriginalText,
      variant: variant
    });

    if (response.error) {
      // Restore original text on error
      textEl.textContent = originalText;
    } else {
      // Update with new text
      textEl.textContent = response.text;

      // Update the copy button's reference to the new text
      const copyBtn = card.querySelector('.parsipad-polish-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(response.text);
            copyBtn.classList.add('copied');
            const originalSvg = copyBtn.innerHTML;
            copyBtn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            `;
            setTimeout(() => {
              copyBtn.classList.remove('copied');
              copyBtn.innerHTML = originalSvg;
            }, 1500);
          } catch (error) {
            // Silently handle copy errors
          }
        });
      }
    }
  } catch (error) {
    // Restore original text on error
    textEl.textContent = originalText;
  } finally {
    // Remove loading state
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/**
 * Check favorite status for polish variants
 */
async function checkPolishFavoriteStatus(polishData) {
  if (!shadowRoot) return;

  const variants = ['professional', 'conversational', 'concise'];

  for (const variant of variants) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'CHECK_FAVORITE',
        originalText: polishData.originalText,
        savedText: polishData.variants[variant]
      });

      if (response.isFavorite) {
        const favBtn = shadowRoot.querySelector(`.parsipad-polish-favorite[data-version="${variant}"]`);
        if (favBtn) {
          favBtn.classList.add('favorited');
          favBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          `;
        }
      }
    } catch (error) {
      // Silently handle errors
    }
  }
}

/**
 * Handle favorite button click for polish variant
 */
async function handlePolishFavorite(btn, polishData) {
  if (!shadowRoot) return;

  const variant = btn.dataset.version;
  const variantText = polishData.variants[variant];
  const isFavorited = btn.classList.contains('favorited');

  try {
    if (isFavorited) {
      // Remove from favorites
      await chrome.runtime.sendMessage({
        action: 'REMOVE_FAVORITE',
        originalText: polishData.originalText,
        savedText: variantText
      });

      btn.classList.remove('favorited');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      `;
    } else {
      // Add to favorites
      await chrome.runtime.sendMessage({
        action: 'ADD_FAVORITE',
        item: {
          type: 'polish',
          originalText: polishData.originalText,
          savedText: variantText,
          variant: variant,
          provider: polishData.provider
        }
      });

      btn.classList.add('favorited');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      `;
    }
  } catch (error) {
    // Silently handle errors
  }
}

/**
 * Show error in polish box, the same way showError() does in the
 * translation box.
 * @param {unknown} errorOrResponse - a service worker response
 *   ({ error, errorCode }), or what a catch caught
 */
function showPolishError(errorOrResponse) {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-polish-content');
  const error = describeBoxError(errorOrResponse);
  if (error.code === ERROR_CODES.CONTEXT_INVALIDATED) {
    renderReloadState(content, userLang);
  } else {
    renderBoxError(content, error, { role: 'alert' });
  }

  placeFloatingBox();
}

// ============================================
// Dictionary Functions
// ============================================

/**
 * Look up word and show dictionary floating box
 */
async function dictionaryAndShow(word) {
  if (!word || word.trim().length === 0) {
    return;
  }

  // Validate single word
  const cleanWord = word.trim();
  if (cleanWord.split(/\s+/).length > 1) {
    return;
  }

  // Capture the selection rectangle before the box takes focus and clears it.
  const selectionRect = captureSelectionRect(window.getSelection());

  // Create dictionary floating box
  createDictionaryBox(selectionRect);
  showDictionaryLoading();
  placeFloatingBox();

  try {
    // Send dictionary lookup request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'DICTIONARY_LOOKUP',
      word: cleanWord,
      sourceLang: 'auto'
    });

    if (response.error) {
      showDictionaryError(response);
    } else {
      showDictionaryResult(response);
    }
  } catch (error) {
    showDictionaryError(error);
  }
}

/**
 * Create the floating dictionary box with Shadow DOM
 */
function createDictionaryBox(selectionRect) {
  // The definition card renders Persian translations, which need the
  // bundled faces registered on the host document.
  ensurePersianFontLoaded();

  const host = createBoxHost(selectionRect);

  // Create shadow root for style isolation
  shadowRoot = host.attachShadow({ mode: 'closed' });

  applyHostTheme(host);
  // Inject styles
  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);

  // Create box structure for dictionary
  const box = document.createElement('div');
  box.className = 'parsipad-box parsipad-dictionary-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'ParsiPad dictionary');
  box.setAttribute('tabindex', '-1');
  box.innerHTML = `
    <div class="parsipad-header">
      <div class="parsipad-logo">
        <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="ParsiPad" class="parsipad-logo-icon">
        <span class="parsipad-logo-text">ParsiPad</span>
      </div>
      <div class="parsipad-badges">
        <span class="parsipad-badge parsipad-badge-dictionary">Dictionary</span>
        <span class="parsipad-provider-badge"></span>
      </div>
      <button class="parsipad-close" type="button" title="Close" aria-label="Close dictionary">×</button>
    </div>
    <div class="parsipad-dictionary-content">
      <!-- Dictionary result will be inserted here -->
    </div>
  `;

  shadowRoot.appendChild(box);
  document.body.appendChild(host);

  floatingBox = host;

  // Set up event listeners
  const closeBtn = shadowRoot.querySelector('.parsipad-close');
  closeBtn.addEventListener('click', removeFloatingBox);

  // Prevent clicks inside box from closing it
  box.addEventListener('click', (e) => e.stopPropagation());

  // Match the translation box: header is a drag handle.
  const headerEl = shadowRoot.querySelector('.parsipad-header');
  enableDrag(host, headerEl);
}

/**
 * Show loading state in the dictionary box
 */
function showDictionaryLoading() {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-dictionary-content');
  content.innerHTML = `
    <div class="parsipad-loading">
      <div class="parsipad-skeleton" style="width: 40%;"></div>
      <div class="parsipad-skeleton" style="width: 90%;"></div>
      <div class="parsipad-skeleton" style="width: 70%;"></div>
      <div class="parsipad-skeleton" style="width: 85%;"></div>
    </div>
  `;
}

/**
 * Show dictionary result
 */
function showDictionaryResult(result) {
  if (!shadowRoot) return;

  const { word, phonetic, partOfSpeech, definitions, synonyms, antonyms, translation, targetLang, provider } = result;
  const isTargetRTL = ['fa', 'ar', 'he'].includes(targetLang);

  // Store dictionary data for favorites
  if (translation) {
    currentDictionaryData = {
      type: 'dictionary',
      originalText: word,
      savedText: translation,
      direction: isTargetRTL ? 'EN → FA' : 'FA → EN',
      provider: provider
    };
  }

  // Update provider badge
  const providerBadge = shadowRoot.querySelector('.parsipad-provider-badge');
  if (providerBadge && provider) {
    providerBadge.textContent = provider;
    providerBadge.className = `parsipad-provider-badge parsipad-provider-${provider.toLowerCase()}`;
  }

  let definitionsHtml = '';
  if (definitions && definitions.length > 0) {
    definitionsHtml = definitions.map((def, i) => `
      <div class="parsipad-dict-definition">
        <div class="parsipad-dict-meaning">${i + 1}. ${escapeHtml(def.meaning)}</div>
        ${def.example ? `<div class="parsipad-dict-example">"${escapeHtml(def.example)}"</div>` : ''}
      </div>
    `).join('');
  }

  let synonymsHtml = '';
  if (synonyms && synonyms.length > 0) {
    synonymsHtml = `
      <div class="parsipad-dict-section">
        <div class="parsipad-dict-section-title">Synonyms</div>
        <div class="parsipad-dict-tags">
          ${synonyms.slice(0, 5).map(s => `<span class="parsipad-dict-tag">${escapeHtml(s)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  let antonymsHtml = '';
  if (antonyms && antonyms.length > 0) {
    antonymsHtml = `
      <div class="parsipad-dict-section">
        <div class="parsipad-dict-section-title">Antonyms</div>
        <div class="parsipad-dict-tags">
          ${antonyms.slice(0, 3).map(a => `<span class="parsipad-dict-tag parsipad-dict-tag-antonym">${escapeHtml(a)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  const content = shadowRoot.querySelector('.parsipad-dictionary-content');
  content.innerHTML = `
    <div class="parsipad-dict-header">
      <div class="parsipad-dict-word">${escapeHtml(word)}</div>
      ${phonetic ? `<div class="parsipad-dict-phonetic">${escapeHtml(phonetic)}</div>` : ''}
      ${partOfSpeech ? `<div class="parsipad-dict-pos">${escapeHtml(partOfSpeech)}</div>` : ''}
    </div>

    ${definitionsHtml ? `
      <div class="parsipad-dict-section">
        <div class="parsipad-dict-section-title">Definitions</div>
        ${definitionsHtml}
      </div>
    ` : ''}

    ${synonymsHtml}
    ${antonymsHtml}

    ${translation ? `
      <div class="parsipad-dict-translation">
        <div class="parsipad-dict-section-title">Translation</div>
        <div class="parsipad-dict-translation-text" ${isTargetRTL ? 'dir="rtl"' : ''}>${escapeHtml(translation)}</div>
        <div class="parsipad-dict-translation-actions">
          <button class="parsipad-dict-favorite-translation" type="button" title="Add to favorites" aria-label="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-dict-copy-translation" type="button" title="Copy translation" aria-label="Copy translation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>
    ` : ''}
  `;

  // Add copy handler for translation
  const copyBtn = shadowRoot.querySelector('.parsipad-dict-copy-translation');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => handleDictionaryCopy(copyBtn, translation));
  }

  // Add favorite handler for translation
  const favBtn = shadowRoot.querySelector('.parsipad-dict-favorite-translation');
  if (favBtn) {
    favBtn.addEventListener('click', handleDictionaryFavorite);
    // Check if already favorited
    checkDictionaryFavoriteStatus();
  }

  placeFloatingBox();
}

/**
 * Handle copy for dictionary translation
 */
async function handleDictionaryCopy(btn, text) {
  try {
    await navigator.clipboard.writeText(text);

    // Visual feedback
    btn.classList.add('copied');
    const originalSvg = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;

    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = originalSvg;
    }, 1500);
  } catch (error) {
    // Silently handle copy errors
  }
}

/**
 * Check if current dictionary translation is favorited
 */
async function checkDictionaryFavoriteStatus() {
  if (!shadowRoot || !currentDictionaryData) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'CHECK_FAVORITE',
      originalText: currentDictionaryData.originalText,
      savedText: currentDictionaryData.savedText
    });

    if (response.isFavorite) {
      const favBtn = shadowRoot.querySelector('.parsipad-dict-favorite-translation');
      if (favBtn) {
        favBtn.classList.add('favorited');
        favBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        `;
      }
    }
  } catch (error) {
    // Silently handle errors
  }
}

/**
 * Handle favorite button click for dictionary
 */
async function handleDictionaryFavorite() {
  if (!shadowRoot || !currentDictionaryData) return;

  const favBtn = shadowRoot.querySelector('.parsipad-dict-favorite-translation');
  if (!favBtn) return;

  const isFavorited = favBtn.classList.contains('favorited');

  try {
    if (isFavorited) {
      // Remove from favorites
      await chrome.runtime.sendMessage({
        action: 'REMOVE_FAVORITE',
        originalText: currentDictionaryData.originalText,
        savedText: currentDictionaryData.savedText
      });

      favBtn.classList.remove('favorited');
      favBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      `;
    } else {
      // Add to favorites
      await chrome.runtime.sendMessage({
        action: 'ADD_FAVORITE',
        item: currentDictionaryData
      });

      favBtn.classList.add('favorited');
      favBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      `;
    }
  } catch (error) {
    // Silently handle errors
  }
}

/**
 * Show error in dictionary box, the same way showError() does in the
 * translation box.
 * @param {unknown} errorOrResponse - a service worker response
 *   ({ error, errorCode }), or what a catch caught
 */
function showDictionaryError(errorOrResponse) {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-dictionary-content');
  const error = describeBoxError(errorOrResponse);
  if (error.code === ERROR_CODES.CONTEXT_INVALIDATED) {
    renderReloadState(content, userLang);
  } else {
    renderBoxError(content, error, { role: 'alert' });
  }

  placeFloatingBox();
}

// ============================================
// Page Translation Functions
// ============================================

/**
 * Whether the selected provider has a key, asked of the service worker
 * without a request to the provider. An unanswered check counts as yes, so
 * the batch request still reports a missing key through its own path.
 * @returns {Promise<boolean>}
 */
async function hasProviderKey() {
  try {
    // Action name literal: content modules cannot import ACTIONS (lib/constants.js)
    const response = await chrome.runtime.sendMessage({ action: 'CHECK_API_KEY' });
    return response?.hasApiKey !== false;
  } catch {
    return true;
  }
}

/**
 * The provider a page translation will use and whether it asks first. Same
 * defaults as lib/storage.js: Claude, and asking unless the stored value is
 * false.
 * @returns {Promise<{provider: string, confirm: boolean}>}
 */
async function readPageTranslatePrefs() {
  try {
    const stored = await chrome.storage.local.get([SELECTED_PROVIDER_KEY, CONFIRM_PAGE_TRANSLATE_KEY]);
    return {
      provider: stored[SELECTED_PROVIDER_KEY] || DEFAULT_PROVIDER_ID,
      confirm: stored[CONFIRM_PAGE_TRANSLATE_KEY] !== false
    };
  } catch {
    return { provider: DEFAULT_PROVIDER_ID, confirm: true };
  }
}

// Pause between batch requests, to stay clear of provider rate limits.
const PAGE_BATCH_GAP_MS = 200;

/**
 * Handle page translation request. With `retry`, run again only the given
 * batches of the run that owns the page, without the question: the user
 * already agreed to translate this page. Retry failed and Translate Page on
 * a page with unfinished sections both come this way.
 * @param {{retry?: {state: object, indexes: number[]}}} [options]
 */
async function handleTranslatePage({ retry = null } = {}) {
  // If already translating, ignore
  if (pageTranslationState?.isTranslating) {
    return;
  }

  if (!retry && pageTranslationState?.run) {
    // Sections that failed or were never sent (a stop) are picked up where
    // the run left off: the user already agreed to translate this page.
    const unfinished = unfinishedIndexes(pageTranslationState.run);
    if (unfinished.length > 0) {
      return handleTranslatePage({ retry: { state: pageTranslationState, indexes: unfinished } });
    }
  }

  // If already translated, toggle instead
  if (!retry && pageTranslationState?.isTranslated) {
    handleTogglePageTranslation();
    return;
  }

  // Initialize state. phase is 'confirming' until the first request goes
  // out, 'running' from then on. A navigation replaces pageTranslationState,
  // so after every await this run checks it still owns the state and
  // otherwise stops quietly: nothing applied, nothing said. stopReason says
  // why a run ended early: 'user' (Cancel, Escape, the popup) or
  // 'missingKey'. batches and run outlive the run, for Retry failed.
  const state = retry ? retry.state : {
    phase: 'confirming',
    isTranslated: false,
    isTranslating: true,
    isShowingTranslated: false,
    originalTexts: new Map(),
    translatedTexts: new Map(),
    originalDirections: new Map(),
    sourceLanguage: null,
    targetLanguage: null,
    textNodes: [],
    batches: [],
    run: null,
    stopReason: null,
    closeSummary: null
  };
  state.isTranslating = true;
  state.stopReason = null;
  // A summary from an earlier run would offer a Retry for work this run
  // now owns.
  pageTranslationState?.closeSummary?.();
  pageTranslationState = state;
  // Set when the run ends before any request (the user said no, or there is
  // no key): it leaves no state, as if never asked.
  let discard = false;

  pageTranslationAbortController = new AbortController();
  const abortSignal = pageTranslationAbortController.signal;

  // The overlay exists before extraction so its host is skipped as ParsiPad's
  // own; it shows the confirmation first and the progress only after it.
  mountPageOverlay();

  try {
    let indexes;
    if (!retry) {
      // Extract text nodes
      state.textNodes = extractVisibleTextNodes(document.body);

      if (state.textNodes.length === 0) {
        discard = true;
        hidePageProgressOverlay();
        state.isTranslating = false;
        // Page translation runs without a floating box, so there is nothing to
        // render an error into; the toast is the surface that does not need one.
        showToast({ message: t('noTextOnPage', userLang), withSettings: false });
        return;
      }

      // Store original texts
      for (const { node, text } of state.textNodes) {
        state.originalTexts.set(node, text);
      }

      // Detect language
      state.sourceLanguage = detectPageLanguage(state.textNodes);
      state.targetLanguage = state.sourceLanguage === 'fa' ? 'en' : 'fa';

      // Group text nodes into batches for translation
      state.batches = batchTextNodesForTranslation(state.textNodes);
      state.run = createPageRun(state.batches.length);

      // A missing key gets its toast before any question about cost.
      const [keySet, prefs] = await Promise.all([hasProviderKey(), readPageTranslatePrefs()]);
      if (pageTranslationState !== state) return;
      if (state.stopReason || abortSignal.aborted) {
        discard = true;
        return;
      }
      if (!keySet) {
        discard = true;
        hidePageProgressOverlay();
        showMissingApiKeyToast();
        return;
      }

      // Ask before the first request, unless the user turned that off.
      if (prefs.confirm) {
        const chars = state.textNodes.reduce((sum, { text }) => sum + text.length, 0);
        const estimate = estimateTranslationCost({
          chars,
          batches: state.batches.length,
          provider: prefs.provider,
          targetLang: state.targetLanguage
        });
        clearPagePreparing();
        coverPageForConfirm();
        const answer = await confirmPageTranslation(pageProgressShadow, {
          count: countParagraphs(state.textNodes),
          costText: formatEstimateUsd(estimate.usd),
          providerName: PROVIDER_NAMES[prefs.provider] || PROVIDER_NAMES[DEFAULT_PROVIDER_ID],
          lang: userLang
        });
        if (pageTranslationState !== state) return;
        if (!answer.go || state.stopReason || abortSignal.aborted) {
          discard = true;
          return;
        }
      }
      indexes = state.batches.map((_, index) => index);
    } else {
      // The key may have gone since the first run. Without it the run keeps
      // what it has and says only that.
      const keyStillSet = await hasProviderKey();
      if (pageTranslationState !== state) return;
      if (!keyStillSet) state.stopReason = 'missingKey';
      indexes = retry.indexes;
    }

    state.phase = 'running';
    if (!state.stopReason) {
      showPageProgress();
      updatePageProgress(0, indexes.length);
    }

    // Each batch's outcome is recorded; a failed one does not stop the
    // others, and a stop keeps the ones that finished.
    for (let step = 0; step < indexes.length; step++) {
      if (step > 0) {
        await new Promise(resolve => setTimeout(resolve, PAGE_BATCH_GAP_MS));
        if (pageTranslationState !== state) return;
      }
      if (state.stopReason || abortSignal.aborted) break;

      const index = indexes[step];
      const outcome = await translatePageBatch(state, index, abortSignal);
      if (pageTranslationState !== state) return;
      if (outcome === 'stopped') break;
      if (outcome === 'missingKey') {
        state.stopReason = 'missingKey';
        break;
      }
      markBatch(state.run, index, outcome);
      updatePageProgress(step + 1, indexes.length);
    }

    finishPageRun(state);
  } catch (error) {
    console.error('Page translation error:', error);
  } finally {
    state.isTranslating = false;
    // A navigation already cleared the overlay and controller, and a later
    // run may own them now.
    if (pageTranslationState === state) {
      hidePageProgressOverlay();
      pageTranslationAbortController = null;
      if (discard) pageTranslationState = null;
    }
  }
}

/**
 * Translate one batch of the page into state.translatedTexts. Nothing is
 * written to the page here; finishPageRun applies every batch that came
 * back at the end.
 * @param {object} state - the run's pageTranslationState
 * @param {number} index - which of state.batches
 * @param {AbortSignal} abortSignal - aborted by a stop or a navigation
 * @returns {Promise<'ok'|'failed'|'stopped'|'missingKey'>} 'stopped' only
 *   when the signal was aborted
 */
async function translatePageBatch(state, index, abortSignal) {
  const batch = state.batches[index];
  // Build the batch text with numbered markers
  const batchText = batch.map((item, idx) => `[${idx + 1}] ${item.text}`).join('\n');

  let response;
  try {
    response = await requestTranslation({
      text: batchText,
      sourceLang: state.sourceLanguage,
      mode: 'batch'
    }, { signal: abortSignal });
  } catch (error) {
    if (error?.name === 'AbortError' || abortSignal.aborted) return 'stopped';
    console.error('Batch translation failed:', error);
    return 'failed';
  }

  // ABORTED without our signal is a dropped port (the service worker went
  // away): a failure a retry can fix, not a stop.
  if (abortSignal.aborted) return 'stopped';
  if (response?.error) {
    if (isMissingApiKeyResponse(response)) return 'missingKey';
    console.error('Batch translation error:', response.error);
    return 'failed';
  }
  if (typeof response?.translation !== 'string') return 'failed';

  // Parse numbered translations back to individual nodes
  const translations = parseNumberedTranslations(response.translation, batch.length);
  batch.forEach((item, j) => {
    state.translatedTexts.set(item.node, translations[j] || item.text);
  });
  return 'ok';
}

/**
 * End a run that still owns the page: apply every batch that came back,
 * show the toggle once anything is translated, and say how it went. A
 * missing key says only that, in its own alert, never under a summary.
 * @param {object} state
 */
function finishPageRun(state) {
  const summary = summarizeRun(state.run);
  if (summary.done > 0) {
    applyPageTranslations();
    state.isTranslated = true;
    state.isShowingTranslated = true;
    showPageToggleButton();
    updatePageToggleButton();
  }

  if (state.stopReason === 'missingKey') {
    showMissingApiKeyToast();
    return;
  }

  const key = summaryMessageKey(summary, state.stopReason === 'user');
  const message = t(key, userLang)
    .replace('{done}', String(summary.done))
    .replace('{total}', String(summary.total))
    .replace('{failed}', String(summary.failed));
  // A stop is the user's choice, so only a run that went to the end offers
  // to send again what failed; Translate Page picks up a stopped run. The
  // offer stays until the user acts on it, so it is never lost to a timer.
  const action = key === 'pageTranslatePartial'
    ? { label: t('pageTranslateRetryFailed', userLang), onClick: () => retryFailedBatches(state) }
    : null;
  state.closeSummary = showToast({ message, withSettings: false, action, persist: Boolean(action) });
}

/**
 * Retry failed: send again only the batches of `state`'s run that failed.
 * Does nothing once the page has moved on (a navigation or a newer run owns
 * it) or while a run is going.
 * @param {object} state
 * @returns {Promise<void>|undefined}
 */
function retryFailedBatches(state) {
  if (pageTranslationState !== state || state.isTranslating) return;
  const indexes = failedIndexes(state.run);
  if (indexes.length === 0) return;
  return handleTranslatePage({ retry: { state, indexes } });
}

/**
 * Stop the page translation: the Cancel button, Escape or the popup. While
 * the page is still asking first, the question closes with nothing sent; a
 * running translation keeps what finished and says it stopped.
 */
function stopPageTranslation() {
  const state = pageTranslationState;
  if (!state?.isTranslating) return;
  state.stopReason = 'user';
  pageTranslationAbortController?.abort();
  // Nothing has been requested while the page asks first; removing the
  // overlay closes the dialog, which answers Cancel.
  if (state.phase === 'confirming') {
    hidePageProgressOverlay();
  }
}

/**
 * Extract visible text nodes from the page
 */
function extractVisibleTextNodes(root) {
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
    'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'MAP', 'TEMPLATE'
  ]);

  const textNodes = [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        let parent = node.parentElement;
        while (parent && parent !== root) {
          if (SKIP_TAGS.has(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.hasAttribute('contenteditable') || parent.isContentEditable) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.tagName === 'INPUT' || parent.tagName === 'TEXTAREA') {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip ParsiPad's own elements
          if (parent.id === 'parsipad-host' || parent.id === 'parsipad-page-progress' || parent.id === 'parsipad-page-toggle') {
            return NodeFilter.FILTER_REJECT;
          }
          parent = parent.parentElement;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push({
      node,
      text: node.textContent,
      parent: node.parentElement
    });
  }

  return textNodes;
}

/**
 * Detect primary language of the page
 */
function detectPageLanguage(textNodes) {
  const sampleSize = Math.min(textNodes.length, 10);
  let persianChars = 0;
  let englishChars = 0;

  for (let i = 0; i < sampleSize; i++) {
    const text = textNodes[i].text;
    persianChars += (text.match(/[\u0600-\u06FF]/g) || []).length;
    englishChars += (text.match(/[a-zA-Z]/g) || []).length;
  }

  return persianChars > englishChars ? 'fa' : 'en';
}

/**
 * Inject the utility class used to style translated Persian content on the
 * host page during full-page translation. The font itself is registered by
 * ensurePersianFontLoaded.
 */
function injectPageTranslationStyles() {
  ensurePersianFontLoaded();

  const styleId = 'parsipad-page-translation-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    [data-parsipad-translated="true"] {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Apply translations to the DOM
 */
function applyPageTranslations() {
  if (!pageTranslationState) return;

  // Inject Vazir font styles for Persian text
  injectPageTranslationStyles();

  const rtlLangs = ['fa', 'ar', 'he'];
  const targetDir = rtlLangs.includes(pageTranslationState.targetLanguage) ? 'rtl' : 'ltr';

  for (const { node, parent } of pageTranslationState.textNodes) {
    const translatedText = pageTranslationState.translatedTexts.get(node);
    if (translatedText) {
      node.textContent = translatedText;

      if (parent) {
        if (!pageTranslationState.originalDirections.has(parent)) {
          pageTranslationState.originalDirections.set(parent, parent.getAttribute('dir'));
        }
        parent.setAttribute('dir', targetDir);
        // Mark as translated for Vazir font styling
        parent.setAttribute('data-parsipad-translated', 'true');
      }
    }
  }
}

/**
 * Restore original text to the DOM. Text nodes no longer on the page (an
 * SPA replaced them) are not written to; their element, if the SPA kept it,
 * still loses the translated marker and gets its direction back.
 */
function restorePageOriginals() {
  if (!pageTranslationState) return;

  for (const { node, parent } of pageTranslationState.textNodes) {
    const originalText = pageTranslationState.originalTexts.get(node);
    if (originalText) {
      if (node.isConnected) node.textContent = originalText;

      if (parent?.isConnected) {
        // Remove translated marker
        parent.removeAttribute('data-parsipad-translated');

        if (pageTranslationState.originalDirections.has(parent)) {
          const originalDir = pageTranslationState.originalDirections.get(parent);
          if (originalDir) {
            parent.setAttribute('dir', originalDir);
          } else {
            parent.removeAttribute('dir');
          }
        }
      }
    }
  }
}

/**
 * Toggle between original and translated text
 */
function handleTogglePageTranslation() {
  if (!pageTranslationState?.isTranslated) return;

  if (pageTranslationState.isShowingTranslated) {
    restorePageOriginals();
    pageTranslationState.isShowingTranslated = false;
  } else {
    applyPageTranslations();
    pageTranslationState.isShowingTranslated = true;
  }

  updatePageToggleButton();
}

// The overlay host while the page asks first: it covers the viewport so the
// scrim keeps the page inert behind the modal dialog, which sits where the
// progress card is. No transform, or the host would not span the viewport.
const PAGE_OVERLAY_CONFIRM_STYLE = `
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 24px;
  box-sizing: border-box;
  z-index: 2147483647;
`;

// The overlay host while it prepares and once the requests run: a card at
// the bottom centre that leaves the page usable.
const PAGE_OVERLAY_PROGRESS_STYLE = `
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
`;

/**
 * Create the page overlay as the bottom-centre card saying "Preparing": it
 * holds the confirmation first, when there is one, and the progress after
 * it. The scrim comes only with the question (coverPageForConfirm), so a
 * run that does not ask never covers the page.
 */
function mountPageOverlay() {
  if (pageProgressOverlay) {
    hidePageProgressOverlay();
  }

  const host = document.createElement('div');
  host.id = 'parsipad-page-progress';
  host.style.cssText = PAGE_OVERLAY_PROGRESS_STYLE;

  pageProgressShadow = host.attachShadow({ mode: 'closed' });


  applyHostTheme(host);
  if (userLang === 'fa') ensurePersianFontLoaded();
  const style = document.createElement('style');
  style.textContent = getPageProgressStyles() + getPageConfirmStyles();
  pageProgressShadow.appendChild(style);

  const status = document.createElement('div');
  status.className = 'parsipad-page-status';
  status.setAttribute('role', 'status');
  status.setAttribute('lang', userLang);
  // In-page UI is not mirrored, but Persian text still reads right to left.
  status.setAttribute('dir', userLang === 'fa' ? 'rtl' : 'ltr');
  status.textContent = t('pagePreparing', userLang);

  pageProgressShadow.append(status);
  document.body.appendChild(host);
  pageProgressOverlay = host;
}

/**
 * Make the overlay modal for the question: the host spans the viewport and
 * a scrim keeps the page inert behind the dialog. A click on the scrim
 * answers the dialog's Cancel.
 */
function coverPageForConfirm() {
  if (!pageProgressShadow) return;

  pageProgressOverlay.style.cssText = PAGE_OVERLAY_CONFIRM_STYLE;
  const scrim = document.createElement('div');
  scrim.className = 'parsipad-scrim';
  scrim.addEventListener('click', (event) => {
    if (event.target !== scrim) return;
    pageProgressShadow?.querySelector('.parsipad-confirm [data-action="cancel"]')?.click();
  });
  pageProgressShadow.append(scrim);
}

/**
 * Remove the "Preparing" status once the dialog or the progress replaces it.
 */
function clearPagePreparing() {
  pageProgressShadow?.querySelector('.parsipad-page-status')?.remove();
}

/**
 * Show the progress UI in the mounted overlay, once the requests start: the
 * scrim goes and the host shrinks back to the bottom-centre card.
 */
function showPageProgress() {
  if (!pageProgressShadow) return;

  clearPagePreparing();
  pageProgressShadow.querySelector('.parsipad-scrim')?.remove();
  pageProgressOverlay.style.cssText = PAGE_OVERLAY_PROGRESS_STYLE;

  const overlay = document.createElement('div');
  overlay.className = 'parsipad-progress-overlay';
  overlay.setAttribute('lang', userLang);
  // In-page UI is not mirrored, but Persian text still reads right to left.
  overlay.setAttribute('dir', userLang === 'fa' ? 'rtl' : 'ltr');
  // Static markup only; every piece of text is set below with textContent.
  overlay.innerHTML = `
    <div class="parsipad-progress-header">
      <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="ParsiPad" class="parsipad-progress-logo">
      <span class="parsipad-progress-title"></span>
    </div>
    <div class="parsipad-progress-bar-container">
      <div class="parsipad-progress-bar" style="width: 0%"></div>
    </div>
    <div class="parsipad-progress-text"></div>
    <button class="parsipad-progress-cancel" type="button"></button>
  `;
  overlay.querySelector('.parsipad-progress-title').textContent = t('translatingPage', userLang);
  overlay.querySelector('.parsipad-progress-text').textContent = t('pagePreparing', userLang);

  pageProgressShadow.appendChild(overlay);

  // Cancel stops the run and keeps what finished.
  const cancelBtn = pageProgressShadow.querySelector('.parsipad-progress-cancel');
  cancelBtn.textContent = t('cancel', userLang);
  cancelBtn.addEventListener('click', stopPageTranslation);
}

/**
 * Update progress display: `current` of `total` sections done.
 * @param {number} current
 * @param {number} total
 */
function updatePageProgress(current, total) {
  if (!pageProgressShadow) return;

  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  const progressBar = pageProgressShadow.querySelector('.parsipad-progress-bar');
  const progressText = pageProgressShadow.querySelector('.parsipad-progress-text');

  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  if (progressText) {
    // The section being translated, so the count starts at 1, not 0.
    progressText.textContent = t('pageTranslateProgress', userLang)
      .replace('{n}', String(Math.min(current + 1, total)))
      .replace('{total}', String(total));
  }
}

/**
 * Hide progress overlay
 */
function hidePageProgressOverlay() {
  if (pageProgressOverlay) {
    pageProgressOverlay.remove();
    pageProgressOverlay = null;
    pageProgressShadow = null;
  }
}

/**
 * Show toggle button after translation
 */
function showPageToggleButton() {
  if (pageToggleButton) {
    return;
  }

  const host = document.createElement('div');
  host.id = 'parsipad-page-toggle';
  host.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
  `;

  pageToggleShadow = host.attachShadow({ mode: 'closed' });


  applyHostTheme(host);
  const style = document.createElement('style');
  style.textContent = getPageToggleStyles();
  pageToggleShadow.appendChild(style);

  // A constant name and a pressed state: pressed while the original shows.
  // Changing both the name and the state would announce the change twice.
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'parsipad-toggle-btn showing-translated';
  button.title = t('showOriginal', userLang);
  button.setAttribute('aria-label', t('showOriginal', userLang));
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.545 6.714 4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286zm1.634-.736L5.5 3.956h-.049l-.679 2.022z"/>
      <path d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm7.138 9.995q.289.451.63.846c-.748.575-1.673 1.001-2.768 1.292.178.217.451.635.555.867 1.125-.359 2.08-.844 2.886-1.494.777.665 1.739 1.165 2.93 1.472.133-.254.414-.673.629-.89-1.125-.253-2.057-.694-2.82-1.284.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6 6 0 0 1-.415-.492 2 2 0 0 1-.94.31"/>
    </svg>
  `;

  pageToggleShadow.appendChild(button);
  document.body.appendChild(host);
  pageToggleButton = host;

  button.addEventListener('click', handleTogglePageTranslation);
}

/**
 * Update toggle button state
 */
function updatePageToggleButton() {
  if (!pageToggleShadow) return;

  const button = pageToggleShadow.querySelector('.parsipad-toggle-btn');
  if (button) {
    const showingTranslated = Boolean(pageTranslationState?.isShowingTranslated);
    button.classList.toggle('showing-translated', showingTranslated);
    button.classList.toggle('showing-original', !showingTranslated);
    button.setAttribute('aria-pressed', String(!showingTranslated));
    button.title = t(showingTranslated ? 'showOriginal' : 'showTranslated', userLang);
  }
}



/**
 * Handle clicks outside the floating box
 */
function handleDocumentClick(event) {
  if (floatingBox && !floatingBox.contains(event.target)) {
    removeFloatingBox();
  }
  // Also remove selection popup if clicking outside it
  if (selectionPopup && !selectionPopup.contains(event.target)) {
    removeSelectionPopup();
  }
}

/**
 * Handle keyboard events
 */
function handleKeyDown(event) {
  // The keyboard path into the selection toolbar, which never takes focus on
  // its own. Remembers where focus was so it can go back there. Tab is only
  // taken once focus has really moved: where the toolbar cannot take focus
  // (an inert page behind a modal dialog), cancelling it would trap the
  // keyboard, so the browser keeps this Tab and the toolbar is passed by.
  if (shouldTabIntoSelectionPopup(event)) {
    const returnTo = document.activeElement;
    focusSelectionPopup();
    if (document.activeElement === selectionPopup) {
      selectionPopupReturnFocus = returnTo;
      event.preventDefault();
    } else {
      selectionPopupFocusLeft = true;
    }
    return;
  }

  // The non-pointer path into block translate. Kept here rather than in
  // manifest.commands because Chrome allows only four suggested keys and all
  // four are already assigned.
  //
  // event.code, not just event.key: on macOS Option composes, so Option+B
  // reports the character it produces rather than "b". Both are accepted so
  // the shortcut works regardless of platform or keyboard layout.
  //
  // Narrowed beyond the raw key match because this content script runs at
  // <all_urls>: ctrlKey/metaKey are excluded so AltGr (which reports
  // ctrlKey && altKey) and any site's own Ctrl+Alt+B pass through untouched;
  // editable regions are excluded so typing "b" while holding Option on macOS
  // does not eat the compose character for a resolution that would fail
  // anyway, since resolveBlock hard-rejects editable regions; and the enabled
  // check runs before preventDefault so a user who turned the feature off
  // keeps the shortcut everywhere else.
  const isEditableTarget = isEditableKeyTarget(event.target);

  if (event.altKey && !event.ctrlKey && !event.metaKey && !isEditableTarget &&
      isBlockTranslateEnabled() &&
      (event.code === 'KeyB' || event.key === 'b' || event.key === 'B')) {
    event.preventDefault();
    translateFocusedBlock();
    return;
  }

  if (event.key === 'Escape') {
    // A running page translation stops first and keeps what finished. The
    // key is not consumed: the page's own Escape handling still runs, and so
    // do the branches below. In a text field Escape belongs to the field
    // (clearing a search, say), so it is left alone there; Cancel stops the
    // run from anywhere. The question before a run handles its own Escape,
    // so this acts only once the requests are going.
    if (!isEditableTarget && pageTranslationState?.isTranslating && pageTranslationState.phase === 'running') {
      stopPageTranslation();
    }
    hideBlockIcon();
    if (screenshotOverlay) {
      cancelScreenshotMode();
      return;
    }
    // Focus in the toolbar: it closes first and hands focus back to where Tab
    // took it from. A box still open behind it then closes without moving
    // focus again to the element it was opened from.
    if (selectionPopup && document.activeElement === selectionPopup) {
      removeSelectionPopup();
      previouslyFocused = null;
    }
    if (floatingBox) {
      removeFloatingBox();
    }
    if (selectionPopup) {
      removeSelectionPopup();
    }
  }
}

/**
 * Whether a key event's target takes typed text, where keys belong to it.
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isEditableKeyTarget(target) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' ||
     target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
}

/**
 * Whether this keydown should move focus into the selection toolbar: a plain
 * Tab while the toolbar is up for the current selection, from anywhere but a
 * text field, the toolbar itself or the floating box. keydown from inside a
 * closed shadow root reaches the document retargeted to its host, so the
 * composed path, not the target, says where it came from; without that check
 * Tab could never leave the toolbar. For the same reason a text field in a
 * page's own closed root shows up only as its host, so focus is also checked
 * with the rule that keeps the toolbar out of text fields. Once focus has
 * left the toolbar, Tab passes it by, or every Tab on the page would pull
 * focus back into it. A page that handled Tab itself (a dialog's focus trap)
 * keeps it, and so does a selection that has gone or changed while the
 * toolbar waits to be cleared away.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function shouldTabIntoSelectionPopup(event) {
  if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (!selectionPopup || selectionPopupFocusLeft || event.defaultPrevented) return false;
  const path = event.composedPath();
  if (isEditableKeyTarget(path[0])) return false;
  if (path.includes(selectionPopup) || (floatingBox && path.includes(floatingBox))) return false;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  if (isEditableSelection(selection, document.activeElement)) return false;
  return Boolean(selectionPopupAnchor) && selection.toString().trim() === selectionPopupAnchor.text;
}

/**
 * Focus the toolbar's current tab stop. Without scrolling: the toolbar was
 * just placed beside the selection, which is already in view.
 */
function focusSelectionPopup() {
  if (!selectionPopupShadow) return;
  const active = selectionPopupShadow.querySelector('.selection-btn[tabindex="0"]');
  if (active) active.focus({ preventScroll: true });
}

/**
 * Give focus back to the element that had it when Tab moved it into the
 * toolbar. Nothing to do when that was the page itself (the body) or the
 * element has since left the document.
 * @returns {boolean} whether focus moved
 */
function returnFocusFromSelectionPopup() {
  const returnTo = selectionPopupReturnFocus;
  if (!returnTo || returnTo === document.body || typeof returnTo.focus !== 'function' ||
      !document.contains(returnTo)) {
    return false;
  }
  returnTo.focus({ preventScroll: true });
  return true;
}


// ============================================
// Screenshot Selection Functions
// ============================================


/**
 * Start screenshot region selection
 * @param {string} screenshotDataUrl - Data URL of the captured viewport
 */
function startScreenshotSelection(screenshotDataUrl) {
  // Cancel any existing screenshot mode
  cancelScreenshotMode();

  // Create host element
  const host = document.createElement('div');
  host.id = 'parsipad-screenshot-host';
  host.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647;';

  // Create shadow root
  screenshotShadow = host.attachShadow({ mode: 'closed' });

  applyHostTheme(host);
  // Inject styles
  const style = document.createElement('style');
  style.textContent = getScreenshotStyles();
  screenshotShadow.appendChild(style);

  // Create container
  const container = document.createElement('div');
  container.className = 'screenshot-container';

  // Screenshot image
  const img = document.createElement('img');
  img.className = 'screenshot-image';
  img.src = screenshotDataUrl;
  container.appendChild(img);

  // Full-screen dimmer (shown initially, replaced by 4 dimmers during selection)
  const dimmerFull = document.createElement('div');
  dimmerFull.className = 'screenshot-dimmer screenshot-dimmer-full';
  container.appendChild(dimmerFull);

  // 4 dimmers for cutout effect (hidden initially)
  const dimmerTop = document.createElement('div');
  dimmerTop.className = 'screenshot-dimmer';
  dimmerTop.style.display = 'none';
  const dimmerBottom = document.createElement('div');
  dimmerBottom.className = 'screenshot-dimmer';
  dimmerBottom.style.display = 'none';
  const dimmerLeft = document.createElement('div');
  dimmerLeft.className = 'screenshot-dimmer';
  dimmerLeft.style.display = 'none';
  const dimmerRight = document.createElement('div');
  dimmerRight.className = 'screenshot-dimmer';
  dimmerRight.style.display = 'none';
  container.appendChild(dimmerTop);
  container.appendChild(dimmerBottom);
  container.appendChild(dimmerLeft);
  container.appendChild(dimmerRight);

  // Selection rectangle
  const selectionRect = document.createElement('div');
  selectionRect.className = 'screenshot-selection';
  container.appendChild(selectionRect);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'screenshot-tooltip';
  tooltip.innerHTML = 'Drag to select region \u2022 <kbd>Esc</kbd> to cancel';
  container.appendChild(tooltip);

  screenshotShadow.appendChild(container);
  document.body.appendChild(host);
  screenshotOverlay = host;

  // Selection state
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  container.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    container.setPointerCapture(e.pointerId);

    // Hide full dimmer, show 4 dimmers
    dimmerFull.style.display = 'none';
    dimmerTop.style.display = 'block';
    dimmerBottom.style.display = 'block';
    dimmerLeft.style.display = 'block';
    dimmerRight.style.display = 'block';

    selectionRect.style.display = 'block';
    tooltip.style.display = 'none';
  });

  container.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.preventDefault();

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    // Update selection rectangle
    selectionRect.style.left = `${x}px`;
    selectionRect.style.top = `${y}px`;
    selectionRect.style.width = `${w}px`;
    selectionRect.style.height = `${h}px`;

    // Update 4 dimmers around selection (cutout effect)
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    dimmerTop.style.cssText = `position:absolute; background:rgba(0,0,0,0.4); pointer-events:none; left:0; top:0; width:${vw}px; height:${y}px;`;
    dimmerBottom.style.cssText = `position:absolute; background:rgba(0,0,0,0.4); pointer-events:none; left:0; top:${y + h}px; width:${vw}px; height:${vh - y - h}px;`;
    dimmerLeft.style.cssText = `position:absolute; background:rgba(0,0,0,0.4); pointer-events:none; left:0; top:${y}px; width:${x}px; height:${h}px;`;
    dimmerRight.style.cssText = `position:absolute; background:rgba(0,0,0,0.4); pointer-events:none; left:${x + w}px; top:${y}px; width:${vw - x - w}px; height:${h}px;`;
  });

  container.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    // Minimum selection size
    if (w < 20 || h < 20) {
      cancelScreenshotMode();
      return;
    }

    cropAndTranslate({ x, y, w, h }, screenshotDataUrl);
  });
}

/**
 * Crop the screenshot to the selected region and translate
 * @param {Object} rect - Selection rectangle {x, y, w, h} in CSS pixels
 * @param {string} screenshotDataUrl - Full viewport screenshot data URL
 */
async function cropAndTranslate(rect, screenshotDataUrl) {
  const { x, y, w, h } = rect;

  // Remove screenshot overlay
  cancelScreenshotMode();

  // The crop rectangle is in viewport coordinates, which is exactly what
  // the placer anchors to, so the cropped region stands in for a selection.
  createFloatingBox({ top: y, bottom: y + h, left: x });
  showLoading();
  placeFloatingBox();

  try {
    // Load screenshot image
    const img = new Image();
    const imageLoaded = new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load screenshot'));
    });
    img.src = screenshotDataUrl;
    await imageLoaded;

    // DPR scaling - captureVisibleTab captures at native resolution
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.round(x * dpr);
    const sy = Math.round(y * dpr);
    const sw = Math.round(w * dpr);
    const sh = Math.round(h * dpr);

    // Crop using canvas
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    // Extract base64 data
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');

    // Send to existing image translation API
    const response = await chrome.runtime.sendMessage({
      action: 'TRANSLATE_IMAGE',
      imageData: base64Data,
      mimeType: 'image/png'
    });

    if (response.error) {
      showError(response);
    } else {
      showImageTranslationResult(response);
    }
  } catch (error) {
    showError(error);
  }
}

/**
 * Display image translation result in the floating box
 * @param {Object} response - Translation response with extractedText, translation, direction, provider
 */
function showImageTranslationResult(response) {
  if (!shadowRoot) return;

  const { extractedText, translation, direction, provider } = response;

  // Update badge
  const badge = shadowRoot.querySelector('.parsipad-badge');
  const dirDisplay = direction === 'en-fa' ? 'EN → FA' : direction === 'fa-en' ? 'FA → EN' : direction?.toUpperCase() || 'OCR';
  badge.textContent = dirDisplay;

  // Update provider badge
  const providerBadge = shadowRoot.querySelector('.parsipad-provider-badge');
  if (providerBadge && provider) {
    providerBadge.textContent = provider;
    providerBadge.className = `parsipad-provider-badge parsipad-provider-${provider.toLowerCase()}`;
  }

  // Build content
  const content = shadowRoot.querySelector('.parsipad-content');
  const isTranslationRTL = direction === 'en-fa';
  const isExtractedRTL = direction === 'fa-en';

  let html = '';
  if (extractedText) {
    html += `<div class="parsipad-text" dir="${isExtractedRTL ? 'rtl' : 'ltr'}" style="font-size:12px; color:#6B7280; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #E5E7EB;">${escapeHtml(extractedText)}</div>`;
  }
  if (translation) {
    html += `<div class="parsipad-text" dir="${isTranslationRTL ? 'rtl' : 'ltr'}">${escapeHtml(translation)}</div>`;
  }
  if (!extractedText && !translation) {
    html = '<div class="parsipad-text" style="color:#6B7280;">No text found in selected region.</div>';
  }

  content.innerHTML = html;

  // Show footer
  const footer = shadowRoot.querySelector('.parsipad-footer');
  footer.style.display = 'flex';

  // Hide cache badge
  const cacheBadge = shadowRoot.querySelector('.parsipad-cache-badge');
  cacheBadge.textContent = '';

  // Store for favorites
  if (translation && extractedText) {
    currentTranslationData = {
      type: 'translation',
      originalText: extractedText,
      savedText: translation,
      direction: dirDisplay,
      provider: provider
    };
    checkTranslationFavoriteStatus();
  }

  placeFloatingBox();
}

/**
 * Cancel screenshot selection mode
 */
function cancelScreenshotMode() {
  if (screenshotOverlay) {
    screenshotOverlay.remove();
    screenshotOverlay = null;
    screenshotShadow = null;
  }
}

// ============================================
// Selection Popup Functions
// ============================================

/**
 * Load the user's preferred UI language (en or fa) so the floating box's
 * copy ("Did you mean:", "Alternatives", "Nuance") matches the extension's
 * popup/settings language. Idempotent; refreshed via chrome.storage.onChanged.
 */
async function loadUserLang() {
  try {
    const result = await chrome.storage.local.get('ui_language');
    userLang = result.ui_language || 'en';
  } catch {
    userLang = 'en';
  }
}

/**
 * Load selection popup setting from storage
 */
async function loadSelectionPopupSetting() {
  try {
    const result = await chrome.storage.local.get('selection_popup_enabled');
    selectionPopupEnabled = result.selection_popup_enabled ?? false;
  } catch (error) {
    selectionPopupEnabled = false;
  }
}

/**
 * Load whether this page's host is muted. Yields to a value written while the
 * read was pending (a storage change or a mute from the toolbar), which is
 * newer than what it read.
 */
async function loadMutedSites() {
  let muted = false;
  try {
    const result = await chrome.storage.local.get(MUTED_SITES_KEY);
    muted = isHostMuted(result[MUTED_SITES_KEY], location.hostname);
  } catch {
    muted = false;
  }
  if (mutedLoaded) return;
  mutedLoaded = true;
  siteMuted = muted;
}

/**
 * Whether a pointer event started on the selection toolbar or the floating
 * box. Both live in closed shadow roots, so the composed path ends at their
 * host elements.
 * @param {Event} event
 * @returns {boolean}
 */
function isPointerOnOwnUi(event) {
  const path = event.composedPath();
  return Boolean((selectionPopup && path.includes(selectionPopup)) ||
    (floatingBox && path.includes(floatingBox)));
}

// The hosts ParsiPad adds to a page: the floating box, toolbar, toast and
// page-translation overlay and toggle carry a parsipad- id; block translate
// marks its icon and its inline translations with data attributes.
const OWN_UI_SELECTOR = '[id^="parsipad-"], [data-parsipad-icon], [data-parsipad-translation]';

/**
 * Whether the selection lies in ParsiPad's own UI (see OWN_UI_SELECTOR).
 * @param {Selection} selection
 * @returns {boolean}
 */
function isSelectionInOwnUi(selection) {
  const inOwnUi = (node) => {
    const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    return Boolean(element && element.closest(OWN_UI_SELECTOR));
  };
  if (inOwnUi(selection.anchorNode) || inOwnUi(selection.focusNode)) return true;
  // A selection inside a closed shadow root (the floating box) is reported
  // at the host's own position in its parent, both ends at the same offset.
  const { anchorNode, anchorOffset } = selection;
  if (!anchorNode || anchorNode.nodeType !== Node.ELEMENT_NODE) return false;
  if (selection.focusNode !== anchorNode || selection.focusOffset !== anchorOffset) return false;
  const child = anchorNode.childNodes[anchorOffset];
  return Boolean(child && child.nodeType === Node.ELEMENT_NODE && child.matches(OWN_UI_SELECTOR));
}

/**
 * Look at the selection once it has settled (called by the toolbar trigger)
 * and show the toolbar for it, move it to a new range, or hide it.
 */
function evaluateSelection() {
  if (siteMuted) return;
  if (!selectionPopupEnabled) return;

  // Focus inside the toolbar (a keyboard user on its buttons): leave it, or a
  // rebuild would destroy the focused button.
  if (selectionPopup && document.activeElement === selectionPopup) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 ||
      isEditableSelection(selection, document.activeElement) ||
      isSelectionInOwnUi(selection)) {
    removeSelectionPopup();
    return;
  }

  // A page-sized selection (Ctrl+A) gets no toolbar: Translate would send the
  // whole page in one request. Same cap as the side-panel report.
  const selectedText = selection.toString().trim();
  if (selectedText.length < 2 || selectedText.length > MAX_REPORT_LENGTH) {
    removeSelectionPopup();
    return;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const anchor = selectionAnchor(selectedText, rect);
  if (selectionPopup && selectionPopup.isConnected && isSameAnchor(anchor, selectionPopupAnchor)) return;

  removeSelectionPopup();
  createSelectionPopup(rect, selectedText);
  selectionPopupAnchor = anchor;
}

/**
 * Create the selection toolbar for the selected text.
 *
 * Laid out hidden and measured first, so it is placed from its real size:
 * above the selection and centred on it, flipping below and clamping at the
 * viewport edges. Its entry animation is chosen after that, from where it
 * landed. It never takes focus on its own; Tab moves focus in (see
 * handleKeyDown), the arrow keys move between its buttons, and Tab leaves.
 *
 * @param {{top: number, bottom: number, left: number, right: number}} selectionRect - viewport coordinates
 * @param {string} selectedText
 */
function createSelectionPopup(selectionRect, selectedText) {
  // Create host element
  const host = document.createElement('div');
  host.id = 'parsipad-selection-popup';
  host.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2147483647;
    visibility: hidden;
  `;

  // Create shadow root for style isolation
  selectionPopupShadow = host.attachShadow({ mode: 'closed' });

  applyHostTheme(host);
  const style = document.createElement('style');
  style.textContent = getSelectionPopupStyles();
  selectionPopupShadow.appendChild(style);

  // Check if selected text is a single word (for dictionary)
  const isSingleWord = selectedText.split(/\s+/).length === 1;

  // Create popup structure with ARIA attributes for accessibility
  const popup = document.createElement('div');
  popup.className = 'selection-popup';
  popup.setAttribute('role', 'toolbar');
  popup.setAttribute('aria-label', t('toolbarLabel', userLang));
  // Build the icon buttons via DOM API so we can safely append a real
  // <span class="pp-tooltip"> for each label without relying on innerHTML
  // interpolation. Tooltips use theme-aware tokens so they stay legible on
  // dark host pages (previous ::before approach was dark-on-dark).
  const dictionaryKey = isSingleWord ? 'toolbarDictionary' : 'toolbarDictionarySingleWord';
  const buttons = [
    {
      action: 'translate',
      label: t('toolbarTranslate', userLang),
      ariaLabel: t('toolbarTranslate', userLang),
      svgPath: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129'
    },
    {
      action: 'polish',
      label: t('toolbarPolish', userLang),
      ariaLabel: t('toolbarPolish', userLang),
      svgPath: 'M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z'
    },
    {
      action: 'dictionary',
      label: t(dictionaryKey, userLang),
      ariaLabel: t(dictionaryKey, userLang),
      disabled: !isSingleWord,
      svgPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
    }
  ];
  // Only a host the muted-sites list can hold (not localhost or an intranet
  // name without a dot) gets the button; anywhere else it would do nothing.
  if (normalizeHost(location.hostname)) {
    buttons.push({
      action: 'mute',
      label: t('toolbarMute', userLang),
      ariaLabel: t('toolbarMute', userLang),
      svgPath: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
    });
  }
  const buttonEls = [];
  for (const cfg of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'selection-btn' + (cfg.disabled ? ' disabled' : '');
    btn.dataset.action = cfg.action;
    btn.setAttribute('aria-label', cfg.ariaLabel);
    if (cfg.disabled) btn.setAttribute('aria-disabled', 'true');

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', cfg.svgPath);
    svg.appendChild(path);
    btn.appendChild(svg);

    const tooltip = document.createElement('span');
    tooltip.className = 'pp-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = cfg.label;
    btn.appendChild(tooltip);

    popup.appendChild(btn);
    buttonEls.push(btn);
  }
  // One tab stop for the whole toolbar; the arrow keys move it.
  applyRovingTabindex(buttonEls, 0);

  selectionPopupShadow.appendChild(popup);
  document.body.appendChild(host);

  selectionPopup = host;

  // Laid out but not painted: measure, place, pick the entry direction, show.
  const size = host.getBoundingClientRect();
  const { top, left, placement } = computeBoxPosition({
    selection: selectionRect,
    box: { width: size.width, height: size.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    gap: 8, padding: 12,
    prefer: 'above',
    align: 'center'
  });
  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  popup.dataset.placement = placement;
  host.style.visibility = 'visible';

  // Set up event listeners
  buttonEls.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;

      // Remove popup first
      removeSelectionPopup();

      // Execute action
      if (action === 'translate') {
        translateAndShow(selectedText);
      } else if (action === 'polish') {
        polishAndShow(selectedText);
      } else if (action === 'dictionary' && isSingleWord) {
        dictionaryAndShow(selectedText);
      } else if (action === 'mute') {
        // detail is the click count, 0 when Enter or Space pressed the button.
        muteThisSite({ fromKeyboard: e.detail === 0 });
      }
    });
  });

  popup.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      // Focus is leaving, and Tab passes this toolbar by from now on. Back on
      // the element focus came in from, Shift+Tab stays there and Tab lets
      // the browser move on from it, as if the toolbar sat right after it.
      selectionPopupFocusLeft = true;
      if (returnFocusFromSelectionPopup()) {
        if (event.shiftKey) event.preventDefault();
      }
      return;
    }
    // Plain arrows only: Alt+Left is the browser's Back.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const current = buttonEls.indexOf(event.target);
    if (current === -1) return;
    const next = rovingIndex(current, event.key, buttonEls.length);
    if (next === null) return;
    // Handled here: the arrows must not also scroll the page or reach its
    // own shortcuts.
    event.preventDefault();
    event.stopPropagation();
    applyRovingTabindex(buttonEls, next);
    buttonEls[next].focus();
  });

  // Prevent clicks inside popup from triggering document click
  popup.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * Remove the selection toolbar. When focus was on one of its buttons, it
 * goes back to the element that had it before Tab moved it in, rather than
 * dropping to <body>.
 */
function removeSelectionPopup() {
  if (selectionPopup) {
    const hadFocus = document.activeElement === selectionPopup;
    selectionPopup.remove();
    selectionPopup = null;
    selectionPopupShadow = null;
    if (hadFocus) returnFocusFromSelectionPopup();
  }
  selectionPopupReturnFocus = null;
  selectionPopupFocusLeft = false;
  selectionPopupAnchor = null;
}



// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

} // end re-injection guard
