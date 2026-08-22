// tests/speech.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function installSpeechStub() {
  const spoken = [];
  globalThis.speechSynthesis = {
    speaking: false,
    cancel: vi.fn(),
    speak: vi.fn((u) => { spoken.push(u); }),
    getVoices: () => [
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Dariush', lang: 'fa-IR' }
    ]
  };
  globalThis.SpeechSynthesisUtterance = function (text) { this.text = text; };
  return spoken;
}

describe('speech', () => {
  let speech;
  beforeEach(async () => {
    installSpeechStub();
    vi.resetModules();
    speech = await import('../shared/speech.js');
  });

  it('speaks English', () => {
    expect(speech.canSpeak('hello there')).toBe(true);
  });

  it('refuses Persian, because browser Persian voices are not worth shipping', () => {
    expect(speech.canSpeak('سلام دنیا')).toBe(false);
  });

  it('refuses empty text', () => {
    expect(speech.canSpeak('')).toBe(false);
    expect(speech.canSpeak(null)).toBe(false);
  });

  it('reports unavailable when the API is missing', async () => {
    delete globalThis.speechSynthesis;
    vi.resetModules();
    const fresh = await import('../shared/speech.js');
    expect(fresh.canSpeak('hello')).toBe(false);
  });

  it('picks an English voice and never a Persian one', () => {
    const spoken = installSpeechStub();
    speech.speak('hello');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice?.lang || spoken[0].lang).toMatch(/^en/);
  });

  it('does not speak Persian even if asked directly', () => {
    const spoken = installSpeechStub();
    speech.speak('سلام');
    expect(spoken).toHaveLength(0);
  });

  it('cancels any current utterance before starting a new one', () => {
    speech.speak('one');
    speech.speak('two');
    expect(globalThis.speechSynthesis.cancel).toHaveBeenCalled();
  });

  it('reports playback state to the caller', () => {
    const spoken = installSpeechStub();
    const onStateChange = vi.fn();
    speech.speak('hello', { onStateChange });
    spoken[0].onstart();
    expect(onStateChange).toHaveBeenCalledWith(true);
    spoken[0].onend();
    expect(onStateChange).toHaveBeenCalledWith(false);
  });

  it('cancelSpeech stops whatever is playing', () => {
    speech.speak('hello');
    speech.cancelSpeech();
    expect(globalThis.speechSynthesis.cancel).toHaveBeenCalled();
  });
});
