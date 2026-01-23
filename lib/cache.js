import { STORAGE_KEYS, CACHE_CONFIG } from './constants.js';

/**
 * Translation Cache Manager
 * Implements LRU cache with TTL expiration
 */
class TranslationCache {
  constructor() {
    this.storageKey = STORAGE_KEYS.translationCache;
  }

  /**
   * Generate a hash key for the text
   * @param {string} text - Text to hash
   * @returns {string}
   */
  hashText(text) {
    // Simple hash using btoa, truncated for storage efficiency
    try {
      return btoa(encodeURIComponent(text)).slice(0, 32);
    } catch {
      // Fallback for very long strings
      return btoa(encodeURIComponent(text.slice(0, 500))).slice(0, 32);
    }
  }

  /**
   * Load cache from storage
   * @returns {Promise<Object>}
   */
  async loadCache() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || {};
  }

  /**
   * Save cache to storage
   * @param {Object} cache - Cache object to save
   */
  async saveCache(cache) {
    await chrome.storage.local.set({ [this.storageKey]: cache });
  }

  /**
   * Get cached translation
   * @param {string} text - Source text
   * @returns {Promise<{translation: string, direction: string}|null>}
   */
  async get(text) {
    const hash = this.hashText(text);
    const cache = await this.loadCache();
    const entry = cache[hash];

    if (!entry) {
      return null;
    }

    // Check TTL expiration
    if (Date.now() - entry.timestamp > CACHE_CONFIG.ttl) {
      // Entry expired, remove it
      delete cache[hash];
      await this.saveCache(cache);
      return null;
    }

    // Update access time for LRU
    entry.lastAccess = Date.now();
    await this.saveCache(cache);

    return {
      translation: entry.translation,
      direction: entry.direction
    };
  }

  /**
   * Store translation in cache
   * @param {string} text - Source text
   * @param {string} translation - Translated text
   * @param {string} direction - Translation direction (e.g., 'en-fa')
   */
  async set(text, translation, direction) {
    const hash = this.hashText(text);
    const cache = await this.loadCache();

    cache[hash] = {
      translation,
      direction,
      timestamp: Date.now(),
      lastAccess: Date.now()
    };

    // Evict oldest entries if over max size
    await this.evictIfNeeded(cache);
    await this.saveCache(cache);
  }

  /**
   * Evict oldest entries if cache exceeds max size (LRU)
   * @param {Object} cache - Cache object
   */
  async evictIfNeeded(cache) {
    const entries = Object.entries(cache);

    if (entries.length <= CACHE_CONFIG.maxSize) {
      return;
    }

    // Sort by lastAccess (oldest first)
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    // Remove oldest entries until we're under the limit
    const toRemove = entries.length - CACHE_CONFIG.maxSize;
    for (let i = 0; i < toRemove; i++) {
      delete cache[entries[i][0]];
    }
  }

  /**
   * Clear all cached translations
   */
  async clear() {
    await chrome.storage.local.remove(this.storageKey);
  }

  /**
   * Get cache statistics
   * @returns {Promise<{size: number, oldestEntry: Date|null}>}
   */
  async getStats() {
    const cache = await this.loadCache();
    const entries = Object.values(cache);

    if (entries.length === 0) {
      return { size: 0, oldestEntry: null };
    }

    const oldest = Math.min(...entries.map(e => e.timestamp));
    return {
      size: entries.length,
      oldestEntry: new Date(oldest)
    };
  }
}

// Export singleton instance
export const translationCache = new TranslationCache();
