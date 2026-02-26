import { getFavorites, removeFavorite } from '../lib/storage.js';
import { getTheme, setTheme, getLanguage } from '../lib/storage.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { ACTIONS } from '../lib/constants.js';

// DOM Elements
const backBtn = document.getElementById('back-btn');
const themeBtn = document.getElementById('theme-btn');
const filterTabs = document.querySelectorAll('.filter-tab');
const favoritesContainer = document.getElementById('favorites-container');
const emptyState = document.getElementById('empty-state');
const emptyMessage = document.getElementById('empty-message');
const footerActions = document.getElementById('footer-actions');
const clearAllBtn = document.getElementById('clear-all-btn');

// State
let currentFilter = 'all';
let currentLang = 'en';
let favorites = [];

/**
 * Initialize the favorites page
 */
async function init() {
  await initLanguage();
  await initTheme();
  await loadFavorites();
  setupEventListeners();
  renderFavorites();
}

/**
 * Initialize language
 */
async function initLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
}

/**
 * Initialize theme
 */
async function initTheme() {
  const storedTheme = await getTheme();
  applyTheme(storedTheme);
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
 * Toggle theme
 */
async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  await setTheme(newTheme);
  applyTheme(newTheme);
}

/**
 * Load all favorites
 */
async function loadFavorites() {
  try {
    favorites = await getFavorites();
  } catch (error) {
    favorites = [];
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Back button
  backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  // Theme toggle
  themeBtn.addEventListener('click', toggleTheme);

  // Filter tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderFavorites();
    });
  });

  // Clear all button
  clearAllBtn.addEventListener('click', handleClearAll);
}

/**
 * Get filtered favorites
 */
function getFilteredFavorites() {
  if (currentFilter === 'all') {
    return favorites;
  }
  return favorites.filter(item => item.type === currentFilter);
}

/**
 * Render favorites list
 */
function renderFavorites() {
  const filtered = getFilteredFavorites();

  if (filtered.length === 0) {
    favoritesContainer.innerHTML = '';
    emptyState.hidden = false;
    footerActions.hidden = true;

    // Update empty message based on context
    if (currentFilter === 'translation') {
      emptyMessage.textContent = t('noTranslationFavorites', currentLang) || 'No translation favorites';
    } else if (currentFilter === 'polish') {
      emptyMessage.textContent = t('noPolishFavorites', currentLang) || 'No polish favorites';
    } else if (currentFilter === 'grammar') {
      emptyMessage.textContent = t('noGrammarFavorites', currentLang) || 'No grammar favorites';
    } else {
      emptyMessage.textContent = t('noFavoritesYet', currentLang) || 'No favorites yet';
    }
    return;
  }

  emptyState.hidden = true;
  footerActions.hidden = false;

  favoritesContainer.innerHTML = filtered.map(item => renderFavoriteCard(item)).join('');

  // Add event listeners to cards
  setupCardEventListeners();
}

/**
 * Render a favorite card
 */
function renderFavoriteCard(item) {
  const timeAgo = formatTimeAgo(item.timestamp);
  // Support both old (original/saved) and new (originalText/savedText) field names
  const originalText = item.originalText || item.original || '';
  const savedText = item.savedText || item.saved || '';
  const isRTL = detectRTL(savedText);

  let badges = '';
  if (item.type === 'translation') {
    const direction = item.direction || 'EN → FA';
    badges = `<span class="favorite-badge translation">${escapeHtml(direction)}</span>`;
  } else if (item.type === 'polish') {
    const variantKey = item.variant || 'polish';
    const variantLabel = t(variantKey, currentLang) || item.variant?.charAt(0).toUpperCase() + item.variant?.slice(1) || 'Polish';
    badges = `
      <span class="favorite-badge polish">${t('polish', currentLang) || 'Polish'}</span>
      <span class="favorite-badge variant">${escapeHtml(variantLabel)}</span>
    `;
  } else if (item.type === 'grammar') {
    const direction = item.direction === 'en-to-fa' ? 'EN → FA' : 'FA → EN';
    badges = `
      <span class="favorite-badge grammar">${t('grammarLesson', currentLang) || 'Grammar'}</span>
      <span class="favorite-badge direction">${direction}</span>
    `;
  }

  // Special rendering for grammar lessons
  if (item.type === 'grammar' && item.lesson) {
    return renderGrammarCard(item, timeAgo, badges, originalText, savedText, isRTL);
  }

  return `
    <div class="favorite-card" data-id="${escapeAttr(item.id)}">
      <div class="favorite-card-header">
        <div class="favorite-card-meta">
          ${badges}
          <span class="favorite-time">${timeAgo}</span>
        </div>
        <div class="favorite-card-actions">
          <button class="card-action-btn copy" data-text="${escapeAttr(savedText)}" title="${t('copyToClipboard', currentLang) || 'Copy'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="card-action-btn delete" data-id="${escapeAttr(item.id)}" title="${t('removeFromFavorites', currentLang) || 'Remove'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="favorite-card-original">
        <div class="favorite-card-original-label">${t('original', currentLang) || 'Original'}</div>
        ${escapeHtml(originalText)}
      </div>
      <div class="favorite-card-saved" dir="${isRTL ? 'rtl' : 'ltr'}">
        ${escapeHtml(savedText)}
      </div>
    </div>
  `;
}

