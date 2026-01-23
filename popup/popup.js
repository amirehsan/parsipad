import { getTextDirection } from '../lib/language-detect.js';
import { getHistory, clearHistory, getPolishHistory, clearPolishHistory } from '../lib/history.js';
import { getTheme, setTheme, getUsageStats, updateUsageStats, resetUsageStats, getLanguage } from '../lib/storage.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements
const settingsBtn = document.getElementById('settings-btn');
const apiKeyWarning = document.getElementById('api-key-warning');
const configureApiBtn = document.getElementById('configure-api-btn');
const tabTranslate = document.getElementById('tab-translate');
const tabPolish = document.getElementById('tab-polish');
const inputText = document.getElementById('input-text');
const charCount = document.getElementById('char-count');
const clearInputBtn = document.getElementById('clear-input-btn');
const actionBtn = document.getElementById('action-btn');
const btnText = actionBtn.querySelector('.btn-text');
const btnLoading = actionBtn.querySelector('.btn-loading');
const outputSection = document.getElementById('output-section');
const directionBadge = document.getElementById('direction-badge');
const copyBtn = document.getElementById('copy-btn');
const outputText = document.getElementById('output-text');
const cacheBadge = document.getElementById('cache-badge');
const polishSection = document.getElementById('polish-section');
const polishProfessional = document.getElementById('polish-professional');
const polishConversational = document.getElementById('polish-conversational');
const polishConcise = document.getElementById('polish-concise');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const viewAllHistoryBtn = document.getElementById('view-all-history-btn');
const polishHistorySection = document.getElementById('polish-history-section');
const polishHistoryList = document.getElementById('polish-history-list');
const clearPolishHistoryBtn = document.getElementById('clear-polish-history-btn');
const viewAllPolishHistoryBtn = document.getElementById('view-all-polish-history-btn');
const themeBtn = document.getElementById('theme-btn');
const statsToggle = document.getElementById('stats-toggle');
const statsContent = document.getElementById('stats-content');
const statTranslations = document.getElementById('stat-translations');
const statPolishes = document.getElementById('stat-polishes');
const statInputTokens = document.getElementById('stat-input-tokens');
const statOutputTokens = document.getElementById('stat-output-tokens');
const resetStatsBtn = document.getElementById('reset-stats-btn');

// State
let isProcessing = false;
let currentMode = 'translate'; // 'translate' or 'polish'
let currentLang = 'en';

/**
 * Initialize the popup
 */
async function init() {
  await initLanguage();
  await initTheme();
  await checkApiKey();
  await loadHistory();
  await loadStats();
  setupEventListeners();
  updateCharCount();
  updateMode('translate');
}

/**
 * Initialize language based on stored preference
 */
async function initLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
}

/**
 * Initialize theme based on stored preference or system
 */
async function initTheme() {
  const storedTheme = await getTheme();
  applyTheme(storedTheme);
}

/**
 * Apply theme to the document
 * @param {'light'|'dark'|'system'} theme
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
 * Load and display usage stats
 */
async function loadStats() {
  const stats = await getUsageStats();
  statTranslations.textContent = formatNumber(stats.totalTranslations);
  statPolishes.textContent = formatNumber(stats.totalPolishes);
  statInputTokens.textContent = formatNumber(stats.totalInputTokens);
  statOutputTokens.textContent = formatNumber(stats.totalOutputTokens);
}

/**
 * Format number with K/M suffix for large numbers
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Check if API key is configured
 */
async function checkApiKey() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'CHECK_API_KEY' });
    if (!response.hasApiKey) {
      apiKeyWarning.hidden = false;
    }
  } catch (error) {
    // Silently handle API key check errors
  }
}

/**
 * Load and display translation history
 */
async function loadHistory() {
  try {
    const history = await getHistory();

    if (history.length === 0) {
      historySection.hidden = true;
      return;
    }

    historySection.hidden = false;
    renderHistory(history);
  } catch (error) {
    // Silently handle history load errors
  }
}

/**
 * Format direction for display (e.g., 'ru-fa' -> 'RU→FA')
 * @param {string} direction - Direction string like 'en-fa' or 'fa-en'
 * @returns {string} - Formatted display string
 */
function formatDirectionBadge(direction) {
  const parts = direction.split('-');
  if (parts.length === 2) {
    return `${parts[0].toUpperCase()}→${parts[1].toUpperCase()}`;
  }
  return direction.toUpperCase();
}

/**
 * Render history items
 * @param {Array} history - History entries
 */
