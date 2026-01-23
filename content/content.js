/**
 * ParsiPad Content Script
 * Handles text selection detection and floating translation box
 */

// State
let floatingBox = null;
let shadowRoot = null;
let currentSelection = null;

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
        <span class="parsipad-logo-icon">P</span>
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
        <span class="parsipad-logo-icon">P</span>
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

/**
 * Handle clicks outside the floating box
 */
function handleDocumentClick(event) {
  if (floatingBox && !floatingBox.contains(event.target)) {
    removeFloatingBox();
  }
}

/**
 * Handle keyboard events
 */
function handleKeyDown(event) {
  if (event.key === 'Escape' && floatingBox) {
    removeFloatingBox();
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
  `;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
