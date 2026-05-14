import { STORAGE_KEYS, CACHE_CONFIG } from './constants.js';

/**
 * Translation Cache Manager
 * Implements LRU cache with TTL expiration.
 *
 * Keys are SHA-256(provider + '|' + sourceLang + '|' + text). The previous
 * implementation truncated a base64 of the input to 32 characters and ignored
 * provider/sourceLang, which both collided on long texts sharing a prefix and
 * returned the wrong provider's output after a provider switch.
 */
class TranslationCache {
  constructor() {
    this.storageKey = STORAGE_KEYS.translationCache;
  }

  /**
   * Generate a collision-resistant key for a translation request.
   * @param {string} text - Source text
   * @param {string} provider - Provider id (e.g. 'claude')
   * @param {string} sourceLang - 'auto' | 'fa' | 'en' | ...
   * @returns {Promise<string>} Hex SHA-256
   */
  async hashKey(text, provider = 'unknown', sourceLang = 'auto') {
    const payload = `${provider}|${sourceLang}|${text}`;
    const buffer = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
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
   * Get cached translation.
   * @param {string} text - Source text
   * @param {string} provider - Provider id used for this request
   * @param {string} sourceLang - Source language hint
   * @returns {Promise<{translation: string, direction: string}|null>}
   */
  async get(text, provider, sourceLang = 'auto') {
    const hash = await this.hashKey(text, provider, sourceLang);
    const cache = await this.loadCache();
    const entry = cache[hash];

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > CACHE_CONFIG.ttl) {
      delete cache[hash];
      await this.saveCache(cache);
      return null;
    }

    entry.lastAccess = Date.now();
    await this.saveCache(cache);

    return {
      translation: entry.translation,
      direction: entry.direction
    };
  }

  /**
   * Store translation in cache.
   * @param {string} text - Source text
   * @param {string} translation - Translated text
   * @param {string} direction - Translation direction (e.g., 'en-fa')
   * @param {string} provider - Provider id that produced this translation
   * @param {string} sourceLang - Source language hint
   */
  async set(text, translation, direction, provider, sourceLang = 'auto') {
    const hash = await this.hashKey(text, provider, sourceLang);
    const cache = await this.loadCache();

    cache[hash] = {
      translation,
      direction,
      provider,
      timestamp: Date.now(),
      lastAccess: Date.now()
    };

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