function renderHistory(history) {
  historyList.innerHTML = history.map(entry => {
    const targetLang = entry.direction.split('-')[1] || 'fa';
    const translationDir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';
    const badgeText = formatDirectionBadge(entry.direction);

    return `
      <div class="history-item" data-original="${escapeAttr(entry.original)}" data-translation="${escapeAttr(entry.translation)}" data-direction="${entry.direction}">
        <div class="history-item-content">
          <div class="history-item-original">${escapeHtml(entry.original)}</div>
          <div class="history-item-translation" dir="${translationDir}">${escapeHtml(entry.translation)}</div>
        </div>
        <span class="history-item-badge">${badgeText}</span>
      </div>
    `;
  }).join('');

  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const original = item.dataset.original;
      const translation = item.dataset.translation;
      const direction = item.dataset.direction;

      inputText.value = original;
      updateCharCount();
      updateInputDirection();

      // Switch to translate mode and show result
      updateMode('translate');
      displayTranslation({ translation, direction, fromCache: true });
    });
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Configure API button
  configureApiBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Tab switching
  tabTranslate.addEventListener('click', () => updateMode('translate'));
  tabPolish.addEventListener('click', () => updateMode('polish'));

  // Input text changes
  inputText.addEventListener('input', () => {
    updateCharCount();
    updateInputDirection();
  });

  // Clear input
  clearInputBtn.addEventListener('click', () => {
    inputText.value = '';
    updateCharCount();
    hideAllOutputs();
    hideError();
  });

  // Action button (Translate or Polish)
  actionBtn.addEventListener('click', handleAction);

  // Keyboard shortcut (Ctrl/Cmd + Enter)
  inputText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleAction();
    }
  });

  // Copy button for translation output
  copyBtn.addEventListener('click', handleCopy);

  // Copy buttons for polish outputs
  document.querySelectorAll('.polish-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePolishCopy(btn));
  });

  // Clear history button
  clearHistoryBtn.addEventListener('click', handleClearHistory);

  // View all history button
  viewAllHistoryBtn.addEventListener('click', openHistoryPage);

  // Polish history buttons
  clearPolishHistoryBtn.addEventListener('click', handleClearPolishHistory);
  viewAllPolishHistoryBtn.addEventListener('click', openHistoryPage);

  // Theme toggle
  themeBtn.addEventListener('click', toggleTheme);

  // Stats toggle
  statsToggle.addEventListener('click', () => {
    const isExpanded = statsContent.hidden;
    statsContent.hidden = !isExpanded;
    statsToggle.classList.toggle('expanded', isExpanded);
  });

  // Reset stats button
  resetStatsBtn.addEventListener('click', async () => {
    await resetUsageStats();
    await loadStats();
  });
}

/**
 * Update mode (translate or polish)
 * @param {string} mode - 'translate' or 'polish'
 */
function updateMode(mode) {
  currentMode = mode;

  // Update tabs
  tabTranslate.classList.toggle('active', mode === 'translate');
  tabPolish.classList.toggle('active', mode === 'polish');

  // Update button text
  btnText.textContent = mode === 'translate' ? t('translate', currentLang) : t('polish', currentLang);

  // Update placeholder
  inputText.placeholder = mode === 'translate'
    ? t('enterTextTranslate', currentLang)
    : t('enterTextPolish', currentLang);

  // Hide outputs when switching modes
  hideAllOutputs();
  hideError();

  // Show/hide history based on mode
  if (mode === 'polish') {
    historySection.hidden = true;
    loadPolishHistory();
  } else {
    polishHistorySection.hidden = true;
    loadHistory();
  }
}

/**
 * Handle action button click
 */
async function handleAction() {
  if (currentMode === 'translate') {
    await handleTranslate();
  } else {
    await handlePolish();
  }
}

/**
 * Update character and word count display
 */
function updateCharCount() {
  const text = inputText.value;
  const charCountNum = text.length;
  const wordCountNum = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charsText = t('chars', currentLang);
  const wordText = wordCountNum === 1 ? t('word', currentLang) : t('words', currentLang);
  charCount.textContent = `${charCountNum} ${charsText} | ${wordCountNum} ${wordText}`;
}

/**
 * Update input text direction based on content
 */
function updateInputDirection() {
  const dir = getTextDirection(inputText.value);
  inputText.dir = dir;
}

/**
 * Handle translate button click
 */
