import { getRandomFavorites, getNewTabEnabled, getTheme, setTheme, getNewTabPhraseCount } from '../lib/storage.js';

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
const openPopupBtn = document.getElementById('open-popup-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const viewAllLink = document.getElementById('view-all-link');
const openSettingsLink = document.getElementById('open-settings-link');
const keyboardHints = document.getElementById('keyboard-hints');

// State
let favorites = [];
let currentIndex = 0;
let isFlipped = false;

/**
 * Initialize the new tab page
 */
async function init() {
  await initTheme();

  // Check 3D transform support
  check3DSupport();

  // Setup common event listeners first (theme, settings links, etc.)
  setupCommonEventListeners();

  // Check if feature is enabled
  const isEnabled = await getNewTabEnabled();

  if (!isEnabled) {
    showDisabledState();
    return;
  }

  await loadFavorites();
  setupFlashcardEventListeners();
  setupKeyboardShortcuts();
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

  // Update text content
  cardSaved.textContent = item.saved;
  cardSaved.dir = detectRTL(item.saved) ? 'rtl' : 'ltr';

  cardOriginal.textContent = item.original;
  cardOriginal.dir = detectRTL(item.original) ? 'rtl' : 'ltr';

  cardSavedBack.textContent = item.saved;
  cardSavedBack.dir = detectRTL(item.saved) ? 'rtl' : 'ltr';

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
    const variantLabel = item.variant ? item.variant.charAt(0).toUpperCase() + item.variant.slice(1) : 'Polish';
    return { text: variantLabel, type: 'polish' };
  } else if (item.type === 'dictionary') {
    return { text: 'Dictionary', type: 'translation' };
  }
  return { text: 'Saved', type: 'translation' };
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

  // Open popup button (empty state)
  if (openPopupBtn) {
    openPopupBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP' });
    });
  }

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
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Ignore if no favorites
    if (favorites.length === 0) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        prevCard();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextCard();
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
