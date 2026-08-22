import { BaseProvider } from './base-provider.js';
import { withAdditionalPropertiesFalse } from './schema-adapters.js';
import { withRetry } from '../retry.js';
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

/**
 * Parse one Claude SSE event into the neutral stream shape.
 * @param {{event: string, data: string}} event
 */
export function parseClaudeSseEvent({ data }) {
  if (!data) return {};
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return {};
  }
  switch (json.type) {
    case 'message_start':
      return typeof json.message?.usage?.input_tokens === 'number' ? { inputTokens: json.message.usage.input_tokens } : {};
    case 'content_block_delta':
      return json.delta?.type === 'text_delta' && json.delta.text ? { delta: json.delta.text } : {};
    case 'message_delta': {
      const out = {};
      if (typeof json.usage?.output_tokens === 'number') out.outputTokens = json.usage.output_tokens;
      if (json.delta?.stop_reason === 'max_tokens') out.truncated = true;
      return out;
    }
    case 'message_stop':
      return { done: true };
    case 'error':
      throw new TranslationError(ERROR_CODES.SERVER_ERROR, json.error?.message);
    default:
      return {};
  }
}

/**
 * Claude (Anthropic) provider. Raw Messages API over fetch, as the extension
 * runs without the SDK.
 */
export class ClaudeProvider extends BaseProvider {
  headers(apiKey) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': this.config.version,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  }

  buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, stream }) {
    const body = {
      model: this.config.model,
      max_tokens: maxTokens || this.config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (responseSchema) {
      body.output_config = { format: { type: 'json_schema', schema: withAdditionalPropertiesFalse(responseSchema) } };
    }
    if (stream) body.stream = true;
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
    const text = (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
    return {
      text,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      truncated: data.stop_reason === 'max_tokens'
    };
  }

  async stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs }) {
    const response = await this.request(this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, stream: true }), { apiKey, signal });
    return this.consumeStream(response, parseClaudeSseEvent, { onDelta, signal, idleTimeoutMs });
  }

  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, temperature, responseSchema, apiKey, signal }) {
    const body = {
      model: this.config.visionModel,
      max_tokens: maxTokens || this.config.maxTokens,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } }
        ]
      }]
    };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (responseSchema) {
      body.output_config = { format: { type: 'json_schema', schema: withAdditionalPropertiesFalse(responseSchema) } };
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
    return {
      text: data.content?.[0]?.text || '',
      truncated: data.stop_reason === 'max_tokens',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0
    };
  }

  async validateApiKey(apiKey) {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: this.headers(apiKey),
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
