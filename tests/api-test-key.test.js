import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/providers/index.js', () => ({ getProviderById: vi.fn(), getCurrentProvider: vi.fn(), getCurrentApiKey: vi.fn() }));

import { getProviderById } from '../lib/providers/index.js';
import { testApiKey } from '../lib/api.js';
import { TranslationError, ERROR_CODES, errorI18nKey } from '../lib/translation/errors.js';
import { KEY_HELP, describeKeyTest } from '../lib/key-help.js';
import { translations, t } from '../lib/i18n.js';

describe('testApiKey', () => {
  beforeEach(() => {
    getProviderById.mockReset();
  });

  it('reports ok with the model and timing', async () => {
    const complete = vi.fn().mockResolvedValue({ text: 'OK' });
    getProviderById.mockReturnValue({ config: { model: 'claude-haiku-5-5' }, complete });

    const r = await testApiKey('claude', 'sk-ant-x');

    expect(getProviderById).toHaveBeenCalledWith('claude');
    expect(r.ok).toBe(true);
    expect(r.model).toBe('claude-haiku-5-5');
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it('sends one tiny request with the key it was given', async () => {
    const complete = vi.fn().mockResolvedValue({ text: 'OK' });
    getProviderById.mockReturnValue({ config: { model: 'm' }, complete });

    await testApiKey('claude', 'sk-ant-given');

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith({
      systemPrompt: 'Reply with the single word OK.',
      userPrompt: 'OK',
      maxTokens: 5,
      apiKey: 'sk-ant-given',
      timeoutMs: 15000
    });
  });

  it('reports the provider error code with the localized message', async () => {
    getProviderById.mockReturnValue({ config: { model: 'm' }, complete: vi.fn().mockRejectedValue(new TranslationError(ERROR_CODES.INVALID_API_KEY)) });

    const r = await testApiKey('claude', 'bad');

    expect(r).toMatchObject({ ok: false, code: 'INVALID_API_KEY' });
    expect(r.message).toBe(t(errorI18nKey(ERROR_CODES.INVALID_API_KEY), 'en'));
  });

  it('maps a raw network failure through toTranslationError', async () => {
    getProviderById.mockReturnValue({ config: { model: 'm' }, complete: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });

    const r = await testApiKey('claude', 'sk-ant-x');

    expect(r).toMatchObject({ ok: false, code: 'NETWORK' });
  });

  it('reports an unknown provider as a failure instead of throwing', async () => {
    getProviderById.mockImplementation(() => { throw new Error('Unknown provider: nope'); });

    const r = await testApiKey('nope', 'k');

    expect(r.ok).toBe(false);
    expect(r.code).toBe('UNKNOWN');
  });
});

describe('key help', () => {
  it('every provider has three localized steps and a cost note', () => {
    expect(Object.keys(KEY_HELP).sort()).toEqual(['claude', 'gemini', 'openai']);
    for (const [provider, help] of Object.entries(KEY_HELP)) {
      expect(help.url, provider).toMatch(/^https:\/\//);
      expect(help.steps).toHaveLength(3);
      for (const key of [...help.steps, help.cost]) {
        expect(translations.en[key], key).toBeTruthy();
        expect(translations.fa[key], key).toBeTruthy();
      }
    }
  });

  it('the language pill switches only the how-to', async () => {
    const { Window } = await import('happy-dom');
    const window = new Window();
    globalThis.document = window.document;
    const { renderKeyHelp } = await import('../lib/key-help.js');
    const en = renderKeyHelp('claude', 'en');
    document.body.append(en);
    expect(en.querySelector('details').getAttribute('dir')).toBe('ltr');
    expect(en.querySelector('summary .key-help-lang')).toBeNull();
    const pill = en.querySelector('.key-help-lang');
    expect(pill.textContent).toBe('فارسی');
    pill.click();
    const fa = document.querySelector('.key-help');
    expect(document.querySelectorAll('.key-help')).toHaveLength(1);
    expect(fa.querySelector('details').getAttribute('lang')).toBe('fa');
    expect(fa.querySelector('details').getAttribute('dir')).toBe('rtl');
    expect(fa.querySelector('.key-help-lang').textContent).toBe('English');
    expect(document.activeElement).toBe(fa.querySelector('.key-help-lang'));
  });

  it('builds the step 1 link and the key prefix without innerHTML', async () => {
    const { Window } = await import('happy-dom');
    const window = new Window();
    globalThis.document = window.document;
    const { renderKeyHelp } = await import('../lib/key-help.js');
    const block = renderKeyHelp('gemini', 'fa');
    const link = block.querySelector('ol li:first-child a');
    expect(link.getAttribute('href')).toBe('https://aistudio.google.com/apikey');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(block.querySelectorAll('ol li')).toHaveLength(3);
    expect(block.querySelector('code[dir="ltr"]')).not.toBeNull();
    expect(block.querySelector('summary').textContent).toBe(t('keyHelpTitle', 'fa'));
  });
});

describe('key test status text', () => {
  it('fills in the model and timing', () => {
    expect(describeKeyTest({ ok: true, model: 'claude-haiku-5-5', ms: 420 }, 'en', 'claude').text).toBe('Key works. claude-haiku-5-5 replied in 420 ms.');
  });

  it('prefixes the localized reason without repeating its advice', () => {
    expect(describeKeyTest({ ok: false, code: 'INVALID_API_KEY', message: 'ignored' }, 'en', 'claude').text).toBe('Test failed. Invalid API key. Please check settings.');
  });

  it('falls back to the unknown error text when there is no reason', () => {
    expect(describeKeyTest({ ok: false }, 'en', 'claude').text).toContain(translations.en.errorUnknown);
  });
});

describe('first-run markup', () => {
  it('is in both the popup and the side panel with the accessible status region', async () => {
    const fs = await import('fs');
    const path = await import('path');
    for (const file of ['popup/popup.html', 'sidepanel/sidepanel.html']) {
      const html = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
      expect(html, file).toMatch(/name="first-run-provider"/);
      expect(html, file).toMatch(/id="first-run-key"[^>]*autocomplete="off"[^>]*spellcheck="false"/);
      expect(html, file).toMatch(/id="first-run-test"/);
      expect(html, file).toMatch(/id="first-run-status"[^>]*role="status"[^>]*aria-live="polite"/);
      expect(html, file).not.toMatch(/api-key-warning|configure-api-btn/);
    }
  });
});
