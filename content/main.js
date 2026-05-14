/**
 * ParsiPad Content Script
 * Handles text selection detection and floating translation box
 */

import { escapeHtml, isMissingApiKeyError } from './utils/text.js';
import {
  getPageProgressStyles,
  getPageToggleStyles,
  getScreenshotStyles,
  getSelectionPopupStyles,
  getStyles
} from './styles/index.js';

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
let selectionDebounceTimer = null;
let currentPolishOriginalText = null; // Store original text for regeneration
let currentTranslationData = null; // Store current translation for favorites
let currentDictionaryData = null; // Store current dictionary result for favorites

// Screenshot selection state
let screenshotOverlay = null;
let screenshotShadow = null;

// Page translation state
let pageTranslationState = null;
let pageProgressOverlay = null;
let pageProgressShadow = null;
let pageToggleButton = null;
let pageToggleShadow = null;
let pageTranslationCancelled = false;
let pageTranslationAbortController = null;


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

  // Listen for text selection (mouseup)
  document.addEventListener('mouseup', handleTextSelection);

  // Load selection popup setting
  loadSelectionPopupSetting();

  // Listen for storage changes to update setting
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.selection_popup_enabled) {
      selectionPopupEnabled = changes.selection_popup_enabled.newValue ?? false;
    }
  });

  // Reset page translation state on SPA navigation. SPAs swap content via
  // pushState/replaceState without firing a full page load, so the old
  // TextNode refs become stale and the toggle button points at nothing.
  installSpaNavigationListener();
}

/**
 * Patch history pushState/replaceState to emit a navigation event and listen
 * for popstate; on any URL change reset stale page-translation state.
 */
function installSpaNavigationListener() {
  const handleNav = () => {
    if (pageTranslationAbortController) {
      pageTranslationAbortController.abort();
      pageTranslationAbortController = null;
    }
    pageTranslationCancelled = false;

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
      // Cancel page translation
      pageTranslationCancelled = true;
      pageTranslationAbortController?.abort();
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
 * Translate text and show floating box
 */
async function translateAndShow(text) {
  if (!text || text.trim().length === 0) {
    return;
  }

  // Get selection position for box placement
  const selection = window.getSelection();
  const position = getBoxPosition(selection);

  // Create or update the floating box
  createFloatingBox(position);
  showLoading();

  try {
    // Send translation request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'TRANSLATE',
      text: text,
      sourceLang: 'auto'
    });

    if (response.error) {
      showError(response.error);
    } else {
      showTranslation(response, text);
    }
  } catch (error) {
    showError(error.message || 'Translation failed');
  }
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

  // Get selection position for box placement
  const selection = window.getSelection();
  const position = getBoxPosition(selection);

  // Create or update the polish floating box
  createPolishBox(position);
  showPolishLoading();

  try {
    // Send polish request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'POLISH',
      text: text
    });

    if (response.error) {
      showPolishError(response.error);
    } else {
      showPolishResults(response);
    }
  } catch (error) {
    showPolishError(error.message || 'Polish failed');
  }
}

/**
 * Calculate position for floating box based on selection
 * Uses smart flip to position above or below based on available space
 */
function getBoxPosition(selection) {
  // Constants for floating box dimensions
  const BOX_WIDTH = 450;
  const BOX_HEIGHT_ESTIMATE = 200; // Approximate height for flip calculation
  const GAP = 8;
  const VIEWPORT_PADDING = 12;

  let top = 100;
  let left = 100;

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Calculate space above and below selection
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    // Prefer below, but flip to above if not enough space below AND more space above
    if (spaceBelow < BOX_HEIGHT_ESTIMATE + GAP && spaceAbove > spaceBelow) {
      // Position above the selection (subtract estimated height)
      top = rect.top + window.scrollY - BOX_HEIGHT_ESTIMATE - GAP;
      // Ensure it doesn't go above the viewport
      if (top < window.scrollY + VIEWPORT_PADDING) {
        top = window.scrollY + VIEWPORT_PADDING;
      }
    } else {
      // Position below the selection
      top = rect.bottom + window.scrollY + GAP;
    }

    left = rect.left + window.scrollX;

    // Ensure box doesn't go off-screen to the right
    const maxLeft = window.innerWidth - BOX_WIDTH - VIEWPORT_PADDING;
    if (left > maxLeft) {
      left = maxLeft > 0 ? maxLeft : VIEWPORT_PADDING;
    }

    // Ensure box doesn't go off-screen to the left
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }
  }

  return { top, left };
}

