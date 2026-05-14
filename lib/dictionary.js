import { ERROR_MESSAGES } from './constants.js';
import { getCurrentProvider, getCurrentApiKey } from './providers/index.js';
import { detectLanguageCode } from './language-detect.js';
import { extractJSON } from './json-utils.js';

// Dictionary System Prompt - with translation (Persian / English only).
// Be forgiving about typos: always guess the intended word and look it up.
const DICTIONARY_PROMPT_WITH_TRANSLATION = `You are a bilingual Persian-English dictionary and a forgiving typo corrector.

OUTPUT: valid JSON only. Shape:
{
  "word": "the canonical (corrected) word",
  "phonetic": "/IPA/",
  "partOfSpeech": "noun | verb | adjective | adverb | ...",
  "definitions": [{ "meaning": "...", "example": "..." }],
  "synonyms": ["..."],
  "antonyms": ["..."],
  "translation": "REQUIRED translation in the other language",
  "corrections": [{ "original": "recieve", "corrected": "receive" }]
}

CORE BEHAVIOR
- Always TRY to interpret the input. Treat any Latin-letter input as English (including fragments like "adde", "recieve", "u r"). Treat any Persian/Arabic-script input as Persian.
- For typos / partial words: guess the intended word, look it up, and set "word" to the corrected form. Report the fix in "corrections".
- THIS APPLIES EQUALLY TO PERSIAN AND ENGLISH. Persian examples you SHOULD correct: "میرم" -> "می‌روم", "نمیدونم" -> "نمی‌دانم", "بازی کرن" -> "بازی کردن", informal "تو رو" -> "تو را", any missing zero-width non-joiner. Be just as aggressive flagging Persian typos as English ones.
- "translation" is MANDATORY. English words -> Persian (Farsi script). Persian words -> English.
- Up to 3 definitions ordered by frequency. Up to 5 synonyms, 3 antonyms. Always include an example per definition.
- Use IPA in /slashes/. American English spelling for English entries. Use standard written Persian (with proper zwnj) for Persian entries.

UNSUPPORTED INPUT
- Only return {"unsupported": true} when the input's primary script is clearly Cyrillic, CJK, Hebrew, Greek, Thai, Devanagari, etc. — not Latin and not Persian/Arabic.
- Do NOT return unsupported for misspelled English/Persian words. Always attempt to correct and look up.

"corrections" is optional; omit when no correction was needed. JSON only.`;

// Dictionary System Prompt - without translation.
const DICTIONARY_PROMPT_NO_TRANSLATION = `You are a Persian-English dictionary. Look up ONLY Persian or English words.

OUTPUT: valid JSON only. Shape:
{
  "word": "the canonical (corrected) word",
  "phonetic": "/IPA/",
  "partOfSpeech": "noun | verb | adjective | adverb | ...",
  "definitions": [{ "meaning": "...", "example": "..." }],
  "synonyms": ["..."],
  "antonyms": ["..."],
  "corrections": [{ "original": "recieve", "corrected": "receive" }]
}

RULES:
- Up to 3 definitions ordered by frequency. Up to 5 synonyms, 3 antonyms. Always include an example per definition.
- If the user misspelled the word, correct it in "word" and report the fix in "corrections".
- Use IPA in /slashes/. American English spelling.
- Do NOT include any translation field.
- If the input is NOT Persian or English, or is gibberish, return EXACTLY: {"unsupported": true}.
- "corrections" is optional; omit when no correction was needed.
- JSON only. No commentary.`;

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
 * Look up a word in the dictionary using the selected AI provider
 * @param {string} word - Word to look up (single word only)
 * @param {'auto' | string} sourceLang - Source language or 'auto' for detection
 * @param {boolean} showTranslation - Whether to include translation in response
 * @returns {Promise<DictionaryResult>}
 */
export async function lookupWord(word, sourceLang = 'auto', showTranslation = true) {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();

  if (!apiKey) {
    throw new Error(`${provider.config.displayName} API key not configured. Please set up in Settings.`);
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

  try {
    const result = await provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens: provider.config.maxTokens,
      apiKey
    });

    // Parse JSON response (handles markdown code blocks from some providers)
    const parsed = extractJSON(result.text);
    if (!parsed) {
      console.error('Dictionary response:', result.text);
      throw new Error('Failed to parse dictionary response');
    }

    if (parsed.unsupported) {
      throw new Error(ERROR_MESSAGES.UNSUPPORTED_LANGUAGE);
    }

    return {
      word: parsed.word || cleanWord,
      phonetic: parsed.phonetic || '',
      partOfSpeech: parsed.partOfSpeech || '',
      definitions: parsed.definitions || [],
      synonyms: parsed.synonyms || [],
      antonyms: parsed.antonyms || [],
      translation: showTranslation ? (parsed.translation || '') : '',
      corrections: Array.isArray(parsed.corrections) ? parsed.corrections : undefined,
      sourceLang: detectedLang,
      targetLang: targetLang,
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
