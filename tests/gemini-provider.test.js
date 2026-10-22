import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiProvider, parseGeminiSseEvent } from '../lib/providers/gemini-provider.js';
import { PROVIDER_CONFIGS } from '../lib/constants.js';
import { SENTENCE_SCHEMA } from '../lib/translation/schemas.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const sseResponse = (text) => new Response(new TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

describe('GeminiProvider', () => {
  let provider;
  let requests;

  beforeEach(() => {
    provider = new GeminiProvider(PROVIDER_CONFIGS.gemini);
    requests = [];
  });

  it('sends temperature, JSON mime type and an ordered schema without additionalProperties', async () => {
    globalThis.fetch = vi.fn(async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"translation":"x"}' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', maxTokens: 900, temperature: 0.2, responseSchema: SENTENCE_SCHEMA, apiKey: 'AIza' });
    expect(result).toEqual({ text: '{"translation":"x"}', inputTokens: 4, outputTokens: 2, truncated: true });
    const { url, body } = requests[0];
    expect(url).toContain(':generateContent');
    expect(body.generationConfig.temperature).toBe(0.2);
    // Thinking cannot be switched off and its tokens come out of this cap, so
    // the caller's budget is sent with headroom added.
    expect(body.generationConfig.maxOutputTokens).toBe(900 + PROVIDER_CONFIGS.gemini.thinkingHeadroomTokens);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.propertyOrdering[0]).toBe('translation');
    expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain('additionalProperties');
  });

  it('omits JSON config without a schema', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' });
    expect(result.truncated).toBe(false);
    expect(requests[0].generationConfig.responseMimeType).toBeUndefined();
    expect(requests[0].generationConfig.temperature).toBeUndefined();
  });

  it('maps 403 to INVALID_API_KEY', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: 'forbidden' } }, 403));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('streams through streamGenerateContent with alt=sse', async () => {
    const events = [
      'data: {"candidates":[{"content":{"parts":[{"text":"سلام "}]}}],"usageMetadata":{"promptTokenCount":3}}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"دنیا"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n'
    ].join('');
    globalThis.fetch = vi.fn(async (url) => {
      requests.push(url);
      return sseResponse(events);
    });
    const deltas = [];
    const result = await provider.stream({ systemPrompt: 's', userPrompt: 'u', maxTokens: 500, apiKey: 'k', onDelta: d => deltas.push(d) });
    expect(requests[0]).toContain(':streamGenerateContent?alt=sse');
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ text: 'سلام دنیا', inputTokens: 3, outputTokens: 2, truncated: false });
  });
  it('vision() forwards temperature and schema, and reports truncation', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: {} });
    });
    const result = await provider.vision({
      systemPrompt: 's', userPrompt: 'u', imageBase64: 'x', mimeType: 'image/png',
      maxTokens: 4096, temperature: 0.2, responseSchema: SENTENCE_SCHEMA, apiKey: 'k'
    });
    expect(requests[0].generationConfig.temperature).toBe(0.2);
    expect(requests[0].generationConfig.responseMimeType).toBe('application/json');
    expect(requests[0].generationConfig.maxOutputTokens).toBe(4096 + PROVIDER_CONFIGS.gemini.thinkingHeadroomTokens);
    expect(requests[0].generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(result.truncated).toBe(true);
  });
});

describe('parseGeminiSseEvent', () => {
  it('extracts text, usage and truncation', () => {
    expect(parseGeminiSseEvent({ data: '{"candidates":[{"content":{"parts":[{"text":"a"},{"text":"b"}]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2}}' }))
      .toEqual({ delta: 'ab', inputTokens: 1, outputTokens: 2, truncated: true });
    expect(parseGeminiSseEvent({ data: 'garbage' })).toEqual({});
  });
});

// Thinking is on at `minimal` on every Gemini 3.x model and cannot be switched
// off, and Google enforces maxOutputTokens as a hard cutoff that counts thought
// tokens alongside the answer. A cap sized for the answer alone is spent
// thinking, and the translation comes back truncated or empty after a long wait.
describe('GeminiProvider thinking allowance', () => {
  // Enough for a `minimal` pass to finish and still write the answer. 2.5 ran
  // with thinking off, where the whole cap was the answer's to spend.
  const MINIMAL_THINKING_ALLOWANCE = 2048;
  let provider;

  beforeEach(() => {
    provider = new GeminiProvider(PROVIDER_CONFIGS.gemini);
  });

  it.each([['word', 700], ['sentence', 900]])('leaves a thinking pass room beyond the %s budget', (_mode, budget) => {
    const { generationConfig } = provider.buildBody({ systemPrompt: 's', userPrompt: 'u', maxTokens: budget });
    expect(generationConfig.maxOutputTokens - budget).toBeGreaterThanOrEqual(MINIMAL_THINKING_ALLOWANCE);
  });

  // Thought parts could not appear while thinking was off. Now that it is on,
  // one must never be mistaken for the translation.
  it('never returns a thought part as the translation', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      candidates: [{ content: { parts: [{ text: 'Let me consider this word.', thought: true }, { text: '{"translation":"سلام"}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 9 }
    }));
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' });
    expect(result.text).toBe('{"translation":"سلام"}');
  });

  it('never streams a thought part as a delta', () => {
    expect(parseGeminiSseEvent({ data: '{"candidates":[{"content":{"parts":[{"text":"thinking out loud","thought":true}]}}]}' }))
      .toEqual({});
  });
});
