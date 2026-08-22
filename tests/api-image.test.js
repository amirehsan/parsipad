import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ apiKey: 'key', provider: null }));

vi.mock('../lib/providers/index.js', () => ({
  getCurrentProvider: async () => state.provider,
  getCurrentApiKey: async () => state.apiKey
}));

import { translateImage } from '../lib/api.js';
import { IMAGE_SCHEMA } from '../lib/translation/schemas.js';

/**
 * The image path used to send no temperature and no schema, and to read the
 * model's reply field by field with `|| ''`. That combination is what let a
 * run come back with the translation missing, or with the source text simply
 * echoed back, and still be presented as a successful result.
 */
function fakeProvider() {
  return {
    config: { displayName: 'Fake', maxTokens: 1024 },
    vision: vi.fn()
  };
}

const reply = (obj, extra = {}) => ({
  text: JSON.stringify(obj),
  truncated: false,
  inputTokens: 5,
  outputTokens: 7,
  ...extra
});

describe('translateImage', () => {
  beforeEach(() => {
    state.apiKey = 'key';
    state.provider = fakeProvider();
  });

  it('pins the sampling temperature and asks for the image schema', async () => {
    state.provider.vision.mockResolvedValue(
      reply({ extractedText: 'Hello', translation: 'سلام', direction: 'en-fa' })
    );

    const result = await translateImage('base64', 'image/png');

    const call = state.provider.vision.mock.calls[0][0];
    // Without these two the request inherited the provider default, around
    // 1.0, and had nothing constraining the reply's shape.
    expect(call.temperature).toBe(0.2);
    expect(call.responseSchema).toBe(IMAGE_SCHEMA);
    expect(result).toMatchObject({ extractedText: 'Hello', translation: 'سلام', direction: 'en-fa' });
  });

  it('gives the reply room for the extracted text and its translation', async () => {
    state.provider.vision.mockResolvedValue(reply({ extractedText: 'a', translation: 'b', direction: 'en-fa' }));
    await translateImage('base64', 'image/png');
    // One budget covers both sides, so the usable room per side is half.
    expect(state.provider.vision.mock.calls[0][0].maxTokens).toBe(4096);
  });

  it('reports a cut-off reply instead of returning half a translation', async () => {
    state.provider.vision.mockResolvedValue(
      reply({ extractedText: 'a long sign', translation: 'يك' }, { truncated: true })
    );
    await expect(translateImage('base64', 'image/png')).rejects.toMatchObject({ code: 'TRUNCATED' });
  });

  it('asks for the unsupported flag, so the branch reading it is reachable', async () => {
    // Strict schema modes forbid keys that are not declared and required.
    // If `unsupported` is dropped from the schema the model physically cannot
    // send it, and the check below becomes dead code that never fires.
    expect(IMAGE_SCHEMA.properties.unsupported).toEqual({
      type: 'boolean',
      description: expect.any(String)
    });
    expect(IMAGE_SCHEMA.required).toContain('unsupported');
  });

  it('acts on the unsupported flag the image prompt asks for', async () => {
    // The prompt tells the model to answer exactly this for text that is
    // neither Persian nor English. The old code read the absent fields as
    // empty strings and showed a blank card with no explanation.
    state.provider.vision.mockResolvedValue(reply({ unsupported: true }));
    await expect(translateImage('base64', 'image/png')).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('clamps a direction outside the enum, which the badge prints verbatim', async () => {
    state.provider.vision.mockResolvedValue(
      reply({ extractedText: 'Hello', translation: 'سلام', direction: 'English to Persian' })
    );
    const result = await translateImage('base64', 'image/png');
    expect(result.direction).toBe('unknown');
  });

  it('keeps a legitimate empty read rather than treating it as a failure', async () => {
    // An image with no legible text is a real outcome, not an error.
    state.provider.vision.mockResolvedValue(
      reply({ extractedText: '', translation: '', direction: 'unknown' })
    );
    const result = await translateImage('base64', 'image/png');
    expect(result).toMatchObject({ extractedText: '', translation: '', direction: 'unknown' });
  });

  it('trims whitespace the model pads its fields with', async () => {
    state.provider.vision.mockResolvedValue(
      reply({ extractedText: '  Hello  ', translation: '  سلام  ', direction: 'en-fa' })
    );
    const result = await translateImage('base64', 'image/png');
    expect(result.extractedText).toBe('Hello');
    expect(result.translation).toBe('سلام');
  });
});
