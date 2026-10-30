// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// The floating box six seconds into a request with no reply says the
// provider is slow, above the skeleton cards, and the notice goes with them
// when the reply lands. Driven through the real content script.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { loadContentScript } from './helpers/content-script.js';
import { functionBody } from './helpers/source.js';

const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

const POLISHED = { professional: 'Thanks a lot.', conversational: 'Thanks so much.', concise: 'Thanks.', provider: 'claude' };

let h;
beforeAll(async () => {
  Object.defineProperty(window, 'navigation', { value: new EventTarget(), configurable: true });
  h = await loadContentScript();
});

beforeEach(() => {
  h.reset();
  h.setUiLanguage('en');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.getElementById('parsipad-host')?.remove();
});

const box = () => {
  const host = document.getElementById('parsipad-host');
  return host ? h.roots.get(host) : null;
};
const notice = () => box()?.querySelector('.parsipad-wait-notice') ?? null;
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('a slow reply in the floating box', () => {
  it('says the provider is slow six seconds into a Polish request, above the skeletons', async () => {
    h.store.set('selectedProvider', 'gemini');
    const reply = deferred();
    h.respond = (message) => (message.action === 'POLISH' ? reply.promise : undefined);
    h.onMessage({ action: 'SHOW_POLISH', text: 'thanks for help yesterday' });
    await vi.advanceTimersByTimeAsync(5999);
    expect(notice()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(notice()).not.toBeNull();
    expect(notice().textContent).toContain('Gemini is taking longer than usual');
    expect(notice().getAttribute('dir')).toBe('ltr');
    // Above the cards, so it is read without scrolling.
    const content = box().querySelector('.parsipad-polish-content');
    expect(content.firstElementChild).toBe(notice());
    expect(content.querySelectorAll('.parsipad-skeleton').length).toBeGreaterThan(0);

    reply.resolve(POLISHED);
    await flush();
    await flush();
    expect(box().querySelector('.parsipad-polish-card[data-variant="concise"] .parsipad-polish-text').textContent).toBe('Thanks.');
    expect(notice()).toBeNull();
  });

  it('never puts the notice over a result that arrived first', async () => {
    h.respond = (message) => (message.action === 'POLISH' ? POLISHED : undefined);
    h.onMessage({ action: 'SHOW_POLISH', text: 'thanks for help yesterday' });
    await flush();
    await flush();
    expect(box().querySelector('.parsipad-polish-card[data-variant="concise"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(7000);
    expect(notice()).toBeNull();
  });

  it('names the default provider when none was chosen, and covers Translate', async () => {
    const reply = deferred();
    h.respond = (message) => (message.action === 'TRANSLATE' ? reply.promise : undefined);
    h.onMessage({ action: 'SHOW_TRANSLATION', text: 'The cat sat on the mat.' });
    await vi.advanceTimersByTimeAsync(6000);
    await flush();
    expect(notice()).not.toBeNull();
    expect(notice().textContent).toContain('Claude is taking longer than usual');
    reply.resolve({ error: 'Translation service unavailable. Please try again.', errorCode: 'SERVER_ERROR' });
    await flush();
    await flush();
    expect(box().querySelector('.parsipad-error')).not.toBeNull();
    expect(notice()).toBeNull();
  });

  it('is worded in Persian, right to left, in the Persian interface', async () => {
    h.setUiLanguage('fa');
    h.store.set('selectedProvider', 'gemini');
    const reply = deferred();
    h.respond = (message) => (message.action === 'POLISH' ? reply.promise : undefined);
    h.onMessage({ action: 'SHOW_POLISH', text: 'thanks for help yesterday' });
    await vi.advanceTimersByTimeAsync(6000);
    await flush();
    expect(notice().textContent.trim()).toBe(translations.fa.slowReply.replace('{provider}', 'Gemini'));
    expect(notice().getAttribute('dir')).toBe('rtl');
    reply.resolve(POLISHED);
  });

  // A streamed translation shows its first words in place of the skeleton;
  // once they arrive the provider is plainly answering.
  it('stops watching once a streamed reply starts arriving', () => {
    const body = functionBody(js, 'translateAndShow');
    expect(body).toMatch(/onDelta: \(delta\) => \{\s*stopSlowWatch\(\);/);
  });
});
