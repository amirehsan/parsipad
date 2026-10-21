/**
 * Retry utility with exponential backoff for API calls.
 * Adds per-attempt timeout via AbortController and supports an external
 * cancellation signal so callers (e.g. page translation) can abort in-flight.
 */

const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  timeoutMs: 30000,
  // A ceiling on the call as a whole, retries and the waits between them
  // included. timeoutMs alone only bounds one attempt, so a provider that is
  // both slow and failing could hold a single translation for roughly two
  // minutes, which reads as a frozen button rather than a slow service.
  deadlineMs: 45000,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: ['Failed to fetch', 'NetworkError', 'ECONNRESET', 'network error']
};

function calculateDelay(attempt, baseDelay, maxDelay) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

function isRetryable(error, response, config) {
  if (response && config.retryableStatuses.includes(response.status)) {
    return true;
  }
  if (error && config.retryableErrors.some(e => error.message?.toLowerCase().includes(e.toLowerCase()))) {
    return true;
  }
  return false;
}

function parseRetryAfter(response) {
  const retryAfter = response?.headers?.get('Retry-After');
  if (!retryAfter) return null;

  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) return seconds * 1000;

  const date = Date.parse(retryAfter);
  if (!isNaN(date)) return Math.max(0, date - Date.now());

  return null;
}

/**
 * Combine an external AbortSignal with an internal timeout signal so fetch
 * is aborted by whichever fires first.
 * @param {AbortSignal | null | undefined} externalSignal
 * @param {number} timeoutMs
 * @returns {{signal: AbortSignal, cleanup: () => void}}
 */
function buildCombinedSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();

  const onExternalAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timeoutId = timeoutMs
    ? setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
    : null;

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Sleep with cancellation support; rejects if the signal fires.
 * @param {number} ms
 * @param {AbortSignal | null} signal
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Retry wrapper for fetch operations with exponential backoff, timeout, and cancellation.
 * @param {(signal: AbortSignal) => Promise<Response>} fetchFn
 *   Function that performs the fetch. Receives a per-attempt signal it should pass to fetch.
 * @param {object} config - Optional retry configuration (timeoutMs, deadlineMs, signal, maxRetries, ...)
 * @returns {Promise<Response>}
 */
export async function withRetry(fetchFn, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const externalSignal = opts.signal || null;
  // Vision and grammar lessons ask for a long single attempt on purpose, so
  // the budget never undercuts one full attempt of the size the caller asked
  // for. It bounds the retries around it, not the request itself.
  const deadlineMs = Math.max(opts.deadlineMs, opts.timeoutMs);
  const startedAt = Date.now();
  const remaining = () => deadlineMs - (Date.now() - startedAt);

  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    if (externalSignal?.aborted) {
      throw externalSignal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    const budget = remaining();
    if (budget <= 0) break;

    const { signal, cleanup } = buildCombinedSignal(externalSignal, Math.min(opts.timeoutMs, budget));

    try {
      const response = await fetchFn(signal);

      if (response.ok) {
        cleanup();
        return response;
      }

      if (!isRetryable(null, response, opts) || attempt === opts.maxRetries) {
        cleanup();
        return response;
      }

      lastResponse = response;
      cleanup();

      const retryAfterDelay = parseRetryAfter(response);
      const delay = retryAfterDelay || calculateDelay(attempt, opts.baseDelay, opts.maxDelay);
      // Sleeping out the rest of the budget only delays the same answer.
      if (delay >= remaining()) break;
      await sleep(delay, externalSignal);
    } catch (error) {
      cleanup();
      lastError = error;

      // Don't retry user-initiated cancels.
      if (externalSignal?.aborted) {
        throw externalSignal.reason ?? error;
      }

      // An attempt the budget cut short is our doing, not the provider's, so
      // prefer the error the provider actually gave us on the way here.
      if (remaining() <= 0 && lastResponse) break;

      if (!isRetryable(error, null, opts) || attempt === opts.maxRetries) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay);
      if (delay >= remaining()) break;
      await sleep(delay, externalSignal);
    }
  }

  // Only reached by running out of budget: report what the provider last said
  // in preference to the abort the deadline raised.
  if (lastResponse) return lastResponse;
  if (lastError) throw lastError;
  throw new DOMException('Request timed out', 'TimeoutError');
}
