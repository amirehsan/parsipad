import { API_CONFIG, SYSTEM_PROMPT, POLISH_SYSTEM_PROMPT, ERROR_MESSAGES } from './constants.js';
import { getApiKey } from './storage.js';
import { getTranslationInfo } from './language-detect.js';

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
 * Translate text using Claude API
 * @param {string} text - Text to translate
 * @param {'auto' | string} sourceLang - Source language or 'auto' for detection
 * @returns {Promise<{translation: string, direction: string, displayDirection: string, inputTokens: number, outputTokens: number}>}
 */
export async function translate(text, sourceLang = 'auto') {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.API_KEY_NOT_SET);
  }

  const translationInfo = getTranslationInfo(text, sourceLang);
  const { from, to, direction, displayDirection } = translationInfo;

  const fromName = getLanguageName(from);
  const toName = getLanguageName(to);

  const userPrompt = `Translate this ${fromName} text to ${toName}:\n\n${text}`;

  let response;
  try {
    response = await fetch(API_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_CONFIG.version,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: API_CONFIG.model,
        max_tokens: API_CONFIG.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
  } catch (error) {
    // Network error
    throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
  }

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();

  return {
    translation: data.content[0].text,
    direction: direction,
    displayDirection: displayDirection,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0
  };
}

/**
 * Handle API error responses
 * @param {Response} response - Fetch response object
 * @throws {Error} With user-friendly message
 */
async function handleApiError(response) {
  let errorMessage = ERROR_MESSAGES.UNKNOWN_ERROR;

  try {
    const errorData = await response.json();
    const apiMessage = errorData.error?.message || '';

    switch (response.status) {
      case 401:
        errorMessage = ERROR_MESSAGES.INVALID_API_KEY;
        break;
      case 429:
        errorMessage = ERROR_MESSAGES.RATE_LIMITED;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorMessage = ERROR_MESSAGES.SERVER_ERROR;
        break;
      default:
        errorMessage = apiMessage || ERROR_MESSAGES.UNKNOWN_ERROR;
    }
  } catch {
    // Couldn't parse error response
    if (response.status === 401) {
      errorMessage = ERROR_MESSAGES.INVALID_API_KEY;
    } else if (response.status === 429) {
      errorMessage = ERROR_MESSAGES.RATE_LIMITED;
    } else if (response.status >= 500) {
      errorMessage = ERROR_MESSAGES.SERVER_ERROR;
    }
  }

  throw new Error(errorMessage);
}

/**
 * Validate API key by making a minimal test request
 * @param {string} apiKey - API key to validate
 * @returns {Promise<boolean>} True if valid
 */
export async function validateApiKey(apiKey) {
  try {
    const response = await fetch(API_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_CONFIG.version,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: API_CONFIG.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Polish text using Claude API - returns 3 versions
 * @param {string} text - Text to polish
 * @returns {Promise<{professional: string, conversational: string, concise: string, inputTokens: number, outputTokens: number}>}
 */
export async function polish(text) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.API_KEY_NOT_SET);
  }

  const userPrompt = `Polish this text:\n\n${text}`;

  let response;
  try {
    response = await fetch(API_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_CONFIG.version,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: API_CONFIG.model,
        max_tokens: API_CONFIG.maxTokens * 2,
        system: POLISH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
  } catch (error) {
    throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
  }

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();
  const rawText = data.content[0].text;

  // Parse JSON response
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // If JSON parsing fails, try to extract from the text
    throw new Error('Failed to parse polish response');
  }

  return {
    professional: parsed.professional || '',
    conversational: parsed.conversational || '',
    concise: parsed.concise || '',
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0
  };
}
