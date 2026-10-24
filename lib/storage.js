import { STORAGE_KEYS, PROVIDERS, PROVIDER_CONFIGS, DEFAULT_PROVIDER, INVALID_KEY_FORMAT } from './constants.js';
import { insertAtOriginalPosition } from './history.js';
import { emptyReviewState, recordSuccess, shouldShowReview, applyResponse, migrateLegacyReviewState } from './review-prompt.js';
import { PRACTICE_SIZE, clampSessionSize } from './practice-size.js';

// ============================================
// Migrations (run once on extension startup)
// ============================================

const CURRENT_CACHE_MIGRATION_VERSION = 2;

/**
 * One-time migration that drops the legacy `translation_cache` blob from
 * chrome.storage.local. v1 used a 32-char base64 prefix hash that collided
 * on long inputs sharing prefixes (e.g. two paragraphs starting with the
 * same sentence). v2 uses SHA-256 of provider|sourceLang|text. Old entries
 * cannot be re-read under the new key, so we drop them to reclaim space.
 *
 * Idempotent: tracks completion via STORAGE_KEYS.cacheMigrationVersion so
 * subsequent extension reloads are no-ops.
 */
export async function runCacheMigrations() {
  try {
    const { [STORAGE_KEYS.cacheMigrationVersion]: version } =
      await chrome.storage.local.get(STORAGE_KEYS.cacheMigrationVersion);
    if (version === CURRENT_CACHE_MIGRATION_VERSION) return;

    await chrome.storage.local.remove(STORAGE_KEYS.translationCacheLegacy);
    await chrome.storage.local.set({
      [STORAGE_KEYS.cacheMigrationVersion]: CURRENT_CACHE_MIGRATION_VERSION
    });
  } catch (err) {
    // Migration failures are non-fatal; the extension still works with the
    // stale data taking up some bytes. Log so it's visible during dev.
    console.warn('[ParsiPad] Cache migration failed:', err);
  }
}

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
 * Tidy a key the way it actually arrives from a paste: surrounding whitespace,
 * and the quotes that come along when it is copied out of a .env file or a code
 * sample. Without this the prefix check below rejects an otherwise good key.
 * @param {string} key
 * @returns {string}
 */
export function normalizeApiKey(key) {
  const trimmed = String(key).trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return (quoted ? quoted[2] : trimmed).trim();
}

/**
 * Whether a key has the shape a provider issues, without storing anything.
 * Save & test calls it before its request, so a key that cannot be right
 * never reaches the provider.
 * @param {string} provider - Provider ID
 * @param {string} key - As typed or pasted; tidied first
 * @returns {null | {ok: false, code: string, prefixes: string[]}} null when
 *   the key starts with one of the provider's prefixes; otherwise a key test
 *   result for describeKeyTest
 */
export function checkKeyFormat(provider, key) {
  const prefixes = PROVIDER_CONFIGS[provider]?.keyPrefixes || [];
  const cleaned = normalizeApiKey(key || '');
  if (prefixes.some(prefix => cleaned.startsWith(prefix))) return null;
  return { ok: false, code: INVALID_KEY_FORMAT, prefixes: [...prefixes] };
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

  const cleaned = key ? normalizeApiKey(key) : key;

  // Validate key format against the prefixes the provider issues. The message
  // is for logs; the UI words it from the code and prefixes (describeKeyTest).
  const problem = cleaned ? checkKeyFormat(provider, cleaned) : null;
  if (problem) {
    const expected = problem.prefixes.map(prefix => `"${prefix}"`).join(' or ');
    const error = new Error(`Invalid ${config.name} API key format. Key should start with ${expected}`);
    error.code = problem.code;
    error.prefixes = problem.prefixes;
    throw error;
  }

  const storageKey = PROVIDER_KEY_MAP[provider];
  await chrome.storage.local.set({
    [storageKey]: cleaned
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
  // Default 'light', not 'system': a fresh install opens in the product's
  // default presentation rather than inheriting the OS. 'system' remains a
  // valid stored value for anyone who selects it.
  const theme = result[STORAGE_KEYS.theme] || 'light';
  // Seed the mirror on read as well as on write. Without this, a user who
  // set their theme before lib/theme-boot.js existed would keep getting the
  // pre-paint flash until they happened to toggle it again.
  try {
    if (localStorage.getItem('pp-theme') !== theme) {
      localStorage.setItem('pp-theme', theme);
    }
  } catch (error) {
    // no-op
  }
  return theme;
}

/**
 * Store theme preference
 * @param {'light'|'dark'|'system'} theme
 */
export async function setTheme(theme) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.theme]: theme
  });
  // Mirrored so lib/theme-boot.js can apply the theme before the page paints;
  // chrome.storage cannot be read synchronously. Best effort: if this fails
  // the page simply paints light and the async path corrects it.
  try {
    localStorage.setItem('pp-theme', theme);
  } catch (error) {
    // no-op
  }
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

