/**
 * Retry utility with exponential backoff for API calls
 */

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,      // 1 second
  maxDelay: 30000,      // 30 seconds
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: ['Failed to fetch', 'NetworkError', 'ECONNRESET', 'network error']
};

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, baseDelay, maxDelay) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Check if an error or response is retryable
 * @param {Error|null} error - The error that occurred
 * @param {Response|null} response - The fetch response
 * @param {object} config - Retry configuration
 * @returns {boolean} Whether the request should be retried
 */
function isRetryable(error, response, config) {
  // Check for retryable HTTP status codes
  if (response && config.retryableStatuses.includes(response.status)) {
    return true;
  }
  // Check for retryable error messages
  if (error && config.retryableErrors.some(e => error.message?.toLowerCase().includes(e.toLowerCase()))) {
    return true;
  }
  return false;
}

/**
 * Parse Retry-After header from response
 * @param {Response|null} response - The fetch response
 * @returns {number|null} Delay in milliseconds, or null if not present
 */
function parseRetryAfter(response) {
  const retryAfter = response?.headers?.get('Retry-After');
  if (!retryAfter) return null;

  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) return seconds * 1000;

  // Try parsing as HTTP date
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) return Math.max(0, date - Date.now());

  return null;
}

/**
 * Retry wrapper for fetch operations with exponential backoff
 * @param {Function} fetchFn - Async function that performs the fetch
 * @param {object} config - Optional retry configuration
 * @returns {Promise<Response>} The fetch response
 */
export async function withRetry(fetchFn, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };
  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetchFn();

      // Success - return response
      if (response.ok) {
        return response;
      }

      // Check if this status is retryable
      if (!isRetryable(null, response, opts) || attempt === opts.maxRetries) {
        return response; // Let caller handle non-retryable errors
      }

      lastResponse = response;

      // Calculate delay (prefer Retry-After header if present)
      const retryAfterDelay = parseRetryAfter(response);
      const delay = retryAfterDelay || calculateDelay(attempt, opts.baseDelay, opts.maxDelay);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));

    } catch (error) {
      lastError = error;

      // Check if this error is retryable
      if (!isRetryable(error, null, opts) || attempt === opts.maxRetries) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Exhausted all retries
  if (lastError) throw lastError;
  return lastResponse;
}
