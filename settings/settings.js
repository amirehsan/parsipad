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
  getTranslateOtherLanguages,
  setTranslateOtherLanguages,
  getNewTabEnabled,
  setNewTabEnabled,
  getNewTabPhraseCount,
  setNewTabPhraseCount,
  getFavorites,
  getTheme,
  setTheme
} from '../lib/storage.js';
import { PROVIDERS, PROVIDER_CONFIGS, STORAGE_KEYS } from '../lib/constants.js';
import { translationCache } from '../lib/cache.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { COMMAND_DESCRIPTIONS, getBoundShortcuts, shortcutKeys } from '../shared/shortcuts.js';
import {
  getHistory,
  getPolishHistory,
  getDictionaryHistory
} from '../lib/history.js';
import { applyThemeToRoot } from '../lib/theme.js';

// DOM Elements - Language
const aboutVersionEl = document.getElementById('about-version');
const langEnRadio = document.getElementById('lang-en');
const langFaRadio = document.getElementById('lang-fa');

// DOM Elements - Dictionary
const dictEnToFaCheckbox = document.getElementById('dict-en-to-fa');
const dictFaToEnCheckbox = document.getElementById('dict-fa-to-en');

// DOM Elements - Selection Popup
const selectionPopupToggle = document.getElementById('selection-popup-toggle');
const translateOtherLanguagesToggle = document.getElementById('translate-other-languages-toggle');

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

// DOM Elements - Key Status Indicators (referenced via getElementById elsewhere, kept for parity)
const _claudeKeyStatus = document.getElementById('claude-key-status');
const _geminiKeyStatus = document.getElementById('gemini-key-status');
const _openaiKeyStatus = document.getElementById('openai-key-status');

// DOM Elements - Cache
const cacheCountEl = document.getElementById('cache-count');
const clearCacheBtn = document.getElementById('clear-cache-btn');

// DOM Elements - Status
const apiStatusEl = document.getElementById('api-status');

// DOM Elements - Data Backup
const exportFavoritesCheckbox = document.getElementById('export-favorites');
const exportTranslationHistoryCheckbox = document.getElementById('export-translation-history');
const exportPolishHistoryCheckbox = document.getElementById('export-polish-history');
const exportDictionaryHistoryCheckbox = document.getElementById('export-dictionary-history');
const exportCacheCheckbox = document.getElementById('export-cache');
const exportBtn = document.getElementById('export-btn');
const importFileInput = document.getElementById('import-file');
const importBtn = document.getElementById('import-btn');
const backupStatusEl = document.getElementById('backup-status');

// Count display elements for backup
const favoritesCountEl = document.getElementById('favorites-count');
const translationHistoryCountEl = document.getElementById('translation-history-count');
const polishHistoryCountEl = document.getElementById('polish-history-count');
const dictionaryHistoryCountEl = document.getElementById('dictionary-history-count');
const cacheCountExportEl = document.getElementById('cache-count-export');

// Backup constants
const BACKUP_VERSION = '1.0';
// Read, not restated. This was a hardcoded literal that had to be edited in
// lockstep with the manifest, next to another copy of the same number in
// settings.html, which is exactly how a version goes stale in the UI while
// the manifest is correct.
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

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
  await loadTranslateOtherLanguagesSetting();
  await loadNewTabSetting();
  await loadProviderSettings();
  await loadAllApiKeyStatuses();
  await loadCacheStats();
  await loadDataCounts();
  await loadKeyboardShortcuts();
  if (aboutVersionEl) aboutVersionEl.textContent = EXTENSION_VERSION;
  setupEventListeners();
}

/**
 * Initialize theme from chrome.storage (shared across all extension surfaces)
 * or system preference if unset.
 */
async function initTheme() {
  // Both conventions, always. This page styles dark with the class, but
  // lib/design-tokens.css also answers to [data-theme], and theme-boot sets
  // both. Clearing only the class leaves data-theme="dark" behind and the
  // tokens stay dark while the page's own rules go light.
  applyThemeToRoot(await getTheme());
}

/**
 * Toggle dark/light theme; persisted to chrome.storage so popup/newtab/grammar stay in sync.
 */
async function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyThemeToRoot(next);
  await setTheme(next);
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
 * Render the global shortcuts from what Chrome actually bound.
 *
 * These used to be written out in the markup, which meant the page could
 * confidently name a key that does nothing: Chrome drops a suggested_key
 * another extension already claimed, and the user can clear or rebind any
 * of them. An unbound command now says so, and says why, next to the button
 * that fixes it.
 */
