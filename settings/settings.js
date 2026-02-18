import {
  getSelectedProvider,
  setSelectedProvider,
  getProviderApiKey,
  setProviderApiKey,
  removeProviderApiKey,
  hasProviderApiKey,
  getLanguage,
  setLanguage,
  getDictionaryTranslationSettings,
  setDictionaryTranslationSettings,
  getSelectionPopupEnabled,
  setSelectionPopupEnabled,
  getNewTabEnabled,
  setNewTabEnabled,
  getNewTabPhraseCount,
  setNewTabPhraseCount
} from '../lib/storage.js';
import { PROVIDERS, PROVIDER_CONFIGS } from '../lib/constants.js';
import { translationCache } from '../lib/cache.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements - Language
const langEnRadio = document.getElementById('lang-en');
const langFaRadio = document.getElementById('lang-fa');

// DOM Elements - Dictionary
const dictEnToFaCheckbox = document.getElementById('dict-en-to-fa');
const dictFaToEnCheckbox = document.getElementById('dict-fa-to-en');

// DOM Elements - Selection Popup
const selectionPopupToggle = document.getElementById('selection-popup-toggle');

// DOM Elements - New Tab
const newtabToggle = document.getElementById('newtab-toggle');
const phraseCountSlider = document.getElementById('phrase-count-slider');
const phraseCountValue = document.getElementById('phrase-count-value');
const phraseCountSection = document.getElementById('phrase-count-section');

// DOM Elements - Theme
const themeToggle = document.getElementById('theme-toggle');

// DOM Elements - Provider Selection
const providerRadios = document.querySelectorAll('input[name="provider"]');

// DOM Elements - API Key Tabs
const apiKeyTabs = document.querySelectorAll('.api-key-tab');
const apiKeyPanels = document.querySelectorAll('.api-key-panel');

// DOM Elements - API Key Inputs
const claudeApiKeyInput = document.getElementById('claude-api-key');
const geminiApiKeyInput = document.getElementById('gemini-api-key');
const openaiApiKeyInput = document.getElementById('openai-api-key');

// DOM Elements - Key Status Indicators
const claudeKeyStatus = document.getElementById('claude-key-status');
const geminiKeyStatus = document.getElementById('gemini-key-status');
const openaiKeyStatus = document.getElementById('openai-key-status');

// DOM Elements - Cache
const cacheCountEl = document.getElementById('cache-count');
const clearCacheBtn = document.getElementById('clear-cache-btn');

// DOM Elements - Status
const apiStatusEl = document.getElementById('api-status');

// State
let currentLang = 'en';
let currentProvider = PROVIDERS.CLAUDE;

/**
 * Initialize the settings page
 */
async function init() {
  initTheme();
  await loadLanguage();
  await loadDictionarySettings();
  await loadSelectionPopupSetting();
  await loadNewTabSetting();
  await loadProviderSettings();
  await loadAllApiKeyStatuses();
  await loadCacheStats();
  setupEventListeners();
}

/**
 * Initialize theme from localStorage or system preference
 */
