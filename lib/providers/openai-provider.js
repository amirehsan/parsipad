import { BaseProvider } from './base-provider.js';
import { ERROR_MESSAGES } from '../constants.js';
import { withRetry } from '../retry.js';

/**
 * OpenAI (ChatGPT) AI Provider implementation
 */
export class OpenAIProvider extends BaseProvider {
  /**
   * Make a text completion request to OpenAI API
   */
  async complete({ systemPrompt, userPrompt, maxTokens, apiKey, signal, timeoutMs }) {
    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: maxTokens || this.config.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: reqSignal
    }), { signal, ...(timeoutMs ? { timeoutMs } : {}) });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
    };
  }

  /**
   * Make a vision request to OpenAI API (image + text)
   */
  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, apiKey, signal }) {
    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.config.visionModel,
        max_tokens: maxTokens || this.config.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`
                }
              }
            ]
          }
        ]
      }),
      signal: reqSignal
    }), { signal, timeoutMs: 60000 });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
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
          'Authorization': `Bearer ${apiKey}`
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
   * Handle OpenAI API error responses
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
