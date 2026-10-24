import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Window } from 'happy-dom';
import { createFirstRun } from '../popup/first-run.js';
import { renderKeyHelp } from '../lib/key-help.js';
import { t } from '../lib/i18n.js';
import { normalizeApiKey } from '../lib/storage.js';

const root = path.resolve(__dirname, '..');
const popupHtml = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const section = popupHtml.match(/<section id="first-run"[\s\S]*?<\/section>/)[0];

let doc;
let actionBtn;
let stored;
let selected;
let needsKey;
let testKey;
let ctl;

function setup({ result = { ok: true, model: 'm', ms: 12 } } = {}) {
  const window = new Window();
  doc = window.document;
  globalThis.document = doc;
  doc.body.innerHTML = `${section}<button id="action-btn">Translate</button>`;
  actionBtn = doc.getElementById('action-btn');
  stored = {};
  selected = 'claude';
  needsKey = null;
  testKey = vi.fn().mockResolvedValue(result);
  const storage = {
    getSelectedProvider: async () => selected,
    setSelectedProvider: vi.fn(async (id) => { selected = id; }),
    getProviderApiKey: async (id) => stored[id] || null,
    setProviderApiKey: vi.fn(async (id, key) => { stored[id] = key; }),
    normalizeApiKey
  };
  ctl = createFirstRun({
    doc,
    getLang: () => 'en',
    onNeedsKeyChange: (needs) => { needsKey = needs; actionBtn.disabled = needs; },
    storage,
    testKey
  });
  ctl.bind();
  return storage;
}

const keyInput = () => doc.getElementById('first-run-key');
const status = () => doc.getElementById('first-run-status');
const radio = (value) => doc.querySelector(`input[name="first-run-provider"][value="${value}"]`);

