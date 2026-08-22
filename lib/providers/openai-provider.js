import { BaseProvider } from './base-provider.js';
import { withAdditionalPropertiesFalse } from './schema-adapters.js';
import { withRetry } from '../retry.js';
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

const SCHEMA_NAME = 'parsipad_result';

/**
 * Parse one Chat Completions SSE event into the neutral shape.
 * @param {{event?: string, data: string}} event
 */
export function parseOpenAISseEvent({ data }) {
  if (!data) return {};
  if (data === '[DONE]') return { done: true };
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return {};
  }
  const out = {};
  const choice = json.choices?.[0];
  if (choice?.delta?.content) out.delta = choice.delta.content;
  if (choice?.finish_reason === 'length') out.truncated = true;
  if (typeof json.usage?.prompt_tokens === 'number') out.inputTokens = json.usage.prompt_tokens;
  if (typeof json.usage?.completion_tokens === 'number') out.outputTokens = json.usage.completion_tokens;
  return out;
}

/**
 * OpenAI (ChatGPT) provider.
 */
export class OpenAIProvider extends BaseProvider {
  headers(apiKey) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
  }

  buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, stream }) {
    const body = {
      model: this.config.model,
      max_tokens: maxTokens || this.config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: SCHEMA_NAME, schema: withAdditionalPropertiesFalse(responseSchema), strict: true }
      };
    }
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    return body;
  }

  async request(body, { apiKey, signal, timeoutMs }) {
    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(body),
      signal: reqSignal
    }), { signal, ...(timeoutMs ? { timeoutMs } : {}) });

    if (!response.ok) {
      await this.handleError(response);
    }
    return response;
  }

  async complete({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, apiKey, signal, timeoutMs }) {
    const response = await this.request(this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema }), { apiKey, signal, timeoutMs });
    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) {
      throw new TranslationError(ERROR_CODES.UNKNOWN, choice.message.refusal);
    }
    return {
      text: choice?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      truncated: choice?.finish_reason === 'length'
    };
  }

  async stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs }) {
    const response = await this.request(this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, stream: true }), { apiKey, signal });
    return this.consumeStream(response, parseOpenAISseEvent, { onDelta, signal, idleTimeoutMs });
  }

  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, temperature, responseSchema, apiKey, signal }) {
    const body = {
      model: this.config.visionModel,
      max_tokens: maxTokens || this.config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
          ]
        }
      ]
    };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: SCHEMA_NAME, schema: withAdditionalPropertiesFalse(responseSchema), strict: true }
      };
    }

    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(body),
      signal: reqSignal
    }), { signal, timeoutMs: 60000 });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) {
      throw new TranslationError(ERROR_CODES.UNKNOWN, choice.message.refusal);
    }
    return {
      text: choice?.message?.content || '',
      truncated: choice?.finish_reason === 'length',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
    };
  }

  async validateApiKey(apiKey) {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({ model: this.config.model, max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async handleError(response) {
    let apiMessage = '';
    try {
      const errorData = await response.json();
      apiMessage = errorData.error?.message || '';
    } catch {
      apiMessage = '';
    }

    switch (response.status) {
      case 401:
        throw new TranslationError(ERROR_CODES.INVALID_API_KEY);
      case 429:
        throw new TranslationError(ERROR_CODES.RATE_LIMITED);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new TranslationError(ERROR_CODES.SERVER_ERROR);
      default:
        throw new TranslationError(ERROR_CODES.UNKNOWN, apiMessage || undefined);
    }
  }
}
