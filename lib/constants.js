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
    model: 'gemini-2.5-flash',
    visionModel: 'gemini-2.5-flash',
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
  translateOtherLanguages: 'translate_other_languages',
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
// Be GENEROUS about input handling:
//   - Partial words ("adde" -> "added"), misspellings, abbreviations, slang,
//     and informal spellings should all be guessed at and translated.
//   - Surface every correction in the "corrections" array so the UI can show
//     "Did you mean ...". Always translate the CORRECTED form.
//   - Only reject inputs whose primary script is clearly NOT Latin (English)
//     or Persian-Arabic. Russian / Chinese / Japanese / Hebrew etc. return
//     {"unsupported": true}. Misspelled English / Persian never does.
//
// For short queries (~80 chars or fewer) include rich context: alternative
// English expressions, example sentences, nuance. For longer text, omit
// those fields to keep responses tight.
export const SYSTEM_PROMPT = `You are a professional Persian-English translator and a forgiving typo corrector.

OUTPUT: valid JSON only, no prose, no markdown fences. Shape:
{
  "translation": "...",
  "direction": "fa-en" | "en-fa",
  "corrections": [
    { "original": "recieve", "corrected": "receive" },
    { "original": "میرم",    "corrected": "می‌روم" }
  ],
  "alternatives": ["alt English expression 1", "alt English expression 2"],
  "examples": [{ "source": "...", "target": "..." }],
  "nuance": "1-2 sentence note about register, idiom, or context"
}

CORE BEHAVIOR
- Always TRY to interpret the input. Treat any Latin-letter input as English (even fragments like "adde", "recieve", "u r", "btw", "thru"). Treat any Persian/Arabic-script input as Persian (even shortened forms like "می‌رم" or "نمیدونم").
- For typos / partial words / casual spelling: guess the intended canonical form, translate THAT, and report the fix in "corrections". Never refuse to translate just because a word is misspelled or incomplete.
- THIS RULE APPLIES EQUALLY TO PERSIAN AND ENGLISH. Examples of Persian fixes you SHOULD surface: "میرم" -> "می‌روم", "نمیدونم" -> "نمی‌دانم", "بازی کرن" -> "بازی کردن", "خانم" with missing zwnj -> "خانم", informal "تو رو" -> standard "تو را", any missing zero-width non-joiner, any informal/colloquial spelling that has a standard written form. Be just as proactive flagging Persian typos as English ones.
- Translate idioms by meaning, not literally. Preserve tone and register.
- Use American spelling for English. Use standard written Persian for Persian (with proper zwnj where needed).

RICH CONTEXT (only when input is one word or a short phrase, roughly 80 chars or fewer)
- "alternatives": IMPORTANT — these are ALWAYS English words/expressions, regardless of translation direction. They show different ENGLISH ways to express the same meaning (helpful for Persian-speaking learners). Never put Persian words in "alternatives".
- "examples": short sentence pairs showing the word in context. Each item has "source" (always English) and "target" (always Persian).
- "nuance": 1-2 sentence note about register, idiom, or context.
- For longer inputs (full sentences / paragraphs), OMIT alternatives, examples, and nuance entirely.

UNSUPPORTED INPUT
- Only return {"unsupported": true} if the input's primary script is something other than Latin or Persian/Arabic (i.e. Cyrillic, CJK, Hebrew, Greek, Thai, Devanagari, etc.) — and that script makes up the majority of the input.
- Do NOT return unsupported for misspellings, abbreviations, single fragments, or anything that could plausibly be English or Persian.

Do NOT include extra commentary, do NOT explain the JSON, do NOT wrap in backticks.`;

