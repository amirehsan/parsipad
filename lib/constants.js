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
  /*
   * Versioned namespace. v1 used a base64-prefix hash that collided on long
   * inputs with shared prefixes (e.g. "I want to translate apples" and
   * "I want to translate bananas"). v2 is SHA-256(provider|sourceLang|text),
   * collision-resistant. Old v1 entries are migrated/dropped on first run -
   * see migrateLegacyTranslationCache() in lib/storage.js.
   */
  translationCache: 'translation_cache_v2',
  translationCacheLegacy: 'translation_cache',
  cacheMigrationVersion: 'cache_migration_version',
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
  newTabPhraseCount: 'newtab_phrase_count',
  // Onboarding
  onboardingComplete: 'onboarding_complete',
  // Review prompt
  reviewPromptDismissed: 'review_prompt_dismissed',
  reviewPromptClicked: 'review_prompt_clicked',
  // Analytics
  usageEvents: 'usage_events'
};

// Cache Configuration
export const CACHE_CONFIG = {
  maxSize: 500,
  ttl: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
};

// Translation System Prompt (structured JSON).
//
// Behavior contract:
// 1. Persian and English are the ONLY supported source/target languages.
// 2. If the input is in any other language, gibberish, or unintelligible,
//    return {"unsupported": true} and nothing else. Do NOT invent a meaning.
// 3. Surface typo corrections in the "corrections" array so the UI can
//    show "Did you mean ...". Apply the correction to the translation.
// 4. For short queries (~80 chars or fewer) include optional rich context:
//    alternative translations, contextual meanings, example sentences,
//    nuance. For longer text, OMIT these fields to keep responses tight.
export const SYSTEM_PROMPT = `You are a professional Persian-English translator. Translate ONLY between Persian (fa) and English (en); reject everything else.

OUTPUT: valid JSON only, no prose, no markdown fences. Shape:
{
  "translation": "...",
  "direction": "fa-en" | "en-fa",
  "corrections": [{ "original": "recieve", "corrected": "receive" }],
  "alternatives": ["alt translation 1", "alt translation 2"],
  "examples": [{ "source": "...", "target": "..." }],
  "nuance": "1-2 sentence note about register, idiom, or context"
}

RULES:
- Translate idioms by meaning, not literally. Preserve tone and register.
- Use American spelling for English. Use standard written Persian for Persian.
- If the user has typos, silently correct them in "translation", and report each correction in "corrections" (keep the array short; only the most relevant fixes).
- "alternatives", "examples", and "nuance" are OPTIONAL. Include them ONLY when the input is a single word or short phrase (roughly 80 chars or fewer). For full sentences or paragraphs, OMIT these three fields entirely to keep output compact.
- If the input is NOT Persian or English, or is so garbled you cannot understand it, return EXACTLY: {"unsupported": true}.
- Do NOT include extra commentary, do NOT explain the JSON, do NOT wrap in backticks.`;

// Polish System Prompt
export const POLISH_SYSTEM_PROMPT = `You are a professional American English editor. Polish ONLY English text; reject other languages.

OUTPUT: valid JSON only, no prose, no markdown fences. Shape:
{
  "professional": "formal, business / academic version",
  "conversational": "natural, friendly version",
  "concise": "brief, streamlined version",
  "corrections": [{ "original": "definately", "corrected": "definitely" }]
}

RULES:
- Use American English spelling. Preserve the user's meaning and intent.
- Fix grammar, punctuation, and spelling errors. Report the most relevant spelling fixes in "corrections".
- "corrections" is OPTIONAL; omit when no typos were corrected.
- If the input is NOT English or is unintelligible, return EXACTLY: {"unsupported": true}.
- Do NOT add commentary. JSON only.`;

// Dictionary System Prompt
export const DICTIONARY_SYSTEM_PROMPT = `You are a bilingual Persian-English dictionary. Look up ONLY Persian or English words; reject other scripts.

OUTPUT: valid JSON only. Shape:
{
  "word": "the canonical (corrected) word",
  "phonetic": "/IPA/",
  "partOfSpeech": "noun | verb | adjective | adverb | ...",
  "definitions": [
    { "meaning": "...", "example": "..." }
  ],
  "synonyms": ["..."],
  "antonyms": ["..."],
  "translation": "translation in the other language",
  "corrections": [{ "original": "recieve", "corrected": "receive" }]
}

RULES:
- Up to 3 definitions ordered by frequency. Up to 5 synonyms, 3 antonyms (omit arrays if empty).
- Always include an example for each definition.
- For English words translate to Persian. For Persian words translate to English.
- IPA in /slashes/ for phonetic. Use American English spelling for English entries.
- If the user typed a misspelled word, treat the corrected word as the canonical entry: set "word" to the corrected form, populate "corrections" with the original and corrected spelling, and look up the corrected word.
- If the word is NOT Persian or English, or is gibberish, return EXACTLY: {"unsupported": true}.
- "corrections" is OPTIONAL; omit if no correction was needed.
- JSON only. No commentary, no fences.`;

