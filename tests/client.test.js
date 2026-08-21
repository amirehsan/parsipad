import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestTranslation } from '../lib/translation/client.js';

function fakePort() {
  const listeners = { message: [], disconnect: [] };
  return {
    posted: [],
    disconnected: false,
    onMessage: { addListener: fn => listeners.message.push(fn) },
    onDisconnect: { addListener: fn => listeners.disconnect.push(fn) },
    postMessage(msg) { this.posted.push(msg); },
    disconnect() { this.disconnected = true; },
    emit(msg) { listeners.message.forEach(fn => fn(msg)); },
    drop() { listeners.disconnect.forEach(fn => fn()); }
  };
}

describe('requestTranslation', () => {
  let port;
  beforeEach(() => {
    port = fakePort();
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg) => ({ translation: 'x', echo: msg })),
        connect: vi.fn(() => port)
      }
    };
  });

  it('sends short inputs as a one-shot TRANSLATE message with the mode', async () => {
    const result = await requestTranslation({ text: 'charge', sourceLang: 'auto', context: { before: 'a' } });
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'TRANSLATE', text: 'charge', sourceLang: 'auto', context: { before: 'a' }, mode: 'word' });
    expect(result.translation).toBe('x');
  });

  it('streams long inputs through the translate-stream port', async () => {
    const deltas = [];
    const promise = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' }, { onDelta: d => deltas.push(d) });
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'translate-stream' });
    expect(port.posted[0]).toEqual({ type: 'start', text: 'One. Two.', sourceLang: 'auto', mode: 'text' });
    port.emit({ type: 'delta', text: 'یک. ' });
    port.emit({ type: 'delta', text: 'دو.' });
    port.emit({ type: 'done', result: { translation: 'یک. دو.' } });
    expect(await promise).toEqual({ translation: 'یک. دو.' });
    expect(deltas).toEqual(['یک. ', 'دو.']);
    expect(port.disconnected).toBe(true);
  });

  it('resolves stream errors as error objects', async () => {
    const promise = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' });
    port.emit({ type: 'error', code: 'TRUNCATED', message: 'cut' });
    expect(await promise).toEqual({ error: 'cut', errorCode: 'TRUNCATED' });
  });

  it('resolves ABORTED when the port drops or the signal fires', async () => {
    const dropped = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' });
    port.drop();
    expect(await dropped).toMatchObject({ errorCode: 'ABORTED' });

    port = fakePort();
    const controller = new AbortController();
    const aborted = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' }, { signal: controller.signal });
    controller.abort();
    expect(await aborted).toMatchObject({ errorCode: 'ABORTED' });
    expect(port.disconnected).toBe(true);
  });

  it('honors an explicit batch mode', async () => {
    requestTranslation({ text: '[1] a', mode: 'batch', sourceLang: 'en' });
    expect(port.posted[0].mode).toBe('batch');
  });
});