async function loadKeyboardShortcuts() {
  const list = document.getElementById('global-shortcuts-list');
  if (!list) return;

  const bound = await getBoundShortcuts();
  list.replaceChildren();

  Object.entries(COMMAND_DESCRIPTIONS).forEach(([command, descriptionKey]) => {
    const item = document.createElement('div');
    item.className = 'shortcut-item';

    const keys = document.createElement('span');
    keys.className = 'shortcut-keys';

    const parts = shortcutKeys(bound.get(command));
    if (parts.length === 0) {
      keys.classList.add('is-unset');
      keys.textContent = t('shortcutNotSet', currentLang);
      keys.title = t('shortcutNotSetHint', currentLang);
    } else {
      parts.forEach((key, index) => {
        if (index > 0) keys.appendChild(document.createTextNode(' + '));
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        keys.appendChild(kbd);
      });
    }

    const description = document.createElement('span');
    description.className = 'shortcut-desc';
    description.textContent = t(descriptionKey, currentLang);

    item.append(keys, description);
    list.appendChild(item);
  });
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
 * Load the "translate other languages" setting
 */
async function loadTranslateOtherLanguagesSetting() {
  translateOtherLanguagesToggle.checked = await getTranslateOtherLanguages();
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
/**
 * Settings tab navigation. Each tab button has data-tab-target; <main> carries
 * data-settings-active and CSS hides cards whose data-settings-tab doesn't
 * match. Pure presentation - no card state mutates.
 */
function setupSettingsTabs() {
  const tabs = document.querySelectorAll('.settings-tab');
  const main = document.querySelector('main');
  if (!main || tabs.length === 0) return;

  const setActive = (name) => {
    main.dataset.settingsActive = name;
    tabs.forEach((t) => {
      const active = t.dataset.tabTarget === name;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.tabIndex = active ? 0 : -1;
    });
    // Scroll to top so users land at the start of the new tab's content.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Default to General on first paint.
  setActive('general');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setActive(tab.dataset.tabTarget));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const order = Array.from(tabs);
      const i = order.indexOf(e.currentTarget);
      const next = order[(i + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length];
      setActive(next.dataset.tabTarget);
      next.focus();
    });
  });
}

function setupEventListeners() {
  setupSettingsTabs();

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
  translateOtherLanguagesToggle.addEventListener('change', handleTranslateOtherLanguagesChange);

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

  // Data Backup
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
  }
  if (importBtn) {
    importBtn.addEventListener('click', handleImport);
  }
  if (importFileInput) {
    importFileInput.addEventListener('change', processImportFile);
  }

  // Customize Shortcuts button
  const customizeShortcutsBtn = document.getElementById('customizeShortcutsBtn');
  if (customizeShortcutsBtn) {
    customizeShortcutsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  // Analytics button
  const openAnalyticsBtn = document.getElementById('openAnalyticsBtn');
  if (openAnalyticsBtn) {
    openAnalyticsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('analytics/analytics.html') });
    });
  }

  // Welcome Guide button
  const welcomeGuideBtn = document.getElementById('welcome-guide-btn');
  if (welcomeGuideBtn) {
    welcomeGuideBtn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('welcome/welcome.html')
      });
    });
  }
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
 * Handle "translate other languages" setting change
 */
