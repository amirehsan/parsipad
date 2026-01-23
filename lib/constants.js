// API Configuration
export const API_CONFIG = {
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-3-5-haiku-20241022',
  maxTokens: 1024,
  version: '2023-06-01'
};

// Storage Keys
export const STORAGE_KEYS = {
  apiKey: 'apiKey',
  apiKeySetAt: 'apiKeySetAt',
  translationCache: 'translation_cache',
  translationHistory: 'translation_history',
  polishHistory: 'polish_history',
  dictionaryHistory: 'dictionary_history',
  dictionaryCache: 'dictionary_cache',
  dictionaryEnToFa: 'dictionary_en_to_fa',
  dictionaryFaToEn: 'dictionary_fa_to_en',
  translationCancelled: 'translation_cancelled',
  settings: 'settings',
  theme: 'theme',
  usageStats: 'usage_stats',
  language: 'ui_language'
};

// Cache Configuration
export const CACHE_CONFIG = {
  maxSize: 500,
  ttl: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
};

// Translation System Prompt
export const SYSTEM_PROMPT = `You are a professional Persian-English translator.
Translate the given text accurately while preserving:
- Tone and register (formal/informal)
- Idiomatic expressions (translate meaning, not literally)
- Technical terminology where applicable

Rules:
- Output ONLY the translation, no explanations
- Maintain paragraph structure
- For single words, provide the most common translation`;

// Polish System Prompt
export const POLISH_SYSTEM_PROMPT = `You are a professional American English editor who refines and enhances text.

When given text, provide exactly three polished versions in this JSON format:
{
  "professional": "formal version here",
  "conversational": "casual version here",
  "concise": "brief version here"
}

Guidelines for each version:
- Professional: Refined for business/academic settings, sophisticated vocabulary, polished grammar
- Conversational: Natural, friendly tone, accessible language, appropriate for everyday communication
- Concise: Streamlined and efficient, remove unnecessary words, clear and punchy

Rules:
- Use American English spelling (color, organize, analyze)
- Maintain the original meaning and intent
- Fix grammar, punctuation, and spelling errors
- Output ONLY valid JSON, no other text`;

// Dictionary System Prompt
export const DICTIONARY_SYSTEM_PROMPT = `You are a comprehensive bilingual dictionary assistant for Persian and English.

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
  "antonyms": ["antonym1", "antonym2"],
  "translation": "translation to the other language"
}

Rules:
- Provide up to 3 definitions, ordered by common usage
- Provide up to 5 synonyms and 3 antonyms (if they exist)
- Include example sentences for each definition
- For English words: translate to Persian
- For Persian words: translate to English
- Use IPA for phonetic transcription
- Output ONLY valid JSON, no other text`;

// Document Translation System Prompt
export const DOCUMENT_SYSTEM_PROMPT = `You are a professional document translator specializing in Persian and English.

Translate the given text segment accurately while:
- Preserving paragraph structure and formatting
- Maintaining tone and register throughout
- Translating idiomatic expressions by meaning, not literally
- Keeping technical terminology consistent

Rules:
- Output ONLY the translation, no explanations or notes
- Maintain line breaks and paragraph structure
- For Persian to English: use American English spelling
- For English to Persian: use standard written Persian`;

// Actions
export const ACTIONS = {
  TRANSLATE: 'TRANSLATE',
  POLISH: 'POLISH',
  CHECK_API_KEY: 'CHECK_API_KEY',
  DICTIONARY_LOOKUP: 'DICTIONARY_LOOKUP',
  TRANSLATE_DOCUMENT: 'TRANSLATE_DOCUMENT',
  CANCEL_DOCUMENT_TRANSLATION: 'CANCEL_DOCUMENT_TRANSLATION'
};

// Error Messages
export const ERROR_MESSAGES = {
  API_KEY_NOT_SET: 'API key not set. Please configure it in settings.',
  INVALID_API_KEY: 'Invalid API key. Please check settings.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  SERVER_ERROR: 'Translation service unavailable. Please try again.',
  NETWORK_ERROR: 'Check your internet connection.',
  UNKNOWN_ERROR: 'An unexpected error occurred.'
};

// Design Tokens (for reference in JS)
export const DESIGN_TOKENS = {
  colors: {
    primary: '#6366F1',
    primaryHover: '#4F46E5',
    bg: '#FFFFFF',
    bgSecondary: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    success: '#10B981',
    error: '#EF4444'
  }
};