async function type(value) {
  keyInput().value = value;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('first run key section', () => {
  it('shows with the how-to open when the selected provider has no key', async () => {
    setup();
    await ctl.check();
    expect(doc.getElementById('first-run').hidden).toBe(false);
    expect(needsKey).toBe(true);
    expect(actionBtn.disabled).toBe(true);
    expect(doc.querySelector('#first-run-help details').open).toBe(true);
  });

  it('hides when the selected provider already has a key', async () => {
    setup();
    stored.claude = 'sk-ant-have';
    await ctl.check();
    expect(doc.getElementById('first-run').hidden).toBe(true);
    expect(actionBtn.disabled).toBe(false);
  });

  it('a rejected key is never stored and Translate stays disabled', async () => {
    const storage = setup({ result: { ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' } });
    await ctl.check();
    await type('sk-ant-wrong');

    await ctl.submit();

    expect(testKey).toHaveBeenCalledWith('claude', 'sk-ant-wrong');
    expect(storage.setProviderApiKey).not.toHaveBeenCalled();
    expect(keyInput().value).toBe('sk-ant-wrong');
    expect(status().textContent).toBe('Test failed. Invalid API key. Please check settings.');
    expect(status().dataset.state).toBe('error');
    expect(doc.getElementById('first-run').hidden).toBe(false);
    expect(actionBtn.disabled).toBe(true);
  });

  it('a rejected key does not unlock Translate after flipping the provider away and back', async () => {
    setup({ result: { ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' } });
    await ctl.check();
    await type('sk-ant-wrong');
    await ctl.submit();

    radio('gemini').checked = true;
    radio('gemini').dispatchEvent(new doc.defaultView.Event('change'));
    await vi.advanceTimersByTimeAsync(0);
    radio('claude').checked = true;
    radio('claude').dispatchEvent(new doc.defaultView.Event('change'));
    await vi.advanceTimersByTimeAsync(0);

    expect(selected).toBe('claude');
    expect(doc.getElementById('first-run').hidden).toBe(false);
    expect(actionBtn.disabled).toBe(true);
  });

  it('stores an accepted key after the test and hides 1500 ms after the result', async () => {
    const storage = setup();
    await ctl.check();
    await type('  "sk-ant-good"  ');

    await ctl.submit();

    expect(testKey).toHaveBeenCalledWith('claude', 'sk-ant-good');
    expect(storage.setProviderApiKey).toHaveBeenCalledWith('claude', 'sk-ant-good');
    expect(status().textContent).toBe('Key works. m replied in 12 ms.');
    expect(doc.getElementById('first-run').hidden).toBe(false);
    expect(ctl.isHolding()).toBe(true);

    await vi.advanceTimersByTimeAsync(1499);
    expect(doc.getElementById('first-run').hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(doc.getElementById('first-run').hidden).toBe(true);
    expect(actionBtn.disabled).toBe(false);
    expect(ctl.isHolding()).toBe(false);
  });

  it('locks the provider radios while a test is in flight', async () => {
    setup();
    await ctl.check();
    await type('sk-ant-x');
    let release;
    testKey.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const pending = ctl.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.querySelector('#first-run fieldset').disabled).toBe(true);
    expect(doc.getElementById('first-run-test').disabled).toBe(true);

    release({ ok: false, code: 'NETWORK', message: 'Check your internet connection.' });
    await pending;
    expect(doc.querySelector('#first-run fieldset').disabled).toBe(false);
    expect(doc.getElementById('first-run-test').disabled).toBe(false);
  });

  it('ignores a result for a provider that is no longer selected', async () => {
    const storage = setup();
    await ctl.check();
    await type('sk-ant-x');
    testKey.mockImplementation(async () => {
      selected = 'gemini';
      return { ok: true, model: 'm', ms: 1 };
    });

    await ctl.submit();

    expect(storage.setProviderApiKey).not.toHaveBeenCalled();
    expect(radio('gemini').checked).toBe(true);
    expect(doc.getElementById('first-run').hidden).toBe(false);
  });

  it('does not send a request when nothing is typed', async () => {
    setup();
    await ctl.check();

    await ctl.submit();

    expect(testKey).not.toHaveBeenCalled();
    expect(status().textContent).toBe(t('pleaseEnterApiKey', 'en'));
  });

  it('picks up a key added in Settings after a failed test', async () => {
    setup({ result: { ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' } });
    await ctl.check();
    await type('sk-ant-wrong');
    testKey.mockImplementation(async () => {
      stored.claude = 'sk-ant-from-settings';
      return { ok: false, code: 'INVALID_API_KEY', message: 'Invalid API key. Please check settings.' };
    });

    await ctl.submit();

    expect(doc.getElementById('first-run').hidden).toBe(true);
    expect(actionBtn.disabled).toBe(false);
  });
});

describe('key help open state', () => {
  it('is collapsed by default, as in Settings', () => {
    setup();
    expect(renderKeyHelp('claude', 'en').querySelector('details').open).toBe(false);
  });

  it('carries the open state across the language toggle', () => {
    setup();
    const block = renderKeyHelp('claude', 'en', { open: true });
    doc.body.append(block);
    block.querySelector('.key-help-lang').click();
    expect(doc.querySelector('.key-help details').open).toBe(true);
    expect(doc.querySelector('.key-help details').getAttribute('lang')).toBe('fa');
  });
});

describe('settings page', () => {
  it('has no hard-coded "Get your API key from" hints above the key help', () => {
    const settingsHtml = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
    expect(settingsHtml).not.toMatch(/Get your API key from/);
    expect(settingsHtml).not.toMatch(/class="input-hint"/);
  });

  it('uses the Persian font on the pill only when the pill is Persian', () => {
    for (const file of ['popup/popup.css', 'settings/settings.css']) {
      const css = fs.readFileSync(path.join(root, file), 'utf8');
      expect(css, file).toMatch(/\.key-help-lang\[lang="fa"\]\s*\{[^}]*var\(--font-persian\)/);
      expect(css, file).not.toMatch(/\.key-help-lang\s*\{[^}]*font-persian/);
    }
  });
});
