// tests/block-index.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const requestTranslation = vi.fn();
vi.mock('../lib/translation/client.js', () => ({ requestTranslation }));

const { initBlockTranslate, teardownBlockTranslate, translateBlock, setEnabled } =
  await import('../content/blocks/index.js');
const { activeBlockIds, clearAllRendered, renderedTextFor } = await import('../content/blocks/render.js');
const { currentIconBlock } = await import('../content/blocks/icon.js');

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

  it('accumulates streamed deltas rather than replacing', async () => {
    requestTranslation.mockImplementation((payload, { onDelta }) => {
      onDelta('سلام ');
      onDelta('دنیا');
      return Promise.resolve({ translation: 'سلام دنیا' });
    });
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = `<main><p id="p">${LONG}</p></main>`;
    const p = document.getElementById('p');

    await translateBlock({ id: 'pp-b1', kind: 'leaf', anchor: p, parts: [p], truncated: false });
    expect(renderedTextFor('pp-b1', 0)).toBe('سلام دنیا');
  });

  // The test above does not discriminate a replacing onDelta from an
  // accumulating one: translateBlock's success path calls apply() once the
  // response resolves, which sets the part to response.translation regardless
  // of what onDelta did along the way, and the mock's final translation here
  // happens to already equal the correctly-accumulated string. A response
  // that never resolves keeps apply() from ever running, so this observes
  // only what onDelta itself wrote.
  it('shows the accumulated text mid-stream, before the response resolves', async () => {
    requestTranslation.mockImplementation((payload, { onDelta }) => {
      onDelta('سلام ');
      onDelta('دنیا');
      return new Promise(() => {});
    });
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = `<main><p id="p">${LONG}</p></main>`;
    const p = document.getElementById('p');

    // Not awaited: the mock's onDelta calls run synchronously before the first
    // real await inside translateLeaf, so they have already landed by the time
    // this call returns control to the test.
    translateBlock({ id: 'pp-mid', kind: 'leaf', anchor: p, parts: [p], truncated: false });

    expect(renderedTextFor('pp-mid', 0)).toBe('سلام دنیا');
  });

  it('shows a message when the concurrency cap drops a click', async () => {
    // Three translations that never settle, so the fourth is capped.
    requestTranslation.mockImplementation(() => new Promise(() => {}));
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = '<main>' +
      Array.from({ length: 4 }, (_, i) => `<p id="p${i}">${LONG} ${i}</p>`).join('') + '</main>';

    for (let i = 0; i < 3; i += 1) {
      const el = document.getElementById(`p${i}`);
      translateBlock({ id: `pp-${i}`, kind: 'leaf', anchor: el, parts: [el], truncated: false });
    }
    const last = document.getElementById('p3');
    await translateBlock({ id: 'pp-3', kind: 'leaf', anchor: last, parts: [last], truncated: false });

    // A node was inserted and it says something, rather than nothing happening.
    expect(document.getElementById('p3').nextElementSibling
      .hasAttribute('data-parsipad-translation')).toBe(true);
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

describe('hover', () => {
  // Placed before "keeps the icon armed": resolve.js mints block ids from a
  // module-scoped counter, and this is the one test in the file that needs
  // its hovered element to land on the same id ('pp-b1') the block below was
  // manually translated under. Running first guarantees that; any hover-
  // triggering test ahead of it would consume the counter and desync the two.
  it('does not offer the icon on a block that is already translated', async () => {
    requestTranslation.mockResolvedValue({ translation: 'ترجمه' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = `<main><p id="p">${LONG}</p></main>`;
    const p = document.getElementById('p');

    await translateBlock({ id: 'pp-b1', kind: 'leaf', anchor: p, parts: [p], truncated: false });
    p.dispatchEvent(new Event('mouseover', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => r()));

    expect(currentIconBlock()).toBeNull();
  });

  it('keeps the icon armed while the pointer rests on it', async () => {
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = `<main><p id="p">${LONG}</p></main>`;

    document.getElementById('p').dispatchEvent(new Event('mouseover', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    expect(currentIconBlock()).not.toBeNull();

    // The pointer travels onto the icon, then the user takes their time.
    document.querySelector('[data-parsipad-icon]')
      .dispatchEvent(new Event('mouseover', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => setTimeout(r, 200));

    // Still armed, so the click that follows actually does something.
    expect(currentIconBlock()).not.toBeNull();
  });

  it('keeps the icon while the pointer strays into the margin beside its block', async () => {
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = `<main><p id="p">${LONG}</p></main>`;
    const p = document.getElementById('p');
    p.getBoundingClientRect = () => ({ top: 300, left: 200, right: 800, bottom: 360, width: 600, height: 60 });

    p.dispatchEvent(new Event('mouseover', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => r()));
    expect(currentIconBlock()).not.toBeNull();

    // The pointer drifts just outside the block, into space that resolves to
    // nothing, and stops there.
    const stray = new MouseEvent('mouseover', { bubbles: true, clientX: 810, clientY: 305 });
    document.querySelector('main').dispatchEvent(stray);
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => setTimeout(r, 400));

    expect(currentIconBlock()).not.toBeNull();
  });

  it('gives up once the pointer is well clear of the block', async () => {
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    document.body.innerHTML = `<main><p id="p">${LONG}</p></main>`;
    const p = document.getElementById('p');
    p.getBoundingClientRect = () => ({ top: 300, left: 200, right: 800, bottom: 360, width: 600, height: 60 });

    p.dispatchEvent(new Event('mouseover', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => r()));

    const far = new MouseEvent('mouseover', { bubbles: true, clientX: 20, clientY: 20 });
    document.querySelector('main').dispatchEvent(far);
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => setTimeout(r, 400));

    expect(currentIconBlock()).toBeNull();
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
