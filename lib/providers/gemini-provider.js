import { BaseProvider } from './base-provider.js';
import { ERROR_MESSAGES } from '../constants.js';
import { withRetry } from '../retry.js';

/**
 * Gemini (Google) AI Provider implementation
 */
export class GeminiProvider extends BaseProvider {
  /**
   * Make a text completion request to Gemini API
   */
  async complete({ systemPrompt, userPrompt, maxTokens, apiKey }) {
    const url = `${this.config.endpoint}/${this.config.model}:generateContent?key=${apiKey}`;

    const response = await withRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [{
          parts: [{ text: userPrompt }]
        }],
        generationConfig: {
          maxOutputTokens: maxTokens || this.config.maxTokens
        }
      })
    }));

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0
    };
  }

  /**
   * Make a vision request to Gemini API (image + text)
   */
  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, apiKey }) {
    const url = `${this.config.endpoint}/${this.config.visionModel}:generateContent?key=${apiKey}`;

    const response = await withRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [{
          parts: [
            { text: userPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          maxOutputTokens: maxTokens || this.config.maxTokens
        }
      })
    }));

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0
    };
  }

  /**
   * Validate API key by making a minimal test request
   */
  async validateApiKey(apiKey) {
    try {
      const url = `${this.config.endpoint}/${this.config.model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Hi' }]
          }],
          generationConfig: {
            maxOutputTokens: 10
          }
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Handle Gemini API error responses
   */
  async handleError(response) {
    let errorMessage = ERROR_MESSAGES.UNKNOWN_ERROR;

    try {
      const errorData = await response.json();
      const apiMessage = errorData.error?.message || '';

      switch (response.status) {
        case 400:
          if (apiMessage.includes('API_KEY_INVALID') || apiMessage.includes('API key not valid')) {
            errorMessage = ERROR_MESSAGES.INVALID_API_KEY;
          } else {
            errorMessage = apiMessage || ERROR_MESSAGES.UNKNOWN_ERROR;
          }
          break;
        case 403:
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
      if (response.status === 403 || response.status === 400) {
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
