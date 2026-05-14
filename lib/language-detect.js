/**
 * Multi-language detection based on Unicode character ranges
 */

// Unicode patterns for different scripts
const LANGUAGE_PATTERNS = {
  // Persian/Arabic
  fa: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g,
  // Russian (Cyrillic)
  ru: /[\u0400-\u04FF]/g,
  // Chinese (CJK Unified Ideographs)
  zh: /[\u4E00-\u9FFF\u3400-\u4DBF]/g,
  // Japanese (Hiragana + Katakana)
  ja: /[\u3040-\u309F\u30A0-\u30FF]/g,
  // Korean (Hangul)
  ko: /[\uAC00-\uD7AF\u1100-\u11FF]/g,
  // Hebrew
  he: /[\u0590-\u05FF]/g,
  // Greek
  el: /[\u0370-\u03FF]/g,
  // Thai
  th: /[\u0E00-\u0E7F]/g,
  // Hindi/Devanagari
  hi: /[\u0900-\u097F]/g,
};

// Persian-specific characters (exist in Persian but not standard Arabic)
const _PERSIAN_SPECIFIC = /[\u067E\u0686\u0698\u06AF\u06CC]/; // پ چ ژ گ ی

// Language display codes
const LANGUAGE_NAMES = {
  fa: 'FA',
  en: 'EN',
  ru: 'RU',
  zh: 'ZH',
  ja: 'JA',
  ko: 'KO',
  he: 'HE',
  el: 'EL',
  th: 'TH',
  hi: 'HI',
  ar: 'AR',
};

/**
 * Detect the language code of the text
 * @param {string} text - The text to analyze
 * @returns {string} - Language code: 'fa', 'en', 'ru', 'zh', 'ja', 'ko', etc.
 */
export function detectLanguageCode(text) {
  if (!text || typeof text !== 'string') {
    return 'en';
  }

  const cleanText = text.replace(/\s/g, '');
  if (cleanText.length === 0) {
    return 'en';
  }

  // Count matches for each language pattern
  const scores = {};

  for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    const matches = text.match(pattern) || [];
    scores[lang] = matches.length / cleanText.length;
  }

  // Find the language with the highest score
  let maxLang = 'en';
  let maxScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore && score > 0.2) {
      maxScore = score;
      maxLang = lang;
    }
  }

  // Special handling for Chinese vs Japanese
  // If both CJK and Hiragana/Katakana are present, it's Japanese
  if (maxLang === 'zh' && scores.ja > 0.1) {
    return 'ja';
  }

  return maxLang;
}

/**
 * Get the display code for a language
 * @param {string} code - Language code (e.g., 'fa')
 * @returns {string} - Display code (e.g., 'FA')
 */
export function getLanguageDisplayCode(code) {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}

/**
 * Get translation info based on detected language
 * Non-Persian → Persian, Persian → English
 * @param {string} text - The text to analyze
 * @param {'auto' | string} sourceLang - Source language or 'auto'
 * @returns {{from: string, to: string, direction: string, displayDirection: string}}
 */
export function getTranslationInfo(text, sourceLang = 'auto') {
  const detectedLang = sourceLang === 'auto' ? detectLanguageCode(text) : sourceLang;

  // Persian → English, everything else → Persian
  const targetLang = detectedLang === 'fa' ? 'en' : 'fa';

  return {
    from: detectedLang,
    to: targetLang,
    direction: `${detectedLang}-${targetLang}`,
    displayDirection: `${getLanguageDisplayCode(detectedLang)} → ${getLanguageDisplayCode(targetLang)}`
  };
}

/**
 * Legacy: Detect if text is Persian or not
 * @param {string} text
 * @returns {'fa' | 'en'}
 */
export function detectLanguage(text) {
  const code = detectLanguageCode(text);
  return code === 'fa' ? 'fa' : 'en';
}

/**
 * Legacy: Get translation direction string
 * @param {string} text
 * @param {'auto' | 'fa' | 'en'} sourceLang
 * @returns {string}
 */
export function getTranslationDirection(text, sourceLang = 'auto') {
  const info = getTranslationInfo(text, sourceLang);
  return info.direction;
}

/**
 * Check if text contains Persian characters
 * @param {string} text
 * @returns {boolean}
 */
export function containsPersian(text) {
  // Reset lastIndex to avoid stateful regex issues with global flag
  LANGUAGE_PATTERNS.fa.lastIndex = 0;
  return LANGUAGE_PATTERNS.fa.test(text);
}

/**
 * Get text direction for CSS (RTL or LTR)
 * @param {string} text
 * @returns {'rtl' | 'ltr'}
 */
export function getTextDirection(text) {
  const lang = detectLanguageCode(text);
  const rtlLanguages = ['fa', 'ar', 'he'];
  return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
}
