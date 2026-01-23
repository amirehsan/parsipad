import { API_CONFIG, ERROR_MESSAGES } from './constants.js';
import { getApiKey } from './storage.js';
import { detectLanguageCode } from './language-detect.js';

// Dictionary System Prompt - with translation
const DICTIONARY_PROMPT_WITH_TRANSLATION = `You are a bilingual dictionary assistant for Persian and English.

Provide lexical information in this exact JSON format:
{
  "word": "the word",
  "phonetic": "/IPA transcription/",
  "partOfSpeech": "noun/verb/adjective/etc",
  "definitions": [
    { "meaning": "definition text", "example": "Example sentence." }
  ],
  "synonyms": ["syn1", "syn2"],
  "antonyms": ["ant1"],
  "translation": "REQUIRED - the translation"
}

CRITICAL RULES:
- The "translation" field is MANDATORY and must ALWAYS be included
- For English words: translate to Persian using Farsi script (e.g., خانه، کتاب، بزرگ)
- For Persian words: translate to English
- Provide 1-3 definitions with examples
- Up to 5 synonyms and 3 antonyms
- Use IPA for phonetics
- Output ONLY valid JSON`;

// Dictionary System Prompt - without translation
const DICTIONARY_PROMPT_NO_TRANSLATION = `You are a comprehensive dictionary assistant.

When given a word, provide detailed lexical information in this exact JSON format:
{
  "word": "the word as entered",
  "phonetic": "/phonetic transcription/",
  "partOfSpeech": "noun/verb/adjective/adverb/etc",
  "definitions": [
    { "meaning": "primary definition", "example": "Example sentence using the word." },
    { "meaning": "secondary definition", "example": "Another example." }
  ],
  "synonyms": ["synonym1", "synonym2", "synonym3"],
  "antonyms": ["antonym1", "antonym2"]
}

Rules:
- Provide up to 3 definitions, ordered by common usage
- Provide up to 5 synonyms and 3 antonyms (if they exist)
- Include example sentences for each definition
- Do NOT include any translation field
- Use IPA for phonetic transcription
- Output ONLY valid JSON, no other text`;

/**
 * @typedef {Object} DictionaryDefinition
 * @property {string} meaning - The definition text
 * @property {string} example - Example sentence
 */

/**
 * @typedef {Object} DictionaryResult
 * @property {string} word - The looked up word
 * @property {string} phonetic - IPA phonetic transcription
 * @property {string} partOfSpeech - Part of speech (noun, verb, etc.)
 * @property {DictionaryDefinition[]} definitions - Array of definitions
 * @property {string[]} synonyms - Array of synonyms
 * @property {string[]} antonyms - Array of antonyms
 * @property {string} translation - Translation to the other language
 * @property {string} sourceLang - Detected source language
 * @property {string} targetLang - Target translation language
 * @property {number} inputTokens - Input tokens used
 * @property {number} outputTokens - Output tokens used
 */

/**
 * Look up a word in the dictionary using Claude API
 * @param {string} word - Word to look up (single word only)
 * @param {'auto' | string} sourceLang - Source language or 'auto' for detection
 * @param {boolean} showTranslation - Whether to include translation in response
 * @returns {Promise<DictionaryResult>}
 */
export async function lookupWord(word, sourceLang = 'auto', showTranslation = true) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.API_KEY_NOT_SET);
  }

  // Validate single word
  const cleanWord = word.trim();
  if (!cleanWord) {
    throw new Error('No word provided');
  }

  if (cleanWord.split(/\s+/).length > 1) {
    throw new Error('Dictionary lookup is for single words only');
  }

  // Detect language
  const detectedLang = sourceLang === 'auto' ? detectLanguageCode(cleanWord) : sourceLang;
  const targetLang = detectedLang === 'fa' ? 'en' : 'fa';
  const targetLangName = targetLang === 'fa' ? 'Persian' : 'English';

  // Select system prompt based on whether translation should be shown
  const systemPrompt = showTranslation
    ? DICTIONARY_PROMPT_WITH_TRANSLATION
    : DICTIONARY_PROMPT_NO_TRANSLATION;

  // Build user prompt
  const userPrompt = showTranslation
    ? `Word: "${cleanWord}"\n\nProvide definition and you MUST include the ${targetLangName} translation in the "translation" field.`
    : `Word: "${cleanWord}"\n\nProvide definition only. Do NOT include any translation.`;

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
        system: systemPrompt,
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
    throw new Error('Failed to parse dictionary response');
  }

  return {
    word: parsed.word || cleanWord,
    phonetic: parsed.phonetic || '',
    partOfSpeech: parsed.partOfSpeech || '',
    definitions: parsed.definitions || [],
    synonyms: parsed.synonyms || [],
    antonyms: parsed.antonyms || [],
    translation: showTranslation ? (parsed.translation || '') : '',
    sourceLang: detectedLang,
    targetLang: targetLang,
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
