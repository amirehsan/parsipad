import { STORAGE_KEYS } from './constants.js';

const MAX_HISTORY_SIZE = 50;

/**
 * Get translation history
 * @returns {Promise<Array>} Array of history entries (newest first)
 */
export async function getHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.translationHistory);
  return result[STORAGE_KEYS.translationHistory] || [];
}

/**
 * Add a translation to history
 * @param {string} original - Original text
 * @param {string} translation - Translated text
 * @param {string} direction - Translation direction (e.g., 'en-fa')
 */
export async function addToHistory(original, translation, direction) {
  const history = await getHistory();

  // Create new entry
  const entry = {
    id: Date.now(),
    original: original.slice(0, 200), // Truncate long texts
    translation: translation.slice(0, 200),
    direction,
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