// Document Translation System Prompt - terse plain text (token-efficient
// for large documents; richer JSON shape is reserved for short popup queries).
export const DOCUMENT_SYSTEM_PROMPT = `You are a professional Persian-English document translator. Translate ONLY between Persian and English.

OUTPUT: plain translated text only. No JSON, no explanations, no notes.

RULES:
- Preserve paragraph structure, line breaks, lists, and formatting.
- Translate idioms by meaning, not literally. Keep tone, register, and technical terminology consistent.
- American English spelling for English; standard written Persian for Persian.
- If the source is not Persian or English, output exactly: UNSUPPORTED_LANGUAGE`;

// Grammar Explanation System Prompt (Language-Aware)
export const GRAMMAR_SYSTEM_PROMPT = `You are a professional Persian-English translator and language teacher.

Translate the given text and provide grammar explanations to help learners understand the translation.

IMPORTANT LANGUAGE RULES:
- If translating English → Persian: Write ALL grammar explanations in Persian (Farsi)
- If translating Persian → English: Write ALL grammar explanations in English

Output ONLY valid JSON in this format:
{
  "translation": "the translated text",
  "direction": "en-to-fa" or "fa-to-en",
  "grammar": [
    { "point": "Grammar concept title (in target language)", "explanation": "Brief explanation in target language (1-2 sentences)" }
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
- Write explanations in the TARGET language (Persian for EN→FA, English for FA→EN)
- Output ONLY valid JSON, no other text`;

// Detailed Grammar Learning Prompt (for dedicated grammar page)
export const GRAMMAR_LEARNING_PROMPT = `You are an expert language teacher creating an interactive grammar lesson.

Given a sentence and its translation, create a comprehensive grammar lesson with examples, comparisons, and practice exercises.

IMPORTANT LANGUAGE RULES:
- For English → Persian translations: Write ALL content in Persian (Farsi)
- For Persian → English translations: Write ALL content in English

CONTEXT-DRIVEN ANALYSIS:
- Reference SPECIFIC words and phrases from the user's input in your explanations
- Break down the exact syntax used in the provided sentence (e.g., Subject-Object-Verb order)
- Do not provide generic grammar rules - tie every explanation back to the actual text
- Quote the specific words being analyzed, e.g., "In this sentence, the word 'می‌روم' shows..."

TRANSLITERATION REQUIREMENTS (for Persian text):
- For ALL Persian text in examples and translations, provide phonetic romanization (Pinglish)
- Use consistent romanization: aa/â=آ, kh=خ, gh=ق/غ, sh=ش, zh=ژ, ch=چ, '=ع/ء
- Example: "می‌روم" → "miravam", "خانه" → "khâne"

REGISTER (FORMALITY) AWARENESS:
- Persian has distinct formal (written) and informal (spoken) registers
- Indicate the register level of the translation and explain differences

Output ONLY valid JSON in this format:
{
  "lessonTitle": "Main grammar concept being taught (in target language)",
  "originalText": "the original text",
  "translation": "the translation",
  "direction": "en-to-fa" or "fa-to-en",
  "grammarPoints": [
    {
      "title": "Grammar concept name (in target language)",
      "explanation": "Detailed explanation in target language (3-4 sentences) referencing specific words from the input",
      "register": {
        "level": "formal" | "informal" | "neutral",
        "note": "Brief explanation of the formality level used in the translation",
        "alternative": "How this would be expressed in the other register (optional, only if meaningfully different)"
      },
      "examples": [
        {
          "source": "example in source language",
          "target": "translation",
          "transliteration": "phonetic romanization (for Persian text, empty string for English)",
          "highlight": "key word/phrase to highlight"
        },
        { "source": "another example", "target": "its translation", "transliteration": "...", "highlight": "key element" },
        { "source": "third example", "target": "its translation", "transliteration": "...", "highlight": "key element" }
      ],
      "compareContrast": {
        "sourceLanguage": "How this grammar works in source language",
        "targetLanguage": "How it differs or works in target language"
      },
      "commonMistakes": ["Common mistake 1", "Common mistake 2"],
      "quiz": {
        "question": "Fill in the blank or choose correct option",
        "options": [
          { "text": "option A", "explanation": "Why this is correct OR why this is incorrect (be specific)" },
          { "text": "option B", "explanation": "Why this is incorrect - explain the specific error or confusion" },
          { "text": "option C", "explanation": "Why this is incorrect - what grammar rule it violates" },
          { "text": "option D", "explanation": "Why this is incorrect - when this WOULD be correct instead" }
        ],
        "correctIndex": 0
      }
    }
  ],
  "relatedPatterns": ["Related grammar topic 1", "Related grammar topic 2"]
}

CRITICAL QUIZ REQUIREMENTS:
- ALL quiz options must be grammatically valid and meaningful sentences in the target language
- Each option MUST have an "explanation" field explaining why it's correct or incorrect
- Wrong options should be PLAUSIBLE alternatives that test subtle grammar distinctions:
  * Use similar-sounding words with different meanings
  * Use correct grammar but wrong word choice (e.g., wrong preposition, wrong verb form)
  * Use words that are commonly confused by learners (L1 interference mistakes)
  * Use options that would be correct in different contexts
- NEVER use nonsensical, ungrammatical, or obviously wrong options
- Each wrong option should be a sentence a learner might mistakenly think is correct
- The quiz should test understanding of the specific grammar point being taught
- Wrong option explanations should be educational: explain the common mistake pattern

Examples of GOOD quiz options (for Persian):
✓ "او به مدرسه می‌رود" vs "او به مدرسه رفت" vs "او مدرسه می‌رود" (tests preposition and tense)
✓ Options that differ only in verb conjugation or word order
✓ Each option with explanation like: "Incorrect: Uses past tense 'رفت' instead of present 'می‌رود'"

Examples of BAD quiz options to AVOID:
✗ Random words strung together
✗ Incomplete sentences
✗ Options that make no sense in any context
✗ Options that are obviously grammatically incorrect
✗ Options without explanations

Rules:
- Include 1-3 grammar points, focusing on the most educational ones
- Provide exactly 3 examples per grammar point with transliterations for Persian
- Make quiz questions practical and educational with CHALLENGING, PLAUSIBLE wrong answers
- Write ALL content in the target language
- Include register information for each grammar point
- Output ONLY valid JSON, no other text`;