/**
 * Render a grammar lesson card
 */
function renderGrammarCard(item, timeAgo, badges, originalText, savedText, isRTL) {
  const lessonTitle = item.lesson?.title || t('grammarLesson', currentLang) || 'Grammar Lesson';
  const pointsCount = item.lesson?.points?.length || 0;

  // For grammar, original and translation have opposite directions
  // EN→FA: original is English (LTR), translation is Persian (RTL)
  // FA→EN: original is Persian (RTL), translation is English (LTR)
  const originalIsRTL = detectRTL(originalText);
  const translationIsRTL = isRTL; // Already calculated from savedText

  return `
    <div class="favorite-card grammar-card" data-id="${escapeAttr(item.id)}">
      <div class="favorite-card-header">
        <div class="favorite-card-meta">
          ${badges}
          <span class="favorite-time">${timeAgo}</span>
        </div>
        <div class="favorite-card-actions">
          <button class="card-action-btn delete" data-id="${escapeAttr(item.id)}" title="${t('removeFromFavorites', currentLang) || 'Remove'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="grammar-lesson-title${translationIsRTL ? ' persian-text' : ''}" dir="${translationIsRTL ? 'rtl' : 'ltr'}">
        ${escapeHtml(lessonTitle)}
      </div>
      <div class="favorite-card-original${originalIsRTL ? ' persian-text' : ''}" dir="${originalIsRTL ? 'rtl' : 'ltr'}">
        <div class="favorite-card-original-label">${t('original', currentLang) || 'Original'}</div>
        ${escapeHtml(originalText)}
      </div>
      <div class="favorite-card-saved${translationIsRTL ? ' persian-text' : ''}" dir="${translationIsRTL ? 'rtl' : 'ltr'}">
        ${escapeHtml(savedText)}
      </div>
      <div class="grammar-points-count">
        ${pointsCount} ${t('grammarPoints', currentLang) || 'grammar points'}
      </div>
    </div>
  `;
}

/**
 * Setup event listeners for cards
 */
function setupCardEventListeners() {
  // Copy buttons
  document.querySelectorAll('.card-action-btn.copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCopy(btn);
    });
  });

  // Delete buttons
  document.querySelectorAll('.card-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete(btn.dataset.id);
    });
  });
}

/**
 * Handle copy button click
 */
async function handleCopy(btn) {
  const text = btn.dataset.text;

  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');

    setTimeout(() => {
      btn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    // Silently handle copy errors
  }
}

/**
 * Handle delete button click
 */
async function handleDelete(id) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: ACTIONS.REMOVE_FAVORITE,
      id: id
    });

    if (response.success) {
      favorites = favorites.filter(item => item.id !== id);
      renderFavorites();
    }
  } catch (error) {
    // Try direct removal
    try {
      await removeFavorite(id);
      favorites = favorites.filter(item => item.id !== id);
      renderFavorites();
    } catch (e) {
      // Silently handle delete errors
    }
  }
}

/**
 * Handle clear all button click
 */
async function handleClearAll() {
  const confirmMessage = t('confirmClearFavorites', currentLang) || 'Are you sure you want to clear all favorites?';
  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    // Remove all favorites based on current filter
    const toRemove = getFilteredFavorites();

    for (const item of toRemove) {
      await chrome.runtime.sendMessage({
        action: ACTIONS.REMOVE_FAVORITE,
        id: item.id
      });
    }

    // Reload favorites
    await loadFavorites();
    renderFavorites();
  } catch (error) {
    // Silently handle clear all errors
  }
}

/**
 * Detect if text is RTL
 */
function detectRTL(text) {
  if (!text) return false;
  // Check for Persian/Arabic/Hebrew characters
  const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
  return rtlRegex.test(text);
}

/**
 * Format timestamp as relative time
 */
function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    if (days === 1) {
      return t('dayAgo', currentLang) || '1 day ago';
    }
    return (t('daysAgo', currentLang) || '{n} days ago').replace('{n}', days);
  }
  if (hours > 0) {
    if (hours === 1) {
      return t('hourAgo', currentLang) || '1 hour ago';
    }
    return (t('hoursAgo', currentLang) || '{n} hours ago').replace('{n}', hours);
  }
  if (minutes > 0) {
    if (minutes === 1) {
      return t('minuteAgo', currentLang) || '1 minute ago';
    }
    return (t('minutesAgo', currentLang) || '{n} minutes ago').replace('{n}', minutes);
  }
  return t('justNow', currentLang) || 'Just now';
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape attribute value
 */
function escapeAttr(text) {
  return String(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
