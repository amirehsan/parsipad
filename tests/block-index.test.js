// tests/block-index.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const requestTranslation = vi.fn();
vi.mock('../lib/translation/client.js', () => ({ requestTranslation }));

const { initBlockTranslate, teardownBlockTranslate, translateBlock, setEnabled } =
  await import('../content/blocks/index.js');
const { activeBlockIds, clearAllRendered } = await import('../content/blocks/render.js');

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
      onChanged: { addListener: vi.fn() }
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
