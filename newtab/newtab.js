import { getRandomFavorites, getNewTabEnabled, getTheme, setTheme, getNewTabPhraseCount, getLanguage } from '../lib/storage.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements - Bookmarks
const bookmarksPanel = document.getElementById('bookmarks-panel');
const bookmarkSearch = document.getElementById('bookmark-search');
const bookmarkTree = document.getElementById('bookmark-tree');
const bookmarkEmpty = document.getElementById('bookmark-empty');

// DOM Elements
const flashcardContainer = document.getElementById('flashcard-container');
const flashcard = document.getElementById('flashcard');
const cardBadge = document.getElementById('card-badge');
const cardBadgeBack = document.getElementById('card-badge-back');
const cardSaved = document.getElementById('card-saved');
const cardOriginal = document.getElementById('card-original');
const cardSavedBack = document.getElementById('card-saved-back');
const currentCardEl = document.getElementById('current-card');
const totalCardsEl = document.getElementById('total-cards');
const progressDots = document.getElementById('progress-dots');
const emptyState = document.getElementById('empty-state');
const disabledState = document.getElementById('disabled-state');
const refreshBtn = document.getElementById('refresh-btn');
const themeBtn = document.getElementById('theme-btn');
const copyBtn = document.getElementById('copy-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const viewAllLink = document.getElementById('view-all-link');
const openSettingsLink = document.getElementById('open-settings-link');
const keyboardHints = document.getElementById('keyboard-hints');

// State
let favorites = [];
let currentIndex = 0;
let isFlipped = false;
let currentLang = 'en';
let bookmarkData = [];

/**
 * Initialize the new tab page
 */
async function init() {
  await initLanguage();
  await initTheme();

  // Check 3D transform support
  check3DSupport();

  // Setup common event listeners first (theme, settings links, etc.)
  setupCommonEventListeners();

  // Load bookmarks (always, independent of flashcard setting)
  await loadBookmarks();

  // Check if feature is enabled
  const isEnabled = await getNewTabEnabled();

  if (!isEnabled) {
    showDisabledState();
    setupKeyboardShortcuts();
    return;
  }

  await loadFavorites();
  setupFlashcardEventListeners();
  setupKeyboardShortcuts();
}

/**
 * Initialize language
 */
async function initLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
}

/**
 * Check if browser supports 3D transforms
 */
function check3DSupport() {
  const el = document.createElement('div');
  el.style.transform = 'rotateY(180deg)';
  const has3D = el.style.transform !== '';
  if (has3D) {
    flashcard.classList.add('has-3d');
  }
}

/**
 * Initialize theme from storage or system preference
 */
async function initTheme() {
  const storedTheme = await getTheme();
  applyTheme(storedTheme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
    const currentTheme = await getTheme();
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });
}

/**
 * Apply theme to the document
 */
function applyTheme(theme) {
  let effectiveTheme = theme;
  if (theme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', effectiveTheme);
}

/**
 * Toggle between light and dark theme
 */
async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  await setTheme(newTheme);
  applyTheme(newTheme);
}

/**
 * Load random favorites
 */
async function loadFavorites() {
  try {
    const count = await getNewTabPhraseCount();
    favorites = await getRandomFavorites(count);
    currentIndex = 0;
    isFlipped = false;

    if (favorites.length === 0) {
      showEmptyState();
    } else {
      showFlashcardView();
      renderCurrentCard();
      renderProgressDots();
      updateNavigation();
    }
  } catch (error) {
    favorites = [];
    showEmptyState();
  }
}

/**
 * Show flashcard view
 */
function showFlashcardView() {
  flashcardContainer.hidden = false;
  emptyState.hidden = true;
  disabledState.hidden = true;
  keyboardHints.hidden = false;
}

/**
 * Show empty state
 */
function showEmptyState() {
  flashcardContainer.hidden = true;
  emptyState.hidden = false;
  disabledState.hidden = true;
  keyboardHints.hidden = true;
}

/**
 * Show disabled state
 */
function showDisabledState() {
  flashcardContainer.hidden = true;
  emptyState.hidden = true;
  disabledState.hidden = false;
  keyboardHints.hidden = true;
}

/**
 * Render the current card
 */
function renderCurrentCard() {
  if (favorites.length === 0) return;

  const item = favorites[currentIndex];

  // Reset flip state
  isFlipped = false;
  flashcard.classList.remove('flipped');

  // Update badge
  const badgeInfo = getBadgeInfo(item);
  cardBadge.textContent = badgeInfo.text;
  cardBadge.className = `flashcard-badge ${badgeInfo.type}`;
  cardBadgeBack.textContent = badgeInfo.text;
  cardBadgeBack.className = `flashcard-badge ${badgeInfo.type}`;

  // Update text content (support both new and legacy field names)
  const savedText = item.savedText || item.saved;
  const originalText = item.originalText || item.original;

  cardSaved.textContent = savedText;
  cardSaved.dir = detectRTL(savedText) ? 'rtl' : 'ltr';

  cardOriginal.textContent = originalText;
  cardOriginal.dir = detectRTL(originalText) ? 'rtl' : 'ltr';

  cardSavedBack.textContent = savedText;
  cardSavedBack.dir = detectRTL(savedText) ? 'rtl' : 'ltr';

  // Update progress indicator
  currentCardEl.textContent = currentIndex + 1;
  totalCardsEl.textContent = favorites.length;
}