// Polish System Prompt
export const POLISH_SYSTEM_PROMPT = `You are a professional American English editor and a forgiving typo corrector.

OUTPUT: valid JSON only, no prose, no markdown fences. Shape:
{
  "professional": "formal, business / academic version",
  "conversational": "natural, friendly version",
  "concise": "brief, streamlined version",
  "corrections": [{ "original": "definately", "corrected": "definitely" }]
}

CORE BEHAVIOR
- Treat any Latin-letter input as English to polish, even with typos or fragments.
- Fix grammar, punctuation, and spelling. Report the most relevant spelling fixes in "corrections".
- Use American English spelling. Preserve the user's meaning and intent.

UNSUPPORTED INPUT
- Only return {"unsupported": true} when the input's primary script is clearly NOT Latin (i.e. it's Cyrillic, CJK, Hebrew, Greek, Persian/Arabic, etc.).
- Do NOT return unsupported for misspellings, fragments, or short inputs.

"corrections" is optional. JSON only.`;

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

// Grammar Explanation System Prompt
//
// AUDIENCE: Persian native speakers learning English grammar.
// Grammar notes are ALWAYS written in English regardless of direction,
// because the user is studying English with Persian as their L1.
// The translation field still respects the requested direction.
export const GRAMMAR_SYSTEM_PROMPT = `You are a professional Persian-English translator and an English-language teacher writing for a Persian-native speaker who wants to understand the ENGLISH grammar at play.

Translate the given text, then provide grammar explanations in ENGLISH that help a Persian speaker understand the ENGLISH grammar of the English side of the pair (whether that English is the source or the translation).

OUTPUT - valid JSON only:
{
  "translation": "the translated text",
  "direction": "en-to-fa" or "fa-to-en",
  "grammar": [
    { "point": "English grammar concept title (in English)", "explanation": "1-2 sentence English explanation focused on the ENGLISH grammar" }
  ]
}

GRAMMAR CONTENT RULES (apply to BOTH translation directions)
- Write every "point" and "explanation" in ENGLISH. No Persian-script text inside grammar[].
- Teach the ENGLISH grammar feature. If the user translated FROM Persian TO English, explain the grammar of the English translation; if FROM English TO Persian, explain the grammar of the English source.
- Include 2-4 of the most educational grammar points. Focus on what a Persian speaker typically struggles with: tense system, articles (a/an/the), prepositions, word order, modal verbs, perfect aspects, agreement.
- Quote specific English words from the sentence when relevant ("In 'have been waiting', the present perfect continuous shows ...").
- Keep explanations concise (1-2 sentences each).

Output ONLY valid JSON, no commentary.`;

