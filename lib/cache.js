import { STORAGE_KEYS, CACHE_CONFIG } from './constants.js';

/**
 * Translation Cache Manager
 * Implements LRU cache with TTL expiration.
 *
 * Keys are SHA-256 of ordered parts (provider | mode | direction | contextHash | text).
 * Entries written by 2.x (which keyed on provider | sourceLang | text and stored flat
 * fields) have no "result" field and are treated as misses until their TTL removes them.
 */
class TranslationCache {
  constructor() {
    this.storageKey = STORAGE_KEYS.translationCache;
  }

  /**
   * Collision-resistant key from ordered parts (see lib/translation/cache-key.js).
   * @param {string[]} parts
   * @returns {Promise<string>} Hex SHA-256
   */
  async hashKey(parts) {
    const payload = parts.join('|');
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
   * @param {string[]} parts
   * @returns {Promise<object|null>} The stored result contract, or null
   */
  async get(parts) {
    const hash = await this.hashKey(parts);
    const cache = await this.loadCache();
    const entry = cache[hash];

    if (!entry || !entry.result) {
      return null;
    }

    if (Date.now() - entry.timestamp > CACHE_CONFIG.ttl) {
      delete cache[hash];
      await this.saveCache(cache);
      return null;
    }

    entry.lastAccess = Date.now();
    await this.saveCache(cache);
    return entry.result;
  }

  /**
   * @param {string[]} parts
   * @param {object} result - Result contract without token counts
   */
  async set(parts, result) {
    const hash = await this.hashKey(parts);
    const cache = await this.loadCache();
    cache[hash] = {
      result,
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
