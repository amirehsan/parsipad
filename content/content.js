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
      showTranslation(response);
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
 */
function getBoxPosition(selection) {
  let top = 100;
  let left = 100;

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Position below the selection with some padding
    top = rect.bottom + window.scrollY + 8;
    left = rect.left + window.scrollX;

    // Ensure box doesn't go off-screen to the right
    const maxLeft = window.innerWidth - 460; // 450px max-width + padding
    if (left > maxLeft) {
      left = maxLeft > 0 ? maxLeft : 10;
    }

    // Ensure box doesn't go off-screen to the left
    if (left < 10) {
      left = 10;
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
      <span class="parsipad-badge">EN → FA</span>
      <button class="parsipad-close" title="Close">×</button>
    </div>
    <div class="parsipad-content">
      <div class="parsipad-text"></div>
    </div>
    <div class="parsipad-footer">
      <span class="parsipad-cache-badge"></span>
      <button class="parsipad-copy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy
      </button>
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
function showTranslation(result) {
  if (!shadowRoot) return;

  const { translation, direction, displayDirection, fromCache } = result;

  // Update direction badge - use displayDirection if available, otherwise format from direction
  const badge = shadowRoot.querySelector('.parsipad-badge');
  badge.textContent = displayDirection || formatDirectionBadge(direction);

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
 * Remove the floating box
 */
function removeFloatingBox() {
  if (floatingBox) {
    floatingBox.remove();
    floatingBox = null;
    shadowRoot = null;
  }
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
      <span class="parsipad-badge parsipad-badge-polish">Polish</span>
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

  const { professional, conversational, concise } = result;

  const content = shadowRoot.querySelector('.parsipad-polish-content');
  content.innerHTML = `
    <div class="parsipad-polish-card">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Professional</span>
        <button class="parsipad-polish-copy" data-version="professional" title="Copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>
      <div class="parsipad-polish-text">${escapeHtml(professional)}</div>
    </div>
    <div class="parsipad-polish-card">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Conversational</span>
        <button class="parsipad-polish-copy" data-version="conversational" title="Copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>
      <div class="parsipad-polish-text">${escapeHtml(conversational)}</div>
    </div>
    <div class="parsipad-polish-card">
      <div class="parsipad-polish-card-header">
        <span class="parsipad-polish-title">Concise</span>
        <button class="parsipad-polish-copy" data-version="concise" title="Copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>
      <div class="parsipad-polish-text">${escapeHtml(concise)}</div>
    </div>
  `;

  // Add copy handlers
  content.querySelectorAll('.parsipad-polish-copy').forEach(btn => {
    btn.addEventListener('click', () => handlePolishCopy(btn, result));
  });
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
      <span class="parsipad-badge parsipad-badge-dictionary">Dictionary</span>
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

  const { word, phonetic, partOfSpeech, definitions, synonyms, antonyms, translation, targetLang } = result;
  const isTargetRTL = ['fa', 'ar', 'he'].includes(targetLang);

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
        <button class="parsipad-dict-copy-translation" title="Copy translation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>
    ` : ''}
  `;

  // Add copy handler for translation
  const copyBtn = shadowRoot.querySelector('.parsipad-dict-copy-translation');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => handleDictionaryCopy(copyBtn, translation));
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

  // Small delay to ensure selection is complete
  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    // Remove existing popup first
    removeSelectionPopup();

    // Only show popup if there's selected text
    if (selectedText && selectedText.length > 0) {
      const position = getSelectionPopupPosition(selection);
      createSelectionPopup(position, selectedText);
    }
  }, 10);
}

/**
 * Get position for selection popup (near the end of selection)
 */
function getSelectionPopupPosition(selection) {
  let top = 100;
  let left = 100;

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Position above the selection, near the end
    top = rect.top + window.scrollY - 44; // 40px height + 4px gap
    left = rect.right + window.scrollX - 120; // Roughly center the popup

    // If popup would go above viewport, show below selection instead
    if (top < window.scrollY + 10) {
      top = rect.bottom + window.scrollY + 4;
    }

    // Ensure popup doesn't go off-screen to the right
    const maxLeft = window.innerWidth - 140;
    if (left > maxLeft) {
      left = maxLeft > 0 ? maxLeft : 10;
    }

    // Ensure popup doesn't go off-screen to the left
    if (left < 10) {
      left = 10;
    }
  }

  return { top, left };
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

  // Inject styles
  const style = document.createElement('style');
  style.textContent = getSelectionPopupStyles();
  selectionPopupShadow.appendChild(style);

  // Check if selected text is a single word (for dictionary)
  const isSingleWord = selectedText.split(/\s+/).length === 1;

  // Create popup structure
  const popup = document.createElement('div');
  popup.className = 'selection-popup';
  popup.innerHTML = `
    <button class="selection-btn" data-action="translate" title="Translate">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
      </svg>
    </button>
    <button class="selection-btn" data-action="polish" title="Polish">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
      </svg>
    </button>
    <button class="selection-btn ${!isSingleWord ? 'disabled' : ''}" data-action="dictionary" title="Dictionary${!isSingleWord ? ' (single word only)' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
 */
function getSelectionPopupStyles() {
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

    .selection-popup {
      display: flex;
      align-items: center;
      gap: 2px;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
      padding: 4px;
      animation: popup-fade-in 150ms ease-out;
    }

    @keyframes popup-fade-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .selection-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      color: #6b7280;
      transition: background-color 0.15s, color 0.15s;
    }

    .selection-btn:hover {
      background: #f3f4f6;
      color: #6366f1;
    }

    .selection-btn:active {
      background: #e5e7eb;
    }

    .selection-btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .selection-btn.disabled:hover {
      background: transparent;
      color: #6b7280;
    }

    .selection-btn svg {
      width: 18px;
      height: 18px;
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

    .parsipad-badge {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 6px;
      background: #6366f1;
      color: white;
      border-radius: 4px;
      margin-left: auto;
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

    .parsipad-polish-copy {
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
      transition: background-color 0.15s, color 0.15s;
    }

    .parsipad-polish-copy:hover {
      background: #e5e7eb;
      color: #374151;
    }

    .parsipad-polish-copy svg {
      width: 14px;
      height: 14px;
    }

    .parsipad-polish-copy.copied {
      color: #10b981;
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
      padding-right: 32px;
    }

    .parsipad-dict-translation-text[dir="rtl"] {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      text-align: right;
      padding-right: 0;
      padding-left: 32px;
    }

    .parsipad-dict-copy-translation {
      position: absolute;
      top: 12px;
      right: 0;
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

    .parsipad-dict-copy-translation svg {
      width: 16px;
      height: 16px;
    }

    .parsipad-dict-copy-translation.copied {
      color: #10b981;
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
