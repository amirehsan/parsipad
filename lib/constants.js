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

// Actions
export const ACTIONS = {
  TRANSLATE: 'TRANSLATE',
  POLISH: 'POLISH',
  CHECK_API_KEY: 'CHECK_API_KEY'
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