/**
 * Get badge info for an item
 */
function getBadgeInfo(item) {
  if (item.type === 'translation') {
    const direction = item.direction || 'EN → FA';
    return { text: direction, type: 'translation' };
  } else if (item.type === 'polish') {
    const variantKey = item.variant || 'polish';
    const variantLabel = t(variantKey, currentLang) || item.variant?.charAt(0).toUpperCase() + item.variant?.slice(1) || t('polish', currentLang);
    return { text: variantLabel, type: 'polish' };
  } else if (item.type === 'dictionary') {
    return { text: t('dictionary', currentLang), type: 'translation' };
  }
  return { text: t('favorites', currentLang), type: 'translation' };
}

/**
 * Render progress dots
 */
function renderProgressDots() {
  progressDots.innerHTML = favorites.map((_, index) =>
    `<div class="progress-dot ${index === currentIndex ? 'active' : ''}" data-index="${index}"></div>`
  ).join('');

  // Add click handlers to dots
  progressDots.querySelectorAll('.progress-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.dataset.index, 10);
      goToCard(index);
    });
  });
}

/**
 * Update navigation buttons
 */
function updateNavigation() {
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === favorites.length - 1;

  // Update active dot
  progressDots.querySelectorAll('.progress-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === currentIndex);
  });
}

/**
 * Go to a specific card
 */
function goToCard(index) {
  if (index < 0 || index >= favorites.length || index === currentIndex) return;

  // Add transition animation
  flashcard.classList.add('transitioning');

  setTimeout(() => {
    currentIndex = index;
    renderCurrentCard();
    updateNavigation();
    flashcard.classList.remove('transitioning');
  }, 150);
}

/**
 * Go to previous card
 */
function prevCard() {
  if (currentIndex > 0) {
    goToCard(currentIndex - 1);
  }
}

/**
 * Go to next card
 */
function nextCard() {
  if (currentIndex < favorites.length - 1) {
    goToCard(currentIndex + 1);
  }
}

/**
 * Flip the current card
 */
function flipCard() {
  isFlipped = !isFlipped;
  flashcard.classList.toggle('flipped', isFlipped);
}

/**
 * Copy current card text to clipboard
 */
async function copyCurrentCard() {
  if (favorites.length === 0) return;

  const item = favorites[currentIndex];
  const text = item.saved;

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.classList.add('copied');

    // Change button text temporarily
    const span = copyBtn.querySelector('span');
    const originalText = span.textContent;
    span.textContent = 'Copied!';

    // Change icon to checkmark
    const svg = copyBtn.querySelector('svg');
    const originalSvg = svg.innerHTML;
    svg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';

    setTimeout(() => {
      copyBtn.classList.remove('copied');
      span.textContent = originalText;
      svg.innerHTML = originalSvg;
    }, 1500);
  } catch (error) {
    // Silently handle copy errors
  }
}

/**
 * Setup common event listeners (work in all states)
 */
function setupCommonEventListeners() {
  // Theme toggle
  themeBtn.addEventListener('click', toggleTheme);

  // Open settings button (disabled state)
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // View all link
  if (viewAllLink) {
    viewAllLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('favorites/favorites.html') });
    });
  }

  // Settings link in footer
  if (openSettingsLink) {
    openSettingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
}

/**
 * Setup flashcard-specific event listeners
 */
function setupFlashcardEventListeners() {
  // Refresh button
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = '0.5';

    await loadFavorites();

    setTimeout(() => {
      refreshBtn.disabled = false;
      refreshBtn.style.opacity = '1';
    }, 500);
  });

  // Flashcard click to flip
  flashcard.addEventListener('click', flipCard);

  // Copy button
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyCurrentCard();
  });

  // Navigation buttons
  prevBtn.addEventListener('click', prevCard);
  nextBtn.addEventListener('click', nextCard);
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Handle Escape in search input
    if (e.key === 'Escape' && e.target === bookmarkSearch) {
      bookmarkSearch.value = '';
      filterBookmarks('');
      bookmarkSearch.blur();
      return;
    }

    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Focus bookmark search with /
    if (e.key === '/') {
      e.preventDefault();
      if (bookmarkSearch) bookmarkSearch.focus();
      return;
    }

    // Ignore if no favorites
    if (favorites.length === 0) return;

    const isRTL = document.documentElement.dir === 'rtl';

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        isRTL ? nextCard() : prevCard();
        break;
      case 'ArrowRight':
        e.preventDefault();
        isRTL ? prevCard() : nextCard();
        break;
      case ' ':
        e.preventDefault();
        flipCard();
        break;
      case 'c':
      case 'C':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          copyCurrentCard();
        }
        break;
      case 'r':
      case 'R':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          loadFavorites();
        }
        break;
    }
  });
}

