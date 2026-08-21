import { readSseEvents } from './sse.js';
import { STREAM_IDLE_TIMEOUT_MS } from '../translation/budget.js';

/**
 * Abstract base class for AI providers.
 * All providers must implement complete(), stream(), vision(),
 * validateApiKey() and handleError().
 */
export class BaseProvider {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.id = config.id;
  }

  /**
   * Text completion.
   * @param {Object} params
   * @param {string} params.systemPrompt
   * @param {string} params.userPrompt
   * @param {number} [params.maxTokens]
   * @param {number} [params.temperature]
   * @param {Object|null} [params.responseSchema] - Canonical JSON schema; enables native structured output
   * @param {string} params.apiKey
   * @param {AbortSignal} [params.signal]
   * @param {number} [params.timeoutMs]
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number, truncated: boolean}>}
   */
  async complete(_params) {
    throw new Error('complete() must be implemented by provider');
  }

  /**
   * Streaming text completion. Calls onDelta(text) for each chunk and resolves
   * with the same shape as complete() once the stream ends.
   * @param {Object} params - complete() params plus onDelta and idleTimeoutMs
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number, truncated: boolean}>}
   */
  async stream(_params) {
    throw new Error('stream() must be implemented by provider');
  }

  /**
   * Vision request (image + text).
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>}
   */
  async vision(_params) {
    throw new Error('vision() must be implemented by provider');
  }

  validateKeyFormat(apiKey) {
    return apiKey && apiKey.startsWith(this.config.keyPrefix);
  }

  async validateApiKey(_apiKey) {
    throw new Error('validateApiKey() must be implemented by provider');
  }

  async handleError(_response) {
    throw new Error('handleError() must be implemented by provider');
  }

  /**
   * Drive an SSE response through a provider-specific event parser.
   * @param {Response} response
   * @param {(event: {event: string, data: string}) => {delta?: string, inputTokens?: number, outputTokens?: number, truncated?: boolean, done?: boolean}} parseEvent
   * @param {{onDelta?: (text: string) => void, signal?: AbortSignal, idleTimeoutMs?: number}} options
   */
  async consumeStream(response, parseEvent, { onDelta, signal, idleTimeoutMs = STREAM_IDLE_TIMEOUT_MS } = {}) {
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let truncated = false;

    for await (const event of readSseEvents(response, { signal, idleTimeoutMs })) {
      const parsed = parseEvent(event);
      if (parsed.delta) {
        text += parsed.delta;
        if (onDelta) onDelta(parsed.delta);
      }
      if (typeof parsed.inputTokens === 'number') inputTokens = parsed.inputTokens;
      if (typeof parsed.outputTokens === 'number') outputTokens = parsed.outputTokens;
      if (parsed.truncated) truncated = true;
      if (parsed.done) break;
    }

    return { text, inputTokens, outputTokens, truncated };
  }
}
