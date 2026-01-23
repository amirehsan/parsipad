import { getApiKey, setApiKey, removeApiKey, maskApiKey, getLanguage, setLanguage } from '../lib/storage.js';
import { translationCache } from '../lib/cache.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const toggleVisibilityBtn = document.getElementById('toggle-visibility');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const cacheStatsEl = document.getElementById('cache-stats');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const langEnRadio = document.getElementById('lang-en');
const langFaRadio = document.getElementById('lang-fa');

// State
let isPasswordVisible = false;
let currentApiKey = '';
let currentLang = 'en';

/**
 * Initialize the settings page
 */
async function init() {
  await loadLanguage();
  await loadApiKey();
  await loadCacheStats();
  setupEventListeners();
}

/**
 * Load and apply language preference
 */
async function loadLanguage() {
  currentLang = await getLanguage();

  // Set radio button
  if (currentLang === 'fa') {
    langFaRadio.checked = true;
  } else {
    langEnRadio.checked = true;
  }

  applyTranslations(currentLang);
}

/**
 * Load and display the stored API key (masked)
 */
async function loadApiKey() {
  const apiKey = await getApiKey();
  currentApiKey = apiKey || '';

  if (apiKey) {
    apiKeyInput.value = apiKey;
    apiKeyInput.placeholder = 'API key configured';
  }
}

/**
 * Load and display cache statistics
 */
async function loadCacheStats() {
  const stats = await translationCache.getStats();

  if (stats.size === 0) {
    cacheStatsEl.textContent = t('cacheEmpty', currentLang);
  } else {
    const oldestDate = stats.oldestEntry
      ? stats.oldestEntry.toLocaleDateString(currentLang === 'fa' ? 'fa-IR' : 'en-US')
      : 'Unknown';
    cacheStatsEl.textContent = `${stats.size} ${t('cachedTranslations', currentLang)} (${t('oldest', currentLang)}: ${oldestDate})`;
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Toggle password visibility
  toggleVisibilityBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    apiKeyInput.type = isPasswordVisible ? 'text' : 'password';
    toggleVisibilityBtn.title = isPasswordVisible ? 'Hide' : 'Show';
  });

  // Save API key
  saveBtn.addEventListener('click', handleSave);

  // Clear API key
  clearBtn.addEventListener('click', handleClear);

  // Clear cache
  clearCacheBtn.addEventListener('click', handleClearCache);

  // Allow Enter key to save
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  });

  // Language selection
  langEnRadio.addEventListener('change', () => handleLanguageChange('en'));
  langFaRadio.addEventListener('change', () => handleLanguageChange('fa'));
}

/**
 * Handle language change
 * @param {'en'|'fa'} lang
 */
async function handleLanguageChange(lang) {
  currentLang = lang;
  await setLanguage(lang);
  applyTranslations(lang);
  await loadCacheStats(); // Refresh cache stats text
}

/**
 * Handle save button click
 */
async function handleSave() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus(t('pleaseEnterApiKey', currentLang), 'error');
    return;
  }

  try {
    await setApiKey(apiKey);
    currentApiKey = apiKey;
    showStatus(t('apiKeySaved', currentLang), 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  }
}

/**
 * Handle clear button click
 */
async function handleClear() {
  await removeApiKey();
  apiKeyInput.value = '';
  currentApiKey = '';
  apiKeyInput.placeholder = 'sk-ant-...';
  showStatus(t('apiKeyRemoved', currentLang), 'success');
}

/**
 * Handle clear cache button click
 */
async function handleClearCache() {
  await translationCache.clear();
  await loadCacheStats();
  showStatus(t('cacheCleared', currentLang), 'success');
}

/**
 * Show a status message
 * @param {string} message - Message to display
 * @param {'success' | 'error'} type - Message type
 */
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.hidden = false;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusEl.hidden = true;
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
