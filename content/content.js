/**
 * ParsiPad Content Script
 * Handles text selection detection and floating translation box
 */

// State
let floatingBox = null;
let shadowRoot = null;
let currentSelection = null;
let selectionPopup = null;
let selectionPopupShadow = null;
let selectionPopupEnabled = false;
let selectionDebounceTimer = null;
let currentPolishOriginalText = null; // Store original text for regeneration
let currentTranslationData = null; // Store current translation for favorites
let currentDictionaryData = null; // Store current dictionary result for favorites

// Page translation state
let pageTranslationState = null;
let pageProgressOverlay = null;
let pageProgressShadow = null;
let pageToggleButton = null;
let pageToggleShadow = null;
let pageTranslationCancelled = false;

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
}

/**
 * Handle messages from background script
 */
function handleMessage(message, sender, sendResponse) {
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
  box.innerHTML = `
    <div class="parsipad-header">
      <div class="parsipad-logo">
        <img src="${chrome.runtime.getURL('icons/icon-48.png')}" alt="ParsiPad" class="parsipad-logo-icon">
        <span class="parsipad-logo-text">ParsiPad</span>
      </div>
      <div class="parsipad-badges">
        <span class="parsipad-badge">EN → FA</span>
        <span class="parsipad-provider-badge"></span>
      </div>
      <button class="parsipad-close" title="Close">×</button>
    </div>
    <div class="parsipad-content">
      <div class="parsipad-text"></div>
    </div>
    <div class="parsipad-footer">
      <span class="parsipad-cache-badge"></span>
      <div class="parsipad-footer-actions">
        <button class="parsipad-favorite" title="Add to favorites">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button class="parsipad-copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
}

/**
 * Show loading state in the floating box
 */
function showLoading() {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-content');
  content.innerHTML = `
    <div class="parsipad-loading">
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
    original: originalText,
    saved: translation,
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
 * Show error state
 */
function showError(message) {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-content');
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

  // Hide footer on error
  const footer = shadowRoot.querySelector('.parsipad-footer');
  footer.style.display = 'none';
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
      original: currentTranslationData.original,
      saved: currentTranslationData.saved
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
        original: currentTranslationData.original,
        saved: currentTranslationData.saved
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
    original: currentPolishOriginalText,
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
        original: polishData.original,
        saved: polishData.variants[variant]
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
        original: polishData.original,
        saved: variantText
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
          original: polishData.original,
          saved: variantText,
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
 * Show error in polish box
 */
function showPolishError(message) {
  if (!shadowRoot) return;

  const content = shadowRoot.querySelector('.parsipad-polish-content');
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
      type: 'translation',
      original: word,
      saved: translation,
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
      original: currentDictionaryData.original,
      saved: currentDictionaryData.saved
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
        original: currentDictionaryData.original,
        saved: currentDictionaryData.saved
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
      if (pageTranslationCancelled) {
        break;
      }

      const batch = batches[i];

      try {
        // Build the batch text with numbered markers
        const batchText = batch.map((item, idx) => `[${idx + 1}] ${item.text}`).join('\n');

        const response = await chrome.runtime.sendMessage({
          action: 'TRANSLATE',
          text: batchText,
          sourceLang: pageTranslationState.sourceLanguage
        });

        if (response.error) {
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
        console.error('Batch translation failed:', error);
      }

      pageTranslationState.translatedChunks = i + 1;
      const percent = Math.round(((i + 1) / batches.length) * 100);
      updatePageProgress(i + 1, batches.length, percent);

      // Delay between batches
      if (i < batches.length - 1 && !pageTranslationCancelled) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Apply translations to DOM
    if (!pageTranslationCancelled) {
      applyPageTranslations();
      pageTranslationState.isTranslated = true;
      pageTranslationState.isShowingTranslated = true;
      showPageToggleButton();
    }
  } catch (error) {
    console.error('Page translation error:', error);
  } finally {
    pageTranslationState.isTranslating = false;
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
 * Inject Vazir font styles for translated Persian content
 */
function injectPageTranslationStyles() {
  const styleId = 'parsipad-page-translation-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap');

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
 * Get styles for progress overlay
 */
function getPageProgressStyles() {
  return `
    .parsipad-progress-overlay {
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25);
      padding: 16px 24px;
      min-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .parsipad-progress-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .parsipad-progress-logo {
      width: 24px;
      height: 24px;
    }

    .parsipad-progress-title {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
    }

    .parsipad-progress-bar-container {
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .parsipad-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .parsipad-progress-text {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
    }

    .parsipad-progress-cancel {
      width: 100%;
      padding: 8px 16px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      color: #374151;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .parsipad-progress-cancel:hover {
      background: #e5e7eb;
      border-color: #d1d5db;
    }
  `;
}

/**
 * Get styles for toggle button
 */
function getPageToggleStyles() {
  return `
    .parsipad-toggle-btn {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15),
                  0 2px 4px rgba(0, 0, 0, 0.1);
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
    }

    .parsipad-toggle-btn svg {
      width: 22px;
      height: 22px;
    }

    .parsipad-toggle-btn.showing-translated {
      background: #6366f1;
      color: white;
    }

    .parsipad-toggle-btn.showing-translated:hover {
      background: #4f46e5;
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4),
                  0 3px 8px rgba(0, 0, 0, 0.12);
    }

    .parsipad-toggle-btn.showing-original {
      background: #ffffff;
      color: #6b7280;
      border: 1px solid #e5e7eb;
    }

    .parsipad-toggle-btn.showing-original:hover {
      background: #f9fafb;
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15),
                  0 3px 8px rgba(0, 0, 0, 0.1);
    }

    .parsipad-toggle-btn:active {
      transform: scale(0.96);
    }
  `;
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
    if (floatingBox) {
      removeFloatingBox();
    }
    if (selectionPopup) {
      removeSelectionPopup();
    }
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

/**
 * Get CSS styles for selection popup
 * @param {boolean} showBelow - Whether popup is shown below selection (affects animation direction)
 */
function getSelectionPopupStyles(showBelow = false) {
  // Animation direction: popup slides toward the selection
  const animFrom = showBelow ? 'translateY(-8px)' : 'translateY(8px)';

  return `
    :host {
      all: initial;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .selection-popup {
      display: flex;
      align-items: center;
      gap: 4px;
      background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
      border-radius: 10px;
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.12),
        0 1px 3px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.04);
      padding: 6px;
      animation: popup-spring-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes popup-spring-in {
      from {
        opacity: 0;
        transform: ${animFrom} scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .selection-btn {
      position: relative;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      color: #64748b;
      transition: background-color 0.15s, color 0.15s, transform 0.15s;
    }

    .selection-btn:hover {
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
      transform: scale(1.05);
    }

    .selection-btn:active {
      transform: scale(0.95);
    }

    .selection-btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .selection-btn.disabled:hover {
      background: transparent;
      color: #64748b;
      transform: none;
    }

    .selection-btn svg {
      width: 18px;
      height: 18px;
    }

    /* Custom tooltips */
    .selection-btn::before {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      background: #1f2937;
      color: #ffffff;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      border-radius: 4px;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      pointer-events: none;
      z-index: 10;
    }

    /* Tooltip arrow */
    .selection-btn::after {
      content: '';
      position: absolute;
      bottom: calc(100% + 2px);
      left: 50%;
      transform: translateX(-50%);
      border: 4px solid transparent;
      border-top-color: #1f2937;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      pointer-events: none;
      z-index: 10;
    }

    .selection-btn:hover::before,
    .selection-btn:hover::after {
      opacity: 1;
      visibility: visible;
    }

    /* Disabled button tooltip stays visible longer */
    .selection-btn.disabled:hover::before {
      opacity: 1;
      visibility: visible;
    }
  `;
}

/**
 * Get CSS styles for shadow DOM
 * Inlined to avoid loading external files
 */
function getStyles() {
  return `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .parsipad-box {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid #e5e7eb;
      min-width: 280px;
      max-width: 450px;
      animation: parsipad-fade-in 150ms ease-out;
      font-size: 14px;
      line-height: 1.5;
      color: #111827;
    }

    @keyframes parsipad-fade-in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .parsipad-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 12px 12px 0 0;
      gap: 8px;
    }

    .parsipad-logo {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .parsipad-logo-icon {
      width: 20px;
      height: 20px;
      background: #6366f1;
      color: white;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
    }

    .parsipad-logo-text {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
    }

    .parsipad-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }

    .parsipad-badge {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 6px;
      background: #6366f1;
      color: white;
      border-radius: 4px;
    }

    .parsipad-provider-badge {
      font-size: 9px;
      font-weight: 500;
      padding: 2px 6px;
      color: white;
      border-radius: 4px;
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    }

    .parsipad-provider-claude {
      background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
    }

    .parsipad-provider-gemini {
      background: linear-gradient(135deg, #4285F4 0%, #1A73E8 100%);
    }

    .parsipad-provider-chatgpt {
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    }

    .parsipad-close {
      width: 24px;
      height: 24px;
      background: none;
      border: none;
      cursor: pointer;
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background-color 0.15s, color 0.15s;
      font-size: 18px;
      line-height: 1;
    }

    .parsipad-close:hover {
      background: #e5e7eb;
      color: #374151;
    }

    .parsipad-content {
      padding: 12px;
      max-height: 200px;
      overflow-y: auto;
    }

    .parsipad-text {
      font-size: 14px;
      line-height: 1.6;
      color: #111827;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .parsipad-text[dir="rtl"] {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      text-align: right;
    }

    .parsipad-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
    }

    .parsipad-cache-badge {
      font-size: 11px;
      color: #9ca3af;
    }

    .parsipad-copy {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background-color 0.15s;
    }

    .parsipad-copy:hover {
      background: #4f46e5;
    }

    .parsipad-copy svg {
      width: 14px;
      height: 14px;
    }

    .parsipad-copy.copied {
      background: #10b981;
    }

    .parsipad-footer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .parsipad-favorite {
      width: 32px;
      height: 32px;
      background: none;
      border: 1px solid #e5e7eb;
      cursor: pointer;
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
    }

    .parsipad-favorite:hover {
      background: #fef3c7;
      border-color: #fbbf24;
      color: #f59e0b;
    }

    .parsipad-favorite svg {
      width: 16px;
      height: 16px;
    }

    .parsipad-favorite.favorited {
      background: #fef3c7;
      border-color: #fbbf24;
      color: #f59e0b;
    }

    .parsipad-loading {
      padding: 4px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .parsipad-skeleton {
      height: 14px;
      background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
      background-size: 200% 100%;
      animation: parsipad-shimmer 1.5s infinite;
      border-radius: 4px;
    }

    .parsipad-skeleton:nth-child(1) { width: 90%; }
    .parsipad-skeleton:nth-child(2) { width: 75%; }
    .parsipad-skeleton:nth-child(3) { width: 60%; }

    @keyframes parsipad-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .parsipad-error {
      color: #ef4444;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .parsipad-error svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .parsipad-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    .parsipad-content::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }

    /* Polish Box Styles */
    .parsipad-polish-box {
      max-width: 500px;
    }

    .parsipad-badge-polish {
      background: #8b5cf6;
    }

    .parsipad-polish-content {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 350px;
      overflow-y: auto;
    }

    .parsipad-polish-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .parsipad-polish-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .parsipad-polish-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .parsipad-polish-title {
      font-size: 11px;
      font-weight: 600;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .parsipad-polish-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .parsipad-polish-copy,
    .parsipad-polish-regenerate,
    .parsipad-polish-favorite {
      width: 24px;
      height: 24px;
      background: none;
      border: none;
      cursor: pointer;
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s, transform 0.15s;
    }

    .parsipad-polish-copy:hover,
    .parsipad-polish-regenerate:hover {
      background: #e5e7eb;
      color: #374151;
    }

    .parsipad-polish-favorite:hover {
      background: #fef3c7;
      color: #f59e0b;
    }

    .parsipad-polish-copy svg,
    .parsipad-polish-regenerate svg,
    .parsipad-polish-favorite svg {
      width: 14px;
      height: 14px;
    }

    .parsipad-polish-copy.copied {
      color: #10b981;
    }

    .parsipad-polish-favorite.favorited {
      color: #f59e0b;
      background: #fef3c7;
    }

    .parsipad-polish-regenerate.loading {
      color: #6366f1;
    }

    .parsipad-polish-regenerate.loading svg {
      animation: parsipad-spin 1s linear infinite;
    }

    @keyframes parsipad-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .parsipad-polish-regenerate:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .parsipad-polish-text {
      font-size: 13px;
      line-height: 1.5;
      color: #111827;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .parsipad-polish-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-polish-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-polish-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    /* Dictionary Box Styles */
    .parsipad-dictionary-box {
      max-width: 400px;
    }

    .parsipad-badge-dictionary {
      background: #059669;
    }

    .parsipad-dictionary-content {
      padding: 12px;
      max-height: 350px;
      overflow-y: auto;
    }

    .parsipad-dict-header {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e5e7eb;
    }

    .parsipad-dict-word {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }

    .parsipad-dict-phonetic {
      font-size: 13px;
      color: #6b7280;
      font-style: italic;
      margin-bottom: 4px;
    }

    .parsipad-dict-pos {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      color: #8b5cf6;
      background: #f3e8ff;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: lowercase;
    }

    .parsipad-dict-section {
      margin-bottom: 12px;
    }

    .parsipad-dict-section-title {
      font-size: 11px;
      font-weight: 600;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .parsipad-dict-definition {
      margin-bottom: 8px;
    }

    .parsipad-dict-meaning {
      font-size: 13px;
      color: #111827;
      line-height: 1.5;
    }

    .parsipad-dict-example {
      font-size: 12px;
      color: #6b7280;
      font-style: italic;
      margin-top: 4px;
      padding-left: 10px;
      border-left: 2px solid #e5e7eb;
    }

    .parsipad-dict-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .parsipad-dict-tag {
      font-size: 12px;
      padding: 3px 8px;
      background: #f3f4f6;
      color: #374151;
      border-radius: 4px;
    }

    .parsipad-dict-tag-antonym {
      background: #fef2f2;
      color: #991b1b;
    }

    .parsipad-dict-translation {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      position: relative;
    }

    .parsipad-dict-translation-text {
      font-size: 15px;
      font-weight: 500;
      color: #111827;
      line-height: 1.5;
      padding-right: 70px;
    }

    .parsipad-dict-translation-text[dir="rtl"] {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      text-align: right;
      padding-right: 0;
      padding-left: 70px;
    }

    .parsipad-dict-translation-actions {
      position: absolute;
      top: 12px;
      right: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .parsipad-dict-copy-translation,
    .parsipad-dict-favorite-translation {
      width: 28px;
      height: 28px;
      background: none;
      border: none;
      cursor: pointer;
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s;
    }

    .parsipad-dict-copy-translation:hover {
      background: #f3f4f6;
      color: #374151;
    }

    .parsipad-dict-favorite-translation:hover {
      background: #fef3c7;
      color: #f59e0b;
    }

    .parsipad-dict-copy-translation svg,
    .parsipad-dict-favorite-translation svg {
      width: 16px;
      height: 16px;
    }

    .parsipad-dict-copy-translation.copied {
      color: #10b981;
    }

    .parsipad-dict-favorite-translation.favorited {
      background: #fef3c7;
      color: #f59e0b;
    }

    .parsipad-dictionary-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-dictionary-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-dictionary-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }
  `;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
