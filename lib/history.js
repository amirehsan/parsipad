import { STORAGE_KEYS } from './constants.js';

const MAX_HISTORY_SIZE = 50;
const MAX_TEXT_LENGTH = 4000;

/**
 * Get translation history
 * @returns {Promise<Array>} Array of history entries (newest first)
 */
export async function getHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.translationHistory);
  return result[STORAGE_KEYS.translationHistory] || [];
}

/**
 * Add a translation to history.
 * Accepts an entry object ({ original, translation, direction, mode, result })
 * or the legacy positional form (original, translation, direction).
 * @param {object|string} entryOrOriginal
 * @param {string} [legacyTranslation]
 * @param {string} [legacyDirection]
 */
export async function addToHistory(entryOrOriginal, legacyTranslation, legacyDirection) {
  const input = typeof entryOrOriginal === 'string'
    ? { original: entryOrOriginal, translation: legacyTranslation, direction: legacyDirection }
    : (entryOrOriginal || {});

  const original = String(input.original || '').slice(0, MAX_TEXT_LENGTH);
  const translation = String(input.translation || '').slice(0, MAX_TEXT_LENGTH);
  const history = await getHistory();

  const entry = {
    id: Date.now(),
    original,
    translation,
    direction: input.direction,
    timestamp: Date.now()
  };
  if (input.mode) entry.mode = input.mode;
  if (input.result && typeof input.result === 'object') entry.result = input.result;

  const existingIndex = history.findIndex(h => h.original.toLowerCase() === original.toLowerCase());
  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }

  history.unshift(entry);
  if (history.length > MAX_HISTORY_SIZE) {
    history.length = MAX_HISTORY_SIZE;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.translationHistory]: history
  });
}

/**
 * Remove a single history entry
 * @param {number} id - Entry ID to remove
 */
export async function removeFromHistory(id) {
  const history = await getHistory();
  const filtered = history.filter(entry => entry.id !== id);

  await chrome.storage.local.set({
    [STORAGE_KEYS.translationHistory]: filtered
  });
}

/**
 * Clear all translation history
 */
export async function clearHistory() {
  await chrome.storage.local.remove(STORAGE_KEYS.translationHistory);
}

/**
 * Get history count
 * @returns {Promise<number>}
 */
export async function getHistoryCount() {
  const history = await getHistory();
  return history.length;
}

// ============================================
// Polish History Functions
// ============================================

/**
 * Get polish history
 * @returns {Promise<Array>} Array of polish history entries (newest first)
 */
export async function getPolishHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.polishHistory);
  return result[STORAGE_KEYS.polishHistory] || [];
}

/**
 * Add a polish result to history
 * @param {string} original - Original text
 * @param {string} professional - Professional version
 * @param {string} conversational - Conversational version
 * @param {string} concise - Concise version
 */
export async function addToPolishHistory(original, professional, conversational, concise) {
  const history = await getPolishHistory();

  // Create new entry
  const entry = {
    id: Date.now(),
    original: original.slice(0, 200), // Truncate long texts
    professional: professional.slice(0, 500),
    conversational: conversational.slice(0, 500),
    concise: concise.slice(0, 500),
    timestamp: Date.now()
  };

  // Check for duplicate (same original text)
  const existingIndex = history.findIndex(
    h => h.original.toLowerCase() === original.slice(0, 200).toLowerCase()
  );

  if (existingIndex !== -1) {
    // Remove existing entry (will be re-added at top)
    history.splice(existingIndex, 1);
  }

  // Add new entry at the beginning
  history.unshift(entry);

  // Keep only the most recent entries
  if (history.length > MAX_HISTORY_SIZE) {
    history.length = MAX_HISTORY_SIZE;
  }

  // Save to storage
  await chrome.storage.local.set({
    [STORAGE_KEYS.polishHistory]: history
  });
}

/**
 * Remove a single polish history entry
 * @param {number} id - Entry ID to remove
 */
export async function removeFromPolishHistory(id) {
  const history = await getPolishHistory();
  const filtered = history.filter(entry => entry.id !== id);

  await chrome.storage.local.set({
    [STORAGE_KEYS.polishHistory]: filtered
  });
}

/**
 * Clear all polish history
 */
export async function clearPolishHistory() {
  await chrome.storage.local.remove(STORAGE_KEYS.polishHistory);
}

/**
 * Get polish history count
 * @returns {Promise<number>}
 */
export async function getPolishHistoryCount() {
  const history = await getPolishHistory();
  return history.length;
}

/**
 * Update a specific variant in a polish history entry
 * @param {number} id - Entry ID to update
 * @param {'professional' | 'conversational' | 'concise'} variant - Variant to update
 * @param {string} newText - New text for the variant
 * @returns {Promise<Object|null>} Updated entry or null if not found
 */
export async function updatePolishVariant(id, variant, newText) {
  const history = await getPolishHistory();
  const entryIndex = history.findIndex(entry => entry.id === id);

  if (entryIndex === -1) {
    return null;
  }

  // Update the specific variant
  history[entryIndex][variant] = newText.slice(0, 500);
  history[entryIndex].timestamp = Date.now();

  // Save to storage
  await chrome.storage.local.set({
    [STORAGE_KEYS.polishHistory]: history
  });

  return history[entryIndex];
}

// ============================================
// Dictionary History Functions
// ============================================

/**
 * Get dictionary lookup history
 * @returns {Promise<Array>} Array of dictionary history entries (newest first)
 */
export async function getDictionaryHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.dictionaryHistory);
  return result[STORAGE_KEYS.dictionaryHistory] || [];
}

/**
 * Add a dictionary lookup to history
 * @param {string} word - The looked up word
 * @param {Object} result - Dictionary result object
 */
export async function addToDictionaryHistory(word, result) {
  const history = await getDictionaryHistory();

  // Create new entry
  const entry = {
    id: Date.now(),
    word: word.slice(0, 50),
    phonetic: result.phonetic || '',
    partOfSpeech: result.partOfSpeech || '',
    definition: result.definitions?.[0]?.meaning || '',
    translation: result.translation || '',
    sourceLang: result.sourceLang,
    targetLang: result.targetLang,
    timestamp: Date.now()
  };

  // Check for duplicate (same word)
  const existingIndex = history.findIndex(
    h => h.word.toLowerCase() === word.slice(0, 50).toLowerCase()
  );

  if (existingIndex !== -1) {
    // Remove existing entry (will be re-added at top)
    history.splice(existingIndex, 1);
  }

  // Add new entry at the beginning
  history.unshift(entry);

  // Keep only the most recent entries
  if (history.length > MAX_HISTORY_SIZE) {
    history.length = MAX_HISTORY_SIZE;
  }

  // Save to storage
  await chrome.storage.local.set({
    [STORAGE_KEYS.dictionaryHistory]: history
  });
}

/**
 * Remove a single dictionary history entry
 * @param {number} id - Entry ID to remove
 */
export async function removeFromDictionaryHistory(id) {
  const history = await getDictionaryHistory();
  const filtered = history.filter(entry => entry.id !== id);

  await chrome.storage.local.set({
    [STORAGE_KEYS.dictionaryHistory]: filtered
  });
}

/**
 * Clear all dictionary history
 */
export async function clearDictionaryHistory() {
  await chrome.storage.local.remove(STORAGE_KEYS.dictionaryHistory);
}

/**
 * Get dictionary history count
 * @returns {Promise<number>}
 */
export async function getDictionaryHistoryCount() {
  const history = await getDictionaryHistory();
  return history.length;
}
