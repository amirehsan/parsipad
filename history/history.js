import { getHistory, clearHistory, removeFromHistory, getPolishHistory, clearPolishHistory, removeFromPolishHistory } from '../lib/history.js';
import { getTheme, setTheme, getLanguage } from '../lib/storage.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { applyThemeToRoot } from '../lib/theme.js';

// DOM Elements
const backBtn = document.getElementById('back-btn');
const themeBtn = document.getElementById('theme-btn');
const filterTabs = document.querySelectorAll('.filter-tab');
const searchInput = document.getElementById('search-input');
const historyContainer = document.getElementById('history-container');
const emptyState = document.getElementById('empty-state');
const emptyMessage = document.getElementById('empty-message');
const footerActions = document.getElementById('footer-actions');
const clearAllBtn = document.getElementById('clear-all-btn');

// State
let currentFilter = 'all';
let currentLang = 'en';
let translationHistory = [];
let polishHistory = [];

/**
 * Initialize the history page
 */
async function init() {
  await initLanguage();
  await initTheme();
  await loadAllHistory();
  setupEventListeners();
  renderHistory();
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
  // Both conventions, always. Writing only data-theme leaves a stale `.dark`
  // class from theme-boot matching :root.dark, which pins the page dark.
  applyThemeToRoot(theme);
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
 * Load all history data
 */
async function loadAllHistory() {
  try {
    translationHistory = await getHistory();
    polishHistory = await getPolishHistory();
  } catch (error) {
    // Silently handle history load errors
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
      renderHistory();
    });
  });

  // Search input
  searchInput.addEventListener('input', () => {
    renderHistory();
  });

  // Clear all button
  clearAllBtn.addEventListener('click', handleClearAll);
}

/**
 * Get filtered and searched history
 */
function getFilteredHistory() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  let combined = [];

  // Add translation history
  if (currentFilter === 'all' || currentFilter === 'translations') {
    combined = combined.concat(
      translationHistory.map(item => ({
        ...item,
        type: 'translation'
      }))
    );
  }

  // Add polish history
  if (currentFilter === 'all' || currentFilter === 'polishes') {
    combined = combined.concat(
      polishHistory.map(item => ({
        ...item,
        type: 'polish'
      }))
    );
  }

  // Sort by timestamp (newest first)
  combined.sort((a, b) => b.timestamp - a.timestamp);

  // Filter by search term
  if (searchTerm) {
    combined = combined.filter(item => {
      if (item.type === 'translation') {
        return item.original.toLowerCase().includes(searchTerm) ||
               item.translation.toLowerCase().includes(searchTerm);
      } else {
        return item.original.toLowerCase().includes(searchTerm) ||
               item.professional.toLowerCase().includes(searchTerm) ||
               item.conversational.toLowerCase().includes(searchTerm) ||
               item.concise.toLowerCase().includes(searchTerm);
      }
    });
  }

  return combined;
}

/**
 * Render history list
 */
function renderHistory() {
  const filtered = getFilteredHistory();

  if (filtered.length === 0) {
    historyContainer.innerHTML = '';
    emptyState.hidden = false;
    footerActions.hidden = true;

    // Update empty message based on context
    const searchTerm = searchInput.value.trim();
    if (searchTerm) {
      emptyMessage.textContent = t('noResultsFound', currentLang);
    } else if (currentFilter === 'translations') {
      emptyMessage.textContent = t('noTranslationsYet', currentLang);
    } else if (currentFilter === 'polishes') {
      emptyMessage.textContent = t('noPolishesYet', currentLang);
    } else {
      emptyMessage.textContent = t('noHistoryYet', currentLang);
    }
    return;
  }

  emptyState.hidden = true;
  footerActions.hidden = false;

  historyContainer.innerHTML = filtered.map(item => {
    if (item.type === 'translation') {
      return renderTranslationCard(item);
    } else {
      return renderPolishCard(item);
    }
  }).join('');

  // Add event listeners to cards
  setupCardEventListeners();
}

/**
 * Render a translation history card
 */
