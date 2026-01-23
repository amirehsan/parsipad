import { STORAGE_KEYS } from './constants.js';

/**
 * Get the stored API key
 * @returns {Promise<string|null>}
 */
export async function getApiKey() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.apiKey);
  return result[STORAGE_KEYS.apiKey] || null;
}

/**
 * Store the API key
 * @param {string} key - The Anthropic API key
 * @throws {Error} If the key format is invalid
 */
export async function setApiKey(key) {
  // Basic validation - Anthropic keys start with sk-ant-
  if (!key || !key.startsWith('sk-ant-')) {
    throw new Error('Invalid Anthropic API key format. Key should start with "sk-ant-"');
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.apiKey]: key,
    [STORAGE_KEYS.apiKeySetAt]: Date.now()
  });
}

/**
 * Check if API key is configured
 * @returns {Promise<boolean>}
 */
export async function hasApiKey() {
  const key = await getApiKey();
  return !!key;
}

/**
 * Remove the stored API key
 */
export async function removeApiKey() {
  await chrome.storage.local.remove([STORAGE_KEYS.apiKey, STORAGE_KEYS.apiKeySetAt]);
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
