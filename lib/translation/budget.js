/** Sampling temperatures and output budgets shared by every provider. */
// OCR and translation are both transcription tasks with a single right
// answer, so image runs at the same low temperature as text translation.
// It previously sent none at all and inherited each provider's default,
// which is around 1.0 and invites the model to paraphrase what it read.
export const TEMPERATURES = Object.freeze({ translate: 0.2, grammar: 0.3, polish: 0.5, polishVariant: 0.7, image: 0.2 });

// Polish is one unstreamed reply three versions long. Gemini Flash-Lite was
// measured at 15 to 47 seconds for it, against a 30 second per-attempt
// default that threw the reply away and showed an error for nothing but the
// wait. Regenerate shares the allowance, since it runs on the same model.
export const POLISH_TIMEOUT_MS = 60000;

// How long a request may run before a surface says the provider is slow.
// Healthy replies measured 0.7 to 2 s on Gemini Flash-Lite and about 3 s on
// Claude Haiku, so 6 s rarely fires on a normal day and still comes well
// before anyone gives up on the request. See lib/slow-reply.js.
export const SLOW_REPLY_NOTICE_MS = 6000;

export const STREAM_IDLE_TIMEOUT_MS = 20000;

const SHORT_MODE_BUDGET = { word: 700, phrase: 700, sentence: 900 };
const MAX_BUDGET = 4096;

/**
 * @param {string} mode
 * @param {string} text
 * @returns {number}
 */
export function computeMaxTokens(mode, text) {
  if (SHORT_MODE_BUDGET[mode]) return SHORT_MODE_BUDGET[mode];
  const chars = (text || '').length;
  return Math.min(MAX_BUDGET, 400 + 2 * chars);
}

/**
 * @param {string} mode
 * @returns {boolean}
 */
export function isStreamingMode(mode) {
  return mode === 'text' || mode === 'batch';
}
