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
    expect(body.generationConfig.maxOutputTokens).toBe(900);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
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
});

describe('parseGeminiSseEvent', () => {
  it('extracts text, usage and truncation', () => {
    expect(parseGeminiSseEvent({ data: '{"candidates":[{"content":{"parts":[{"text":"a"},{"text":"b"}]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2}}' }))
      .toEqual({ delta: 'ab', inputTokens: 1, outputTokens: 2, truncated: true });
    expect(parseGeminiSseEvent({ data: 'garbage' })).toEqual({});
  });
});