// Detailed Grammar Learning Prompt (for dedicated grammar page).
//
// AUDIENCE: Persian native speakers learning English grammar.
// All lesson content is in ENGLISH regardless of translation direction.
// Examples use English source sentences with Persian translations as
// reference. The quiz tests ENGLISH grammar with English option sentences.
//
// Optimized for SPEED and QUALITY: 1 grammar point (rare 2), 2 examples,
// 2-3 sentence explanations, self-enforcing near-miss quiz rules.
export const GRAMMAR_LEARNING_PROMPT = `You are an expert English-language teacher creating an interactive grammar lesson for a Persian-native speaker. The user just translated one sentence between English and Persian, and now wants to study the ENGLISH grammar at play.

LANGUAGE RULES (CRITICAL - applies to BOTH translation directions)
- Write ALL lesson content in ENGLISH: lessonTitle, every grammarPoint title and explanation, every example "source", every commonMistake, every quiz question and option, every relatedPattern, and the compareContrast text.
- Examples are ALWAYS English sentences as "source", with a Persian translation as "target". The "transliteration" field for the English source stays "".
- The quiz tests ENGLISH grammar. Every quiz option is an ENGLISH sentence. Quiz explanations are in English.
- Do NOT produce Persian-script content anywhere except the example "target" fields and the "user's translation" reference at the top.
- The teaching focus is always the ENGLISH grammar feature, even when the user translated FROM Persian. If the user gave Persian source + English translation, teach the grammar of the ENGLISH translation; if they gave English source + Persian translation, teach the grammar of the ENGLISH original.

CONTEXT-FIRST ANALYSIS
- Tie every explanation to SPECIFIC words from the user's English sentence; quote them ("In 'I had been waiting', the past perfect continuous shows ...").
- Never give generic textbook rules disconnected from the actual input.

REGISTER
- Indicate formal | informal | neutral for the English sentence's tone; mention the other-register English form only when meaningfully different.

OUTPUT - valid JSON only, no prose, no markdown fences:
{
  "lessonTitle": "Main English grammar concept being taught",
  "originalText": "the user's original text (English or Persian, whichever they entered)",
  "translation": "the user's translation",
  "direction": "en-to-fa" | "fa-to-en",
  "grammarPoints": [
    {
      "title": "English grammar concept name",
      "explanation": "2-3 sentence English explanation that quotes specific words from the English sentence in this lesson",
      "register": {
        "level": "formal" | "informal" | "neutral",
        "note": "1 sentence in English on the formality of the English sentence",
        "alternative": "How this would be expressed in a different English register (OMIT this field if not meaningfully different)"
      },
      "examples": [
        { "source": "English example sentence", "target": "Persian translation", "transliteration": "", "highlight": "key English word/phrase" },
        { "source": "English example sentence", "target": "Persian translation", "transliteration": "", "highlight": "key English word/phrase" }
      ],
      "compareContrast": {
        "sourceLanguage": "1-2 sentences in English on how this grammar works in English",
        "targetLanguage": "1-2 sentences in English on how Persian handles the same concept differently"
      },
      "commonMistakes": ["English mistake Persian speakers actually make", "second realistic English mistake"],
      "quiz": {
        "question": "English question testing the SAME grammar point as this lesson (fill-in-the-blank or 'which form is correct?')",
        "options": [
          { "text": "ENGLISH option A", "explanation": "English explanation - tied to the lesson's grammar point" },
          { "text": "ENGLISH option B", "explanation": "..." },
          { "text": "ENGLISH option C", "explanation": "..." },
          { "text": "ENGLISH option D", "explanation": "..." }
        ],
        "correctIndex": 0
      }
    }
  ],
  "relatedPatterns": ["related English grammar topic 1", "related English grammar topic 2"]
}

QUALITY RULES (NON-NEGOTIABLE)
1. Include exactly 1 grammar point in "grammarPoints". Only add a second one if the English sentence genuinely demonstrates two clearly distinct teachable concepts; never pad.
2. Provide exactly 2 examples per point. Examples must be realistic everyday English sentences (people, places, work, food, travel, family). No "Lorem ipsum", no abstract placeholders, no generic "The cat sat on the mat".
3. Examples must use the SAME English grammar feature as the lesson. Different vocabulary, same structural pattern.
4. Quiz question MUST test the lesson's English grammar point - not vocabulary, not an unrelated tense, not spelling.
5. Quiz options MUST be four near-identical ENGLISH sentences, differing only in the grammar feature being taught (e.g. wrong verb tense, wrong preposition, wrong agreement, wrong word order). Never include a sentence that's obviously wrong from a different feature.
6. Every option's "explanation" must reference the specific English feature: "Wrong because it uses simple past 'went' instead of present perfect 'have gone'". Generic "this is wrong" is forbidden.
7. Wrong options must be English sentences a real Persian-speaking learner might genuinely produce (L1 interference from Persian word order, missing articles, wrong preposition choice, calque) - not random gibberish.
8. "correctIndex" must point to the option whose "explanation" begins with "Correct" so the marker is consistent.

OUTPUT JSON ONLY. No commentary. No \\\`\\\`\\\` fences.`;

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
  EXPLAIN_GRAMMAR: 'EXPLAIN_GRAMMAR',
  // Page Translation
  TRANSLATE_PAGE: 'TRANSLATE_PAGE',
  CANCEL_PAGE_TRANSLATION: 'CANCEL_PAGE_TRANSLATION',
  TOGGLE_PAGE_TRANSLATION: 'TOGGLE_PAGE_TRANSLATION',
  GET_PAGE_TRANSLATION_STATE: 'GET_PAGE_TRANSLATION_STATE',
  OPEN_OPTIONS: 'OPEN_OPTIONS',
  OPEN_GRAMMAR_PAGE: 'OPEN_GRAMMAR_PAGE'
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