async function handleTranslate() {
  const text = inputText.value.trim();

  if (!text) {
    showError('Please enter text to translate');
    return;
  }

  if (isProcessing) {
    return;
  }

  setLoadingState(true);
  hideError();
  hideAllOutputs();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'TRANSLATE',
      text: text,
      sourceLang: 'auto'
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    displayTranslation(response);
    await loadHistory();

    // Update usage stats (always count translations, only track tokens for non-cached)
    await updateUsageStats({
      inputTokens: response.fromCache ? 0 : (response.inputTokens || 0),
      outputTokens: response.fromCache ? 0 : (response.outputTokens || 0),
      translations: 1
    });
    await loadStats();
  } catch (error) {
    showError(error.message || 'Translation failed');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Handle polish button click
 */
async function handlePolish() {
  const text = inputText.value.trim();

  if (!text) {
    showError('Please enter text to polish');
    return;
  }

  if (isProcessing) {
    return;
  }

  setLoadingState(true);
  hideError();
  hideAllOutputs();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'POLISH',
      text: text
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    displayPolishResults(response);

    // Update usage stats
    await updateUsageStats({
      inputTokens: response.inputTokens || 0,
      outputTokens: response.outputTokens || 0,
      polishes: 1
    });
    await loadStats();
  } catch (error) {
    showError(error.message || 'Polish failed');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Display translation result
 * @param {Object} result - Translation result
 */
function displayTranslation(result) {
  const { translation, direction, displayDirection, fromCache } = result;

  directionBadge.textContent = displayDirection || formatDirectionBadge(direction);

  const targetLang = direction.split('-')[1] || 'fa';
  const outputDir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';
  outputText.dir = outputDir;
  outputText.textContent = translation;

  cacheBadge.hidden = !fromCache;
  outputSection.hidden = false;
}

/**
 * Display polish results
 * @param {Object} result - Polish result with professional, conversational, concise
 */
function displayPolishResults(result) {
  polishProfessional.textContent = result.professional;
  polishConversational.textContent = result.conversational;
  polishConcise.textContent = result.concise;
  polishSection.hidden = false;
}

/**
 * Handle copy button click for translation
 */
async function handleCopy() {
  const text = outputText.textContent;

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showError('Failed to copy to clipboard');
  }
}

/**
 * Handle copy button click for polish versions
 * @param {HTMLElement} btn - The clicked copy button
 */
async function handlePolishCopy(btn) {
  const version = btn.dataset.version;
  let text = '';

  if (version === 'professional') {
    text = polishProfessional.textContent;
  } else if (version === 'conversational') {
    text = polishConversational.textContent;
  } else if (version === 'concise') {
    text = polishConcise.textContent;
  }

  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    setTimeout(() => {
      btn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showError('Failed to copy to clipboard');
  }
}

/**
 * Handle clear history button click
 */
async function handleClearHistory() {
  await clearHistory();
  historySection.hidden = true;
  historyList.innerHTML = '';
}

/**
 * Handle clear polish history button click
 */
async function handleClearPolishHistory() {
  await clearPolishHistory();
  polishHistorySection.hidden = true;
  polishHistoryList.innerHTML = '';
}

/**
 * Open the dedicated history page
 */
function openHistoryPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
}

/**
 * Load and display polish history
 */
async function loadPolishHistory() {
  try {
    const history = await getPolishHistory();

    if (history.length === 0) {
      polishHistorySection.hidden = true;
      return;
    }

    polishHistorySection.hidden = false;
    renderPolishHistory(history);
  } catch (error) {
    // Silently handle polish history load errors
  }
}

/**
 * Render polish history items
 * @param {Array} history - Polish history entries
 */
function renderPolishHistory(history) {
  polishHistoryList.innerHTML = history.map(entry => {
    return `
      <div class="history-item polish-history-item"
           data-original="${escapeAttr(entry.original)}"
           data-professional="${escapeAttr(entry.professional)}"
           data-conversational="${escapeAttr(entry.conversational)}"
           data-concise="${escapeAttr(entry.concise)}">
        <div class="history-item-content">
          <div class="history-item-original">${escapeHtml(entry.original)}</div>
          <div class="history-item-translation">${escapeHtml(entry.professional.slice(0, 50))}${entry.professional.length > 50 ? '...' : ''}</div>
        </div>
        <span class="history-item-badge polish-badge">Polish</span>
      </div>
    `;
  }).join('');

  polishHistoryList.querySelectorAll('.polish-history-item').forEach(item => {
    item.addEventListener('click', () => {
      const original = item.dataset.original;
      const professional = item.dataset.professional;
      const conversational = item.dataset.conversational;
      const concise = item.dataset.concise;

      inputText.value = original;
      updateCharCount();
      updateInputDirection();

      // Show polish results directly
      displayPolishResults({ professional, conversational, concise });
    });
  });
}

/**
 * Set loading state
 * @param {boolean} loading
 */
function setLoadingState(loading) {
  isProcessing = loading;
  actionBtn.disabled = loading;
  btnText.hidden = loading;
  btnLoading.hidden = !loading;
}

/**
 * Show error message
 * @param {string} message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorSection.hidden = false;
  hideAllOutputs();
}

/**
 * Hide error section
 */
function hideError() {
  errorSection.hidden = true;
}

/**
 * Hide all output sections
 */
function hideAllOutputs() {
  outputSection.hidden = true;
  polishSection.hidden = true;
}

/**
 * Escape HTML for safe rendering
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
