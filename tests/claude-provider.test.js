import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeProvider, parseClaudeSseEvent } from '../lib/providers/claude-provider.js';
import { PROVIDER_CONFIGS } from '../lib/constants.js';
import { WORD_SCHEMA } from '../lib/translation/schemas.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function sseResponse(text) {
  return new Response(new TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('ClaudeProvider', () => {
  let provider;
  let requests;

  beforeEach(() => {
    provider = new ClaudeProvider(PROVIDER_CONFIGS.claude);
    requests = [];
  });

  it('sends temperature and structured output config, reports truncation', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ content: [{ type: 'text', text: '{"translation":"x"}' }], stop_reason: 'max_tokens', usage: { input_tokens: 11, output_tokens: 7 } });
    });
    const result = await provider.complete({ systemPrompt: 'sys', userPrompt: 'user', maxTokens: 700, temperature: 0.2, responseSchema: WORD_SCHEMA, apiKey: 'sk-ant-test' });
    expect(result).toEqual({ text: '{"translation":"x"}', inputTokens: 11, outputTokens: 7, truncated: true });
    const body = requests[0];
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(700);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.output_config.format.schema.properties.senses.items.additionalProperties).toBe(false);
    expect(body.stream).toBeUndefined();
  });

  it('omits temperature and output_config when not provided', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage: {} });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', maxTokens: 100, apiKey: 'k' });
    expect(result.truncated).toBe(false);
    expect(requests[0].temperature).toBeUndefined();
    expect(requests[0].output_config).toBeUndefined();
  });

  it('maps 401 to INVALID_API_KEY', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('streams deltas and returns the assembled text', async () => {
    const events = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"سلام "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"دنیا"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    ].join('');
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return sseResponse(events);
    });
    const deltas = [];
    const result = await provider.stream({ systemPrompt: 's', userPrompt: 'u', maxTokens: 500, temperature: 0.2, apiKey: 'k', onDelta: d => deltas.push(d) });
    expect(requests[0].stream).toBe(true);
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ text: 'سلام دنیا', inputTokens: 5, outputTokens: 3, truncated: false });
  });
});

describe('parseClaudeSseEvent', () => {
  it('extracts deltas, usage, truncation and completion', () => {
    expect(parseClaudeSseEvent({ event: 'content_block_delta', data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"a"}}' })).toEqual({ delta: 'a' });
    expect(parseClaudeSseEvent({ event: 'message_delta', data: '{"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":9}}' })).toEqual({ outputTokens: 9, truncated: true });
    expect(parseClaudeSseEvent({ event: 'message_stop', data: '{"type":"message_stop"}' })).toEqual({ done: true });
    expect(parseClaudeSseEvent({ event: 'ping', data: '{"type":"ping"}' })).toEqual({});
    expect(parseClaudeSseEvent({ event: 'message', data: 'not json' })).toEqual({});
  });
  it('throws on error events', () => {
    expect(() => parseClaudeSseEvent({ event: 'error', data: '{"type":"error","error":{"message":"overloaded"}}' })).toThrowError(expect.objectContaining({ code: 'SERVER_ERROR' }));
  });
});
