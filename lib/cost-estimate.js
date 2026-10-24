/**
 * The estimate a whole-page translation shows before its first request.
 * Kept free of imports because the content script loads it unbundled from the
 * extension root, where lib/constants.js is deliberately not web-accessible.
 * The pricing table lives here and lib/constants.js re-exports it; the
 * provider names, the storage key and the default provider repeat values in
 * lib/constants.js, and tests/cost-estimate.test.js asserts they stay equal.
 */

// Provider Pricing (approximate USD per million tokens)
export const PROVIDER_PRICING = {
  claude: { inputPerMillion: 0.10, outputPerMillion: 0.50 },
  gemini: { inputPerMillion: 0.30, outputPerMillion: 2.50 },
  openai: { inputPerMillion: 0.10, outputPerMillion: 0.50 }
};

// PROVIDER_CONFIGS[id].name
export const PROVIDER_NAMES = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'ChatGPT'
};

// STORAGE_KEYS.selectedProvider and DEFAULT_PROVIDER
export const SELECTED_PROVIDER_KEY = 'selectedProvider';
export const DEFAULT_PROVIDER_ID = 'claude';

// The system prompt and numbering instructions sent with every batch.
export const PROMPT_OVERHEAD_TOKENS = 350;

// About four characters per token. Persian output runs longer than the
// English it translates, so it is weighted up.
const CHARS_PER_TOKEN = 4;
const PERSIAN_OUTPUT_FACTOR = 1.6;

/**
 * Estimate the tokens and cost of translating `chars` characters of page
 * text sent in `batches` requests.
 * @param {{chars: number, batches: number, provider: string, targetLang: 'fa'|'en'}} input
 * @returns {{inputTokens: number, outputTokens: number, usd: number}}
 */
export function estimateTranslationCost({ chars, batches, provider, targetLang }) {
  const textTokens = chars / CHARS_PER_TOKEN;
  const inputTokens = Math.ceil(textTokens) + PROMPT_OVERHEAD_TOKENS * batches;
  const outputTokens = Math.ceil(textTokens * (targetLang === 'fa' ? PERSIAN_OUTPUT_FACTOR : 1));
  const pricing = PROVIDER_PRICING[provider];
  const usd = pricing
    ? (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1e6
    : 0;
  return { inputTokens, outputTokens, usd };
}

/**
 * The estimate as the dialog shows it, in Latin digits in both interface
 * languages: under a cent reads "<$0.01", anything else is rounded to the cent.
 * @param {number} usd
 * @returns {string}
 */
export function formatEstimateUsd(usd) {
  return usd < 0.01 ? '<$0.01' : '$' + usd.toFixed(2);
}
