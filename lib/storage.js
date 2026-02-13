import { STORAGE_KEYS, PROVIDERS, PROVIDER_CONFIGS, DEFAULT_PROVIDER } from './constants.js';

// ============================================
// Provider Selection Functions
// ============================================

/**
 * Get the selected AI provider
 * @returns {Promise<string>} Provider ID (claude, gemini, openai)
 */
export async function getSelectedProvider() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.selectedProvider);
  return result[STORAGE_KEYS.selectedProvider] || DEFAULT_PROVIDER;
}

/**
 * Set the selected AI provider
 * @param {string} provider - Provider ID (claude, gemini, openai)
 * @throws {Error} If provider is invalid
 */
export async function setSelectedProvider(provider) {
  if (!PROVIDER_CONFIGS[provider]) {
    throw new Error(`Invalid provider: ${provider}`);
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.selectedProvider]: provider
  });
}

/**
 * Get provider configuration
 * @param {string} provider - Provider ID
 * @returns {Object|null} Provider config
 */
export function getProviderConfig(provider) {
  return PROVIDER_CONFIGS[provider] || null;
}

// ============================================
// Multi-Provider API Key Functions
// ============================================

/**
 * Map provider ID to storage key
 */
const PROVIDER_KEY_MAP = {
  [PROVIDERS.CLAUDE]: STORAGE_KEYS.apiKey,
  [PROVIDERS.GEMINI]: STORAGE_KEYS.geminiApiKey,
  [PROVIDERS.OPENAI]: STORAGE_KEYS.openaiApiKey
};

/**
 * Get API key for a specific provider
 * @param {string} provider - Provider ID
 * @returns {Promise<string|null>}
 */
export async function getProviderApiKey(provider) {
  const storageKey = PROVIDER_KEY_MAP[provider];
  if (!storageKey) return null;

  const result = await chrome.storage.local.get(storageKey);
  return result[storageKey] || null;
}

/**
 * Set API key for a specific provider
 * @param {string} provider - Provider ID
 * @param {string} key - API key
 * @throws {Error} If provider is invalid or key format is wrong
 */
