// tests/cost-estimate.test.js
// The estimate a whole-page translation shows before it asks the provider
// for anything. lib/cost-estimate.js has no imports because the content
// script loads it unbundled, where lib/constants.js is deliberately not
// web-accessible; these tests keep its copies equal to the originals.
import { describe, it, expect } from 'vitest';
import {
  estimateTranslationCost,
  formatEstimateUsd,
  PROMPT_OVERHEAD_TOKENS,
  PROVIDER_PRICING,
  PROVIDER_NAMES,
  SELECTED_PROVIDER_KEY,
  DEFAULT_PROVIDER_ID
} from '../lib/cost-estimate.js';
import * as constants from '../lib/constants.js';
import { CONFIRM_PAGE_TRANSLATE_KEY } from '../content/page-confirm.js';

describe('estimateTranslationCost', () => {
  it('counts input with prompt overhead and heavier Persian output', () => {
    const r = estimateTranslationCost({ chars: 4000, batches: 2, provider: 'claude', targetLang: 'fa' });
    expect(r.inputTokens).toBe(1700);
    expect(r.outputTokens).toBe(1600);
    expect(r.usd).toBeCloseTo(0.00097, 8);
  });

  it('keeps English output the size of the input text', () => {
    const r = estimateTranslationCost({ chars: 4001, batches: 1, provider: 'gemini', targetLang: 'en' });
    expect(r.inputTokens).toBe(1001 + PROMPT_OVERHEAD_TOKENS);
    expect(r.outputTokens).toBe(1001);
    expect(r.usd).toBeCloseTo((1351 * 0.30 + 1001 * 2.50) / 1e6, 10);
  });

  it('is zero for an unknown provider rather than throwing', () => {
    expect(estimateTranslationCost({ chars: 100, batches: 1, provider: 'x', targetLang: 'en' }).usd).toBe(0);
  });

  it('uses 350 tokens of prompt overhead per batch', () => {
    expect(PROMPT_OVERHEAD_TOKENS).toBe(350);
  });
});

describe('formatEstimateUsd', () => {
  it('shows under a cent as <$0.01 and anything else to the cent, in Latin digits', () => {
    expect(formatEstimateUsd(0)).toBe('<$0.01');
    expect(formatEstimateUsd(0.00097)).toBe('<$0.01');
    expect(formatEstimateUsd(0.01)).toBe('$0.01');
    expect(formatEstimateUsd(0.123)).toBe('$0.12');
    expect(formatEstimateUsd(2)).toBe('$2.00');
  });
});

describe('copies of lib/constants.js values', () => {
  it('lib/constants.js re-exports the same pricing table', () => {
    expect(constants.PROVIDER_PRICING).toBe(PROVIDER_PRICING);
    expect(Object.keys(PROVIDER_PRICING).sort()).toEqual(Object.keys(constants.PROVIDER_CONFIGS).sort());
  });

  it('names every provider as PROVIDER_CONFIGS does', () => {
    expect(Object.keys(PROVIDER_NAMES).sort()).toEqual(Object.keys(constants.PROVIDER_CONFIGS).sort());
    for (const [id, config] of Object.entries(constants.PROVIDER_CONFIGS)) {
      expect(PROVIDER_NAMES[id], id).toBe(config.name);
    }
  });

  it('reads the same storage keys and default provider as the rest of the extension', () => {
    expect(SELECTED_PROVIDER_KEY).toBe(constants.STORAGE_KEYS.selectedProvider);
    expect(CONFIRM_PAGE_TRANSLATE_KEY).toBe(constants.STORAGE_KEYS.confirmPageTranslate);
    expect(DEFAULT_PROVIDER_ID).toBe(constants.DEFAULT_PROVIDER);
  });
});