/**
 * Create the floating translation box with Shadow DOM
 */
function createFloatingBox(position) {
  // Remove existing box if present
  removeFloatingBox();

  // Create host element
  const host = document.createElement('div');
  host.id = 'parsipad-host';
  host.style.cssText = `
    position: absolute;
    top: ${position.top}px;
    left: ${position.left}px;
    z-index: 2147483647;
  `;

  // Create shadow root for style isolation
  shadowRoot = host.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);

  // Create box structure
  const box = document.createElement('div');
  box.className = 'parsipad-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'ParsiPad translation');
  box.innerHTML = `
    <div class="parsipad-header">
      <div class="parsipad-logo">
        <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="" class="parsipad-logo-icon" aria-hidden="true">
        <span class="parsipad-logo-text">ParsiPad</span>
      </div>
      <div class="parsipad-badges">
        <span class="parsipad-badge">EN → FA</span>
        <span class="parsipad-provider-badge"></span>
      </div>
      <button class="parsipad-close" type="button" title="Close" aria-label="Close translation">×</button>
    </div>
    <div class="parsipad-content" aria-live="polite" aria-atomic="true">
      <div class="parsipad-text"></div>
    </div>
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
 * Show translation result
 */
function showTranslation(result, originalText) {
  if (!shadowRoot) return;

  const { translation, direction, displayDirection, fromCache, provider } = result;

  // Store translation data for favorites
  currentTranslationData = {
    type: 'translation',
    originalText: originalText,
    savedText: translation,
    direction: displayDirection || formatDirectionBadge(direction),
    provider: provider
  };

  // Update direction badge - use displayDirection if available, otherwise format from direction
  const badge = shadowRoot.querySelector('.parsipad-badge');
  badge.textContent = displayDirection || formatDirectionBadge(direction);

  // Update provider badge
  const providerBadge = shadowRoot.querySelector('.parsipad-provider-badge');
  if (providerBadge && provider) {
    providerBadge.textContent = provider;
    providerBadge.className = `parsipad-provider-badge parsipad-provider-${provider.toLowerCase()}`;
  }

  // Update content - target language determines text direction
  const content = shadowRoot.querySelector('.parsipad-content');
  const targetLang = direction.split('-')[1] || 'fa';
  const textDir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';
  content.innerHTML = `<div class="parsipad-text" dir="${textDir}">${escapeHtml(translation)}</div>`;

  // Show footer
  const footer = shadowRoot.querySelector('.parsipad-footer');
  footer.style.display = 'flex';

  // Update cache badge
  const cacheBadge = shadowRoot.querySelector('.parsipad-cache-badge');
  cacheBadge.textContent = fromCache ? 'From cache' : '';

  // Check if already favorited
  checkTranslationFavoriteStatus();
}

/**
 * Show error state. Missing-API-key errors get a CTA to open Settings.
 */
function showError(message) {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-content');
  if (isMissingApiKeyError(message)) {
    content.innerHTML = `
      <div class="parsipad-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <div>${escapeHtml(message)}</div>
          <button class="parsipad-open-settings" type="button">Open Settings</button>
        </div>
      </div>
    `;
    content.querySelector('.parsipad-open-settings')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' });
    });
  } else {
    content.innerHTML = `
      <div class="parsipad-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        ${escapeHtml(message)}
      </div>
    `;
  }

  // Hide footer on error
  const footer = shadowRoot.querySelector('.parsipad-footer');
  footer.style.display = 'none';
}

/**
 * Floating toast used when no floating box is on-screen (e.g. during page translation).
 */
function showMissingApiKeyToast() {
  const existing = document.getElementById('parsipad-missing-key-toast');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'parsipad-missing-key-toast';
  host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .toast {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #1f2937;
        color: #fff;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0,0,0,.2);
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 360px;
      }
      .toast button {
        background: #6366f1;
        color: #fff;
        border: 0;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
      }
      .toast button.close {
        background: transparent;
        padding: 4px;
        color: #9ca3af;
      }
    </style>
    <div class="toast" role="alert">
      <span>API key not configured.</span>
      <button class="open" type="button">Open Settings</button>
      <button class="close" type="button" aria-label="Dismiss">×</button>
    </div>
  `;
  document.body.appendChild(host);

  root.querySelector('.open').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' });
    host.remove();
  });
  root.querySelector('.close').addEventListener('click', () => host.remove());
  setTimeout(() => host.remove(), 10000);
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
      const favBtn = shadowRoot.querySelector('.parsipad-favorite');
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
 * Handle favorite button click for translation
 */
