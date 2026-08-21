import { POLISH_SYSTEM_PROMPT, POLISH_VARIANT_SYSTEM_PROMPT, GRAMMAR_LEARNING_PROMPT, IMAGE_SYSTEM_PROMPT, ERROR_MESSAGES } from './constants.js';
import { getCurrentProvider, getCurrentApiKey } from './providers/index.js';
import { extractJSON } from './json-utils.js';
import { buildSystemPrompt, buildUserMessage, GRAMMAR_POINTS_PROMPT, buildGrammarUserMessage } from './translation/prompts.js';
import { schemaForMode, coerceResult, coerceGrammarPoints, GRAMMAR_POINTS_SCHEMA } from './translation/schemas.js';
import { TEMPERATURES, computeMaxTokens, isStreamingMode } from './translation/budget.js';
import { TranslationError, ERROR_CODES, toTranslationError } from './translation/errors.js';

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
      const result = await provider.stream({ systemPrompt, userPrompt, maxTokens, temperature: TEMPERATURES.translate, apiKey, signal, onDelta });
      const translation = result.text.trim();
      if (!translation) throw new TranslationError(ERROR_CODES.PARSE_FAILED);
      return { translation, truncated: Boolean(result.truncated), inputTokens: result.inputTokens, outputTokens: result.outputTokens };
    }

    const result = await provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: TEMPERATURES.translate,
      responseSchema: schemaForMode(mode),
      apiKey,
      signal
    });
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
    const result = await provider.complete({
      systemPrompt: GRAMMAR_POINTS_PROMPT,
      userPrompt: buildGrammarUserMessage({ source, translation, direction }),
      maxTokens: GRAMMAR_POINTS_MAX_TOKENS,
      temperature: TEMPERATURES.grammar,
      responseSchema: GRAMMAR_POINTS_SCHEMA,
      apiKey
    });
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
 * Polish text using the selected AI provider - returns 3 versions
 * @param {string} text - Text to polish
 * @returns {Promise<{professional: string, conversational: string, concise: string, inputTokens: number, outputTokens: number}>}
 */
export async function polish(text) {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();

  if (!apiKey) {
    throw new Error(`${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }

  const userPrompt = `Polish this text:\n\n${text}`;

  try {
    const result = await provider.complete({
      systemPrompt: POLISH_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: provider.config.maxTokens * 2,
      temperature: TEMPERATURES.polish,
      apiKey
    });

    // Parse JSON response (handles markdown code blocks from some providers)
    const parsed = extractJSON(result.text);
    if (!parsed) {
      console.error('Polish response:', result.text);
      throw new Error('Failed to parse polish response');
    }

    if (parsed.unsupported) {
      throw new Error(ERROR_MESSAGES.UNSUPPORTED_LANGUAGE);
    }

    return {
      professional: parsed.professional || '',
      conversational: parsed.conversational || '',
      concise: parsed.concise || '',
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : undefined,
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
 * Regenerate a single polish variant using the selected AI provider
 * @param {string} text - Original text to polish
 * @param {'professional' | 'conversational' | 'concise'} variant - Which variant to regenerate
 * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>}
 */
export async function regeneratePolishVariant(text, variant) {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();

  if (!apiKey) {
    throw new Error(`${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }

  const variantDescriptions = {
    professional: 'professional style (formal, business/academic appropriate, sophisticated vocabulary)',
    conversational: 'conversational style (natural, friendly, everyday language)',
    concise: 'concise style (brief, streamlined, remove unnecessary words)'
  };

  const userPrompt = `Rewrite this text in a ${variantDescriptions[variant]}:\n\n${text}`;

  try {
    const result = await provider.complete({
      systemPrompt: POLISH_VARIANT_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: provider.config.maxTokens,
      apiKey
    });

    return {
      text: result.text.trim(),
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
    const result = await provider.vision({
      systemPrompt: IMAGE_SYSTEM_PROMPT,
      userPrompt: 'Extract and translate all visible text in this image.',
      imageBase64: base64Data,
      mimeType,
      maxTokens: provider.config.maxTokens * 2,
      apiKey
    });

    // Parse JSON response (handles markdown code blocks from some providers)
    const parsed = extractJSON(result.text);
    if (!parsed) {
      console.error('Image translation response:', result.text);
      throw new Error('Failed to parse image translation response');
    }

    return {
      extractedText: parsed.extractedText || '',
      translation: parsed.translation || '',
      direction: parsed.direction || 'unknown',
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
    const result = await provider.complete({
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
    });

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
