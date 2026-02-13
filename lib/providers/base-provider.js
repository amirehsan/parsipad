import { ERROR_MESSAGES } from '../constants.js';

/**
 * Abstract base class for AI providers
 * All providers must implement these methods
 */
export class BaseProvider {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.id = config.id;
  }

  /**
   * Make a text completion request
   * @param {Object} params
   * @param {string} params.systemPrompt - System prompt
   * @param {string} params.userPrompt - User message
   * @param {number} params.maxTokens - Max tokens for response
   * @param {string} params.apiKey - API key
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>}
   */
  async complete(params) {
    throw new Error('complete() must be implemented by provider');
  }

  /**
   * Make a vision request (image + text)
   * @param {Object} params
   * @param {string} params.systemPrompt - System prompt
   * @param {string} params.userPrompt - User message
   * @param {string} params.imageBase64 - Base64 encoded image
   * @param {string} params.mimeType - Image MIME type
   * @param {number} params.maxTokens - Max tokens for response
   * @param {string} params.apiKey - API key
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>}
   */
  async vision(params) {
    throw new Error('vision() must be implemented by provider');
  }

  /**
   * Validate API key format based on provider prefix
   * @param {string} apiKey
   * @returns {boolean}
   */
  validateKeyFormat(apiKey) {
    return apiKey && apiKey.startsWith(this.config.keyPrefix);
  }

  /**
   * Test API key validity by making a minimal request
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async validateApiKey(apiKey) {
    throw new Error('validateApiKey() must be implemented by provider');
  }

  /**
   * Handle API error response and throw appropriate error
   * @param {Response} response
   * @throws {Error}
   */
  async handleError(response) {
    throw new Error('handleError() must be implemented by provider');
  }

  /**
   * Get the max tokens for a request, optionally doubled for complex responses
   * @param {boolean} double - Whether to double the max tokens
   * @returns {number}
   */
  getMaxTokens(double = false) {
    return double ? this.config.maxTokens * 2 : this.config.maxTokens;
  }
}
