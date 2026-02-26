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
 * Translate text using the selected AI provider
 * @param {string} text - Text to translate
 * @param {'auto' | string} sourceLang - Source language or 'auto' for detection
 * @param {boolean} withGrammar - Whether to include grammar explanations
 * @returns {Promise<{translation: string, direction: string, displayDirection: string, grammar?: Array, inputTokens: number, outputTokens: number}>}
 */
export async function translate(text, sourceLang = 'auto', withGrammar = false) {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();

  if (!apiKey) {
    throw new Error(`${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }

  const translationInfo = getTranslationInfo(text, sourceLang);
  const { from, to, direction, displayDirection } = translationInfo;

  const fromName = getLanguageName(from);
  const toName = getLanguageName(to);

  const userPrompt = `Translate this ${fromName} text to ${toName}:\n\n${text}`;

  // Use grammar prompt if grammar explanations requested
  const systemPrompt = withGrammar ? GRAMMAR_SYSTEM_PROMPT : SYSTEM_PROMPT;

  try {
    const result = await provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens: withGrammar ? provider.config.maxTokens * 2 : provider.config.maxTokens,
      apiKey
    });

    // Parse JSON response if grammar mode is enabled
    if (withGrammar) {
      const parsed = extractJSON(result.text);
      if (parsed) {
        return {
          translation: parsed.translation || '',
          direction: direction,
          displayDirection: displayDirection,
          grammar: parsed.grammar || [],
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens
        };
      } else {
        // If JSON parsing fails, return the raw text as translation
        return {
          translation: result.text,
          direction: direction,
          displayDirection: displayDirection,
          grammar: [],
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens
        };
      }
    }

    return {
      translation: result.text,
      direction: direction,
      displayDirection: displayDirection,
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

    return {
      professional: parsed.professional || '',
      conversational: parsed.conversational || '',
      concise: parsed.concise || '',
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
      maxTokens: provider.config.maxTokens * 3, // Grammar lessons need more tokens
      apiKey
    });

    // Parse JSON response
    const parsed = extractJSON(result.text);
    if (!parsed) {
      console.error('Grammar lesson response:', result.text);
      throw new Error('Failed to parse grammar lesson response');
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
    throw error;
  }
}
