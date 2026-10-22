import { BaseProvider } from './base-provider.js';
import { withPropertyOrdering } from './schema-adapters.js';
import { withRetry } from '../retry.js';
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

/**
 * The visible text of a candidate's parts. A reasoning part is flagged
 * `thought` and is not the answer, so it never reaches the reader as one.
 * Thinking is on at `minimal` on every 3.x model, so such a part can appear
 * where `thinkingBudget: 0` once ruled it out.
 * @param {Array<{text?: string, thought?: boolean}>} [parts]
 * @returns {string}
 */
function visibleText(parts) {
  return (parts || []).filter(part => !part.thought).map(part => part.text || '').join('');
}

/**
 * Parse one Gemini SSE event (a GenerateContentResponse) into the neutral shape.
 * @param {{event?: string, data: string}} event
 */
export function parseGeminiSseEvent({ data }) {
  if (!data) return {};
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return {};
  }
  const out = {};
  const candidate = json.candidates?.[0];
  const delta = visibleText(candidate?.content?.parts);
  if (delta) out.delta = delta;
  if (candidate?.finishReason === 'MAX_TOKENS') out.truncated = true;
  if (typeof json.usageMetadata?.promptTokenCount === 'number') out.inputTokens = json.usageMetadata.promptTokenCount;
  if (typeof json.usageMetadata?.candidatesTokenCount === 'number') out.outputTokens = json.usageMetadata.candidatesTokenCount;
  return out;
}

/**
 * Gemini (Google) provider.
 */
export class GeminiProvider extends BaseProvider {
  headers(apiKey) {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
  }

  /**
   * The cap to send for a caller's visible-output budget. maxOutputTokens is a
   * hard cutoff counting thought tokens as well as the answer, and no 3.x model
   * turns thinking off, so the cap carries a thinking allowance or the answer is
   * squeezed out entirely.
   * @param {number} [maxTokens]
   * @returns {number}
   */
  outputCap(maxTokens) {
    return (maxTokens || this.config.maxTokens) + (this.config.thinkingHeadroomTokens || 0);
  }

  buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema }) {
    const generationConfig = {
      maxOutputTokens: this.outputCap(maxTokens),
      thinkingConfig: { thinkingLevel: this.config.thinkingLevel }
    };
    if (typeof temperature === 'number') generationConfig.temperature = temperature;
    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = withPropertyOrdering(responseSchema);
    }
    return {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig
    };
  }

  async request(url, body, { apiKey, signal, timeoutMs }) {
    const response = await withRetry((reqSignal) => fetch(url, {
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
    const url = `${this.config.endpoint}/${this.config.model}:generateContent`;
    const response = await this.request(url, this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema }), { apiKey, signal, timeoutMs });
    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = visibleText(candidate?.content?.parts);
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      truncated: candidate?.finishReason === 'MAX_TOKENS'
    };
  }

  async stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs }) {
    const url = `${this.config.endpoint}/${this.config.model}:streamGenerateContent?alt=sse`;
    const response = await this.request(url, this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature }), { apiKey, signal });
    return this.consumeStream(response, parseGeminiSseEvent, { onDelta, signal, idleTimeoutMs });
  }

  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, temperature, responseSchema, apiKey, signal }) {
    const url = `${this.config.endpoint}/${this.config.visionModel}:generateContent`;
    const generationConfig = { maxOutputTokens: this.outputCap(maxTokens), thinkingConfig: { thinkingLevel: this.config.thinkingLevel } };
    if (typeof temperature === 'number') generationConfig.temperature = temperature;
    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = withPropertyOrdering(responseSchema);
    }

    const response = await withRetry((reqSignal) => fetch(url, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
        generationConfig
      }),
      signal: reqSignal
    }), { signal, timeoutMs: 60000 });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    return {
      text: visibleText(candidate?.content?.parts),
      truncated: candidate?.finishReason === 'MAX_TOKENS',
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0
    };
  }

  async validateApiKey(apiKey) {
    try {
      const url = `${this.config.endpoint}/${this.config.model}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 10 } })
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
      case 400:
        if (/API_KEY_INVALID|API key not valid/i.test(apiMessage)) throw new TranslationError(ERROR_CODES.INVALID_API_KEY);
        throw new TranslationError(ERROR_CODES.UNKNOWN, apiMessage || undefined);
      case 403:
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