function initTheme() {
  const html = document.documentElement;

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
 * Load selection popup setting
 */
async function loadSelectionPopupSetting() {
  const enabled = await getSelectionPopupEnabled();
  selectionPopupToggle.checked = enabled;
}

/**
 * Load new tab setting
 */
async function loadNewTabSetting() {
  const enabled = await getNewTabEnabled();
  newtabToggle.checked = enabled;

  // Load phrase count
  const count = await getNewTabPhraseCount();
  phraseCountSlider.value = count;
  phraseCountValue.textContent = count;

  // Show/hide phrase count section based on toggle state
  updatePhraseCountVisibility(enabled);
}

/**
 * Update phrase count section visibility
 */
function updatePhraseCountVisibility(enabled) {
  if (phraseCountSection) {
    phraseCountSection.style.display = enabled ? 'flex' : 'none';
  }
}

/**
 * Load provider settings (selected provider)
 */
async function loadProviderSettings() {
  currentProvider = await getSelectedProvider();

  // Set the correct radio button
  const providerRadio = document.getElementById(`provider-${currentProvider}`);
  if (providerRadio) {
    providerRadio.checked = true;
  }

  // Also activate the corresponding API key tab
  activateApiKeyTab(currentProvider);
}

/**
 * Load API key status indicators for all providers
 */
async function loadAllApiKeyStatuses() {
  const providers = [PROVIDERS.CLAUDE, PROVIDERS.GEMINI, PROVIDERS.OPENAI];

  for (const provider of providers) {
    await updateKeyStatus(provider);
  }
}

/**
 * Update key status indicator for a provider
 */
async function updateKeyStatus(provider) {
  const hasKey = await hasProviderApiKey(provider);
  const statusEl = document.getElementById(`${provider}-key-status`);

  if (statusEl) {
    if (hasKey) {
      statusEl.classList.add('configured');
      statusEl.title = 'API key configured';
    } else {
      statusEl.classList.remove('configured');
      statusEl.title = 'API key not configured';
    }
  }

  // Also load the key into the input if it exists
  const key = await getProviderApiKey(provider);
  const input = getApiKeyInput(provider);
  if (input && key) {
    input.value = key;
    input.placeholder = `${PROVIDER_CONFIGS[provider].keyPlaceholder} (configured)`;
  }
}

/**
 * Get the API key input element for a provider
 */
function getApiKeyInput(provider) {
  switch (provider) {
    case PROVIDERS.CLAUDE:
      return claudeApiKeyInput;
    case PROVIDERS.GEMINI:
      return geminiApiKeyInput;
    case PROVIDERS.OPENAI:
      return openaiApiKeyInput;
    default:
      return null;
  }
}

/**
 * Activate API key tab for a provider
 */
function activateApiKeyTab(provider) {
  // Update tab states
  apiKeyTabs.forEach(tab => {
    if (tab.dataset.provider === provider) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update panel visibility
  apiKeyPanels.forEach(panel => {
    if (panel.id === `${provider}-panel`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });
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

  // Language selection
  langEnRadio.addEventListener('change', () => handleLanguageChange('en'));
  langFaRadio.addEventListener('change', () => handleLanguageChange('fa'));

  // Dictionary translation settings
  dictEnToFaCheckbox.addEventListener('change', handleDictionarySettingChange);
  dictFaToEnCheckbox.addEventListener('change', handleDictionarySettingChange);

  // Selection popup setting
  selectionPopupToggle.addEventListener('change', handleSelectionPopupChange);

  // New tab setting
  newtabToggle.addEventListener('change', handleNewTabChange);

  // Phrase count slider
  if (phraseCountSlider) {
    phraseCountSlider.addEventListener('input', handlePhraseCountChange);
  }

  // Provider selection
  providerRadios.forEach(radio => {
    radio.addEventListener('change', handleProviderChange);
  });

  // API key tabs
  apiKeyTabs.forEach(tab => {
    tab.addEventListener('click', () => handleTabClick(tab.dataset.provider));
  });

  // Toggle password visibility buttons
  document.querySelectorAll('.toggle-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      togglePasswordVisibility(targetId);
    });
  });

  // Save API key buttons
  document.querySelectorAll('.save-key-btn').forEach(btn => {
    btn.addEventListener('click', () => handleSaveApiKey(btn.dataset.provider));
  });

  // Clear API key buttons
  document.querySelectorAll('.clear-key-btn').forEach(btn => {
    btn.addEventListener('click', () => handleClearApiKey(btn.dataset.provider));
  });

  // Allow Enter key to save in API key inputs
  [claudeApiKeyInput, geminiApiKeyInput, openaiApiKeyInput].forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const provider = input.id.replace('-api-key', '');
          handleSaveApiKey(provider);
        }
      });
    }
  });

  // Clear cache
  clearCacheBtn.addEventListener('click', handleClearCache);
}

/**
 * Handle language change
 */
async function handleLanguageChange(lang) {
  currentLang = lang;
  await setLanguage(lang);
  applyTranslations(lang);
  await loadCacheStats();
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
 * Handle selection popup setting change
 */
async function handleSelectionPopupChange() {
  const enabled = selectionPopupToggle.checked;
  await setSelectionPopupEnabled(enabled);
}

/**
 * Handle new tab setting change
 */
async function handleNewTabChange() {
  const enabled = newtabToggle.checked;
  await setNewTabEnabled(enabled);
  updatePhraseCountVisibility(enabled);
}

/**
 * Handle phrase count slider change
 */
async function handlePhraseCountChange() {
  const count = parseInt(phraseCountSlider.value, 10);
  phraseCountValue.textContent = count;
  await setNewTabPhraseCount(count);
}

/**
 * Handle provider selection change
 */
async function handleProviderChange(e) {
  const provider = e.target.value;
  currentProvider = provider;

  try {
    await setSelectedProvider(provider);
    activateApiKeyTab(provider);
    showStatus(`Switched to ${PROVIDER_CONFIGS[provider].displayName}`, 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  }
}

/**
 * Handle API key tab click
 */
function handleTabClick(provider) {
  activateApiKeyTab(provider);
}

/**
 * Toggle password visibility for an input
 */
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const btn = document.querySelector(`[data-target="${inputId}"]`);

  if (input && btn) {
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';

    // Update icon
    const icon = btn.querySelector('.eye-icon');
    if (icon) {
      if (isVisible) {
        icon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        `;
      } else {
        icon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        `;
      }
    }
  }
}

/**
 * Handle save API key button click
 */
async function handleSaveApiKey(provider) {
  const input = getApiKeyInput(provider);
  if (!input) return;

  const apiKey = input.value.trim();
  const config = PROVIDER_CONFIGS[provider];

  if (!apiKey) {
    showStatus(t('pleaseEnterApiKey', currentLang), 'error');
    return;
  }

  try {
    await setProviderApiKey(provider, apiKey);
    await updateKeyStatus(provider);
    showStatus(`${config.name} API key saved successfully`, 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  }
}

/**
 * Handle clear API key button click
 */
async function handleClearApiKey(provider) {
  const input = getApiKeyInput(provider);
  const config = PROVIDER_CONFIGS[provider];

  await removeProviderApiKey(provider);

  if (input) {
    input.value = '';
    input.placeholder = config.keyPlaceholder;
  }

  await updateKeyStatus(provider);
  showStatus(`${config.name} API key removed`, 'success');
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
 */
function showStatus(message, type) {
  apiStatusEl.textContent = message;
  apiStatusEl.className = `status-message ${type}`;
  apiStatusEl.hidden = false;

  setTimeout(() => {
    apiStatusEl.hidden = true;
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
