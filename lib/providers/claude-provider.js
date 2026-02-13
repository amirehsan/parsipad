import { BaseProvider } from './base-provider.js';
import { ERROR_MESSAGES } from '../constants.js';

/**
 * Claude (Anthropic) AI Provider implementation
 */
export class ClaudeProvider extends BaseProvider {
  /**
   * Make a text completion request to Claude API
   */
  async complete({ systemPrompt, userPrompt, maxTokens, apiKey }) {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': this.config.version,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: maxTokens || this.config.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return {
      text: data.content[0].text,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0
    };
  }

  /**
   * Make a vision request to Claude API (image + text)
   */
  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, apiKey }) {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': this.config.version,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.config.visionModel,
        max_tokens: maxTokens || this.config.maxTokens,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return {
      text: data.content[0].text,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0
    };
  }

  /**
   * Validate API key by making a minimal test request
   */
  async validateApiKey(apiKey) {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': this.config.version,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Handle Claude API error responses
   */
  async handleError(response) {
    let errorMessage = ERROR_MESSAGES.UNKNOWN_ERROR;

    try {
      const errorData = await response.json();
      const apiMessage = errorData.error?.message || '';

      switch (response.status) {
        case 401:
          errorMessage = ERROR_MESSAGES.INVALID_API_KEY;
          break;
        case 429:
          errorMessage = ERROR_MESSAGES.RATE_LIMITED;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          errorMessage = ERROR_MESSAGES.SERVER_ERROR;
          break;
        default:
          errorMessage = apiMessage || ERROR_MESSAGES.UNKNOWN_ERROR;
      }
    } catch {
      if (response.status === 401) {
        errorMessage = ERROR_MESSAGES.INVALID_API_KEY;
      } else if (response.status === 429) {
        errorMessage = ERROR_MESSAGES.RATE_LIMITED;
      } else if (response.status >= 500) {
        errorMessage = ERROR_MESSAGES.SERVER_ERROR;
      }
    }

    throw new Error(errorMessage);
  }
}
