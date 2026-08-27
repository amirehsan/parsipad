// tests/block-index.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const requestTranslation = vi.fn();
vi.mock('../lib/translation/client.js', () => ({ requestTranslation }));

const { initBlockTranslate, teardownBlockTranslate, translateBlock, setEnabled } =
  await import('../content/blocks/index.js');
const { activeBlockIds, clearAllRendered, renderedTextFor } = await import('../content/blocks/render.js');

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function blockOf(ids, kind = 'leaf') {
  const parts = ids.map((id) => document.getElementById(id));
  return { id: `pp-t${ids.join('')}`, kind, anchor: parts[0], parts, truncated: false };
}

beforeEach(() => {
  requestTranslation.mockReset();
  clearAllRendered();
  document.head.innerHTML = '';
  document.body.innerHTML = `<p id="p">${LONG}</p>`;
  globalThis.chrome = {
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    storage: {
      local: { get: vi.fn().mockResolvedValue({ block_translate_enabled: true }) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
    }
  };
});

afterEach(() => { teardownBlockTranslate(); });

describe('translateBlock', () => {
  it('renders the translation returned for a leaf block', async () => {
    requestTranslation.mockResolvedValue({ translation: 'ترجمه شده' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    await translateBlock(blockOf(['p']));

    expect(document.querySelector('[data-parsipad-translation]')).not.toBeNull();
    expect(requestTranslation).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton before the request resolves', async () => {
    let release;
    requestTranslation.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    const pending = translateBlock(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]')).not.toBeNull();

    release({ translation: 'ترجمه' });
    await pending;
  });

  it('calls onMissingApiKey and removes the node when no key is set', async () => {
    requestTranslation.mockResolvedValue({ error: 'API key not set.', errorCode: 'API_KEY_NOT_SET' });
    const onMissingApiKey = vi.fn();
    initBlockTranslate({ onMissingApiKey });

    await translateBlock(blockOf(['p']));

    expect(onMissingApiKey).toHaveBeenCalledTimes(1);
    expect(activeBlockIds()).toEqual([]);
  });

  it('removes the node silently when the request is aborted', async () => {
    requestTranslation.mockResolvedValue({ error: 'Translation cancelled.', errorCode: 'ABORTED' });
    const onMissingApiKey = vi.fn();
    initBlockTranslate({ onMissingApiKey });

    await translateBlock(blockOf(['p']));

    expect(onMissingApiKey).not.toHaveBeenCalled();
    expect(activeBlockIds()).toEqual([]);
  });

  it('keeps the node and shows an error for any other failure', async () => {
    requestTranslation.mockResolvedValue({ error: 'Rate limited.', errorCode: 'RATE_LIMITED' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    await translateBlock(blockOf(['p']));

    expect(activeBlockIds().length).toBe(1);
  });

  it('does not translate the same block twice', async () => {
    requestTranslation.mockResolvedValue({ translation: 'ترجمه' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    const block = blockOf(['p']);
    await translateBlock(block);
    await translateBlock(block);

    expect(requestTranslation).toHaveBeenCalledTimes(1);
  });

  it('sends a section as one batch request', async () => {
    document.body.innerHTML = `<div><h2 id="h">Title</h2><p id="a">${LONG}</p><p id="b">${LONG}</p></div>`;
    requestTranslation.mockResolvedValue({ translation: '[1] یک\n[2] دو\n[3] سه' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    await translateBlock(blockOf(['h', 'a', 'b'], 'section'));

    expect(requestTranslation).toHaveBeenCalledTimes(1);
    expect(requestTranslation.mock.calls[0][0].mode).toBe('batch');
    expect(document.querySelectorAll('[data-parsipad-translation]').length).toBe(3);
  });

  it('puts a batch failure on the part that failed, not on part zero', async () => {
    document.body.innerHTML = '<div id="w">' +
      Array.from({ length: 25 }, (_, i) => `<p id="p${i}">${LONG} ${i}</p>`).join('') + '</div>';
    const parts = Array.from({ length: 25 }, (_, i) => document.getElementById(`p${i}`));
    let call = 0;
    requestTranslation.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({
          translation: Array.from({ length: 20 }, (_, i) => `[${i + 1}] ترجمه ${i}`).join('\n')
        });
      }
      return Promise.resolve({ error: 'Too many requests.', errorCode: 'RATE_LIMITED' });
    });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    await translateBlock({ id: 'pp-s', kind: 'section', anchor: parts[0], parts, truncated: false });

    // The first batch's work survives instead of being overwritten by the error.
    expect(renderedTextFor('pp-s', 0)).toBe('ترجمه 0');
    // Nothing after the failure is left spinning on a skeleton.
    expect(renderedTextFor('pp-s', 24)).toBeNull();
  });
});

describe('setEnabled', () => {
  it('clears rendered translations when the feature is switched off', async () => {
    requestTranslation.mockResolvedValue({ translation: 'ترجمه' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    await translateBlock(blockOf(['p']));

    setEnabled(false);

    expect(activeBlockIds()).toEqual([]);
  });

  it('refuses to translate while disabled', async () => {
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    setEnabled(false);

    await translateBlock(blockOf(['p']));

    expect(requestTranslation).not.toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('cancels a pending hover frame on teardown', () => {
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = `<main><p id="p">${LONG}</p></main>`;
    document.getElementById('p').dispatchEvent(new Event('mouseover', { bubbles: true }));

    teardownBlockTranslate();

    return new Promise((resolve) => requestAnimationFrame(() => {
      expect(document.querySelectorAll('[data-parsipad-icon]').length).toBe(0);
      resolve();
    }));
  });
});
