// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// tests/content-polish-regenerate.test.js
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { loadContentScript } from './helpers/content-script.js';

let h;
beforeAll(async () => {
  // A stand-in for window.navigation, which happy-dom lacks; the page
  // translation looks for it when the content script loads.
  Object.defineProperty(window, 'navigation', { value: new EventTarget(), configurable: true });
  h = await loadContentScript();
});

describe('regenerating a version in the page', () => {
  beforeEach(() => h.reset());
  afterEach(() => document.getElementById('parsipad-host')?.remove());

  const settle = async (rounds = 5) => {
    for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const box = () => {
    const host = document.getElementById('parsipad-host');
    return host ? h.roots.get(host) : null;
  };

  // Regenerate sent only the original text, so the worker could not know
  // what the writer had rejected and often handed back a near copy.
  it('sends the version on the card as the one to replace', async () => {
    h.respond = (message) => {
      if (message.action === 'POLISH') return { professional: 'Please improve this.', conversational: 'Make it better.', concise: 'Improve.', provider: 'claude' };
      if (message.action === 'REGENERATE_POLISH_VARIANT') return { text: 'Kindly improve this.' };
      return undefined;
    };
    h.onMessage({ action: 'SHOW_POLISH', text: 'make this better' });
    await settle();
    box().querySelector('.parsipad-polish-card[data-variant="professional"] .parsipad-polish-regenerate').click();
    await settle();
    const sent = h.sent.find((m) => m.action === 'REGENERATE_POLISH_VARIANT');
    expect(sent).toMatchObject({ text: 'make this better', variant: 'professional', previous: 'Please improve this.' });
  });
});
