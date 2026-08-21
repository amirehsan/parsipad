/**
 * Multi-language detection based on Unicode character ranges
 */

import { getLanguageName } from './translation/languages.js';

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
 * @returns {{from: string, to: string, direction: string, displayDirection: string, detectedName: string, targetName: string}}
 */
export function getTranslationInfo(text, sourceLang = 'auto') {
  const detectedLang = sourceLang === 'auto' ? detectLanguageCode(text) : sourceLang;

  // Persian to English, everything else to Persian
  const targetLang = detectedLang === 'fa' ? 'en' : 'fa';

  return {
    from: detectedLang,
    to: targetLang,
    direction: `${detectedLang}-${targetLang}`,
    displayDirection: `${getLanguageDisplayCode(detectedLang)} → ${getLanguageDisplayCode(targetLang)}`,
    detectedName: getLanguageName(detectedLang),
    targetName: getLanguageName(targetLang)
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

/**
 * ParsiPad supports Persian and English only. This is a STRICT pre-filter
 * that only rejects when the input is clearly not Latin and not Persian-
 * Arabic script. The LLM does final validation and is responsible for
 * deciding whether a Latin-letter fragment is a misspelled English word
 * (translate it) vs. truly nonsense (return {unsupported: true}).
 *
 * Conservative rules:
 *  - Empty / null / numeric / punctuation-only -> accept (no language signal).
 *  - Any text whose detected script is fa or en -> accept.
 *  - Any text with even a small amount of Latin or Arabic-script characters
 *    is accepted (so typos like "adde" don't get pre-rejected just because
 *    detectLanguageCode happens to flag something unusual).
 *  - Only inputs that are >50% a non-fa/non-en script (Cyrillic, CJK,
 *    Hebrew, Greek, Thai, Devanagari) are rejected client-side.
 *
 * @param {string} text
 * @returns {{ supported: boolean, detected: string }}
 */
export function isSupportedLanguage(text) {
  if (!text || typeof text !== 'string') return { supported: true, detected: 'en' };
  const detected = detectLanguageCode(text);
  if (detected === 'fa' || detected === 'en') return { supported: true, detected };

  // Detected as something else - but if the input contains ANY Latin letters
  // or Persian/Arabic script, defer to the LLM. This catches mixed inputs
  // (e.g. "adde سلام") and misspellings that happen to skew the detector.
  const hasLatin = /[a-zA-Z]/.test(text);
  const hasArabicScript = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text);
  if (hasLatin || hasArabicScript) return { supported: true, detected };

  return { supported: false, detected };
}
