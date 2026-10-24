import { STORAGE_KEYS } from './constants.js';
import { ERROR_CODES, toTranslationError } from './translation/errors.js';

/**
 * Last-request health per provider, shown as the dot on the header badge.
 * One record per provider, replaced by every user-visible call outcome.
 */

// Writes are read-modify-write on a single storage key, so they are chained
// to keep two calls that finish together from overwriting each other.
let writeQueue = Promise.resolve();

/**
 * Store the latest outcome for a provider.
 * @param {string} provider - Provider ID (claude, gemini, openai)
 * @param {{ok: boolean, code?: string, ms?: number}} outcome
 * @returns {Promise<void>}
 */
export function recordProviderHealth(provider, outcome) {
  const run = async () => {
    const result = await chrome.storage.local.get(STORAGE_KEYS.providerHealth);
    const all = result[STORAGE_KEYS.providerHealth] || {};
    const record = { ok: Boolean(outcome.ok), at: Date.now() };
    if (outcome.code) record.code = outcome.code;
    if (typeof outcome.ms === 'number') record.ms = outcome.ms;
    await chrome.storage.local.set({ [STORAGE_KEYS.providerHealth]: { ...all, [provider]: record } });
  };
  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => {});
  return next;
}

/**
 * Read the latest outcome for a provider.
 * @param {string} provider
 * @returns {Promise<{ok: boolean, code?: string, ms?: number, at: number}|null>}
 */
export async function getProviderHealth(provider) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.providerHealth);
  return result[STORAGE_KEYS.providerHealth]?.[provider] || null;
}

/**
 * Colour band for a health record.
 * @param {{ok: boolean, code?: string}|null|undefined} record
 * @returns {'ok'|'warn'|'error'|'unknown'}
 */
export function healthTone(record) {
  if (!record) return 'unknown';
  if (record.ok) return 'ok';
  if (record.code === ERROR_CODES.RATE_LIMITED || record.code === ERROR_CODES.TIMEOUT) return 'warn';
  return 'error';
}

/**
 * Run one provider request and record how it went. Records once per call, so
 * retries inside the provider are one outcome. Recording can never change the
 * request's result or error, and a cancelled request says nothing about the
 * provider, so it is not recorded.
 * @template T
 * @param {{config?: {id?: string}}} provider
 * @param {() => Promise<T>} request
 * @returns {Promise<T>}
 */
export async function trackProviderCall(provider, request) {
  const started = Date.now();
  let value;
  try {
    value = await request();
  } catch (error) {
    safeRecord(provider, { ok: false, code: toTranslationError(error).code });
    throw error;
  }
  safeRecord(provider, { ok: true, ms: Date.now() - started });
  return value;
}

function safeRecord(provider, outcome) {
  try {
    if (outcome.code === ERROR_CODES.ABORTED) return;
    const id = provider?.config?.id;
    if (!id) return;
    recordProviderHealth(id, outcome).catch(() => {});
  } catch {
    // Health is informational; never let it reach the caller.
  }
}
