// Provider Identifiers
export const PROVIDERS = {
  CLAUDE: 'claude',
  GEMINI: 'gemini',
  OPENAI: 'openai'
};

// Provider Configurations
export const PROVIDER_CONFIGS = {
  [PROVIDERS.CLAUDE]: {
    id: PROVIDERS.CLAUDE,
    name: 'Claude',
    displayName: 'Claude (Anthropic)',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5-20251001',
    visionModel: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
    version: '2023-06-01',
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-api03-...',
    consoleUrl: 'https://console.anthropic.com/settings/keys'
  },
  [PROVIDERS.GEMINI]: {
    id: PROVIDERS.GEMINI,
    name: 'Gemini',
    displayName: 'Gemini (Google)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.0-flash',
    visionModel: 'gemini-2.0-flash',
    maxTokens: 1024,
    keyPrefix: 'AIza',
    keyPlaceholder: 'AIza...',
    consoleUrl: 'https://aistudio.google.com/apikey'
  },
  [PROVIDERS.OPENAI]: {
    id: PROVIDERS.OPENAI,
    name: 'ChatGPT',
    displayName: 'ChatGPT (OpenAI)',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    visionModel: 'gpt-4o-mini',
    maxTokens: 1024,
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    consoleUrl: 'https://platform.openai.com/api-keys'
  }
};

// Default provider
export const DEFAULT_PROVIDER = PROVIDERS.CLAUDE;

// Legacy API Configuration (for backward compatibility)
export const API_CONFIG = {
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 1024,
  version: '2023-06-01'
};

// Storage Keys
export const STORAGE_KEYS = {
  // Provider settings
  selectedProvider: 'selectedProvider',
  // API keys (one per provider)
  apiKey: 'apiKey', // Claude - kept for backward compatibility
  geminiApiKey: 'geminiApiKey',
  openaiApiKey: 'openaiApiKey',
  apiKeySetAt: 'apiKeySetAt',
  // Cache and history
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
  language: 'ui_language',
  selectionPopup: 'selection_popup_enabled',
  // Favorites
  favorites: 'favorites',
  // New tab page
  newTabEnabled: 'newtab_enabled',
  newTabPhraseCount: 'newtab_phrase_count'
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

// Grammar Explanation System Prompt
export const GRAMMAR_SYSTEM_PROMPT = `You are a professional Persian-English translator and language teacher.

Translate the given text and provide grammar explanations to help learners understand the translation.

Output ONLY valid JSON in this format:
{
  "translation": "the translated text",
  "grammar": [
    { "point": "Grammar concept title", "explanation": "Brief explanation of why/how this works in 1-2 sentences" }
  ]
}

Grammar points to explain (include 2-4 most relevant ones):
- Word order differences between source and target language
- Verb conjugations, tenses, or aspects used
- Idiomatic expressions and their literal vs actual meaning
- Formal/informal register choices
- Notable vocabulary, false friends, or cultural context
- Pronouns, articles, or particles that differ between languages

Rules:
- Keep explanations concise and practical
- Focus on the most educational grammar points
- Output ONLY valid JSON, no other text`;

// Image Translation System Prompt
export const IMAGE_SYSTEM_PROMPT = `You are a professional Persian-English translator with OCR capabilities.

Extract all visible text from the image and translate it.

Output ONLY valid JSON in this format:
{
  "extractedText": "original text from image exactly as written",
  "translation": "translated text",
  "direction": "en-fa or fa-en"
}

Rules:
- Preserve text layout and structure where possible (line breaks, paragraphs)
- For Persian to English: use American English spelling
- For English to Persian: use standard written Persian
- If the image contains mixed languages, translate appropriately
- If no text is found, return: {"extractedText": "", "translation": "", "direction": "unknown"}
- Output ONLY valid JSON, no other text`;

// Single Variant Polish Regeneration System Prompt
export const POLISH_VARIANT_SYSTEM_PROMPT = `You are a professional American English editor who refines and enhances text.

You will be given text and a specific style to rewrite it in.

Guidelines for each style:
- Professional: Refined for business/academic settings, sophisticated vocabulary, polished grammar
- Conversational: Natural, friendly tone, accessible language, appropriate for everyday communication
- Concise: Streamlined and efficient, remove unnecessary words, clear and punchy

Rules:
- Use American English spelling (color, organize, analyze)
- Maintain the original meaning and intent
- Fix grammar, punctuation, and spelling errors
- Output ONLY the polished text, no other text or explanation`;

// Actions
export const ACTIONS = {
  TRANSLATE: 'TRANSLATE',
  POLISH: 'POLISH',
  CHECK_API_KEY: 'CHECK_API_KEY',
  DICTIONARY_LOOKUP: 'DICTIONARY_LOOKUP',
  TRANSLATE_DOCUMENT: 'TRANSLATE_DOCUMENT',
  CANCEL_DOCUMENT_TRANSLATION: 'CANCEL_DOCUMENT_TRANSLATION',
  TRANSLATE_IMAGE: 'TRANSLATE_IMAGE',
  REGENERATE_POLISH_VARIANT: 'REGENERATE_POLISH_VARIANT',
  ADD_FAVORITE: 'ADD_FAVORITE',
  REMOVE_FAVORITE: 'REMOVE_FAVORITE',
  GET_FAVORITES: 'GET_FAVORITES',
  CHECK_FAVORITE: 'CHECK_FAVORITE'
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