// Image Translation System Prompt
export const IMAGE_SYSTEM_PROMPT = `You are a Persian-English OCR translator. Extract visible text from the image and translate it between Persian and English only.

OUTPUT: valid JSON only. Shape:
{
  "extractedText": "original text verbatim",
  "translation": "translated text",
  "direction": "en-fa" | "fa-en" | "unknown"
}

RULES:
- Preserve line breaks and paragraph structure when possible.
- American English spelling for English; standard written Persian for Persian.
- If no text is detected, return: {"extractedText": "", "translation": "", "direction": "unknown"}.
- If the visible text is not Persian or English, return: {"unsupported": true}.
- JSON only, no commentary.`;

// Single Variant Polish Regeneration System Prompt
export const POLISH_VARIANT_SYSTEM_PROMPT = `You are a professional American English editor. Rewrite the given text in the requested style.

Styles:
- Professional: formal, business/academic, polished grammar.
- Conversational: natural, friendly, everyday tone.
- Concise: streamlined, remove unnecessary words.

OUTPUT: plain polished text only. No JSON, no commentary, no explanations.
Use American English spelling. Fix grammar, punctuation, and spelling. Preserve meaning and intent.`;

// Actions
export const ACTIONS = {
  TRANSLATE: 'TRANSLATE',
  POLISH: 'POLISH',
  CHECK_API_KEY: 'CHECK_API_KEY',
  DICTIONARY_LOOKUP: 'DICTIONARY_LOOKUP',
  TRANSLATE_DOCUMENT: 'TRANSLATE_DOCUMENT',
  CANCEL_DOCUMENT_TRANSLATION: 'CANCEL_DOCUMENT_TRANSLATION',
  TRANSLATE_IMAGE: 'TRANSLATE_IMAGE',
  CAPTURE_SCREENSHOT: 'CAPTURE_SCREENSHOT',
  REGENERATE_POLISH_VARIANT: 'REGENERATE_POLISH_VARIANT',
  ADD_FAVORITE: 'ADD_FAVORITE',
  REMOVE_FAVORITE: 'REMOVE_FAVORITE',
  GET_FAVORITES: 'GET_FAVORITES',
  CHECK_FAVORITE: 'CHECK_FAVORITE',
  GET_GRAMMAR_LESSON: 'GET_GRAMMAR_LESSON',
  // Page Translation
  TRANSLATE_PAGE: 'TRANSLATE_PAGE',
  CANCEL_PAGE_TRANSLATION: 'CANCEL_PAGE_TRANSLATION',
  TOGGLE_PAGE_TRANSLATION: 'TOGGLE_PAGE_TRANSLATION',
  GET_PAGE_TRANSLATION_STATE: 'GET_PAGE_TRANSLATION_STATE',
  OPEN_OPTIONS: 'OPEN_OPTIONS'
};

// Error Messages
export const ERROR_MESSAGES = {
  API_KEY_NOT_SET: 'API key not set. Please configure it in settings.',
  INVALID_API_KEY: 'Invalid API key. Please check settings.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  SERVER_ERROR: 'Translation service unavailable. Please try again.',
  NETWORK_ERROR: 'Check your internet connection.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
  UNSUPPORTED_LANGUAGE: 'ParsiPad only supports Persian and English. Please try a different selection.',
  UNINTELLIGIBLE_INPUT: 'I could not understand this input. Please check the spelling and try again.'
};

// Analytics Action Types
export const ACTION_TYPES = {
  TRANSLATE: 'translate',
  POLISH: 'polish',
  DICTIONARY: 'dictionary',
  DOCUMENT: 'document',
  IMAGE: 'image',
  GRAMMAR: 'grammar',
  REGENERATE: 'regenerate'
};

// Provider Pricing (approximate USD per million tokens)
export const PROVIDER_PRICING = {
  [PROVIDERS.CLAUDE]: { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  [PROVIDERS.GEMINI]: { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  [PROVIDERS.OPENAI]: { inputPerMillion: 0.15, outputPerMillion: 0.60 }
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
