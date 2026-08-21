import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ apiKey: 'key', provider: null }));

vi.mock('../lib/providers/index.js', () => ({
  getCurrentProvider: async () => state.provider,
  getCurrentApiKey: async () => state.apiKey
}));

import { translate, explainGrammar } from '../lib/api.js';
import { WORD_SCHEMA, SENTENCE_SCHEMA, GRAMMAR_POINTS_SCHEMA } from '../lib/translation/schemas.js';

function fakeProvider() {
  return {
    config: { displayName: 'Fake', maxTokens: 1024 },
    complete: vi.fn(),
    stream: vi.fn()
  };
}

const baseRequest = { text: 'charge', mode: 'word', fromName: 'English', toName: 'Persian', direction: 'en-fa' };

describe('translate', () => {
  beforeEach(() => {
    state.apiKey = 'key';
    state.provider = fakeProvider();
  });

  it('uses structured completion for word mode with the agreed settings', async () => {
    state.provider.complete.mockResolvedValue({ text: JSON.stringify({ translation: 'هزينه', detectedSource: 'en', senses: [] }), inputTokens: 3, outputTokens: 2, truncated: false });
    const result = await translate({ ...baseRequest, context: { before: 'they will ', after: ' you' } });
    expect(result.translation).toBe('هزينه');
    expect(result.senses).toEqual([]);
    expect(result.inputTokens).toBe(3);
    const call = state.provider.complete.mock.calls[0][0];
    expect(call.responseSchema).toBe(WORD_SCHEMA);
    expect(call.temperature).toBe(0.2);
    expect(call.maxTokens).toBe(700);
    expect(call.userPrompt).toContain('<context before>they will </context before>');
    expect(call.systemPrompt).toMatch(/up to five distinct senses/);
    expect(state.provider.stream).not.toHaveBeenCalled();
  });

  it('uses the sentence schema for sentence mode', async () => {
    state.provider.complete.mockResolvedValue({ text: '{"translation":"x","alternatives":[]}', inputTokens: 0, outputTokens: 0, truncated: false });
    await translate({ ...baseRequest, mode: 'sentence', text: 'Go home.' });
    expect(state.provider.complete.mock.calls[0][0].responseSchema).toBe(SENTENCE_SCHEMA);
    expect(state.provider.complete.mock.calls[0][0].maxTokens).toBe(900);
  });

  it('throws TRUNCATED for a cut-off structured reply', async () => {
    state.provider.complete.mockResolvedValue({ text: '{"translation":"x', inputTokens: 0, outputTokens: 0, truncated: true });
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'TRUNCATED' });
  });

  it('throws PARSE_FAILED when the reply is not JSON', async () => {
    state.provider.complete.mockResolvedValue({ text: 'plain text', inputTokens: 0, outputTokens: 0, truncated: false });
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('streams text mode and returns partial text with a truncated flag', async () => {
    state.provider.stream.mockImplementation(async ({ onDelta }) => {
      onDelta('سلام ');
      onDelta('دنیا');
      return { text: 'سلام دنیا', inputTokens: 4, outputTokens: 2, truncated: true };
    });
    const deltas = [];
    const result = await translate({ ...baseRequest, mode: 'text', text: 'Hello world. Bye.', onDelta: d => deltas.push(d) });
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ translation: 'سلام دنیا', truncated: true, inputTokens: 4, outputTokens: 2 });
    const call = state.provider.stream.mock.calls[0][0];
    expect(call.responseSchema).toBeUndefined();
    expect(call.maxTokens).toBe(400 + 2 * 'Hello world. Bye.'.length);
    expect(call.systemPrompt).toMatch(/Output only the translation/);
    expect(state.provider.complete).not.toHaveBeenCalled();
  });

  it('throws API_KEY_NOT_SET without a key', async () => {
    state.apiKey = null;
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'API_KEY_NOT_SET' });
  });

  it('wraps provider network failures', async () => {
    state.provider.complete.mockRejectedValue(new Error('Failed to fetch'));
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('explainGrammar', () => {
  beforeEach(() => {
    state.apiKey = 'key';
    state.provider = fakeProvider();
  });

  it('asks for grammar points with the grammar schema and passes both sides', async () => {
    state.provider.complete.mockResolvedValue({ text: JSON.stringify({ grammar: [{ point: 'Present perfect', explanation: 'x' }] }), inputTokens: 1, outputTokens: 1, truncated: false });
    const result = await explainGrammar('I have been waiting.', 'منتظر بوده‌ام.', 'en-fa');
    expect(result.grammar).toEqual([{ point: 'Present perfect', explanation: 'x' }]);
    const call = state.provider.complete.mock.calls[0][0];
    expect(call.responseSchema).toBe(GRAMMAR_POINTS_SCHEMA);
    expect(call.temperature).toBe(0.3);
    expect(call.maxTokens).toBe(800);
    expect(call.userPrompt).toContain('<source lang="English">I have been waiting.</source>');
  });
});