async function handleTranslateOtherLanguagesChange() {
  await setTranslateOtherLanguages(translateOtherLanguagesToggle.checked);
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
  const savedProviders = [];

  // Save all providers that have new/changed values
  const allProviders = [PROVIDERS.CLAUDE, PROVIDERS.GEMINI, PROVIDERS.OPENAI];

  for (const p of allProviders) {
    const input = getApiKeyInput(p);
    if (!input) continue;

    const apiKey = input.value.trim();
    if (!apiKey) continue;

    // Check if this key is different from what's stored
    const existingKey = await getProviderApiKey(p);
    if (apiKey !== existingKey) {
      try {
        await setProviderApiKey(p, apiKey);
        await updateKeyStatus(p);
        savedProviders.push(PROVIDER_CONFIGS[p].name);
      } catch (error) {
        showStatus(error.message, 'error');
        return;
      }
    }
  }

  // Also ensure the clicked provider's key is saved even if unchanged (in case it's a first save)
  const input = getApiKeyInput(provider);
  if (input) {
    const apiKey = input.value.trim();
    if (!apiKey) {
      showStatus(t('pleaseEnterApiKey', currentLang), 'error');
      return;
    }
    if (!savedProviders.includes(PROVIDER_CONFIGS[provider].name)) {
      try {
        await setProviderApiKey(provider, apiKey);
        await updateKeyStatus(provider);
        savedProviders.push(PROVIDER_CONFIGS[provider].name);
      } catch (error) {
        showStatus(error.message, 'error');
        return;
      }
    }
  }

  if (savedProviders.length > 0) {
    showStatus(`${savedProviders.join(', ')} API key${savedProviders.length > 1 ? 's' : ''} saved successfully`, 'success');
  } else {
    showStatus('No changes to save', 'success');
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
  // Confirm before clearing
  if (!confirm(t('confirmClearCache', currentLang))) {
    return;
  }

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

// ============================================
// Data Backup Functions
// ============================================

/**
 * Load and display data counts for export checkboxes
 */
async function loadDataCounts() {
  try {
    // Favorites count
    const favorites = await getFavorites();
    if (favoritesCountEl) {
      favoritesCountEl.textContent = `(${favorites.length})`;
    }

    // Translation history count
    const translationHistory = await getHistory();
    if (translationHistoryCountEl) {
      translationHistoryCountEl.textContent = `(${translationHistory.length})`;
    }

    // Polish history count
    const polishHistory = await getPolishHistory();
    if (polishHistoryCountEl) {
      polishHistoryCountEl.textContent = `(${polishHistory.length})`;
    }

    // Dictionary history count
    const dictionaryHistory = await getDictionaryHistory();
    if (dictionaryHistoryCountEl) {
      dictionaryHistoryCountEl.textContent = `(${dictionaryHistory.length})`;
    }

    // Translation cache count
    const cacheStats = await translationCache.getStats();
    if (cacheCountExportEl) {
      cacheCountExportEl.textContent = `(${cacheStats.size})`;
    }
  } catch (error) {
    console.error('Error loading data counts:', error);
  }
}

/**
 * Export selected data to JSON file
 */
async function handleExport() {
  // Check if at least one option is selected
  const exportOptions = {
    favorites: exportFavoritesCheckbox?.checked,
    translationHistory: exportTranslationHistoryCheckbox?.checked,
    polishHistory: exportPolishHistoryCheckbox?.checked,
    dictionaryHistory: exportDictionaryHistoryCheckbox?.checked,
    cache: exportCacheCheckbox?.checked
  };

  if (!Object.values(exportOptions).some(v => v)) {
    showBackupStatus(t('noDataSelected', currentLang), 'error');
    return;
  }

  try {
    const exportData = {
      meta: {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        extensionVersion: EXTENSION_VERSION,
        source: 'ParsiPad'
      },
      data: {}
    };

    // Gather selected data
    if (exportOptions.favorites) {
      exportData.data.favorites = await getFavorites();
    }

    if (exportOptions.translationHistory) {
      exportData.data.translationHistory = await getHistory();
    }

    if (exportOptions.polishHistory) {
      exportData.data.polishHistory = await getPolishHistory();
    }

    if (exportOptions.dictionaryHistory) {
      exportData.data.dictionaryHistory = await getDictionaryHistory();
    }

    if (exportOptions.cache) {
      const cacheData = await chrome.storage.local.get([
        STORAGE_KEYS.translationCache,
        STORAGE_KEYS.dictionaryCache
      ]);
      exportData.data.translationCache = cacheData[STORAGE_KEYS.translationCache] || {};
      exportData.data.dictionaryCache = cacheData[STORAGE_KEYS.dictionaryCache] || {};
    }

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `parsipad-backup-${date}.json`;

    // Create and download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showBackupStatus(t('exportSuccess', currentLang), 'success');
  } catch (error) {
    console.error('Export error:', error);
    showBackupStatus(t('importFailed', currentLang), 'error');
  }
}

/**
 * Validate backup file structure
 * @param {Object} data - Parsed JSON data
 * @returns {boolean}
 */
function validateBackupFile(data) {
  // Check meta object exists
  if (!data || typeof data !== 'object') return false;
  if (!data.meta || typeof data.meta !== 'object') return false;
  if (!data.meta.source || data.meta.source !== 'ParsiPad') return false;
  if (!data.meta.version) return false;
  if (!data.data || typeof data.data !== 'object') return false;

  // Validate data arrays if present
  if (data.data.favorites && !Array.isArray(data.data.favorites)) return false;
  if (data.data.translationHistory && !Array.isArray(data.data.translationHistory)) return false;
  if (data.data.polishHistory && !Array.isArray(data.data.polishHistory)) return false;
  if (data.data.dictionaryHistory && !Array.isArray(data.data.dictionaryHistory)) return false;

  // Cache should be objects
  if (data.data.translationCache && typeof data.data.translationCache !== 'object') return false;
  if (data.data.dictionaryCache && typeof data.data.dictionaryCache !== 'object') return false;

  return true;
}

/**
 * Merge arrays by unique identifier
 * @param {Array} existing - Existing array
 * @param {Array} imported - Imported array
 * @param {string} idField - Field to use as unique identifier
 * @returns {Array}
 */
function mergeArraysById(existing, imported, idField = 'id') {
  const existingIds = new Set(existing.map(item => item[idField]));
  const newItems = imported.filter(item => !existingIds.has(item[idField]));
  return [...newItems, ...existing]; // New items first, then existing
}

/**
 * Merge cache objects
 * @param {Object} existing - Existing cache
 * @param {Object} imported - Imported cache
 * @returns {Object}
 */
function mergeCacheObjects(existing, imported) {
  return { ...imported, ...existing }; // Existing takes precedence
}

/**
 * Handle file import button click
 */
function handleImport() {
  importFileInput?.click();
}

/**
 * Process imported file
 */
async function processImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedData = JSON.parse(text);

    // Validate file structure
    if (!validateBackupFile(importedData)) {
      showBackupStatus(t('invalidBackupFile', currentLang), 'error');
      importFileInput.value = ''; // Reset file input
      return;
    }

    // Get import strategy
    const strategyRadio = document.querySelector('input[name="import-strategy"]:checked');
    const strategy = strategyRadio?.value || 'merge';
    const isReplace = strategy === 'replace';

    let totalImported = 0;
    const { data } = importedData;

    // Import favorites
    if (data.favorites && data.favorites.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.favorites]: data.favorites });
        totalImported += data.favorites.length;
      } else {
        const existing = await getFavorites();
        const merged = mergeArraysById(existing, data.favorites, 'id');
        await chrome.storage.local.set({ [STORAGE_KEYS.favorites]: merged });
        totalImported += data.favorites.length;
      }
    }

    // Import translation history
    if (data.translationHistory && data.translationHistory.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.translationHistory]: data.translationHistory });
        totalImported += data.translationHistory.length;
      } else {
        const existing = await getHistory();
        const merged = mergeArraysById(existing, data.translationHistory, 'id');
        // Limit to 50 items (MAX_HISTORY_SIZE)
        await chrome.storage.local.set({
          [STORAGE_KEYS.translationHistory]: merged.slice(0, 50)
        });
        totalImported += data.translationHistory.length;
      }
    }

    // Import polish history
    if (data.polishHistory && data.polishHistory.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.polishHistory]: data.polishHistory });
        totalImported += data.polishHistory.length;
      } else {
        const existing = await getPolishHistory();
        const merged = mergeArraysById(existing, data.polishHistory, 'id');
        await chrome.storage.local.set({
          [STORAGE_KEYS.polishHistory]: merged.slice(0, 50)
        });
        totalImported += data.polishHistory.length;
      }
    }

    // Import dictionary history
    if (data.dictionaryHistory && data.dictionaryHistory.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.dictionaryHistory]: data.dictionaryHistory });
        totalImported += data.dictionaryHistory.length;
      } else {
        const existing = await getDictionaryHistory();
        const merged = mergeArraysById(existing, data.dictionaryHistory, 'id');
        await chrome.storage.local.set({
          [STORAGE_KEYS.dictionaryHistory]: merged.slice(0, 50)
        });
        totalImported += data.dictionaryHistory.length;
      }
    }

    // Import caches
    if (data.translationCache) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.translationCache]: data.translationCache });
      } else {
        const existing = await chrome.storage.local.get(STORAGE_KEYS.translationCache);
        const merged = mergeCacheObjects(
          existing[STORAGE_KEYS.translationCache] || {},
          data.translationCache
        );
        await chrome.storage.local.set({ [STORAGE_KEYS.translationCache]: merged });
      }
      totalImported += Object.keys(data.translationCache).length;
    }

    if (data.dictionaryCache) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.dictionaryCache]: data.dictionaryCache });
      } else {
        const existing = await chrome.storage.local.get(STORAGE_KEYS.dictionaryCache);
        const merged = mergeCacheObjects(
          existing[STORAGE_KEYS.dictionaryCache] || {},
          data.dictionaryCache
        );
        await chrome.storage.local.set({ [STORAGE_KEYS.dictionaryCache]: merged });
      }
      totalImported += Object.keys(data.dictionaryCache).length;
    }

    // Refresh UI
    await loadDataCounts();
    await loadCacheStats();

    // Show success message
    const message = t('itemsImported', currentLang).replace('{n}', totalImported);
    showBackupStatus(message, 'success');

  } catch (error) {
    console.error('Import error:', error);
    showBackupStatus(t('importFailed', currentLang), 'error');
  }

  // Reset file input
  if (importFileInput) {
    importFileInput.value = '';
  }
}

/**
 * Show backup status message
 */
function showBackupStatus(message, type) {
  if (!backupStatusEl) return;

  backupStatusEl.textContent = message;
  backupStatusEl.className = `status-message ${type}`;
  backupStatusEl.hidden = false;

  setTimeout(() => {
    backupStatusEl.hidden = true;
  }, 4000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
