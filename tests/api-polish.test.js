import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ apiKey: 'key', provider: null }));

vi.mock('../lib/providers/index.js', () => ({
  getCurrentProvider: async () => state.provider,
  getCurrentApiKey: async () => state.apiKey
}));

import { polish, regeneratePolishVariant } from '../lib/api.js';
import { POLISH_PROMPT, POLISH_VARIANT_PROMPT } from '../lib/translation/prompts.js';
import { TranslationError, ERROR_CODES } from '../lib/translation/errors.js';

const timedOut = () => Object.assign(new Error('Request timed out'), { name: 'TimeoutError' });

function fakeProvider() {
  return { config: { displayName: 'Fake', maxTokens: 1024 }, complete: vi.fn() };
}

const THREE = {
  professional: 'Thanks for your help yesterday.',
  conversational: 'Thanks for the help yesterday.',
  concise: 'Thanks for yesterday.'
};
const reply = (text, truncated = false) => ({ text, inputTokens: 5, outputTokens: 7, truncated });

describe('polish', () => {
  beforeEach(() => {
    state.apiKey = 'key';
    state.provider = fakeProvider();
  });

  // Measured on Gemini Flash-Lite: 15 to 47 seconds for a three-version reply
  // against a 30 second per-attempt timeout, so a slow reply was thrown away
  // and the user shown an error with nothing wrong but the wait.
  it('sends the shared prompt, the tagged text, the polish temperature and a timeout a slow provider can meet', async () => {
    state.provider.complete.mockResolvedValue(reply(JSON.stringify(THREE)));
    await polish('thanks for help yesterday');
    const call = state.provider.complete.mock.calls[0][0];
    expect(call.systemPrompt).toBe(POLISH_PROMPT);
    expect(call.userPrompt).toContain('<text>\nthanks for help yesterday\n</text>');
    expect(call.temperature).toBe(0.5);
    expect(call.maxTokens).toBe(2048);
    expect(call.timeoutMs).toBe(60000);
  });

  // The prompt used to ask for a corrections list that no surface rendered.
  it('returns the three versions and the token counts, and nothing else from the reply', async () => {
    state.provider.complete.mockResolvedValue(reply(JSON.stringify({ ...THREE, corrections: [{ original: 'x', corrected: 'y' }] })));
    const result = await polish('thanks for help yesterday');
    expect(result).toEqual({ ...THREE, inputTokens: 5, outputTokens: 7 });
  });

  it('throws TRUNCATED when the reply was cut off', async () => {
    state.provider.complete.mockResolvedValue(reply('{"professional": "Thanks', true));
    await expect(polish('x')).rejects.toMatchObject({ code: 'TRUNCATED' });
  });

  it('throws PARSE_FAILED when the reply is not JSON', async () => {
    state.provider.complete.mockResolvedValue(reply('Here you go.'));
    await expect(polish('x')).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('throws UNSUPPORTED when the model says the text is not in Latin letters', async () => {
    state.provider.complete.mockResolvedValue(reply('{"unsupported": true}'));
    await expect(polish('x')).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  // The shared timeout message says the translation took too long, which
  // is the wrong word on a Polish card.
  it('reports a timeout as Polish taking too long', async () => {
    state.provider.complete.mockRejectedValue(timedOut());
    await expect(polish('thanks for help yesterday')).rejects.toMatchObject({ code: 'POLISH_TIMEOUT' });
  });

  it('passes every other failure through unchanged', async () => {
    state.provider.complete.mockRejectedValue(new TranslationError(ERROR_CODES.INVALID_API_KEY));
    await expect(polish('x')).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });
});

describe('regeneratePolishVariant', () => {
  beforeEach(() => {
    state.apiKey = 'key';
    state.provider = fakeProvider();
  });

  // Regenerate never saw the version the writer had rejected and sent no
  // temperature, so it could hand back a near copy.
  it('sends the single-version prompt with the rejected version, a warmer temperature and the long timeout', async () => {
    state.provider.complete.mockResolvedValue(reply('Thank you for yesterday.\n'));
    const result = await regeneratePolishVariant('thanks for help yesterday', 'professional', 'Thanks for your help yesterday.');
    const call = state.provider.complete.mock.calls[0][0];
    expect(call.systemPrompt).toBe(POLISH_VARIANT_PROMPT);
    expect(call.userPrompt).toContain('<text>\nthanks for help yesterday\n</text>');
    expect(call.userPrompt).toContain('<previous>\nThanks for your help yesterday.\n</previous>');
    expect(call.userPrompt).toMatch(/professional/);
    expect(call.temperature).toBe(0.7);
    expect(call.maxTokens).toBe(1024);
    expect(call.timeoutMs).toBe(60000);
    expect(result).toEqual({ text: 'Thank you for yesterday.', inputTokens: 5, outputTokens: 7 });
  });

  it('drops quotation marks a model wraps around the whole text', async () => {
    state.provider.complete.mockResolvedValue(reply('"Thank you for yesterday."'));
    const result = await regeneratePolishVariant('x', 'concise', 'y');
    expect(result.text).toBe('Thank you for yesterday.');
  });

  it('throws TRUNCATED when the reply was cut off', async () => {
    state.provider.complete.mockResolvedValue(reply('Thank you for', true));
    await expect(regeneratePolishVariant('x', 'concise', 'y')).rejects.toMatchObject({ code: 'TRUNCATED' });
  });

  it('reports a timeout as Polish taking too long', async () => {
    state.provider.complete.mockRejectedValue(timedOut());
    await expect(regeneratePolishVariant('x', 'concise', 'y')).rejects.toMatchObject({ code: 'POLISH_TIMEOUT' });
  });
});
