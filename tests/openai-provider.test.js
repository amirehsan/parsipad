import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider, parseOpenAISseEvent } from '../lib/providers/openai-provider.js';
import { PROVIDER_CONFIGS } from '../lib/constants.js';
import { WORD_SCHEMA } from '../lib/translation/schemas.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const sseResponse = (text) => new Response(new TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

describe('OpenAIProvider', () => {
  let provider;
  let requests;

  beforeEach(() => {
    provider = new OpenAIProvider(PROVIDER_CONFIGS.openai);
    requests = [];
  });

  it('sends temperature and a strict json_schema response format, reports truncation', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ choices: [{ message: { content: '{"translation":"x"}' }, finish_reason: 'length' }], usage: { prompt_tokens: 8, completion_tokens: 3 } });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', maxTokens: 700, temperature: 0.2, responseSchema: WORD_SCHEMA, apiKey: 'sk' });
    expect(result).toEqual({ text: '{"translation":"x"}', inputTokens: 8, outputTokens: 3, truncated: true });
    const body = requests[0];
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(700);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe('parsipad_result');
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.stream).toBeUndefined();
  });

  it('surfaces a refusal as an error instead of empty text', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ choices: [{ message: { refusal: 'I cannot help with that' }, finish_reason: 'stop' }], usage: {} }));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'UNKNOWN', message: 'I cannot help with that' });
  });

  it('maps 401 to INVALID_API_KEY', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: 'bad' } }, 401));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('streams deltas with usage and stops at [DONE]', async () => {
    const events = [
      'data: {"choices":[{"delta":{"content":"سلام "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"دنیا"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":6,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n'
    ].join('');
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return sseResponse(events);
    });
    const deltas = [];
    const result = await provider.stream({ systemPrompt: 's', userPrompt: 'u', maxTokens: 500, temperature: 0.2, apiKey: 'k', onDelta: d => deltas.push(d) });
    expect(requests[0].stream).toBe(true);
    expect(requests[0].stream_options).toEqual({ include_usage: true });
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ text: 'سلام دنیا', inputTokens: 6, outputTokens: 2, truncated: false });
  });
});

describe('parseOpenAISseEvent', () => {
  it('extracts deltas, truncation, usage and completion', () => {
    expect(parseOpenAISseEvent({ data: '{"choices":[{"delta":{"content":"a"},"finish_reason":"length"}]}' })).toEqual({ delta: 'a', truncated: true });
    expect(parseOpenAISseEvent({ data: '{"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2}}' })).toEqual({ inputTokens: 1, outputTokens: 2 });
    expect(parseOpenAISseEvent({ data: '[DONE]' })).toEqual({ done: true });
    expect(parseOpenAISseEvent({ data: 'nope' })).toEqual({});
  });
});
