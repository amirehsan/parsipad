import { GRAMMAR_LEARNING_PROMPT, IMAGE_SYSTEM_PROMPT, ERROR_MESSAGES } from './constants.js';
import { getCurrentProvider, getCurrentApiKey, getProviderById } from './providers/index.js';
import { getLanguage } from './storage.js';
import { t } from './i18n.js';
import { extractJSON } from './json-utils.js';
import { buildSystemPrompt, buildUserMessage, GRAMMAR_POINTS_PROMPT, buildGrammarUserMessage, POLISH_PROMPT, POLISH_VARIANT_PROMPT, buildPolishUserMessage, buildPolishVariantUserMessage } from './translation/prompts.js';
import { schemaForMode, coerceResult, coerceGrammarPoints, coerceImageResult, GRAMMAR_POINTS_SCHEMA, IMAGE_SCHEMA } from './translation/schemas.js';
import { TEMPERATURES, POLISH_TIMEOUT_MS, computeMaxTokens, isStreamingMode } from './translation/budget.js';
import { TranslationError, ERROR_CODES, toTranslationError, errorI18nKey } from './translation/errors.js';
import { trackProviderCall } from './provider-health.js';

const GRAMMAR_POINTS_MAX_TOKENS = 800;

/**
 * Resolve the active provider and its key, or throw API_KEY_NOT_SET.
 */
