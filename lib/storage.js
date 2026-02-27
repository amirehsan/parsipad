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

// ============================================
// Favorites Functions
// ============================================

/**
 * Get all favorites
 * @returns {Promise<Array>}
 */
export async function getFavorites() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.favorites);
  return result[STORAGE_KEYS.favorites] || [];
}

/**
 * Add item to favorites
 * @param {Object} item - Favorite item
 * @param {string} [item.id] - Optional explicit ID (for grammar lessons)
 * @param {string} item.type - 'translation', 'polish', or 'grammar'
 * @param {string} item.originalText - Original text
 * @param {string} item.savedText - Saved translation or polish variant
 * @param {string} [item.variant] - For polish: 'professional', 'conversational', or 'concise'
 * @param {string} [item.direction] - For translation/grammar: 'en-to-fa' or 'fa-to-en'
 * @param {Object} [item.lesson] - For grammar: lesson data with title, points, relatedPatterns
 * @param {string} [item.provider] - AI provider used
 * @returns {Promise<Object>} The added favorite with id and timestamp
 */
export async function addFavorite(item) {
  const favorites = await getFavorites();

  // Check if already exists by ID or by original+saved text
  const exists = favorites.some(f =>
    (item.id && f.id === item.id) ||
    (f.originalText === item.originalText && f.savedText === item.savedText) ||
    // Legacy support for 'original' and 'saved' fields
    (f.original === item.originalText && f.saved === item.savedText)
  );

  if (exists) {
    return null; // Already favorited
  }

  const favorite = {
    id: item.id || `fav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: item.type,
    originalText: item.originalText,
    savedText: item.savedText,
    ...(item.variant && { variant: item.variant }),
    ...(item.direction && { direction: item.direction }),
    ...(item.lesson && { lesson: item.lesson }),
    ...(item.provider && { provider: item.provider }),
    timestamp: item.timestamp || Date.now()
  };

  favorites.unshift(favorite); // Add to beginning

  await chrome.storage.local.set({
    [STORAGE_KEYS.favorites]: favorites
  });

  return favorite;
}

/**
 * Remove item from favorites by id
 * @param {string} id - Favorite item id
 * @returns {Promise<boolean>} True if removed, false if not found
 */
export async function removeFavorite(id) {
  const favorites = await getFavorites();
  const index = favorites.findIndex(f => f.id === id);

  if (index === -1) {
    return false;
  }

  favorites.splice(index, 1);

  await chrome.storage.local.set({
    [STORAGE_KEYS.favorites]: favorites
  });

  return true;
}

/**
 * Check if an item is favorited
 * @param {string} originalOrId - Original text OR favorite ID (for grammar lessons)
 * @param {string} [saved] - Saved text (optional, not needed if passing ID)
 * @returns {Promise<Object|null>} The favorite object if found, null otherwise
 */
export async function isFavorite(originalOrId, saved) {
  const favorites = await getFavorites();

  // If only one argument, treat it as an ID
  if (saved === undefined) {
    return favorites.find(f => f.id === originalOrId) || null;
  }

  // Otherwise, match by original and saved text (check both new and legacy fields)
  return favorites.find(f =>
    (f.originalText === originalOrId && f.savedText === saved) ||
    (f.original === originalOrId && f.saved === saved)
  ) || null;
}

/**
 * Get random favorites for new tab display
 * @param {number} count - Number of random favorites to get
 * @returns {Promise<Array>}
 */
export async function getRandomFavorites(count = 3) {
  const favorites = await getFavorites();

  if (favorites.length === 0) {
    return [];
  }

  if (favorites.length <= count) {
    return [...favorites];
  }

  // Shuffle and take first 'count' items
  const shuffled = [...favorites].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ============================================
// New Tab Functions
// ============================================

/**
 * Get new tab enabled setting
 * @returns {Promise<boolean>}
 */
export async function getNewTabEnabled() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.newTabEnabled);
  return result[STORAGE_KEYS.newTabEnabled] ?? false;
}

/**
 * Set new tab enabled setting
 * @param {boolean} enabled
 */
export async function setNewTabEnabled(enabled) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.newTabEnabled]: enabled
  });
}

/**
 * Get number of phrases to show on new tab
 * @returns {Promise<number>}
 */
export async function getNewTabPhraseCount() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.newTabPhraseCount);
  return result[STORAGE_KEYS.newTabPhraseCount] ?? 3;
}

/**
 * Set number of phrases to show on new tab
 * @param {number} count - Number between 1 and 10
 */
export async function setNewTabPhraseCount(count) {
  const validCount = Math.min(10, Math.max(1, count));
  await chrome.storage.local.set({
    [STORAGE_KEYS.newTabPhraseCount]: validCount
  });
}

// ============================================
// Onboarding Functions
// ============================================

/**
 * Check if user has completed onboarding
 * @returns {Promise<boolean>}
 */
export async function hasCompletedOnboarding() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.onboardingComplete);
  return result[STORAGE_KEYS.onboardingComplete] === true;
}

/**
 * Mark onboarding as complete
 */
export async function setOnboardingComplete() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.onboardingComplete]: true
  });
}

// ============================================
// Review Prompt Functions
// ============================================

/**
 * Check if review prompt should be shown
 * Shows if: 3+ favorites AND not dismissed AND not already clicked
 * @returns {Promise<boolean>}
 */
export async function shouldShowReviewPrompt() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.favorites,
    STORAGE_KEYS.reviewPromptDismissed,
    STORAGE_KEYS.reviewPromptClicked
  ]);

  const favorites = result[STORAGE_KEYS.favorites] || [];
  const dismissed = result[STORAGE_KEYS.reviewPromptDismissed];
  const clicked = result[STORAGE_KEYS.reviewPromptClicked];

  return favorites.length >= 3 && !dismissed && !clicked;
}

/**
 * Dismiss the review prompt (user clicked "Maybe Later" or X)
 */
export async function dismissReviewPrompt() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.reviewPromptDismissed]: true
  });
}

/**
 * Mark that user clicked "Rate Now"
 */
export async function markReviewClicked() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.reviewPromptClicked]: true
  });
}