/**
 * Detect if text is RTL (Persian/Arabic/Hebrew)
 */
function detectRTL(text) {
  if (!text) return false;
  const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
  return rtlRegex.test(text);
}

// ============================================
// Bookmarks
// ============================================

/**
 * Load Chrome bookmarks
 */
async function loadBookmarks() {
  try {
    const tree = await chrome.bookmarks.getTree();
    bookmarkData = tree[0].children || [];
    renderBookmarkTree(bookmarkData);
    setupBookmarkEventListeners();
  } catch (error) {
    // Bookmarks API unavailable — hide panel gracefully
    if (bookmarksPanel) bookmarksPanel.hidden = true;
  }
}

/**
 * Render the bookmark tree into the container
 */
function renderBookmarkTree(nodes) {
  bookmarkTree.innerHTML = '';
  bookmarkEmpty.hidden = true;

  for (const node of nodes) {
    const el = createBookmarkNode(node, true);
    if (el) bookmarkTree.appendChild(el);
  }
}

/**
 * Create a DOM element for a bookmark node (recursive)
 */
function createBookmarkNode(node, isTopLevel) {
  if (node.children) {
    // It's a folder
    // Skip empty folders (no children with URLs or sub-folders with URLs)
    if (!hasBookmarks(node)) return null;

    const folder = document.createElement('div');
    folder.className = 'bookmark-folder';
    if (isTopLevel) folder.classList.add('open');

    const header = document.createElement('div');
    header.className = 'bookmark-folder-header';
    header.innerHTML = `
      <svg class="folder-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="folder-title">${escapeHtml(node.title || 'Bookmarks')}</span>
    `;
    folder.appendChild(header);

    const children = document.createElement('div');
    children.className = 'bookmark-folder-children';

    for (const child of node.children) {
      const childEl = createBookmarkNode(child, false);
      if (childEl) children.appendChild(childEl);
    }

    folder.appendChild(children);
    return folder;
  } else if (node.url) {
    // It's a bookmark
    const item = document.createElement('a');
    item.className = 'bookmark-item';
    item.href = node.url;
    item.title = node.url;
    item.innerHTML = `
      <svg class="bookmark-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <span class="bookmark-title">${escapeHtml(node.title || node.url)}</span>
    `;
    return item;
  }
  return null;
}

/**
 * Check if a folder node contains any bookmarks (recursively)
 */
function hasBookmarks(node) {
  if (!node.children) return !!node.url;
  return node.children.some(child => hasBookmarks(child));
}

/**
 * Setup bookmark event listeners
 */
function setupBookmarkEventListeners() {
  // Folder toggle via event delegation
  bookmarkTree.addEventListener('click', (e) => {
    const header = e.target.closest('.bookmark-folder-header');
    if (header) {
      e.preventDefault();
      header.parentElement.classList.toggle('open');
    }
  });

  // Search with debounce
  let searchTimeout;
  bookmarkSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterBookmarks(bookmarkSearch.value.trim());
    }, 200);
  });
}

/**
 * Filter bookmarks by search query
 */
function filterBookmarks(query) {
  if (!query) {
    renderBookmarkTree(bookmarkData);
    return;
  }

  const lowerQuery = query.toLowerCase();
  const matches = [];
  collectMatchingBookmarks(bookmarkData, lowerQuery, matches);

  bookmarkTree.innerHTML = '';

  if (matches.length === 0) {
    bookmarkEmpty.hidden = false;
    return;
  }

  bookmarkEmpty.hidden = true;

  for (const bookmark of matches) {
    const item = document.createElement('a');
    item.className = 'bookmark-search-result';
    item.href = bookmark.url;
    item.title = bookmark.url;

    const titleHtml = highlightMatch(bookmark.title || bookmark.url, lowerQuery);
    let urlHost = '';
    try {
      urlHost = new URL(bookmark.url).hostname;
    } catch (e) {
      urlHost = bookmark.url;
    }

    item.innerHTML = `
      <svg class="bookmark-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <div class="bookmark-result-info">
        <div class="bookmark-result-title">${titleHtml}</div>
        <div class="bookmark-result-url">${escapeHtml(urlHost)}</div>
      </div>
    `;
    bookmarkTree.appendChild(item);
  }
}

/**
 * Recursively collect bookmarks matching query
 */
function collectMatchingBookmarks(nodes, query, results) {
  for (const node of nodes) {
    if (node.children) {
      collectMatchingBookmarks(node.children, query, results);
    } else if (node.url) {
      const title = (node.title || '').toLowerCase();
      const url = (node.url || '').toLowerCase();
      if (title.includes(query) || url.includes(query)) {
        results.push(node);
      }
    }
  }
}

/**
 * Highlight matching text in a string
 */
function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const lowerEscaped = escaped.toLowerCase();
  const idx = lowerEscaped.indexOf(query);
  if (idx === -1) return escaped;
  return escaped.slice(0, idx) +
    '<mark class="bookmark-highlight">' + escaped.slice(idx, idx + query.length) + '</mark>' +
    escaped.slice(idx + query.length);
}

/**
 * Escape HTML entities
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