// ============================================
// Analytics Event Logging
// ============================================

const MAX_USAGE_EVENTS = 5000;
const TRIM_BATCH = 500;

/**
 * Log a usage event for analytics
 * @param {Object} event
 * @param {string} event.action - Action type (translate, polish, dictionary, etc.)
 * @param {string} event.provider - Provider ID (claude, gemini, openai)
 * @param {number} event.inputTokens - Input tokens used
 * @param {number} event.outputTokens - Output tokens used
 * @param {boolean} [event.cached] - Whether result was from cache
 */
export async function logUsageEvent({ action, provider, inputTokens, outputTokens, cached }) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.usageEvents);
  const events = result[STORAGE_KEYS.usageEvents] || [];

  events.push({
    t: Date.now(),
    a: action,
    p: provider,
    i: inputTokens || 0,
    o: outputTokens || 0,
    c: !!cached
  });

  if (events.length > MAX_USAGE_EVENTS) {
    events.splice(0, TRIM_BATCH);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.usageEvents]: events });

  // Every successful action is logged here, which makes this the one place
  // a success can be counted toward the review prompt. The action has
  // already succeeded and been billed, so a failure here must not fail it.
  try {
    await recordTranslationSuccess();
  } catch (error) {
    console.warn('[ParsiPad] Could not count a success for the review prompt:', error);
  }
}

/**
 * Get all usage events
 * @returns {Promise<Array>}
 */
export async function getUsageEvents() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.usageEvents);
  return result[STORAGE_KEYS.usageEvents] || [];
}

/**
 * Clear all usage events (keeps cumulative stats)
 */
export async function clearUsageEvents() {
  await chrome.storage.local.set({ [STORAGE_KEYS.usageEvents]: [] });
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

/**
 * Whether non-Persian, non-English text is translated into Persian (true)
 * or rejected with UNSUPPORTED (false).
 * @returns {Promise<boolean>}
 */
export async function getTranslateOtherLanguages() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.translateOtherLanguages);
  return result[STORAGE_KEYS.translateOtherLanguages] ?? true;
}

/**
 * @param {boolean} enabled
 */
export async function setTranslateOtherLanguages(enabled) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.translateOtherLanguages]: enabled
  });
}

/**
 * Whether translating a whole page first shows how many paragraphs it has
 * and the estimated cost. On unless the user turned it off.
 * @returns {Promise<boolean>}
 */
export async function getConfirmPageTranslate() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.confirmPageTranslate);
  return result[STORAGE_KEYS.confirmPageTranslate] ?? true;
}

/**
 * @param {boolean} value
 */
export async function setConfirmPageTranslate(value) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.confirmPageTranslate]: value
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
 * Put a removed favorite back where it was. A favorite whose id is already
 * saved is left alone.
 * @param {Object} favorite - The stored favorite, exactly as it was before removal
 * @param {number} [index] - The favorite's index in the list before removal
 * @returns {Promise<void>}
 */
