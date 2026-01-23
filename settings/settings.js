import { getApiKey, setApiKey, removeApiKey, maskApiKey, getLanguage, setLanguage, getDictionaryTranslationSettings, setDictionaryTranslationSettings } from '../lib/storage.js';
import { translationCache } from '../lib/cache.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const toggleVisibilityBtn = document.getElementById('toggle-visibility');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const statusEl = document.getElementById('status');
const cacheCountEl = document.getElementById('cache-count');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const langEnRadio = document.getElementById('lang-en');
const langFaRadio = document.getElementById('lang-fa');
const dictEnToFaCheckbox = document.getElementById('dict-en-to-fa');
const dictFaToEnCheckbox = document.getElementById('dict-fa-to-en');
const themeToggle = document.getElementById('theme-toggle');

// State
let isPasswordVisible = false;
let currentApiKey = '';
let currentLang = 'en';

/**
 * Initialize the settings page
 */
async function init() {
  initTheme();
  await loadLanguage();
  await loadDictionarySettings();
  await loadApiKey();
  await loadCacheStats();
  setupEventListeners();
}

/**
 * Initialize theme from localStorage or system preference
 */
function initTheme() {
  const html = document.documentElement;

  // Check for saved preference or system preference
  if (localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

/**
 * Toggle dark/light theme
 */
function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle('dark');
  localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
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
 * Load dictionary translation settings
 */
async function loadDictionarySettings() {
  const settings = await getDictionaryTranslationSettings();
  dictEnToFaCheckbox.checked = settings.enToFa;
  dictFaToEnCheckbox.checked = settings.faToEn;
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
    cacheCountEl.textContent = '0 items';
  } else {
    cacheCountEl.textContent = `${stats.size} items`;
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // Toggle password visibility
  toggleVisibilityBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    apiKeyInput.type = isPasswordVisible ? 'text' : 'password';
    toggleVisibilityBtn.title = isPasswordVisible ? 'Hide' : 'Show';

    // Toggle eye icons
    const eyeOpen = toggleVisibilityBtn.querySelector('.eye-open');
    const eyeClosed = toggleVisibilityBtn.querySelector('.eye-closed');
    if (eyeOpen && eyeClosed) {
      eyeOpen.classList.toggle('hidden', isPasswordVisible);
      eyeClosed.classList.toggle('hidden', !isPasswordVisible);
    }
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

  // Dictionary translation settings
  dictEnToFaCheckbox.addEventListener('change', handleDictionarySettingChange);
  dictFaToEnCheckbox.addEventListener('change', handleDictionarySettingChange);
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
 * Handle dictionary translation setting change
 */
async function handleDictionarySettingChange() {
  const enToFa = dictEnToFaCheckbox.checked;
  const faToEn = dictFaToEnCheckbox.checked;
  await setDictionaryTranslationSettings(enToFa, faToEn);
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
  statusEl.className = `status-message ${type}`;
  statusEl.hidden = false;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusEl.hidden = true;
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