async function getProviderAndKey() {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();
  if (!apiKey) {
    throw new TranslationError(ERROR_CODES.API_KEY_NOT_SET, `${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }
  return { provider, apiKey };
}

/**
 * Translate normalized text in a given mode.
 *
 * Word, phrase and sentence modes use native structured output and return the
 * coerced result contract. Text and batch modes stream plain text through
 * onDelta and return the assembled translation; when the provider stops at the
 * token limit the partial text is returned with truncated: true.
 *
 * @param {object} request
 * @param {string} request.text - Normalized source text
 * @param {'word'|'phrase'|'sentence'|'text'|'batch'} request.mode
 * @param {string} request.fromName - English name of the source language
 * @param {string} request.toName - English name of the target language
 * @param {string} request.direction - e.g. 'en-fa'
 * @param {boolean} [request.detectedByScript=true]
 * @param {{before?: string, after?: string, pageLang?: string, title?: string}} [request.context]
 * @param {Array} [request.glossary]
 * @param {AbortSignal} [request.signal]
 * @param {(text: string) => void} [request.onDelta]
 * @returns {Promise<object>}
 */
export async function translate(request) {
  const { provider, apiKey } = await getProviderAndKey();
  const { text, mode, fromName, toName, direction, detectedByScript = true, context, glossary = [], signal, onDelta } = request;

  const systemPrompt = buildSystemPrompt(mode);
  const userPrompt = buildUserMessage({ text, mode, fromName, toName, detectedByScript, context, glossary, direction });
  const maxTokens = computeMaxTokens(mode, text);

  try {
    if (isStreamingMode(mode)) {
      const result = await trackProviderCall(provider, () => provider.stream({ systemPrompt, userPrompt, maxTokens, temperature: TEMPERATURES.translate, apiKey, signal, onDelta }));
      const translation = result.text.trim();
      if (!translation) throw new TranslationError(ERROR_CODES.PARSE_FAILED);
      return { translation, truncated: Boolean(result.truncated), inputTokens: result.inputTokens, outputTokens: result.outputTokens };
    }

    const result = await trackProviderCall(provider, () => provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: TEMPERATURES.translate,
      responseSchema: schemaForMode(mode),
      apiKey,
      signal
    }));
    if (result.truncated) throw new TranslationError(ERROR_CODES.TRUNCATED);

    const parsed = extractJSON(result.text);
    if (!parsed) throw new TranslationError(ERROR_CODES.PARSE_FAILED);

    return { ...coerceResult(mode, parsed), truncated: false, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (error) {
    throw toTranslationError(error);
  }
}

/**
 * Explain the English grammar of a translation pair (2 to 4 points).
 * The translation shown to the user is never recomputed here.
 * @param {string} source
 * @param {string} translation
 * @param {string} direction - 'en-fa' | 'fa-en'
 * @returns {Promise<{grammar: Array<{point: string, explanation: string}>, inputTokens: number, outputTokens: number}>}
 */
export async function explainGrammar(source, translation, direction) {
  const { provider, apiKey } = await getProviderAndKey();
  try {
    const result = await trackProviderCall(provider, () => provider.complete({
      systemPrompt: GRAMMAR_POINTS_PROMPT,
      userPrompt: buildGrammarUserMessage({ source, translation, direction }),
      maxTokens: GRAMMAR_POINTS_MAX_TOKENS,
      temperature: TEMPERATURES.grammar,
      responseSchema: GRAMMAR_POINTS_SCHEMA,
      apiKey
    }));
    if (result.truncated) throw new TranslationError(ERROR_CODES.TRUNCATED);
    const parsed = extractJSON(result.text);
    if (!parsed) throw new TranslationError(ERROR_CODES.PARSE_FAILED);
    return { grammar: coerceGrammarPoints(parsed), inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (error) {
    throw toTranslationError(error);
  }
}

/**
 * Validate API key for a specific provider
 * @param {string} apiKey - API key to validate
 * @param {string} providerId - Provider ID (optional, uses current provider if not specified)
 * @returns {Promise<boolean>} True if valid
 */
export async function validateApiKey(apiKey, providerId = null) {
  const { getProviderById } = await import('./providers/index.js');
  const { getSelectedProvider } = await import('./storage.js');

  const targetProviderId = providerId || await getSelectedProvider();
  const provider = getProviderById(targetProviderId);

  return provider.validateApiKey(apiKey);
}

/**
 * Check a key with one real, tiny request. Uses the key it is given rather than
 * the stored one, so a key can be tested before and without being saved.
 * @param {string} providerId - Provider ID (claude, gemini, openai)
 * @param {string} key - API key to test
 * @returns {Promise<{ok: true, model: string, ms: number} | {ok: false, code: string, message: string}>}
 */
export async function testApiKey(providerId, key) {
  try {
    const provider = getProviderById(providerId);
    const started = performance.now();
    await provider.complete({
      systemPrompt: 'Reply with the single word OK.',
      userPrompt: 'OK',
      maxTokens: 5,
      apiKey: key,
      timeoutMs: 15000
    });
    return { ok: true, model: provider.config.model, ms: Math.round(performance.now() - started) };
  } catch (error) {
    const err = toTranslationError(error);
    let lang = 'en';
    try { lang = await getLanguage(); } catch { /* default */ }
    const message = err.code === ERROR_CODES.UNKNOWN ? err.message : t(errorI18nKey(err.code), lang);
    return { ok: false, code: err.code, message };
  }
}

/**
 * Straight or curly double quotes a model has put around the whole reply,
 * despite being asked not to. One outer pair only; quotes inside stay.
 * @param {string} text
 * @returns {string}
 */
function stripWrappingQuotes(text) {
  const match = text.match(/^(?:"([\s\S]*)"|“([\s\S]*)”)$/);
  return match ? (match[1] ?? match[2]).trim() : text;
}

const POLISH_VERSIONS = ['professional', 'conversational', 'concise'];

/**
 * A Polish request's completion. A timeout is reported as Polish taking too
 * long: the shared TIMEOUT message speaks of a translation.
 * @param {object} provider
 * @param {object} request - what provider.complete takes
 */
async function completePolish(provider, request) {
  try {
    return await trackProviderCall(provider, () => provider.complete(request));
  } catch (error) {
    if (toTranslationError(error).code === ERROR_CODES.TIMEOUT) throw new TranslationError(ERROR_CODES.POLISH_TIMEOUT);
    throw error;
  }
}

/**
 * Three versions of the user's own English text. Not cached: a fresh take is
 * what the user expects.
 * @param {string} text - Text to polish
 * @returns {Promise<{professional: string, conversational: string, concise: string, inputTokens: number, outputTokens: number}>}
 */
export async function polish(text) {
  const { provider, apiKey } = await getProviderAndKey();

  const result = await completePolish(provider, {
    systemPrompt: POLISH_PROMPT,
    userPrompt: buildPolishUserMessage(text),
    maxTokens: provider.config.maxTokens * 2,
    temperature: TEMPERATURES.polish,
    timeoutMs: POLISH_TIMEOUT_MS,
    apiKey
  });

  if (result.truncated) throw new TranslationError(ERROR_CODES.TRUNCATED);
  const parsed = extractJSON(result.text);
  if (!parsed) throw new TranslationError(ERROR_CODES.PARSE_FAILED);
  if (parsed.unsupported) throw new TranslationError(ERROR_CODES.UNSUPPORTED);

  const versions = {};
  for (const name of POLISH_VERSIONS) {
    const value = typeof parsed[name] === 'string' ? parsed[name].trim() : '';
    if (!value) throw new TranslationError(ERROR_CODES.PARSE_FAILED);
    versions[name] = value;
  }

  return { ...versions, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}

/**
 * One fresh version in a named style, for Regenerate. The version the user
 * rejected goes along so the model writes something else, not a near copy.
 * @param {string} text - Original text to polish
 * @param {'professional' | 'conversational' | 'concise'} variant - Which version to regenerate
 * @param {string} [previous] - The version being replaced
 * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>}
 */
export async function regeneratePolishVariant(text, variant, previous = '') {
  const { provider, apiKey } = await getProviderAndKey();

  const result = await completePolish(provider, {
    systemPrompt: POLISH_VARIANT_PROMPT,
    userPrompt: buildPolishVariantUserMessage({ text, variant, previous }),
    maxTokens: provider.config.maxTokens,
    temperature: TEMPERATURES.polishVariant,
    timeoutMs: POLISH_TIMEOUT_MS,
    apiKey
  });

  if (result.truncated) throw new TranslationError(ERROR_CODES.TRUNCATED);
  const rewritten = stripWrappingQuotes(result.text.trim());
  if (!rewritten) throw new TranslationError(ERROR_CODES.PARSE_FAILED);

  return { text: rewritten, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
}

/**
 * Translate text from an image using the selected AI provider's vision capabilities
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} mimeType - Image MIME type (image/jpeg, image/png, image/webp)
 * @returns {Promise<{extractedText: string, translation: string, direction: string, inputTokens: number, outputTokens: number}>}
 */
export async function translateImage(base64Data, mimeType) {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();

  if (!apiKey) {
    throw new Error(`${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }

  try {
    const result = await trackProviderCall(provider, () => provider.vision({
      systemPrompt: IMAGE_SYSTEM_PROMPT,
      userPrompt: 'Extract and translate all visible text in this image.',
      imageBase64: base64Data,
      mimeType,
      // One budget covers the extracted text and its translation together, so
      // the usable room per side is half of this. 2x was leaving roughly a
      // thousand tokens each, which a dense screenshot overruns.
      maxTokens: provider.config.maxTokens * 4,
      temperature: TEMPERATURES.image,
      responseSchema: IMAGE_SCHEMA,
      apiKey
    }));

    if (result.truncated) throw new TranslationError(ERROR_CODES.TRUNCATED);

    // Parse JSON response (handles markdown code blocks from some providers)
    const parsed = extractJSON(result.text);
    if (!parsed) {
      console.error('Image translation response:', result.text);
      throw new Error('Failed to parse image translation response');
    }

    // The image prompt asks for this when the text is neither Persian nor
    // English. Every other path acts on it; this one used to fall through and
    // read the absent fields as empty strings, so the user was shown a blank
    // result with nothing explaining why.
    if (parsed.unsupported) {
      throw new TranslationError(ERROR_CODES.UNSUPPORTED);
    }

    return {
      ...coerceImageResult(parsed),
      truncated: false,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    };
  } catch (error) {
    if (error.message === 'Failed to fetch') {
      throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
    }
    throw error;
  }
}

/**
 * Get a detailed grammar lesson for a sentence and its translation
 * @param {string} originalText - Original text
 * @param {string} translation - Translated text
 * @param {string} direction - Translation direction ('en-to-fa' or 'fa-to-en')
 * @returns {Promise<{lesson: Object, inputTokens: number, outputTokens: number}>}
 */
export async function getGrammarLesson(originalText, translation, direction) {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();

  if (!apiKey) {
    throw new Error(`${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }

  const userPrompt = `Create a grammar lesson for this translation:

Original: ${originalText}
Translation: ${translation}
Direction: ${(direction === 'en-to-fa' || direction === 'en-fa') ? 'English → Persian' : 'Persian → English'}

Provide detailed grammar explanations, examples, and a practice quiz.`;

  try {
    const result = await trackProviderCall(provider, () => provider.complete({
      systemPrompt: GRAMMAR_LEARNING_PROMPT,
      userPrompt,
      // Grammar lessons return a deeply nested JSON: 1-3 grammar points with
      // examples, transliterations, compare/contrast blocks, common mistakes,
      // and 4-option quizzes. 3x maxTokens (3072 for Claude) was truncating
      // mid-JSON for non-trivial sentences and failing extractJSON. 8x leaves
      // generous headroom for the full structure.
      maxTokens: provider.config.maxTokens * 8,
      // The grammar lesson is the heaviest request type and routinely exceeds
      // the default 30s withRetry timeout. Bump to 2 minutes to give the
      // model enough time to emit the full structured response.
      timeoutMs: 120000,
      apiKey
    }));

    // Parse JSON response. If extractJSON fails, surface a translatable
    // message instead of an internal parse error.
    const parsed = extractJSON(result.text);
    if (!parsed) {
      console.error('Grammar lesson response:', result.text);
      throw new Error('GRAMMAR_PARSE_FAILED');
    }

    return {
      lesson: parsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens
    };
  } catch (error) {
    if (error.message === 'Failed to fetch') {
      throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
    }
    // withRetry surfaces timeouts as DOMException(name: 'TimeoutError') or
    // 'Request timed out'. Translate that to a user-actionable sentinel
    // that grammar.js maps to an i18n'd "still working" message.
    if (error?.name === 'TimeoutError' || /request timed out|timeout/i.test(error?.message || '')) {
      throw new Error('GRAMMAR_TIMEOUT');
    }
    throw error;
  }
}
