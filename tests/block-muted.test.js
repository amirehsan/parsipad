// tests/block-muted.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../lib/translation/client.js', () => ({ requestTranslation: vi.fn() }));

const { initBlockTranslate, teardownBlockTranslate, isBlockTranslateEnabled } =
  await import('../content/blocks/index.js');

let listeners;
function setStorage(values) {
  listeners = [];
  globalThis.chrome = {
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    storage: {
      local: { get: vi.fn().mockResolvedValue(values) },
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => { listeners = listeners.filter((l) => l !== fn); }
      }
    }
  };
}
const change = (changes) => listeners.forEach((fn) => fn(changes, 'local'));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  window.happyDOM.setURL('https://docs.example.com/');
  document.body.innerHTML = '<p>Hello</p>';
});
afterEach(() => { teardownBlockTranslate(); });

describe('block translate on muted sites', () => {
  it('stays off when the host is muted', async () => {
    setStorage({ block_translate_enabled: true, muted_sites: ['example.com'] });
    initBlockTranslate();
    await settle();
    expect(isBlockTranslateEnabled()).toBe(false);
  });

  it('stays on when the list does not cover the host', async () => {
    setStorage({ block_translate_enabled: true, muted_sites: ['notexample.com'] });
    initBlockTranslate();
    await settle();
    expect(isBlockTranslateEnabled()).toBe(true);
  });

  it('turns back on when the host is removed from the list', async () => {
    setStorage({ block_translate_enabled: true, muted_sites: ['example.com'] });
    initBlockTranslate();
    await settle();
    change({ muted_sites: { newValue: [] } });
    expect(isBlockTranslateEnabled()).toBe(true);
  });

  it('turns off when the host is added to the list', async () => {
    setStorage({ block_translate_enabled: true });
    initBlockTranslate();
    await settle();
    expect(isBlockTranslateEnabled()).toBe(true);
    change({ muted_sites: { newValue: ['example.com'] } });
    expect(isBlockTranslateEnabled()).toBe(false);
  });

  it('keeps the stored toggle in charge when the host is not muted', async () => {
    setStorage({ block_translate_enabled: false, muted_sites: [] });
    initBlockTranslate();
    await settle();
    expect(isBlockTranslateEnabled()).toBe(false);
    change({ block_translate_enabled: { newValue: true } });
    expect(isBlockTranslateEnabled()).toBe(true);
  });

  it('does not let the toggle override a mute', async () => {
    setStorage({ block_translate_enabled: false, muted_sites: ['example.com'] });
    initBlockTranslate();
    await settle();
    change({ block_translate_enabled: { newValue: true } });
    expect(isBlockTranslateEnabled()).toBe(false);
  });

  it('a change that arrives before the first read is not clobbered by it', async () => {
    setStorage({ block_translate_enabled: true, muted_sites: [] });
    initBlockTranslate();
    change({ muted_sites: { newValue: ['example.com'] } });
    await settle();
    expect(isBlockTranslateEnabled()).toBe(false);
  });
});