export async function setProviderApiKey(provider, key) {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Invalid provider: ${provider}`);
  }

  // Validate key format based on provider prefix
  if (key && !key.startsWith(config.keyPrefix)) {
    throw new Error(`Invalid ${config.name} API key format. Key should start with "${config.keyPrefix}"`);
  }

  const storageKey = PROVIDER_KEY_MAP[provider];
  await chrome.storage.local.set({
    [storageKey]: key
  });
}

/**
 * Remove API key for a specific provider
 * @param {string} provider - Provider ID
 */
export async function removeProviderApiKey(provider) {
  const storageKey = PROVIDER_KEY_MAP[provider];
  if (storageKey) {
    await chrome.storage.local.remove(storageKey);
  }
}

/**
 * Check if a specific provider has API key configured
 * @param {string} provider - Provider ID
 * @returns {Promise<boolean>}
 */
export async function hasProviderApiKey(provider) {
  const key = await getProviderApiKey(provider);
  return !!key;
}

/**
 * Get all providers with their key status
 * @returns {Promise<Array<{id: string, name: string, hasKey: boolean}>>}
 */
export async function getAllProvidersStatus() {
  const providers = Object.values(PROVIDERS);
  const statuses = await Promise.all(
    providers.map(async (provider) => ({
      id: provider,
      name: PROVIDER_CONFIGS[provider].name,
      displayName: PROVIDER_CONFIGS[provider].displayName,
      hasKey: await hasProviderApiKey(provider)
    }))
  );
  return statuses;
}

// ============================================
// Legacy API Key Functions (for backward compatibility)
// ============================================

/**
 * Get the API key for the currently selected provider
 * @returns {Promise<string|null>}
 */
export async function getApiKey() {
  const provider = await getSelectedProvider();
  return getProviderApiKey(provider);
}

/**
 * Store the API key for the currently selected provider
 * @param {string} key - The API key
 * @throws {Error} If the key format is invalid
 */
export async function setApiKey(key) {
  const provider = await getSelectedProvider();
  await setProviderApiKey(provider, key);
}

/**
 * Check if API key is configured for the selected provider
 * @returns {Promise<boolean>}
 */
export async function hasApiKey() {
  const key = await getApiKey();
  return !!key;
}

/**
 * Remove the API key for the currently selected provider
 */
export async function removeApiKey() {
  const provider = await getSelectedProvider();
  await removeProviderApiKey(provider);
}

/**
 * Get user settings
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return result[STORAGE_KEYS.settings] || {};
}

/**
 * Update user settings
 * @param {Object} settings - Settings object to merge
 */
export async function setSettings(settings) {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: { ...current, ...settings }
  });
}

/**
 * Mask an API key for display (show first and last 4 characters)
 * @param {string} key - The API key to mask
 * @returns {string}
 */
export function maskApiKey(key) {
  if (!key || key.length < 12) return '••••••••';
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

/**
 * Get the stored theme preference
 * @returns {Promise<'light'|'dark'|'system'>}
 */
export async function getTheme() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.theme);
  return result[STORAGE_KEYS.theme] || 'system';
}

/**
 * Store theme preference
 * @param {'light'|'dark'|'system'} theme
 */
export async function setTheme(theme) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.theme]: theme
  });
}

/**
 * Get usage statistics
 * @returns {Promise<Object>}
 */
export async function getUsageStats() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.usageStats);
  return result[STORAGE_KEYS.usageStats] || {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTranslations: 0,
    totalPolishes: 0
  };
}

/**
 * Update usage statistics
 * @param {Object} stats - Stats to add
 */
export async function updateUsageStats(stats) {
  const current = await getUsageStats();
  await chrome.storage.local.set({
    [STORAGE_KEYS.usageStats]: {
      totalInputTokens: current.totalInputTokens + (stats.inputTokens || 0),
      totalOutputTokens: current.totalOutputTokens + (stats.outputTokens || 0),
      totalTranslations: current.totalTranslations + (stats.translations || 0),
      totalPolishes: current.totalPolishes + (stats.polishes || 0)
    }
  });
}

/**
 * Reset usage statistics
 */
export async function resetUsageStats() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.usageStats]: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTranslations: 0,
      totalPolishes: 0
    }
  });
}

/**
 * Get the stored UI language preference
 * @returns {Promise<'en'|'fa'>}
 */
export async function getLanguage() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.language);
  return result[STORAGE_KEYS.language] || 'en';
}

/**
 * Store UI language preference
 * @param {'en'|'fa'} language
 */
export async function setLanguage(language) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.language]: language
  });
}

/**
 * Get dictionary translation settings
 * @returns {Promise<{enToFa: boolean, faToEn: boolean}>}
 */
export async function getDictionaryTranslationSettings() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.dictionaryEnToFa,
    STORAGE_KEYS.dictionaryFaToEn
  ]);
  return {
    enToFa: result[STORAGE_KEYS.dictionaryEnToFa] ?? true,
    faToEn: result[STORAGE_KEYS.dictionaryFaToEn] ?? true
  };
}

/**
 * Store dictionary translation settings
 * @param {boolean} enToFa - Show Persian translation for English words
 * @param {boolean} faToEn - Show English translation for Persian words
 */
export async function setDictionaryTranslationSettings(enToFa, faToEn) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.dictionaryEnToFa]: enToFa,
    [STORAGE_KEYS.dictionaryFaToEn]: faToEn
  });
}

/**
 * Check if document translation was cancelled
 * @returns {Promise<boolean>}
 */
export async function isTranslationCancelled() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.translationCancelled);
  return result[STORAGE_KEYS.translationCancelled] === true;
}

/**
 * Set document translation cancellation flag
 * @param {boolean} cancelled
 */
export async function setTranslationCancelled(cancelled) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.translationCancelled]: cancelled
  });
}

/**
 * Get selection popup enabled setting
 * @returns {Promise<boolean>}
 */
export async function getSelectionPopupEnabled() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.selectionPopup);
  return result[STORAGE_KEYS.selectionPopup] ?? false;
}

/**
 * Set selection popup enabled setting
 * @param {boolean} enabled
 */
export async function setSelectionPopupEnabled(enabled) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.selectionPopup]: enabled
  });
}