function renderTranslationCard(item) {
  const targetLang = item.direction.split('-')[1] || 'fa';
  const textDir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';
  const badgeText = formatDirectionBadge(item.direction);
  const timeAgo = formatTimeAgo(item.timestamp);

  return `
    <div class="history-card" data-type="translation" data-id="${item.id}">
      <div class="history-card-header">
        <div class="history-card-meta">
          <span class="history-badge translation">${badgeText}</span>
          <span class="history-time">${timeAgo}</span>
        </div>
        <div class="history-card-actions">
          <button class="card-action-btn copy-btn" data-text="${escapeAttr(item.translation)}" title="${t('copyToClipboard', currentLang)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="card-action-btn delete" data-type="translation" data-id="${item.id}" title="${t('deleteItem', currentLang)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="history-card-original">
        <div class="history-card-original-label">${t('original', currentLang)}</div>
        ${escapeHtml(item.original)}
      </div>
      <div class="history-card-result">
        <div class="history-card-translation" dir="${textDir}">${escapeHtml(item.translation)}</div>
      </div>
    </div>
  `;
}

/**
 * Render a polish history card
 */
function renderPolishCard(item) {
  const timeAgo = formatTimeAgo(item.timestamp);

  return `
    <div class="history-card" data-type="polish" data-id="${item.id}">
      <div class="history-card-header">
        <div class="history-card-meta">
          <span class="history-badge polish">Polish</span>
          <span class="history-time">${timeAgo}</span>
        </div>
        <div class="history-card-actions">
          <button class="card-action-btn delete" data-type="polish" data-id="${item.id}" title="${t('deleteItem', currentLang)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="history-card-original">
        <div class="history-card-original-label">${t('original', currentLang)}</div>
        ${escapeHtml(item.original)}
      </div>
      <div class="history-card-result">
        <div class="polish-versions">
          <div class="polish-version">
            <div class="polish-version-label">${t('professional', currentLang)}</div>
            <div class="polish-version-text">${escapeHtml(item.professional)}</div>
            <button class="card-action-btn copy-btn" data-text="${escapeAttr(item.professional)}" style="margin-top: 4px;" title="${t('copyToClipboard', currentLang)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
          <div class="polish-version">
            <div class="polish-version-label">${t('conversational', currentLang)}</div>
            <div class="polish-version-text">${escapeHtml(item.conversational)}</div>
            <button class="card-action-btn copy-btn" data-text="${escapeAttr(item.conversational)}" style="margin-top: 4px;" title="${t('copyToClipboard', currentLang)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
          <div class="polish-version">
            <div class="polish-version-label">${t('concise', currentLang)}</div>
            <div class="polish-version-text">${escapeHtml(item.concise)}</div>
            <button class="card-action-btn copy-btn" data-text="${escapeAttr(item.concise)}" style="margin-top: 4px;" title="${t('copyToClipboard', currentLang)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Setup event listeners for cards
 */
function setupCardEventListeners() {
  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCopy(btn);
    });
  });

  // Delete buttons
  document.querySelectorAll('.card-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete(btn.dataset.type, parseInt(btn.dataset.id));
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

    // Visual feedback
    const originalSvg = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    btn.style.color = 'var(--color-success)';

    setTimeout(() => {
      btn.innerHTML = originalSvg;
      btn.style.color = '';
    }, 1500);
  } catch (error) {
    // Silently handle copy errors
  }
}

/**
 * Handle delete button click
 */
async function handleDelete(type, id) {
  try {
    if (type === 'translation') {
      await removeFromHistory(id);
      translationHistory = translationHistory.filter(item => item.id !== id);
    } else {
      await removeFromPolishHistory(id);
      polishHistory = polishHistory.filter(item => item.id !== id);
    }
    renderHistory();
  } catch (error) {
    // Silently handle delete errors
  }
}

/**
 * Handle clear all button click
 */
async function handleClearAll() {
  if (!confirm('Are you sure you want to clear all history?')) {
    return;
  }

  try {
    if (currentFilter === 'all') {
      await clearHistory();
      await clearPolishHistory();
      translationHistory = [];
      polishHistory = [];
    } else if (currentFilter === 'translations') {
      await clearHistory();
      translationHistory = [];
    } else if (currentFilter === 'polishes') {
      await clearPolishHistory();
      polishHistory = [];
    }
    renderHistory();
  } catch (error) {
    // Silently handle clear history errors
  }
}

/**
 * Format direction badge (e.g., 'en-fa' -> 'EN → FA')
 */
function formatDirectionBadge(direction) {
  const parts = direction.split('-');
  if (parts.length === 2) {
    return `${parts[0].toUpperCase()} → ${parts[1].toUpperCase()}`;
  }
  return direction.toUpperCase();
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
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  return 'Just now';
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
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