export async function restoreFavorite(favorite, index) {
  const favorites = await getFavorites();
  const next = insertAtOriginalPosition(favorites, favorite, index);
  if (next === favorites) return;

  await chrome.storage.local.set({
    [STORAGE_KEYS.favorites]: next
  });
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

// ============================================
// Practice Functions
// ============================================

/**
 * How many cards a practice session deals.
 * @returns {Promise<number>}
 */
export async function getPracticeSessionSize() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.practiceSessionSize);
  return clampSessionSize(result[STORAGE_KEYS.practiceSessionSize] ?? PRACTICE_SIZE.default);
}

/**
 * @param {number} n - Clamped to PRACTICE_SIZE before it is stored
 * @returns {Promise<number>} The size stored
 */
export async function setPracticeSessionSize(n) {
  const size = clampSessionSize(n);
  await chrome.storage.local.set({ [STORAGE_KEYS.practiceSessionSize]: size });
  return size;
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

/*
 * The review prompt's state lives in three keys, one per writer:
 *
 *   review_usage    successes and active days  (written per success, by the worker)
 *   review_schedule shows and snoozes          (written when shown or snoozed)
 *   review_answer   rated / don't ask again    (written by the user's answer)
 *
 * chrome.storage has no transactions, so two read-modify-write cycles on
 * one key interleave and the later write silently drops the other's change.
 * With one key per writer, a success counted in the middle of a click can
 * no longer erase "Don't ask again". The rules in lib/review-prompt.js still
 * see one object; it is composed on read and split on write here.
 */
const REVIEW_PARTS = Object.freeze({
  [STORAGE_KEYS.reviewUsage]: ['installedAt', 'successes', 'activeDays'],
  [STORAGE_KEYS.reviewSchedule]: ['shownCount', 'lastShownAt', 'snoozedUntil'],
  [STORAGE_KEYS.reviewAnswer]: ['rated', 'optedOut']
});

function pick(state, fields) {
  return Object.fromEntries(fields.map(field => [field, state[field]]));
}

async function writeReviewPart(key, state) {
  await chrome.storage.local.set({ [key]: pick(state, REVIEW_PARTS[key]) });
}

/**
 * The review prompt's state, created on first read. Installs that predate
 * it carry the two old flags, which are folded in once (see
 * migrateLegacyReviewState). installedAt is set then, so an existing user
 * is treated as installed today rather than shown the prompt at once.
 * @returns {Promise<import('./review-prompt.js').ReviewState>}
 */
export async function getReviewState() {
  const partKeys = Object.keys(REVIEW_PARTS);
  const result = await chrome.storage.local.get([
    ...partKeys,
    STORAGE_KEYS.reviewPromptDismissed,
    STORAGE_KEYS.reviewPromptClicked
  ]);
  if (partKeys.every(key => result[key])) {
    return Object.assign({}, ...partKeys.map(key => result[key]));
  }

  const now = Date.now();
  const state = migrateLegacyReviewState({
    dismissed: result[STORAGE_KEYS.reviewPromptDismissed],
    clicked: result[STORAGE_KEYS.reviewPromptClicked]
  }, emptyReviewState(now), now);
  await chrome.storage.local.set(Object.fromEntries(
    partKeys.map(key => [key, pick(state, REVIEW_PARTS[key])])
  ));
  return state;
}

/** Count one successful translation, polish, lookup or lesson. */
export async function recordTranslationSuccess() {
  const state = await getReviewState();
  await writeReviewPart(STORAGE_KEYS.reviewUsage, recordSuccess(state, Date.now()));
}

/**
 * True when the prompt should be shown now. A true answer records the show,
 * so a second surface asking in the same window gets false.
 * @returns {Promise<boolean>}
 */
export async function claimReviewPrompt() {
  const state = await getReviewState();
  const now = Date.now();
  if (!shouldShowReview(state, now)) return false;
  await writeReviewPart(STORAGE_KEYS.reviewSchedule, applyResponse(state, 'shown', now));
  return true;
}

/** @param {'rated' | 'later' | 'never'} response */
export async function respondToReviewPrompt(response) {
  const state = await getReviewState();
  const key = response === 'later' ? STORAGE_KEYS.reviewSchedule : STORAGE_KEYS.reviewAnswer;
  await writeReviewPart(key, applyResponse(state, response, Date.now()));
}