async function handleTranslationFavorite() {
  if (!shadowRoot || !currentTranslationData) return;

  const favBtn = shadowRoot.querySelector('.parsipad-favorite');
  if (!favBtn) return;

  const isFavorited = favBtn.classList.contains('favorited');

  try {
    if (isFavorited) {
      // Remove from favorites
      await chrome.runtime.sendMessage({
        action: 'REMOVE_FAVORITE',
        originalText: currentTranslationData.originalText,
        savedText: currentTranslationData.savedText
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
        item: currentTranslationData
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
 * Remove the floating box
 */
function removeFloatingBox() {
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
function createPolishBox(position) {
  // Remove existing box if present
  removeFloatingBox();

  // Create host element
  const host = document.createElement('div');
  host.id = 'parsipad-host';
  host.style.cssText = `
    position: absolute;
    top: ${position.top}px;
    left: ${position.left}px;
    z-index: 2147483647;
  `;

  // Create shadow root for style isolation
  shadowRoot = host.attachShadow({ mode: 'closed' });

  // Inject styles (includes polish styles)
  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);

  // Create box structure for polish results
  const box = document.createElement('div');
  box.className = 'parsipad-box parsipad-polish-box';
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
      <button class="parsipad-close" title="Close">×</button>
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
          <button class="parsipad-polish-favorite" data-version="professional" title="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-polish-regenerate" data-version="professional" title="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="parsipad-polish-copy" data-version="professional" title="Copy">
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
          <button class="parsipad-polish-favorite" data-version="conversational" title="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-polish-regenerate" data-version="conversational" title="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="parsipad-polish-copy" data-version="conversational" title="Copy">
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
          <button class="parsipad-polish-favorite" data-version="concise" title="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-polish-regenerate" data-version="concise" title="Regenerate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button class="parsipad-polish-copy" data-version="concise" title="Copy">
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
 * Show error in polish box. Missing-API-key errors get the same CTA as showError().
 */
function showPolishError(message) {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-polish-content');
  if (isMissingApiKeyError(message)) {
    content.innerHTML = `
      <div class="parsipad-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <div>${escapeHtml(message)}</div>
          <button class="parsipad-open-settings" type="button">Open Settings</button>
        </div>
      </div>
    `;
    content.querySelector('.parsipad-open-settings')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' });
    });
  } else {
    content.innerHTML = `
      <div class="parsipad-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        ${escapeHtml(message)}
      </div>
    `;
  }
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

  // Get selection position for box placement
  const selection = window.getSelection();
  const position = getBoxPosition(selection);

  // Create dictionary floating box
  createDictionaryBox(position);
  showDictionaryLoading();

  try {
    // Send dictionary lookup request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'DICTIONARY_LOOKUP',
      word: cleanWord,
      sourceLang: 'auto'
    });

    if (response.error) {
      showDictionaryError(response.error);
    } else {
      showDictionaryResult(response);
    }
  } catch (error) {
    showDictionaryError(error.message || 'Lookup failed');
  }
}

/**
 * Create the floating dictionary box with Shadow DOM
 */
function createDictionaryBox(position) {
  // Remove existing box if present
  removeFloatingBox();

  // Create host element
  const host = document.createElement('div');
  host.id = 'parsipad-host';
  host.style.cssText = `
    position: absolute;
    top: ${position.top}px;
    left: ${position.left}px;
    z-index: 2147483647;
  `;

  // Create shadow root for style isolation
  shadowRoot = host.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);

  // Create box structure for dictionary
  const box = document.createElement('div');
  box.className = 'parsipad-box parsipad-dictionary-box';
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
      <button class="parsipad-close" title="Close">×</button>
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
          <button class="parsipad-dict-favorite-translation" title="Add to favorites">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="parsipad-dict-copy-translation" title="Copy translation">
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
 * Show error in dictionary box
 */
function showDictionaryError(message) {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-dictionary-content');
  content.innerHTML = `
    <div class="parsipad-error" role="alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      ${escapeHtml(message)}
    </div>
  `;
}

// ============================================
// Page Translation Functions
// ============================================

/**
 * Handle page translation request
 */
async function handleTranslatePage() {
  // If already translating, ignore
  if (pageTranslationState?.isTranslating) {
    return;
  }

  // If already translated, toggle instead
  if (pageTranslationState?.isTranslated) {
    handleTogglePageTranslation();
    return;
  }

  // Initialize state
  pageTranslationState = {
    isTranslated: false,
    isTranslating: true,
    isShowingTranslated: false,
    originalTexts: new Map(),
    translatedTexts: new Map(),
    originalDirections: new Map(),
    sourceLanguage: null,
    targetLanguage: null,
    textNodes: [],
    totalChunks: 0,
    translatedChunks: 0
  };

  pageTranslationCancelled = false;
  pageTranslationAbortController = new AbortController();
  const abortSignal = pageTranslationAbortController.signal;

  // Show progress overlay
  showPageProgressOverlay();

  try {
    // Extract text nodes
    pageTranslationState.textNodes = extractVisibleTextNodes(document.body);

    if (pageTranslationState.textNodes.length === 0) {
      hidePageProgressOverlay();
      pageTranslationState.isTranslating = false;
      alert('No translatable text found on this page.');
      return;
    }

    // Store original texts
    for (const { node, text } of pageTranslationState.textNodes) {
      pageTranslationState.originalTexts.set(node, text);
    }

    // Detect language
    pageTranslationState.sourceLanguage = detectPageLanguage(pageTranslationState.textNodes);
    pageTranslationState.targetLanguage = pageTranslationState.sourceLanguage === 'fa' ? 'en' : 'fa';

    // Group text nodes into batches for translation
    const batches = batchTextNodesForTranslation(pageTranslationState.textNodes);
    pageTranslationState.totalChunks = batches.length;

    updatePageProgress(0, batches.length, 0);

    // Translate each batch
    for (let i = 0; i < batches.length; i++) {
      if (pageTranslationCancelled || abortSignal.aborted) {
        break;
      }

      const batch = batches[i];

      try {
        // Build the batch text with numbered markers
        const batchText = batch.map((item, idx) => `[${idx + 1}] ${item.text}`).join('\n');

        // Race the background message against the abort signal so the cancel
        // button doesn't have to wait for the current batch's network round-trip.
        const response = await Promise.race([
          chrome.runtime.sendMessage({
            action: 'TRANSLATE',
            text: batchText,
            sourceLang: pageTranslationState.sourceLanguage
          }),
          new Promise((_, reject) => {
            abortSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
          })
        ]);

        if (response.error) {
          if (isMissingApiKeyError(response.error)) {
            showMissingApiKeyToast();
            pageTranslationCancelled = true;
            break;
          }
          console.error('Batch translation error:', response.error);
          continue;
        }

        // Parse numbered translations back to individual nodes
        const translations = parseNumberedTranslations(response.translation, batch.length);

        for (let j = 0; j < batch.length; j++) {
          const node = batch[j].node;
          const translatedText = translations[j] || batch[j].text;
          pageTranslationState.translatedTexts.set(node, translatedText);
        }
      } catch (error) {
        if (error?.name === 'AbortError' || abortSignal.aborted) {
          break;
        }
        console.error('Batch translation failed:', error);
      }

      pageTranslationState.translatedChunks = i + 1;
      const percent = Math.round(((i + 1) / batches.length) * 100);
      updatePageProgress(i + 1, batches.length, percent);

      // Delay between batches
      if (i < batches.length - 1 && !pageTranslationCancelled && !abortSignal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Apply translations to DOM
    if (!pageTranslationCancelled && !abortSignal.aborted) {
      applyPageTranslations();
      pageTranslationState.isTranslated = true;
      pageTranslationState.isShowingTranslated = true;
      showPageToggleButton();
    }
  } catch (error) {
    console.error('Page translation error:', error);
  } finally {
    if (pageTranslationState) {
      pageTranslationState.isTranslating = false;
    }
    hidePageProgressOverlay();
    pageTranslationAbortController = null;
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
 * Batch text nodes for translation with numbered markers
 * Each batch contains nodes that will be translated together with [1], [2], etc. markers
 */
function batchTextNodesForTranslation(textNodes) {
  const MAX_CHARS_PER_BATCH = 3000;
  const MAX_NODES_PER_BATCH = 20;

  if (textNodes.length === 0) {
    return [];
  }

  const batches = [];
  let currentBatch = [];
  let currentLength = 0;

  for (const nodeInfo of textNodes) {
    const text = nodeInfo.text;
    // Account for marker like "[1] " which adds ~4-5 chars per item
    const itemLength = text.length + 6;

    // Start new batch if this would exceed limits
    if (currentBatch.length >= MAX_NODES_PER_BATCH ||
        (currentLength + itemLength > MAX_CHARS_PER_BATCH && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = 0;
    }

    currentBatch.push(nodeInfo);
    currentLength += itemLength;
  }

  // Add remaining batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Parse numbered translations back to array
 * Expects format like "[1] translated text\n[2] another translation"
 */
function parseNumberedTranslations(translatedText, expectedCount) {
  const results = new Array(expectedCount).fill('');

  // Split by numbered markers [1], [2], etc.
  const lines = translatedText.split(/\n/);
  let currentIndex = -1;
  let currentText = '';

  for (const line of lines) {
    // Check if line starts with a numbered marker
    const markerMatch = line.match(/^\[(\d+)\]\s*(.*)/);

    if (markerMatch) {
      // Save previous item if any
      if (currentIndex >= 0 && currentIndex < expectedCount) {
        results[currentIndex] = currentText.trim();
      }

      // Start new item
      currentIndex = parseInt(markerMatch[1], 10) - 1; // Convert to 0-based index
      currentText = markerMatch[2];
    } else if (currentIndex >= 0) {
      // Continuation of current item
      currentText += '\n' + line;
    }
  }

  // Save last item
  if (currentIndex >= 0 && currentIndex < expectedCount) {
    results[currentIndex] = currentText.trim();
  }

  return results;
}

/**
 * Inject Vazirmatn font + utility class used to style translated Persian
 * content on the host page. Loads the woff2 from the extension's own bundle
 * via chrome.runtime.getURL so we don't make any third-party requests.
 */
function injectPageTranslationStyles() {
  const styleId = 'parsipad-page-translation-styles';
  if (document.getElementById(styleId)) return;

  const url400 = chrome.runtime.getURL('fonts/vazirmatn-arabic-400-normal.woff2');
  const url500 = chrome.runtime.getURL('fonts/vazirmatn-arabic-500-normal.woff2');
  const url600 = chrome.runtime.getURL('fonts/vazirmatn-arabic-600-normal.woff2');
  const url700 = chrome.runtime.getURL('fonts/vazirmatn-arabic-700-normal.woff2');

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @font-face { font-family: 'Vazirmatn'; font-weight: 400; font-display: swap; src: url('${url400}') format('woff2'); }
    @font-face { font-family: 'Vazirmatn'; font-weight: 500; font-display: swap; src: url('${url500}') format('woff2'); }
    @font-face { font-family: 'Vazirmatn'; font-weight: 600; font-display: swap; src: url('${url600}') format('woff2'); }
    @font-face { font-family: 'Vazirmatn'; font-weight: 700; font-display: swap; src: url('${url700}') format('woff2'); }

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
 * Restore original text to the DOM
 */
function restorePageOriginals() {
  if (!pageTranslationState) return;

  for (const { node, parent } of pageTranslationState.textNodes) {
    const originalText = pageTranslationState.originalTexts.get(node);
    if (originalText) {
      node.textContent = originalText;

      if (parent) {
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

/**
 * Show page progress overlay
 */
function showPageProgressOverlay() {
  if (pageProgressOverlay) {
    hidePageProgressOverlay();
  }

  const host = document.createElement('div');
  host.id = 'parsipad-page-progress';
  host.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
  `;

  pageProgressShadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getPageProgressStyles();
  pageProgressShadow.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'parsipad-progress-overlay';
  overlay.innerHTML = `
    <div class="parsipad-progress-header">
      <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="ParsiPad" class="parsipad-progress-logo">
      <span class="parsipad-progress-title">Translating page...</span>
    </div>
    <div class="parsipad-progress-bar-container">
      <div class="parsipad-progress-bar" style="width: 0%"></div>
    </div>
    <div class="parsipad-progress-text">Preparing...</div>
    <button class="parsipad-progress-cancel">Cancel</button>
  `;

  pageProgressShadow.appendChild(overlay);
  document.body.appendChild(host);
  pageProgressOverlay = host;

  // Cancel button handler
  const cancelBtn = pageProgressShadow.querySelector('.parsipad-progress-cancel');
  cancelBtn.addEventListener('click', () => {
    pageTranslationCancelled = true;
    pageTranslationAbortController?.abort();
  });
}

/**
 * Update progress display
 */
function updatePageProgress(current, total, percent) {
  if (!pageProgressShadow) return;

  const progressBar = pageProgressShadow.querySelector('.parsipad-progress-bar');
  const progressText = pageProgressShadow.querySelector('.parsipad-progress-text');

  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  if (progressText) {
    progressText.textContent = `Processing chunk ${current} of ${total} (${percent}%)`;
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

  const style = document.createElement('style');
  style.textContent = getPageToggleStyles();
  pageToggleShadow.appendChild(style);

  const button = document.createElement('button');
  button.className = 'parsipad-toggle-btn showing-translated';
  button.title = 'Show original';
  button.setAttribute('aria-label', 'Toggle between original and translated text');
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
    if (pageTranslationState?.isShowingTranslated) {
      button.classList.add('showing-translated');
      button.classList.remove('showing-original');
      button.title = 'Show original';
    } else {
      button.classList.remove('showing-translated');
      button.classList.add('showing-original');
      button.title = 'Show translated';
    }
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
  if (event.key === 'Escape') {
    if (screenshotOverlay) {
      cancelScreenshotMode();
      return;
    }
    if (floatingBox) {
      removeFloatingBox();
    }
    if (selectionPopup) {
      removeSelectionPopup();
    }
  }
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

  // Calculate position for floating box (center of selection)
  const boxTop = y + h + 8 + window.scrollY;
  const boxLeft = Math.max(12, Math.min(x + window.scrollX, window.innerWidth - 450 - 12));

  // Remove screenshot overlay
  cancelScreenshotMode();

  // Create floating box at selection position
  createFloatingBox({ top: boxTop, left: boxLeft });
  showLoading();

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
      showError(response.error);
    } else {
      showImageTranslationResult(response);
    }
  } catch (error) {
    showError(error.message || 'Screenshot translation failed');
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
 * Handle text selection on mouseup
 */
function handleTextSelection(event) {
  // Don't show popup if disabled
  if (!selectionPopupEnabled) return;

  // Don't show if clicking inside existing popup or floating box
  if (selectionPopup && selectionPopup.contains(event.target)) return;
  if (floatingBox && floatingBox.contains(event.target)) return;

  // Clear any existing debounce timer
  if (selectionDebounceTimer) {
    clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = null;
  }

  // Remove existing popup immediately on new selection attempt
  removeSelectionPopup();

  // Debounce: wait 200ms before showing popup to avoid flickering
  selectionDebounceTimer = setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    // Only show popup if there's selected text (min 2 chars)
    if (selectedText && selectedText.length >= 2) {
      const position = getSelectionPopupPosition(selection);
      createSelectionPopup(position, selectedText);
    }
  }, 200);
}

/**
 * Get position for selection popup (centered on selection)
 * Uses smart flip to position above or below based on available space
 */
function getSelectionPopupPosition(selection) {
  // Constants for popup dimensions
  const POPUP_WIDTH = 120;
  const POPUP_HEIGHT = 46;
  const GAP = 8;
  const VIEWPORT_PADDING = 12;

  let top = 100;
  let left = 100;
  let showBelow = false;

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Center popup horizontally on selection
    const selectionCenterX = rect.left + (rect.width / 2);
    left = selectionCenterX + window.scrollX - (POPUP_WIDTH / 2);

    // Calculate space above and below selection
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    // Prefer above, but flip to below if not enough space above AND more space below
    if (spaceAbove < POPUP_HEIGHT + GAP && spaceBelow > spaceAbove) {
      // Show below selection
      top = rect.bottom + window.scrollY + GAP;
      showBelow = true;
    } else {
      // Show above selection
      top = rect.top + window.scrollY - POPUP_HEIGHT - GAP;
    }

    // Ensure popup stays within horizontal viewport bounds
    const maxLeft = window.innerWidth - POPUP_WIDTH - VIEWPORT_PADDING;
    if (left > maxLeft) {
      left = maxLeft > 0 ? maxLeft : VIEWPORT_PADDING;
    }
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

    // Ensure popup stays within vertical viewport bounds
    const scrollTop = window.scrollY;
    if (top < scrollTop + VIEWPORT_PADDING) {
      top = scrollTop + VIEWPORT_PADDING;
    }
  }

  return { top, left, showBelow };
}

/**
 * Create the selection popup with action icons
 */
function createSelectionPopup(position, selectedText) {
  // Create host element
  const host = document.createElement('div');
  host.id = 'parsipad-selection-popup';
  host.style.cssText = `
    position: absolute;
    top: ${position.top}px;
    left: ${position.left}px;
    z-index: 2147483647;
  `;

  // Create shadow root for style isolation
  selectionPopupShadow = host.attachShadow({ mode: 'closed' });

  // Inject styles with animation direction based on position
  const style = document.createElement('style');
  style.textContent = getSelectionPopupStyles(position.showBelow);
  selectionPopupShadow.appendChild(style);

  // Check if selected text is a single word (for dictionary)
  const isSingleWord = selectedText.split(/\s+/).length === 1;

  // Create popup structure with ARIA attributes for accessibility
  const popup = document.createElement('div');
  popup.className = 'selection-popup';
  popup.setAttribute('role', 'toolbar');
  popup.setAttribute('aria-label', 'Text actions');
  popup.innerHTML = `
    <button class="selection-btn" data-action="translate" data-tooltip="Translate" role="button" aria-label="Translate selected text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
      </svg>
    </button>
    <button class="selection-btn" data-action="polish" data-tooltip="Polish" role="button" aria-label="Polish and improve text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
      </svg>
    </button>
    <button class="selection-btn ${!isSingleWord ? 'disabled' : ''}" data-action="dictionary" data-tooltip="${isSingleWord ? 'Dictionary' : 'Single word only'}" role="button" aria-label="Look up in dictionary${!isSingleWord ? ' (single word only)' : ''}" ${!isSingleWord ? 'aria-disabled="true"' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
      </svg>
    </button>
  `;

  selectionPopupShadow.appendChild(popup);
  document.body.appendChild(host);

  selectionPopup = host;

  // Set up event listeners
  popup.querySelectorAll('.selection-btn').forEach(btn => {
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
      }
    });
  });

  // Prevent clicks inside popup from triggering document click
  popup.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * Remove the selection popup
 */
function removeSelectionPopup() {
  if (selectionPopup) {
    selectionPopup.remove();
    selectionPopup = null;
    selectionPopupShadow = null;
  }
}



// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

} // end re-injection guard
