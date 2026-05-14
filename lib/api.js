import { SYSTEM_PROMPT, POLISH_SYSTEM_PROMPT, POLISH_VARIANT_SYSTEM_PROMPT, GRAMMAR_SYSTEM_PROMPT, GRAMMAR_LEARNING_PROMPT, IMAGE_SYSTEM_PROMPT, ERROR_MESSAGES } from './constants.js';
import { getCurrentProvider, getCurrentApiKey } from './providers/index.js';
import { getTranslationInfo } from './language-detect.js';
import { extractJSON } from './json-utils.js';

// Language names for prompts
const LANGUAGE_NAMES = {
  fa: 'Persian',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  he: 'Hebrew',
  el: 'Greek',
  th: 'Thai',
  hi: 'Hindi',
  ar: 'Arabic',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese'
};

/**
 * Get language name for prompt
 * @param {string} code - Language code
 * @returns {string} - Language name
 */
function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || 'the source language';
}

/**
 * Translate text using the selected AI provider.
 *
 * The non-grammar path now returns structured JSON with optional rich context
 * (corrections, alternatives, examples, nuance). For short queries (<=80
 * chars) the model is asked to populate the rich-context fields; for longer
 * inputs it returns just translation + direction + maybe corrections.
 *
 * Falls back to plain text if the model's response is not valid JSON.
 *
 * @param {string} text
 * @param {'auto' | string} sourceLang
 * @param {boolean} withGrammar
 * @param {AbortSignal | null} signal
 * @returns {Promise<{
 *   translation: string,
 *   direction: string,
 *   displayDirection: string,
 *   grammar?: Array,
 *   corrections?: Array<{original: string, corrected: string}>,
 *   alternatives?: string[],
 *   examples?: Array<{source: string, target: string}>,
 *   nuance?: string,
 *   unsupported?: boolean,
 *   inputTokens: number,
 *   outputTokens: number
 * }>}
 */
export async function translate(text, sourceLang = 'auto', withGrammar = false, signal = null) {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();

  if (!apiKey) {
    throw new Error(`${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }

  const translationInfo = getTranslationInfo(text, sourceLang);
  const { from, to, direction, displayDirection } = translationInfo;

  const fromName = getLanguageName(from);
  const toName = getLanguageName(to);

  // Page translation sends batches as "[1] line\n[2] line\n..."
  // These need a plain-text response (no JSON) so the calling code can
  // parse the numbered output deterministically.
  const isNumberedBatch = /^\[1\]\s/.test(text);

  let userPrompt;
  if (isNumberedBatch) {
    userPrompt = `Translate each numbered item from ${fromName} to ${toName}. Keep the [1], [2] markers. Output ONLY the numbered translations, no JSON, no commentary:

${text}`;
  } else {
    userPrompt = `Translate this ${fromName} text to ${toName}:\n\n${text}`;
  }

  const systemPrompt = withGrammar
    ? GRAMMAR_SYSTEM_PROMPT
    : (isNumberedBatch
        // Numbered batch: bypass the structured JSON contract.
        ? `You are a professional ${fromName}-${toName} translator. Output the translation only.`
        : SYSTEM_PROMPT);

  try {
    const result = await provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens: withGrammar ? provider.config.maxTokens * 2 : provider.config.maxTokens,
      apiKey,
      signal
    });

    // Grammar mode: JSON with translation + grammar points.
    if (withGrammar) {
      const parsed = extractJSON(result.text);
      if (parsed) {
        return {
          translation: parsed.translation || '',
          direction,
          displayDirection,
          grammar: parsed.grammar || [],
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens
        };
      }
      return {
        translation: result.text,
        direction,
        displayDirection,
        grammar: [],
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      };
    }

    // Numbered batches return plain text by design.
    if (isNumberedBatch) {
      return {
        translation: result.text,
        direction,
        displayDirection,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      };
    }

    // Standard structured-JSON path.
    const parsed = extractJSON(result.text);
    if (parsed?.unsupported) {
      throw new Error(ERROR_MESSAGES.UNSUPPORTED_LANGUAGE);
    }
    if (parsed && typeof parsed.translation === 'string') {
      return {
        translation: parsed.translation,
        direction: parsed.direction || direction,
        displayDirection,
        corrections: Array.isArray(parsed.corrections) ? parsed.corrections : undefined,
        alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : undefined,
        examples: Array.isArray(parsed.examples) ? parsed.examples : undefined,
        nuance: typeof parsed.nuance === 'string' ? parsed.nuance : undefined,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
      };
    }

    // Fallback: treat the raw text as the translation. Older models / non-
    // compliant providers occasionally skip the JSON wrapper.
    return {
      translation: result.text,
      direction,
      displayDirection,
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
