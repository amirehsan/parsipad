# Translation Core Implementation Plan (ParsiPad 3.0, sub-project 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ParsiPad's single-prompt translation path with a context-aware, mode-routed, schema-enforced core that streams long text, reports truncation, and keeps the existing UI working through thin adapters.

**Architecture:** New pure modules under `lib/translation/` (mode router, normalizers, prompts, schemas, budgets, errors, cache key) feed a rewritten `translate()` in `lib/api.js`. Providers gain `temperature`, native structured output, `truncated` detection and an SSE `stream()` method built on a shared parser in `lib/providers/sse.js`. The service worker routes one-shot requests through `TRANSLATE` and streamed requests through a `translate-stream` port; a shared `lib/translation/client.js` hides that choice from the content script and popup.

**Tech Stack:** Chrome MV3 extension, ES modules bundled by esbuild (`npm run build`), Vitest (`npm test`, node environment, no DOM), ESLint (`npm run lint`), raw `fetch` against Claude, Gemini and OpenAI REST APIs.

**Spec:** `docs/superpowers/specs/2026-08-20-translation-core-design.md`

## Global Constraints

- Branch `feat/translator-3`; one commit per task; commit messages follow the repo's conventional style (`feat(scope): ...`, `test(scope): ...`); never mention "claude code" and never add a `Co-Authored-By` trailer.
- No em dashes and no emojis in code, comments, docs, prompts or commit messages. Invisible characters (soft hyphen, zero-width characters) are always written as `\uXXXX` escapes in source and tests, never as literal characters.
- Code style per `eslint.config.js`: single quotes, semicolons, `eqeqeq`, `prefer-const`, unused args prefixed `_`. Run `npm run lint` before every commit.
- ES modules everywhere; files in `lib/` must not touch the DOM; `chrome.*` is only used in `lib/storage.js`, `lib/cache.js`, `lib/history.js`, `lib/translation/client.js`, `background/`, `content/`, `popup/`, `settings/`.
- Model ids stay `claude-haiku-4-5-20251001`, `gemini-2.5-flash`, `gpt-4o-mini`.
- Temperatures: translation 0.2, grammar points 0.3, polish 0.5. Budgets: word/phrase 700, sentence 900, text/batch `min(4096, 400 + 2 * chars)`. Stream idle timeout 20000 ms.
- Canonical JSON schemas contain only `type`, `properties`, `required`, `enum`, `items`, `description`. No `maxItems`, no `additionalProperties`.
- Array caps: senses 5, synonyms 5, antonyms 3, alternatives 3, grammar points 4.
- Persian output is passed through `normalizePersian` before display, cache, history and copy.
- Tests live in `tests/*.test.js`, run with `npx vitest run <file>`; `chrome.storage.local` is stubbed with the in-memory helper shown in Task 10.
- The app must build and work at the end of every task (`npm run build` succeeds; existing flows keep functioning through adapters).

---

## File structure

| File | Responsibility |
|---|---|
| `lib/translation/errors.js` (new) | `ERROR_CODES`, `TranslationError`, `toTranslationError`, `errorI18nKey` |
| `lib/translation/languages.js` (new) | `LANGUAGE_NAMES` (full English names), `getLanguageName` |
| `lib/translation/mode.js` (new) | `classifyMode`, `countSentenceTerminators`, `stripEdgePunctuation`, `MODES` |
| `lib/translation/normalize.js` (new) | `normalizeInput`, `normalizePersian` |
| `lib/translation/schemas.js` (new) | `WORD_SCHEMA`, `SENTENCE_SCHEMA`, `GRAMMAR_POINTS_SCHEMA`, `LIMITS`, `coerceResult`, `coerceGrammarPoints`, `schemaForMode` |
| `lib/translation/prompts.js` (new) | `CORE_PROMPT`, `buildSystemPrompt`, `buildUserMessage`, `selectGlossaryEntries`, `GRAMMAR_POINTS_PROMPT`, `buildGrammarUserMessage` |
| `lib/translation/budget.js` (new) | `TEMPERATURES`, `computeMaxTokens`, `STREAM_IDLE_TIMEOUT_MS`, `isStreamingMode` |
| `lib/translation/cache-key.js` (new) | `buildCacheKeyParts`, `hashContext` |
| `lib/translation/client.js` (new) | `requestTranslation` (sendMessage or port, returns `{ error }` objects like today) |
| `lib/providers/sse.js` (new) | `createSseParser`, `readSseEvents` |
| `lib/providers/schema-adapters.js` (new) | `withAdditionalPropertiesFalse`, `withPropertyOrdering` |
| `lib/providers/base-provider.js` | new `complete` contract, `stream`, `consumeStream` helper; `getMaxTokens` removed |
| `lib/providers/claude-provider.js`, `gemini-provider.js`, `openai-provider.js` | structured output, temperature, `truncated`, `stream`, exported `parse*SseEvent`, `TranslationError` in `handleError` |
| `lib/api.js` | `translate(request)`, `explainGrammar`; batch inference removed |
| `lib/constants.js` | `STORAGE_KEYS.translateOtherLanguages`, `ACTIONS.EXPLAIN_GRAMMAR`; `SYSTEM_PROMPT` and `GRAMMAR_SYSTEM_PROMPT` removed |
| `lib/cache.js` | key from ordered parts; stores whole result |
| `lib/history.js` | `addToHistory(entry)` with structured result, 4000-char cap |
| `lib/language-detect.js` | `getTranslationInfo` adds `detectedName` |
| `lib/storage.js` | `getTranslateOtherLanguages`, `setTranslateOtherLanguages` |
| `lib/i18n.js` | error messages and setting labels, en and fa |
| `background/service-worker.js` | new `handleTranslate`, `handleExplainGrammar`, `translate-stream` port, localized error responses |
| `content/context.js` (new) | `sliceContext` (pure), `captureSelectionContext` (DOM) |
| `content/main.js` | adapters: context capture, `requestTranslation`, new result fields, `EXPLAIN_GRAMMAR`, batch mode for page translation |
| `popup/popup.js` | adapters: `requestTranslation`, new result fields, grammar via `EXPLAIN_GRAMMAR` |
| `settings/settings.html`, `settings/settings.js` | "Translate other languages into Persian" toggle |
| `lib/page-translator.js` | deleted (no importers) |

---

### Task 1: Typed errors

**Files:**
- Create: `lib/translation/errors.js`
- Test: `tests/errors.test.js`

**Interfaces:**
- Produces: `ERROR_CODES` (frozen object of string codes), `class TranslationError extends Error { code: string }`, `toTranslationError(error): TranslationError`, `errorI18nKey(code): string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/errors.test.js
import { describe, it, expect } from 'vitest';
import { ERROR_CODES, TranslationError, toTranslationError, errorI18nKey } from '../lib/translation/errors.js';

describe('TranslationError', () => {
  it('keeps a known code and a default message', () => {
    const err = new TranslationError('TRUNCATED');
    expect(err.code).toBe(ERROR_CODES.TRUNCATED);
    expect(err.message).toMatch(/cut off/i);
    expect(err).toBeInstanceOf(Error);
  });

  it('falls back to UNKNOWN for unknown codes but keeps the message', () => {
    const err = new TranslationError('NOPE', 'custom text');
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('custom text');
  });

  it('maps fetch failures to NETWORK', () => {
    expect(toTranslationError(new Error('Failed to fetch')).code).toBe('NETWORK');
  });

  it('maps timeouts to TIMEOUT', () => {
    const dom = new DOMException('Request timed out', 'TimeoutError');
    expect(toTranslationError(dom).code).toBe('TIMEOUT');
    expect(toTranslationError(new Error('request timed out')).code).toBe('TIMEOUT');
  });

  it('maps aborts to ABORTED', () => {
    expect(toTranslationError(new DOMException('Aborted', 'AbortError')).code).toBe('ABORTED');
  });

  it('passes TranslationError through unchanged', () => {
    const original = new TranslationError('RATE_LIMITED');
    expect(toTranslationError(original)).toBe(original);
  });

  it('wraps anything else as UNKNOWN with the original message', () => {
    const err = toTranslationError(new Error('boom'));
    expect(err.code).toBe('UNKNOWN');
    expect(err.message).toBe('boom');
  });

  it('derives i18n keys from codes', () => {
    expect(errorI18nKey('TRUNCATED')).toBe('errorTruncated');
    expect(errorI18nKey('INVALID_API_KEY')).toBe('errorInvalidApiKey');
    expect(errorI18nKey('WHATEVER')).toBe('errorUnknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/errors.test.js`
Expected: FAIL with "Failed to load url ../lib/translation/errors.js"

- [ ] **Step 3: Write the implementation**

```js
// lib/translation/errors.js
/**
 * Typed errors for the translation pipeline. Every failure that reaches the
 * UI carries a stable code so messages can be localized (see errorI18nKey)
 * and so callers can branch without string matching.
 */

export const ERROR_CODES = Object.freeze({
  EMPTY_INPUT: 'EMPTY_INPUT',
  UNSUPPORTED: 'UNSUPPORTED',
  TRUNCATED: 'TRUNCATED',
  PARSE_FAILED: 'PARSE_FAILED',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  API_KEY_NOT_SET: 'API_KEY_NOT_SET',
  UNKNOWN: 'UNKNOWN'
});

// English fallbacks. The UI prefers the localized string from lib/i18n.js.
const DEFAULT_MESSAGES = {
  EMPTY_INPUT: 'Select or type some text to translate.',
  UNSUPPORTED: 'ParsiPad only supports Persian and English. Please try a different selection.',
  TRUNCATED: 'The translation was cut off. Select a shorter passage or translate in parts.',
  PARSE_FAILED: 'The translation could not be read. Please try again.',
  NETWORK: 'Check your internet connection.',
  TIMEOUT: 'The translation took too long. Please try again.',
  ABORTED: 'Translation cancelled.',
  INVALID_API_KEY: 'Invalid API key. Please check settings.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  SERVER_ERROR: 'Translation service unavailable. Please try again.',
  API_KEY_NOT_SET: 'API key not set. Please configure it in settings.',
  UNKNOWN: 'An unexpected error occurred.'
};

const I18N_KEYS = {
  EMPTY_INPUT: 'errorEmptyInput',
  UNSUPPORTED: 'errorUnsupported',
  TRUNCATED: 'errorTruncated',
  PARSE_FAILED: 'errorParseFailed',
  NETWORK: 'errorNetwork',
  TIMEOUT: 'errorTimeout',
  ABORTED: 'errorAborted',
  INVALID_API_KEY: 'errorInvalidApiKey',
  RATE_LIMITED: 'errorRateLimited',
  SERVER_ERROR: 'errorServerError',
  API_KEY_NOT_SET: 'errorApiKeyNotSet',
  UNKNOWN: 'errorUnknown'
};

export class TranslationError extends Error {
  /**
   * @param {string} code - One of ERROR_CODES; unknown codes become UNKNOWN
   * @param {string} [message] - Optional override (used for provider messages)
   */
  constructor(code, message) {
    const safeCode = ERROR_CODES[code] ? code : ERROR_CODES.UNKNOWN;
    super(message || DEFAULT_MESSAGES[safeCode]);
    this.name = 'TranslationError';
    this.code = safeCode;
  }
}

/**
 * Normalize any thrown value into a TranslationError.
 * @param {unknown} error
 * @returns {TranslationError}
 */
export function toTranslationError(error) {
  if (error instanceof TranslationError) return error;
  const message = typeof error?.message === 'string' ? error.message : String(error ?? '');
  const name = error?.name || '';
  if (name === 'AbortError') return new TranslationError(ERROR_CODES.ABORTED);
  if (name === 'TimeoutError' || /timed out|timeout/i.test(message)) return new TranslationError(ERROR_CODES.TIMEOUT);
  if (/failed to fetch|networkerror|network error/i.test(message)) return new TranslationError(ERROR_CODES.NETWORK);
  return new TranslationError(ERROR_CODES.UNKNOWN, message || undefined);
}

/**
 * i18n key for a code (see lib/i18n.js).
 * @param {string} code
 * @returns {string}
 */
export function errorI18nKey(code) {
  return I18N_KEYS[code] || I18N_KEYS.UNKNOWN;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/errors.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/translation/errors.js tests/errors.test.js && git commit -m "feat(translation): add typed TranslationError with stable codes"
```

---

### Task 2: Language names and mode router

**Files:**
- Create: `lib/translation/languages.js`, `lib/translation/mode.js`
- Test: `tests/mode.test.js`

**Interfaces:**
- Produces: `getLanguageName(code): string`; `MODES` frozen object; `classifyMode(text): 'word' | 'phrase' | 'sentence' | 'text'`; `countSentenceTerminators(text): number`; `stripEdgePunctuation(text): string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/mode.test.js
import { describe, it, expect } from 'vitest';
import { classifyMode, countSentenceTerminators, stripEdgePunctuation } from '../lib/translation/mode.js';
import { getLanguageName } from '../lib/translation/languages.js';

describe('stripEdgePunctuation', () => {
  it('removes surrounding quotes and trailing terminators', () => {
    expect(stripEdgePunctuation('"Hello."')).toBe('Hello');
    expect(stripEdgePunctuation('(charge),')).toBe('charge');
    expect(stripEdgePunctuation('سلام.')).toBe('سلام');
  });
});

describe('countSentenceTerminators', () => {
  it('counts terminal runs followed by space or end', () => {
    expect(countSentenceTerminators('One. Two! Three?')).toBe(3);
    expect(countSentenceTerminators('سلام. خوبی؟')).toBe(2);
  });
  it('ignores abbreviation dots after one or two letters', () => {
    expect(countSentenceTerminators('e.g. apples and U.S. exports')).toBe(0);
    expect(countSentenceTerminators('We met Dr. Smith.')).toBe(1);
  });
  it('treats a run like ?! as one terminator', () => {
    expect(countSentenceTerminators('Really?! Yes.')).toBe(2);
  });
});

describe('classifyMode', () => {
  it('classifies single words, with or without punctuation', () => {
    expect(classifyMode('charge')).toBe('word');
    expect(classifyMode('Charge.')).toBe('word');
    expect(classifyMode('"می‌روم"')).toBe('word');
  });
  it('classifies short phrases without terminal punctuation', () => {
    expect(classifyMode('run the migration')).toBe('phrase');
    expect(classifyMode('as a matter of fact')).toBe('phrase');
    expect(classifyMode('e.g. apples')).toBe('phrase');
  });
  it('classifies one sentence', () => {
    expect(classifyMode('They will charge you a fee for late returns.')).toBe('sentence');
    expect(classifyMode('Go home.')).toBe('sentence');
    expect(classifyMode('من دیروز به بازار رفتم')).toBe('sentence');
  });
  it('classifies multi-sentence or long input as text', () => {
    expect(classifyMode('One sentence. Another sentence.')).toBe('text');
    expect(classifyMode('a '.repeat(150).trim())).toBe('text');
    expect(classifyMode('line one\nline two')).toBe('text');
  });
  it('treats a long single token as a sentence, not a word', () => {
    expect(classifyMode('x'.repeat(41))).toBe('sentence');
  });
});

describe('getLanguageName', () => {
  it('maps codes to English names with a fallback', () => {
    expect(getLanguageName('fa')).toBe('Persian');
    expect(getLanguageName('ru')).toBe('Russian');
    expect(getLanguageName('xx')).toBe('the source language');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mode.test.js`
Expected: FAIL with "Failed to load url ../lib/translation/mode.js"

- [ ] **Step 3: Write the implementation**

```js
// lib/translation/languages.js
/** Full English language names used inside prompts. */
export const LANGUAGE_NAMES = Object.freeze({
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
});

/**
 * @param {string} code
 * @returns {string}
 */
export function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || 'the source language';
}
```

```js
// lib/translation/mode.js
/**
 * Client-side mode router. Decides which translation job a piece of text is
 * (word, phrase, sentence, text). Batch is never inferred; page translation
 * passes it explicitly.
 */

export const MODES = Object.freeze({
  WORD: 'word',
  PHRASE: 'phrase',
  SENTENCE: 'sentence',
  TEXT: 'text',
  BATCH: 'batch'
});

const WORD_MAX_CHARS = 40;
const PHRASE_MAX_TOKENS = 6;
const PHRASE_MAX_CHARS = 60;
const SENTENCE_MAX_CHARS = 280;

// Leading and trailing punctuation that does not belong to the word itself.
const LEADING_PUNCT = /^[\s"'“”‘’«»(\[{]+/;
const TRAILING_PUNCT = /[\s"'“”‘’«»)\]}.!?؟…,;:،؛]+$/;
const ENDS_WITH_TERMINAL = /[.!?؟…]["'”’»)\]]*$/;
const TERMINATOR_RUN = /(\S*?)([.!?؟]+)(?=\s|$)/g;

/**
 * @param {string} text
 * @returns {string}
 */
export function stripEdgePunctuation(text) {
  return String(text || '').replace(LEADING_PUNCT, '').replace(TRAILING_PUNCT, '');
}

/**
 * Count sentence terminators: a run of . ! ? or Arabic ? followed by
 * whitespace or end of string. A single dot after a one- or two-letter Latin
 * token (e.g., U.S., Dr) is an abbreviation, not a terminator.
 * @param {string} text
 * @returns {number}
 */
export function countSentenceTerminators(text) {
  const source = String(text || '');
  const re = new RegExp(TERMINATOR_RUN.source, 'g');
  let count = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    const before = match[1];
    const run = match[2];
    if (run === '.') {
      const lastLetters = before.split(/[^A-Za-z]+/).pop() || '';
      if (lastLetters.length >= 1 && lastLetters.length <= 2) continue;
    }
    count++;
  }
  return count;
}

/**
 * @param {string} text
 * @returns {'word' | 'phrase' | 'sentence' | 'text'}
 */
export function classifyMode(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return MODES.TEXT;
  if (/\n/.test(trimmed)) return MODES.TEXT;

  const core = stripEdgePunctuation(trimmed);
  const tokens = core ? core.split(/\s+/) : [];
  const terminators = countSentenceTerminators(trimmed);
  const endsWithTerminal = ENDS_WITH_TERMINAL.test(trimmed);

  if (tokens.length === 1 && core.length <= WORD_MAX_CHARS && countSentenceTerminators(core) === 0) {
    return MODES.WORD;
  }
  if (tokens.length <= PHRASE_MAX_TOKENS && trimmed.length <= PHRASE_MAX_CHARS && !endsWithTerminal && terminators === 0) {
    return MODES.PHRASE;
  }
  if (terminators <= 1 && trimmed.length <= SENTENCE_MAX_CHARS) {
    return MODES.SENTENCE;
  }
  return MODES.TEXT;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mode.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/translation/languages.js lib/translation/mode.js tests/mode.test.js && git commit -m "feat(translation): add mode router and language names"
```

---

### Task 3: Input and Persian normalizers

**Files:**
- Create: `lib/translation/normalize.js`
- Test: `tests/normalize.test.js`

**Interfaces:**
- Produces: `normalizeInput(text): string`, `normalizePersian(text, { persianDigits?: boolean }): string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/normalize.test.js
import { describe, it, expect } from 'vitest';
import { normalizeInput, normalizePersian } from '../lib/translation/normalize.js';

describe('normalizeInput', () => {
  it('joins single line breaks inside a sentence', () => {
    expect(normalizeInput('the quick brown\nfox jumps')).toBe('the quick brown fox jumps');
  });
  it('keeps a break after terminal punctuation', () => {
    expect(normalizeInput('First sentence.\nSecond sentence.')).toBe('First sentence.\nSecond sentence.');
  });
  it('keeps paragraph breaks', () => {
    expect(normalizeInput('para one\n\npara two')).toBe('para one\n\npara two');
    expect(normalizeInput('para one\n\n\n\npara two')).toBe('para one\n\npara two');
  });
  it('keeps list items on their own lines', () => {
    expect(normalizeInput('- apples\n- pears')).toBe('- apples\n- pears');
    expect(normalizeInput('1. first\n2) second')).toBe('1. first\n2) second');
  });
  it('removes soft hyphens and zero-width characters between Latin letters', () => {
    expect(normalizeInput('hy­phen​ated')).toBe('hyphenated');
    expect(normalizeInput('ab‌cd')).toBe('abcd');
  });
  it('preserves the zero-width non-joiner in Persian', () => {
    expect(normalizeInput('می‌روم')).toBe('می‌روم');
  });
  it('drops standalone footnote markers', () => {
    expect(normalizeInput('text [12] continues [3]')).toBe('text continues');
  });
  it('collapses repeated spaces and normalizes CRLF', () => {
    expect(normalizeInput('a   b\r\nc')).toBe('a b c');
  });
  it('returns empty string for empty input', () => {
    expect(normalizeInput('')).toBe('');
    expect(normalizeInput(null)).toBe('');
  });
});

describe('normalizePersian', () => {
  it('maps Arabic Yeh and Kaf to Persian forms', () => {
    expect(normalizePersian('كتاب علي')).toBe('کتاب علی');
  });
  it('removes spaces before Persian punctuation', () => {
    expect(normalizePersian('سلام ، خوبی ؟')).toBe('سلام، خوبی؟');
  });
  it('maps Arabic-Indic digits only when asked', () => {
    expect(normalizePersian('١٢')).toBe('١٢');
    expect(normalizePersian('١٢', { persianDigits: true })).toBe('۱۲');
  });
  it('trims and collapses spaces', () => {
    expect(normalizePersian('  سلام   دنیا ')).toBe('سلام دنیا');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/normalize.test.js`
Expected: FAIL with "Failed to load url ../lib/translation/normalize.js"

- [ ] **Step 3: Write the implementation**

```js
// lib/translation/normalize.js
/**
 * Input normalization (before sending to the model) and Persian output
 * normalization (before display, cache, history and copy).
 */

// Placeholder that survives the line-joining pass; never appears in user text.
const PARAGRAPH_MARK = ' ';
const TERMINAL_BEFORE_BREAK = /[.!?؟:;،؛]$/;
const LIST_ITEM_START = /^\s*(?:[-*•]\s|\d+[.)]\s)/;

/**
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeInput(text) {
  if (!text) return '';
  let s = String(text).replace(/\r\n?/g, '\n');

  // Soft hyphen, zero-width space, BOM: never meaningful, strip everywhere.
  s = s.replace(/[­​﻿]/g, '');
  // ZWNJ / ZWJ between Latin letters are layout artifacts; inside Persian they
  // are orthography and must stay.
  s = s.replace(/([A-Za-z])[‌‍]+(?=[A-Za-z])/g, '$1');

  // Standalone bracketed footnote markers.
  s = s.replace(/(^|\s)\[\d{1,3}\](?=\s|$)/g, '$1');

  // Protect paragraph breaks, then join single breaks inside sentences.
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, PARAGRAPH_MARK);
  const lines = s.split('\n');
  const joined = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      joined.push(line);
      continue;
    }
    const prev = joined[joined.length - 1];
    const keepBreak = TERMINAL_BEFORE_BREAK.test(prev.trimEnd())
      || LIST_ITEM_START.test(line)
      || prev.endsWith(PARAGRAPH_MARK)
      || line.startsWith(PARAGRAPH_MARK);
    if (keepBreak) {
      joined.push(line);
    } else {
      joined[joined.length - 1] = `${prev} ${line}`;
    }
  }
  s = joined.join('\n').split(PARAGRAPH_MARK).join('\n\n');

  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.split('\n').map(line => line.trim()).join('\n').trim();
}

/**
 * @param {unknown} text
 * @param {{ persianDigits?: boolean }} [options]
 * @returns {string}
 */
export function normalizePersian(text, options = {}) {
  if (!text) return '';
  let s = String(text)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
  if (options.persianDigits) {
    s = s.replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x06F0));
  }
  return s
    .replace(/ +([،؛؟.!])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/normalize.test.js`
Expected: PASS (13 tests). If the footnote test leaves a double space, confirm the `[ \t]{2,}` collapse runs after the marker removal (it does in the order above).

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/translation/normalize.js tests/normalize.test.js && git commit -m "feat(translation): add input and Persian output normalizers"
```

---

### Task 4: Schemas, coercion and provider schema adapters

**Files:**
- Create: `lib/translation/schemas.js`, `lib/providers/schema-adapters.js`
- Test: `tests/schemas.test.js`

**Interfaces:**
- Consumes: `TranslationError`, `ERROR_CODES` from Task 1.
- Produces: `WORD_SCHEMA`, `SENTENCE_SCHEMA`, `GRAMMAR_POINTS_SCHEMA`, `LIMITS`, `REGISTERS`, `ALTERNATIVE_LABELS`, `SOURCES`, `schemaForMode(mode): object | null`, `coerceResult(mode, obj): object`, `coerceGrammarPoints(obj): Array<{point, explanation}>`; `withAdditionalPropertiesFalse(schema): object`, `withPropertyOrdering(schema): object`.

- [ ] **Step 1: Write the failing test**

```js
// tests/schemas.test.js
import { describe, it, expect } from 'vitest';
import { WORD_SCHEMA, SENTENCE_SCHEMA, GRAMMAR_POINTS_SCHEMA, schemaForMode, coerceResult, coerceGrammarPoints, LIMITS } from '../lib/translation/schemas.js';
import { withAdditionalPropertiesFalse, withPropertyOrdering } from '../lib/providers/schema-adapters.js';

const ALLOWED_KEYWORDS = new Set(['type', 'properties', 'required', 'enum', 'items', 'description']);

function collectKeywords(schema, found = new Set()) {
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties') {
      Object.values(value).forEach(v => collectKeywords(v, found));
    } else if (key === 'items') {
      collectKeywords(value, found);
    } else {
      found.add(key);
    }
  }
  return found;
}

describe('canonical schemas', () => {
  it.each([['word', WORD_SCHEMA], ['sentence', SENTENCE_SCHEMA], ['grammar', GRAMMAR_POINTS_SCHEMA]])('%s uses only the shared keyword subset', (_name, schema) => {
    for (const k of collectKeywords(schema)) expect(ALLOWED_KEYWORDS.has(k), `keyword ${k}`).toBe(true);
  });
  it('lists every property as required and puts translation first', () => {
    for (const schema of [WORD_SCHEMA, SENTENCE_SCHEMA]) {
      expect(schema.required).toEqual(Object.keys(schema.properties));
      expect(Object.keys(schema.properties)[0]).toBe('translation');
    }
  });
  it('maps modes to schemas', () => {
    expect(schemaForMode('word')).toBe(WORD_SCHEMA);
    expect(schemaForMode('phrase')).toBe(WORD_SCHEMA);
    expect(schemaForMode('sentence')).toBe(SENTENCE_SCHEMA);
    expect(schemaForMode('text')).toBeNull();
    expect(schemaForMode('batch')).toBeNull();
  });
});

describe('coerceResult', () => {
  it('throws PARSE_FAILED without a translation', () => {
    expect(() => coerceResult('word', {})).toThrow(/could not be read/);
    expect(() => coerceResult('word', { translation: '  ' })).toThrowError(expect.objectContaining({ code: 'PARSE_FAILED' }));
  });
  it('defaults and caps word results', () => {
    const senses = Array.from({ length: 8 }, (_, i) => ({ pos: 'noun', meaning: `m${i}`, example: { src: 's', tgt: 't' } }));
    const out = coerceResult('word', { translation: ' هزینه ', register: 'weird', senses, synonyms: ['a', 'b', 'c', 'd', 'e', 'f', 7], antonyms: ['x', 'y', 'z', 'w'] });
    expect(out.translation).toBe('هزینه');
    expect(out.register).toBe('neutral');
    expect(out.senses).toHaveLength(LIMITS.senses);
    expect(out.synonyms).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out.antonyms).toEqual(['x', 'y', 'z']);
    expect(out.pronunciation).toBe('');
    expect(out.detectedSource).toBe('');
  });
  it('drops senses without a meaning', () => {
    const out = coerceResult('phrase', { translation: 'x', senses: [{ pos: 'noun' }, { meaning: 'ok' }] });
    expect(out.senses).toEqual([{ pos: '', meaning: 'ok', example: { src: '', tgt: '' } }]);
  });
  it('coerces sentence alternatives and labels', () => {
    const out = coerceResult('sentence', { translation: 'x', detectedSource: 'fa-latn', alternatives: [{ text: 'a', label: 'colloquial' }, { text: 'b', label: 'nope' }, { text: '' }, { text: 'c' }, { text: 'd' }] });
    expect(out.detectedSource).toBe('fa-latn');
    expect(out.alternatives).toEqual([{ text: 'a', label: 'colloquial' }, { text: 'b', label: 'other sense' }, { text: 'c', label: 'other sense' }]);
    expect(out.note).toBe('');
  });
  it('returns only the base fields for text mode', () => {
    expect(coerceResult('text', { translation: 'hi', senses: [] })).toEqual({ translation: 'hi', detectedSource: '', normalized: '', correction: '' });
  });
});

describe('coerceGrammarPoints', () => {
  it('caps and filters points', () => {
    const points = Array.from({ length: 6 }, (_, i) => ({ point: `p${i}`, explanation: `e${i}` }));
    expect(coerceGrammarPoints({ grammar: [...points, { point: '' }] })).toHaveLength(LIMITS.grammar);
    expect(coerceGrammarPoints({})).toEqual([]);
  });
});

describe('schema adapters', () => {
  it('adds additionalProperties false to every object', () => {
    const out = withAdditionalPropertiesFalse(WORD_SCHEMA);
    expect(out.additionalProperties).toBe(false);
    expect(out.properties.senses.items.additionalProperties).toBe(false);
    expect(out.properties.senses.items.properties.example.additionalProperties).toBe(false);
    expect(WORD_SCHEMA.additionalProperties).toBeUndefined();
  });
  it('adds propertyOrdering matching property order', () => {
    const out = withPropertyOrdering(WORD_SCHEMA);
    expect(out.propertyOrdering[0]).toBe('translation');
    expect(out.properties.senses.items.propertyOrdering).toEqual(['pos', 'meaning', 'example']);
    expect(out.additionalProperties).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schemas.test.js`
Expected: FAIL with "Failed to load url ../lib/translation/schemas.js"

- [ ] **Step 3: Write the implementation**

```js
// lib/translation/schemas.js
import { TranslationError, ERROR_CODES } from './errors.js';

export const LIMITS = Object.freeze({ senses: 5, synonyms: 5, antonyms: 3, alternatives: 3, grammar: 4 });
export const REGISTERS = Object.freeze(['formal', 'neutral', 'informal', 'slang', 'technical']);
export const ALTERNATIVE_LABELS = Object.freeze(['more formal', 'colloquial', 'literal', 'other sense']);
export const SOURCES = Object.freeze(['en', 'fa', 'fa-latn', 'other']);

const str = (description) => (description ? { type: 'string', description } : { type: 'string' });

const EXAMPLE_SCHEMA = {
  type: 'object',
  properties: {
    src: str('Short example in the headword language'),
    tgt: str('Its translation')
  },
  required: ['src', 'tgt']
};

const SENSE_SCHEMA = {
  type: 'object',
  properties: {
    pos: str('Part of speech'),
    meaning: str('Meaning in the target language'),
    example: EXAMPLE_SCHEMA
  },
  required: ['pos', 'meaning', 'example']
};

export const WORD_SCHEMA = {
  type: 'object',
  properties: {
    translation: str('Best rendering of the selection for this context'),
    detectedSource: { type: 'string', enum: [...SOURCES], description: 'Language the selection is actually written in' },
    normalized: str('Persian-script form when the source is Finglish, otherwise empty'),
    pronunciation: str('IPA between slashes for English headwords, otherwise empty'),
    pos: str('Primary part of speech, empty for phrases'),
    register: { type: 'string', enum: [...REGISTERS] },
    inContext: str('One sentence on why this sense fits the surrounding text, empty when no context was given'),
    senses: { type: 'array', description: 'Up to five distinct senses ordered by frequency', items: SENSE_SCHEMA },
    synonyms: { type: 'array', description: 'Up to five, same language as the headword', items: { type: 'string' } },
    antonyms: { type: 'array', description: 'Up to three, same language as the headword', items: { type: 'string' } },
    correction: str('Corrected source when it contained a real error, otherwise empty')
  },
  required: ['translation', 'detectedSource', 'normalized', 'pronunciation', 'pos', 'register', 'inContext', 'senses', 'synonyms', 'antonyms', 'correction']
};

export const SENTENCE_SCHEMA = {
  type: 'object',
  properties: {
    translation: str('Most natural rendering of the sentence'),
    detectedSource: { type: 'string', enum: [...SOURCES] },
    normalized: str('Persian-script form when the source is Finglish, otherwise empty'),
    register: { type: 'string', enum: [...REGISTERS] },
    alternatives: {
      type: 'array',
      description: 'Up to three alternatives in the target language',
      items: {
        type: 'object',
        properties: {
          text: str(),
          label: { type: 'string', enum: [...ALTERNATIVE_LABELS] }
        },
        required: ['text', 'label']
      }
    },
    note: str('One sentence about an idiom, cultural reference or ambiguity, otherwise empty'),
    correction: str('Corrected source when it contained a real error, otherwise empty')
  },
  required: ['translation', 'detectedSource', 'normalized', 'register', 'alternatives', 'note', 'correction']
};

export const GRAMMAR_POINTS_SCHEMA = {
  type: 'object',
  properties: {
    grammar: {
      type: 'array',
      description: 'Two to four grammar points about the English side',
      items: {
        type: 'object',
        properties: { point: str(), explanation: str() },
        required: ['point', 'explanation']
      }
    }
  },
  required: ['grammar']
};

/**
 * @param {string} mode
 * @returns {object | null}
 */
export function schemaForMode(mode) {
  if (mode === 'word' || mode === 'phrase') return WORD_SCHEMA;
  if (mode === 'sentence') return SENTENCE_SCHEMA;
  return null;
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const strings = (v, cap) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, cap) : []);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/**
 * Normalize a parsed model reply into the result contract for a mode.
 * @param {string} mode
 * @param {unknown} obj
 * @returns {object}
 */
export function coerceResult(mode, obj) {
  const translation = text(obj?.translation);
  if (!translation) throw new TranslationError(ERROR_CODES.PARSE_FAILED);

  const base = {
    translation,
    detectedSource: oneOf(obj.detectedSource, SOURCES, ''),
    normalized: text(obj.normalized),
    correction: text(obj.correction)
  };

  if (mode === 'word' || mode === 'phrase') {
    const senses = (Array.isArray(obj.senses) ? obj.senses : [])
      .filter(s => s && text(s.meaning))
      .map(s => ({ pos: text(s.pos), meaning: text(s.meaning), example: { src: text(s.example?.src), tgt: text(s.example?.tgt) } }))
      .slice(0, LIMITS.senses);
    return {
      ...base,
      pronunciation: text(obj.pronunciation),
      pos: text(obj.pos),
      register: oneOf(obj.register, REGISTERS, 'neutral'),
      inContext: text(obj.inContext),
      senses,
      synonyms: strings(obj.synonyms, LIMITS.synonyms),
      antonyms: strings(obj.antonyms, LIMITS.antonyms)
    };
  }

  if (mode === 'sentence') {
    const alternatives = (Array.isArray(obj.alternatives) ? obj.alternatives : [])
      .filter(a => a && text(a.text))
      .map(a => ({ text: text(a.text), label: oneOf(a.label, ALTERNATIVE_LABELS, 'other sense') }))
      .slice(0, LIMITS.alternatives);
    return {
      ...base,
      register: oneOf(obj.register, REGISTERS, 'neutral'),
      alternatives,
      note: text(obj.note)
    };
  }

  return base;
}

/**
 * @param {unknown} obj
 * @returns {Array<{point: string, explanation: string}>}
 */
export function coerceGrammarPoints(obj) {
  const list = Array.isArray(obj?.grammar) ? obj.grammar : [];
  return list
    .filter(p => p && text(p.point) && text(p.explanation))
    .map(p => ({ point: text(p.point), explanation: text(p.explanation) }))
    .slice(0, LIMITS.grammar);
}
```

```js
// lib/providers/schema-adapters.js
/**
 * Pure adapters from the canonical schema subset to each provider's dialect.
 * Both return deep copies; the canonical schema objects are never mutated.
 */

function mapObjects(schema, visit) {
  if (!schema || typeof schema !== 'object') return schema;
  const copy = { ...schema };
  if (copy.properties) {
    copy.properties = Object.fromEntries(Object.entries(copy.properties).map(([k, v]) => [k, mapObjects(v, visit)]));
  }
  if (copy.items) copy.items = mapObjects(copy.items, visit);
  return copy.type === 'object' ? visit(copy) : copy;
}

/** Claude and OpenAI strict mode require additionalProperties: false on every object. */
export function withAdditionalPropertiesFalse(schema) {
  return mapObjects(schema, obj => ({ ...obj, additionalProperties: false }));
}

/** Gemini responseSchema uses propertyOrdering to fix key order (translation first). */
export function withPropertyOrdering(schema) {
  return mapObjects(schema, obj => ({ ...obj, propertyOrdering: Object.keys(obj.properties || {}) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schemas.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/translation/schemas.js lib/providers/schema-adapters.js tests/schemas.test.js && git commit -m "feat(translation): add per-mode schemas, result coercion and provider schema adapters"
```

---

### Task 5: Budgets and prompt builders

**Files:**
- Create: `lib/translation/budget.js`, `lib/translation/prompts.js`
- Test: `tests/budget.test.js`, `tests/prompts.test.js`

**Interfaces:**
- Produces: `TEMPERATURES` (`{ translate: 0.2, grammar: 0.3, polish: 0.5 }`), `STREAM_IDLE_TIMEOUT_MS` (20000), `computeMaxTokens(mode, text): number`, `isStreamingMode(mode): boolean`; `CORE_PROMPT`, `buildSystemPrompt(mode): string`, `selectGlossaryEntries(glossary, text, direction): Array`, `buildUserMessage({ text, mode, fromName, toName, detectedByScript, context, glossary, direction }): string`, `GRAMMAR_POINTS_PROMPT`, `buildGrammarUserMessage({ source, translation, direction }): string`.
- Glossary entry shape: `{ source: string, target: string, direction: 'en-fa' | 'fa-en' | '' }` (`''` means both directions).

- [ ] **Step 1: Write the failing tests**

```js
// tests/budget.test.js
import { describe, it, expect } from 'vitest';
import { TEMPERATURES, STREAM_IDLE_TIMEOUT_MS, computeMaxTokens, isStreamingMode } from '../lib/translation/budget.js';

describe('budget', () => {
  it('exposes the agreed temperatures and idle timeout', () => {
    expect(TEMPERATURES).toEqual({ translate: 0.2, grammar: 0.3, polish: 0.5 });
    expect(STREAM_IDLE_TIMEOUT_MS).toBe(20000);
  });
  it('uses fixed budgets for short modes', () => {
    expect(computeMaxTokens('word', 'charge')).toBe(700);
    expect(computeMaxTokens('phrase', 'run the migration')).toBe(700);
    expect(computeMaxTokens('sentence', 'a'.repeat(200))).toBe(900);
  });
  it('scales text and batch budgets with input length, capped at 4096', () => {
    expect(computeMaxTokens('text', 'a'.repeat(100))).toBe(600);
    expect(computeMaxTokens('batch', 'a'.repeat(100))).toBe(600);
    expect(computeMaxTokens('text', 'a'.repeat(5000))).toBe(4096);
  });
  it('streams only text and batch', () => {
    expect(isStreamingMode('text')).toBe(true);
    expect(isStreamingMode('batch')).toBe(true);
    expect(isStreamingMode('word')).toBe(false);
    expect(isStreamingMode('sentence')).toBe(false);
  });
});
```

```js
// tests/prompts.test.js
import { describe, it, expect } from 'vitest';
import { CORE_PROMPT, buildSystemPrompt, buildUserMessage, selectGlossaryEntries, buildGrammarUserMessage, GRAMMAR_POINTS_PROMPT } from '../lib/translation/prompts.js';

describe('buildSystemPrompt', () => {
  it('starts with the shared core prompt for every mode', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      expect(buildSystemPrompt(mode).startsWith(CORE_PROMPT)).toBe(true);
    }
  });
  it('adds mode-specific instructions', () => {
    expect(buildSystemPrompt('word')).toMatch(/up to five distinct senses/);
    expect(buildSystemPrompt('sentence')).toMatch(/up to three alternatives/);
    expect(buildSystemPrompt('text')).toMatch(/Output only the translation/);
    expect(buildSystemPrompt('batch')).toMatch(/Keep the \[1\], \[2\] markers/);
  });
  it('states the Persian orthography rules once in the core', () => {
    expect(CORE_PROMPT).toMatch(/never Arabic/);
    expect(CORE_PROMPT).toMatch(/zero-width non-joiner/);
    expect(CORE_PROMPT).toMatch(/Finglish/);
  });
});

describe('selectGlossaryEntries', () => {
  const glossary = [
    { source: 'commit', target: 'کامیت', direction: 'en-fa' },
    { source: 'branch', target: 'شاخه', direction: '' },
    { source: 'خط', target: 'line', direction: 'fa-en' }
  ];
  it('matches whole words, case-insensitively, in the right direction', () => {
    expect(selectGlossaryEntries(glossary, 'Please Commit your work', 'en-fa')).toEqual([glossary[0]]);
    expect(selectGlossaryEntries(glossary, 'committed', 'en-fa')).toEqual([]);
    expect(selectGlossaryEntries(glossary, 'the branch', 'fa-en')).toEqual([glossary[1]]);
    expect(selectGlossaryEntries(glossary, 'commit', 'fa-en')).toEqual([]);
  });
  it('matches Persian terms', () => {
    expect(selectGlossaryEntries(glossary, 'این خط را بخوان', 'fa-en')).toEqual([glossary[2]]);
  });
  it('tolerates missing input', () => {
    expect(selectGlossaryEntries(undefined, 'x', 'en-fa')).toEqual([]);
  });
});

describe('buildUserMessage', () => {
  const base = { text: 'charge', mode: 'word', fromName: 'English', toName: 'Persian', direction: 'en-fa' };
  it('wraps a word with task and selection tags and no context tags when absent', () => {
    const msg = buildUserMessage(base);
    expect(msg).toContain('<task>');
    expect(msg).toContain('Mode: word. Source: English (detected, may be wrong). Target: Persian.');
    expect(msg).toContain('<selection>charge</selection>');
    expect(msg).not.toContain('<context before>');
    expect(msg).not.toContain('<page');
    expect(msg).not.toContain('<glossary>');
  });
  it('omits the detection caveat when the user fixed the direction', () => {
    expect(buildUserMessage({ ...base, detectedByScript: false })).toContain('Source: English. Target: Persian.');
  });
  it('includes context and page tags when provided', () => {
    const msg = buildUserMessage({ ...base, context: { before: 'they will ', after: ' you a fee', pageLang: 'en', title: 'Library policies' } });
    expect(msg).toContain('<context before>they will </context before>');
    expect(msg).toContain('<context after> you a fee</context after>');
    expect(msg).toContain('<page lang="en" title="Library policies"/>');
    expect(msg.indexOf('<context before>')).toBeLessThan(msg.indexOf('<selection>'));
  });
  it('includes only matching glossary entries', () => {
    const msg = buildUserMessage({ ...base, text: 'commit now', mode: 'phrase', glossary: [{ source: 'commit', target: 'کامیت', direction: '' }, { source: 'push', target: 'پوش', direction: '' }] });
    expect(msg).toContain('<glossary>\ncommit => کامیت\n</glossary>');
    expect(msg).not.toContain('push');
  });
  it('uses a text tag for text and batch modes', () => {
    const text = buildUserMessage({ ...base, mode: 'text', text: 'Para one.\n\nPara two.' });
    expect(text).toContain('Translate the whole text inside <text>.');
    expect(text).toContain('<text>\nPara one.\n\nPara two.\n</text>');
    const batch = buildUserMessage({ ...base, mode: 'batch', text: '[1] a\n[2] b' });
    expect(batch).toContain('Keep the [n] markers');
    expect(batch).toContain('<text>\n[1] a\n[2] b\n</text>');
  });
});

describe('grammar prompt', () => {
  it('asks for English-only points in JSON and passes both sides', () => {
    expect(GRAMMAR_POINTS_PROMPT).toMatch(/ENGLISH/);
    const msg = buildGrammarUserMessage({ source: 'I have been waiting.', translation: 'منتظر بوده‌ام.', direction: 'en-fa' });
    expect(msg).toContain('<source lang="English">I have been waiting.</source>');
    expect(msg).toContain('<translation lang="Persian">منتظر بوده‌ام.</translation>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/budget.test.js tests/prompts.test.js`
Expected: FAIL with "Failed to load url" for both modules

- [ ] **Step 3: Write the implementation**

```js
// lib/translation/budget.js
/** Sampling temperatures and output budgets shared by every provider. */
export const TEMPERATURES = Object.freeze({ translate: 0.2, grammar: 0.3, polish: 0.5 });

export const STREAM_IDLE_TIMEOUT_MS = 20000;

const SHORT_MODE_BUDGET = { word: 700, phrase: 700, sentence: 900 };
const MAX_BUDGET = 4096;

/**
 * @param {string} mode
 * @param {string} text
 * @returns {number}
 */
export function computeMaxTokens(mode, text) {
  if (SHORT_MODE_BUDGET[mode]) return SHORT_MODE_BUDGET[mode];
  const chars = (text || '').length;
  return Math.min(MAX_BUDGET, 400 + 2 * chars);
}

/**
 * @param {string} mode
 * @returns {boolean}
 */
export function isStreamingMode(mode) {
  return mode === 'text' || mode === 'batch';
}
```

```js
// lib/translation/prompts.js
/**
 * Prompt construction. CORE_PROMPT is byte-stable across requests so
 * provider-side prompt caching applies; per-mode addenda follow it.
 */

export const CORE_PROMPT = `You are ParsiPad, a professional translator between English and Persian for Persian speakers who read and study English.

Translate meaning, not words. Write the way an educated native speaker of the target language would write the same thing, in the same register as the source: casual stays casual, formal stays formal, technical stays technical.

Persian output: standard written Persian unless the source is casual. Use Persian ی and ک, never Arabic ي and ك. Use the zero-width non-joiner in prefixes and suffixes (می‌روم, کتاب‌ها, بزرگ‌تر). Use Persian punctuation (، ؛ ؟). Keep numerals as written in the source.

English output: American spelling, natural word order, contractions only when the source is casual.

Keep unchanged: proper nouns that have no standard Persian form, product and brand names, code, URLs, email addresses, @handles, hashtags, units and symbols. Preserve paragraph breaks, list structure and emphasis.

The source language was detected by script and may be wrong. If the text is Persian written in Latin letters (Finglish), treat it as Persian: translate it to English and return the Persian-script form in "normalized". If the text is neither English nor Persian, translate it into Persian.

Report a correction only when the source contains an error that changes meaning or blocks translation (a real misspelling, a missing word). Colloquial spelling and informal register are not errors.

Never add commentary, quotation marks or notes inside a translation.`;

const WORD_ADDENDUM = `The selection is a single word or short phrase. Give the best rendering for this context in "translation". Then list up to five distinct senses ordered by frequency, each with a part of speech, a target-language meaning and one short example pair. Synonyms (up to five) and antonyms (up to three) are in the same language as the headword. Pronunciation is IPA between slashes for English headwords and empty otherwise. "inContext" is one sentence explaining why the chosen sense fits the surrounding text; leave it empty when no context was given. Respond with JSON matching the schema and nothing else.`;

const SENTENCE_ADDENDUM = `The selection is one sentence. Give the most natural rendering in "translation". Then give up to three alternatives in the target language, each labelled "more formal", "colloquial", "literal" or "other sense". "note" is one sentence about an idiom, cultural reference or ambiguity, or empty. Respond with JSON matching the schema and nothing else.`;

const TEXT_ADDENDUM = `Translate the whole text. Output only the translation, preserving paragraphs. No JSON, no preface, no notes.`;

const BATCH_ADDENDUM = `Translate each numbered item. Keep the [1], [2] markers and the order, one item per line. Output only the numbered translations.`;

const MODE_ADDENDA = {
  word: WORD_ADDENDUM,
  phrase: WORD_ADDENDUM,
  sentence: SENTENCE_ADDENDUM,
  text: TEXT_ADDENDUM,
  batch: BATCH_ADDENDUM
};

/**
 * @param {string} mode
 * @returns {string}
 */
export function buildSystemPrompt(mode) {
  return `${CORE_PROMPT}\n\n${MODE_ADDENDA[mode] || TEXT_ADDENDUM}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Entries whose source term occurs in the text as a whole word and whose
 * direction matches (empty direction means both).
 * @param {Array<{source: string, target: string, direction?: string}>} glossary
 * @param {string} text
 * @param {string} direction
 * @returns {Array}
 */
export function selectGlossaryEntries(glossary, text, direction) {
  if (!Array.isArray(glossary) || !text) return [];
  return glossary.filter(entry => {
    if (!entry || !entry.source || !entry.target) return false;
    if (entry.direction && entry.direction !== direction) return false;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(entry.source)}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
    return pattern.test(text);
  });
}

function glossaryBlock(entries) {
  if (!entries.length) return [];
  return ['<glossary>', ...entries.map(e => `${e.source} => ${e.target}`), '</glossary>'];
}

/**
 * @param {object} params
 * @param {string} params.text - Normalized source text
 * @param {string} params.mode
 * @param {string} params.fromName - English name of the source language
 * @param {string} params.toName - English name of the target language
 * @param {boolean} [params.detectedByScript=true] - false when the user fixed the direction
 * @param {{before?: string, after?: string, pageLang?: string, title?: string}} [params.context]
 * @param {Array} [params.glossary]
 * @param {string} [params.direction]
 * @returns {string}
 */
export function buildUserMessage({ text, mode, fromName, toName, detectedByScript = true, context, glossary = [], direction = '' }) {
  const sourceLabel = detectedByScript ? `${fromName} (detected, may be wrong)` : fromName;
  const entries = selectGlossaryEntries(glossary, text, direction);
  const lines = ['<task>', `Mode: ${mode}. Source: ${sourceLabel}. Target: ${toName}.`];

  if (mode === 'text' || mode === 'batch') {
    lines.push(mode === 'batch'
      ? 'Translate each numbered item inside <text>. Keep the [n] markers and the order.'
      : 'Translate the whole text inside <text>.');
    lines.push('</task>', ...glossaryBlock(entries), '<text>', text, '</text>');
    return lines.join('\n');
  }

  lines.push('Translate only the text inside <selection>. Use <context> to choose the right sense; do not translate the context.', '</task>');
  lines.push(...glossaryBlock(entries));
  if (context?.before) lines.push(`<context before>${context.before}</context before>`);
  lines.push(`<selection>${text}</selection>`);
  if (context?.after) lines.push(`<context after>${context.after}</context after>`);
  if (context?.pageLang || context?.title) {
    const attrs = [
      context.pageLang ? `lang="${context.pageLang}"` : '',
      context.title ? `title="${String(context.title).replace(/"/g, '\'')}"` : ''
    ].filter(Boolean).join(' ');
    lines.push(`<page ${attrs}/>`);
  }
  return lines.join('\n');
}

export const GRAMMAR_POINTS_PROMPT = `You are an English-language teacher writing for a Persian-native speaker who wants to understand the ENGLISH grammar at play in a translation pair.

You receive the source text and its translation. Do not translate anything. Explain the grammar of the English side of the pair (whether English is the source or the translation).

Rules:
- Write every "point" and "explanation" in ENGLISH. No Persian-script text inside grammar[].
- Give two to four of the most educational points. Focus on what Persian speakers typically struggle with: tense system, articles, prepositions, word order, modal verbs, perfect aspects, agreement.
- Quote specific English words from the sentence ("In 'have been waiting', the present perfect continuous shows ...").
- Keep each explanation to one or two sentences.
- Respond with JSON matching the schema and nothing else.`;

const DIRECTION_NAMES = {
  'en-fa': ['English', 'Persian'],
  'fa-en': ['Persian', 'English']
};

/**
 * @param {{source: string, translation: string, direction: string}} params
 * @returns {string}
 */
export function buildGrammarUserMessage({ source, translation, direction }) {
  const [from, to] = DIRECTION_NAMES[direction] || DIRECTION_NAMES['en-fa'];
  return [
    `<source lang="${from}">${source}</source>`,
    `<translation lang="${to}">${translation}</translation>`
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/budget.test.js tests/prompts.test.js`
Expected: PASS (4 + 11 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/translation/budget.js lib/translation/prompts.js tests/budget.test.js tests/prompts.test.js && git commit -m "feat(translation): add core prompt, per-mode messages and token budgets"
```

---

### Task 6: SSE parser and reader

**Files:**
- Create: `lib/providers/sse.js`
- Test: `tests/sse.test.js`

**Interfaces:**
- Consumes: `TranslationError`, `ERROR_CODES` (Task 1).
- Produces: `createSseParser(): { push(chunk: string): Array<{event: string, data: string}>, flush(): Array }`, `readSseEvents(response, { signal, idleTimeoutMs }): AsyncGenerator<{event, data}>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sse.test.js
import { describe, it, expect } from 'vitest';
import { createSseParser, readSseEvents } from '../lib/providers/sse.js';

function streamResponse(chunks, { delayMs = 0, hang = false } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
        controller.enqueue(encoder.encode(chunk));
      }
      if (!hang) controller.close();
    }
  });
  return new Response(body, { status: 200 });
}

describe('createSseParser', () => {
  it('parses event and multi-line data blocks', () => {
    const parser = createSseParser();
    const events = parser.push('event: ping\ndata: {"a":1}\ndata: {"b":2}\n\n');
    expect(events).toEqual([{ event: 'ping', data: '{"a":1}\n{"b":2}' }]);
  });
  it('buffers across chunk boundaries and handles CRLF', () => {
    const parser = createSseParser();
    expect(parser.push('data: hel')).toEqual([]);
    expect(parser.push('lo\r\n\r\ndata: [DONE]\r\n\r\n')).toEqual([
      { event: 'message', data: 'hello' },
      { event: 'message', data: '[DONE]' }
    ]);
  });
  it('ignores comments and unknown fields, flushes a trailing block', () => {
    const parser = createSseParser();
    expect(parser.push(': keep-alive\nid: 7\n\n')).toEqual([]);
    expect(parser.push('data: tail')).toEqual([]);
    expect(parser.flush()).toEqual([{ event: 'message', data: 'tail' }]);
    expect(parser.flush()).toEqual([]);
  });
});

describe('readSseEvents', () => {
  it('yields events from a streamed response', async () => {
    const response = streamResponse(['data: a\n\nda', 'ta: b\n\n']);
    const seen = [];
    for await (const ev of readSseEvents(response)) seen.push(ev.data);
    expect(seen).toEqual(['a', 'b']);
  });
  it('throws TIMEOUT when the stream goes idle', async () => {
    const response = streamResponse(['data: a\n\n'], { hang: true });
    const run = async () => {
      for await (const _ev of readSseEvents(response, { idleTimeoutMs: 30 })) { /* drain */ }
    };
    await expect(run()).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('stops when the abort signal fires', async () => {
    const controller = new AbortController();
    const response = streamResponse(['data: a\n\n', 'data: b\n\n'], { delayMs: 20 });
    const seen = [];
    const run = async () => {
      for await (const ev of readSseEvents(response, { signal: controller.signal })) {
        seen.push(ev.data);
        controller.abort();
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'ABORTED' });
    expect(seen).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sse.test.js`
Expected: FAIL with "Failed to load url ../lib/providers/sse.js"

- [ ] **Step 3: Write the implementation**

```js
// lib/providers/sse.js
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

const BLOCK_DELIMITER = /\r?\n\r?\n/;

function parseBlock(block) {
  let event = 'message';
  const data = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    const idx = rawLine.indexOf(':');
    const field = idx === -1 ? rawLine : rawLine.slice(0, idx);
    let value = idx === -1 ? '' : rawLine.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

/**
 * Incremental Server-Sent Events parser. Feed it decoded text chunks; it
 * returns complete events and keeps partial blocks buffered.
 */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      const events = [];
      let match;
      while ((match = BLOCK_DELIMITER.exec(buffer)) !== null) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const event = parseBlock(block);
        if (event) events.push(event);
      }
      return events;
    },
    flush() {
      const block = buffer;
      buffer = '';
      const event = block.trim() ? parseBlock(block) : null;
      return event ? [event] : [];
    }
  };
}

/**
 * Read a fetch Response body as SSE events. Throws TranslationError TIMEOUT
 * when no bytes arrive for idleTimeoutMs and ABORTED when signal fires.
 * @param {Response} response
 * @param {{ signal?: AbortSignal, idleTimeoutMs?: number }} [options]
 */
export async function* readSseEvents(response, { signal, idleTimeoutMs = 0 } = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  const readWithIdleTimeout = () => {
    if (!idleTimeoutMs) return reader.read();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reader.cancel().catch(() => {});
        reject(new TranslationError(ERROR_CODES.TIMEOUT));
      }, idleTimeoutMs);
    });
    return Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
  };

  try {
    while (true) {
      if (aborted) throw new TranslationError(ERROR_CODES.ABORTED);
      const { value, done } = await readWithIdleTimeout();
      if (aborted) throw new TranslationError(ERROR_CODES.ABORTED);
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) yield event;
    }
    for (const event of parser.flush()) yield event;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sse.test.js`
Expected: PASS (6 tests). If the abort test sees `['a', 'b']`, the generator checked `aborted` only after the read resolved; the check before `readWithIdleTimeout()` handles the abort raised inside the consumer loop body.

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/providers/sse.js tests/sse.test.js && git commit -m "feat(providers): add shared SSE parser and reader with idle timeout"
```

---

### Task 7: Base provider contract and Claude provider

**Files:**
- Modify: `lib/providers/base-provider.js` (whole file), `lib/providers/claude-provider.js` (whole file)
- Test: `tests/claude-provider.test.js`

**Interfaces:**
- Consumes: `readSseEvents` (Task 6), `withAdditionalPropertiesFalse` (Task 4), `TranslationError`, `ERROR_CODES` (Task 1), `STREAM_IDLE_TIMEOUT_MS` (Task 5), existing `withRetry` from `lib/retry.js`.
- Produces: `BaseProvider.complete({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, apiKey, signal, timeoutMs }) -> { text, inputTokens, outputTokens, truncated }`; `BaseProvider.stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs }) -> same shape`; `BaseProvider.consumeStream(response, parseEvent, { onDelta, signal, idleTimeoutMs })`; `parseClaudeSseEvent({ event, data }) -> { delta?, inputTokens?, outputTokens?, truncated?, done? }`. `getMaxTokens` is removed (no callers; confirm with `grep -rn getMaxTokens lib background popup content`).

- [ ] **Step 1: Write the failing test**

```js
// tests/claude-provider.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeProvider, parseClaudeSseEvent } from '../lib/providers/claude-provider.js';
import { PROVIDER_CONFIGS } from '../lib/constants.js';
import { WORD_SCHEMA } from '../lib/translation/schemas.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function sseResponse(text) {
  return new Response(new TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('ClaudeProvider', () => {
  let provider;
  let requests;

  beforeEach(() => {
    provider = new ClaudeProvider(PROVIDER_CONFIGS.claude);
    requests = [];
  });

  it('sends temperature and structured output config, reports truncation', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ content: [{ type: 'text', text: '{"translation":"x"}' }], stop_reason: 'max_tokens', usage: { input_tokens: 11, output_tokens: 7 } });
    });
    const result = await provider.complete({ systemPrompt: 'sys', userPrompt: 'user', maxTokens: 700, temperature: 0.2, responseSchema: WORD_SCHEMA, apiKey: 'sk-ant-test' });
    expect(result).toEqual({ text: '{"translation":"x"}', inputTokens: 11, outputTokens: 7, truncated: true });
    const body = requests[0];
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(700);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.output_config.format.schema.properties.senses.items.additionalProperties).toBe(false);
    expect(body.stream).toBeUndefined();
  });

  it('omits temperature and output_config when not provided', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn', usage: {} });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', maxTokens: 100, apiKey: 'k' });
    expect(result.truncated).toBe(false);
    expect(requests[0].temperature).toBeUndefined();
    expect(requests[0].output_config).toBeUndefined();
  });

  it('maps 401 to INVALID_API_KEY', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, 401));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('streams deltas and returns the assembled text', async () => {
    const events = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"سلام "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"دنیا"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    ].join('');
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return sseResponse(events);
    });
    const deltas = [];
    const result = await provider.stream({ systemPrompt: 's', userPrompt: 'u', maxTokens: 500, temperature: 0.2, apiKey: 'k', onDelta: d => deltas.push(d) });
    expect(requests[0].stream).toBe(true);
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ text: 'سلام دنیا', inputTokens: 5, outputTokens: 3, truncated: false });
  });
});

describe('parseClaudeSseEvent', () => {
  it('extracts deltas, usage, truncation and completion', () => {
    expect(parseClaudeSseEvent({ event: 'content_block_delta', data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"a"}}' })).toEqual({ delta: 'a' });
    expect(parseClaudeSseEvent({ event: 'message_delta', data: '{"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":9}}' })).toEqual({ outputTokens: 9, truncated: true });
    expect(parseClaudeSseEvent({ event: 'message_stop', data: '{"type":"message_stop"}' })).toEqual({ done: true });
    expect(parseClaudeSseEvent({ event: 'ping', data: '{"type":"ping"}' })).toEqual({});
    expect(parseClaudeSseEvent({ event: 'message', data: 'not json' })).toEqual({});
  });
  it('throws on error events', () => {
    expect(() => parseClaudeSseEvent({ event: 'error', data: '{"type":"error","error":{"message":"overloaded"}}' })).toThrowError(expect.objectContaining({ code: 'SERVER_ERROR' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/claude-provider.test.js`
Expected: FAIL ("parseClaudeSseEvent is not exported" or body assertions fail)

- [ ] **Step 3: Write the implementation**

```js
// lib/providers/base-provider.js
import { readSseEvents } from './sse.js';
import { STREAM_IDLE_TIMEOUT_MS } from '../translation/budget.js';

/**
 * Abstract base class for AI providers.
 * All providers must implement complete(), stream(), vision(),
 * validateApiKey() and handleError().
 */
export class BaseProvider {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.id = config.id;
  }

  /**
   * Text completion.
   * @param {Object} params
   * @param {string} params.systemPrompt
   * @param {string} params.userPrompt
   * @param {number} [params.maxTokens]
   * @param {number} [params.temperature]
   * @param {Object|null} [params.responseSchema] - Canonical JSON schema; enables native structured output
   * @param {string} params.apiKey
   * @param {AbortSignal} [params.signal]
   * @param {number} [params.timeoutMs]
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number, truncated: boolean}>}
   */
  async complete(_params) {
    throw new Error('complete() must be implemented by provider');
  }

  /**
   * Streaming text completion. Calls onDelta(text) for each chunk and resolves
   * with the same shape as complete() once the stream ends.
   * @param {Object} params - complete() params plus onDelta and idleTimeoutMs
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number, truncated: boolean}>}
   */
  async stream(_params) {
    throw new Error('stream() must be implemented by provider');
  }

  /**
   * Vision request (image + text).
   * @returns {Promise<{text: string, inputTokens: number, outputTokens: number}>}
   */
  async vision(_params) {
    throw new Error('vision() must be implemented by provider');
  }

  validateKeyFormat(apiKey) {
    return apiKey && apiKey.startsWith(this.config.keyPrefix);
  }

  async validateApiKey(_apiKey) {
    throw new Error('validateApiKey() must be implemented by provider');
  }

  async handleError(_response) {
    throw new Error('handleError() must be implemented by provider');
  }

  /**
   * Drive an SSE response through a provider-specific event parser.
   * @param {Response} response
   * @param {(event: {event: string, data: string}) => {delta?: string, inputTokens?: number, outputTokens?: number, truncated?: boolean, done?: boolean}} parseEvent
   * @param {{onDelta?: (text: string) => void, signal?: AbortSignal, idleTimeoutMs?: number}} options
   */
  async consumeStream(response, parseEvent, { onDelta, signal, idleTimeoutMs = STREAM_IDLE_TIMEOUT_MS } = {}) {
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let truncated = false;

    for await (const event of readSseEvents(response, { signal, idleTimeoutMs })) {
      const parsed = parseEvent(event);
      if (parsed.delta) {
        text += parsed.delta;
        if (onDelta) onDelta(parsed.delta);
      }
      if (typeof parsed.inputTokens === 'number') inputTokens = parsed.inputTokens;
      if (typeof parsed.outputTokens === 'number') outputTokens = parsed.outputTokens;
      if (parsed.truncated) truncated = true;
      if (parsed.done) break;
    }

    return { text, inputTokens, outputTokens, truncated };
  }
}
```

```js
// lib/providers/claude-provider.js
import { BaseProvider } from './base-provider.js';
import { withAdditionalPropertiesFalse } from './schema-adapters.js';
import { withRetry } from '../retry.js';
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

/**
 * Parse one Claude SSE event into the neutral stream shape.
 * @param {{event: string, data: string}} event
 */
export function parseClaudeSseEvent({ data }) {
  if (!data) return {};
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return {};
  }
  switch (json.type) {
    case 'message_start':
      return typeof json.message?.usage?.input_tokens === 'number' ? { inputTokens: json.message.usage.input_tokens } : {};
    case 'content_block_delta':
      return json.delta?.type === 'text_delta' && json.delta.text ? { delta: json.delta.text } : {};
    case 'message_delta': {
      const out = {};
      if (typeof json.usage?.output_tokens === 'number') out.outputTokens = json.usage.output_tokens;
      if (json.delta?.stop_reason === 'max_tokens') out.truncated = true;
      return out;
    }
    case 'message_stop':
      return { done: true };
    case 'error':
      throw new TranslationError(ERROR_CODES.SERVER_ERROR, json.error?.message);
    default:
      return {};
  }
}

/**
 * Claude (Anthropic) provider. Raw Messages API over fetch, as the extension
 * runs without the SDK.
 */
export class ClaudeProvider extends BaseProvider {
  headers(apiKey) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': this.config.version,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  }

  buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, stream }) {
    const body = {
      model: this.config.model,
      max_tokens: maxTokens || this.config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (responseSchema) {
      body.output_config = { format: { type: 'json_schema', schema: withAdditionalPropertiesFalse(responseSchema) } };
    }
    if (stream) body.stream = true;
    return body;
  }

  async request(body, { apiKey, signal, timeoutMs }) {
    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(body),
      signal: reqSignal
    }), { signal, ...(timeoutMs ? { timeoutMs } : {}) });

    if (!response.ok) {
      await this.handleError(response);
    }
    return response;
  }

  async complete({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, apiKey, signal, timeoutMs }) {
    const response = await this.request(this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema }), { apiKey, signal, timeoutMs });
    const data = await response.json();
    const text = (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
    return {
      text,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      truncated: data.stop_reason === 'max_tokens'
    };
  }

  async stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs }) {
    const response = await this.request(this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, stream: true }), { apiKey, signal });
    return this.consumeStream(response, parseClaudeSseEvent, { onDelta, signal, idleTimeoutMs });
  }

  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, apiKey, signal }) {
    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model: this.config.visionModel,
        max_tokens: maxTokens || this.config.maxTokens,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } }
          ]
        }]
      }),
      signal: reqSignal
    }), { signal, timeoutMs: 60000 });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return {
      text: data.content?.[0]?.text || '',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0
    };
  }

  async validateApiKey(apiKey) {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async handleError(response) {
    let apiMessage = '';
    try {
      const errorData = await response.json();
      apiMessage = errorData.error?.message || '';
    } catch {
      apiMessage = '';
    }

    switch (response.status) {
      case 401:
        throw new TranslationError(ERROR_CODES.INVALID_API_KEY);
      case 429:
        throw new TranslationError(ERROR_CODES.RATE_LIMITED);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new TranslationError(ERROR_CODES.SERVER_ERROR);
      default:
        throw new TranslationError(ERROR_CODES.UNKNOWN, apiMessage || undefined);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/claude-provider.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Verify nothing else used getMaxTokens and commit**

Run: `grep -rn "getMaxTokens" lib background popup content settings` (expected: no output), then

```bash
npm run lint && git add lib/providers/base-provider.js lib/providers/claude-provider.js tests/claude-provider.test.js && git commit -m "feat(providers): structured output, temperature, truncation and streaming for Claude"
```

---

### Task 8: Gemini provider

**Files:**
- Modify: `lib/providers/gemini-provider.js` (whole file)
- Test: `tests/gemini-provider.test.js`

**Interfaces:**
- Consumes: `BaseProvider` (Task 7), `withPropertyOrdering` (Task 4), `TranslationError` (Task 1).
- Produces: `GeminiProvider.complete/stream` per the base contract; `parseGeminiSseEvent({ event, data })`.

- [ ] **Step 1: Write the failing test**

```js
// tests/gemini-provider.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiProvider, parseGeminiSseEvent } from '../lib/providers/gemini-provider.js';
import { PROVIDER_CONFIGS } from '../lib/constants.js';
import { SENTENCE_SCHEMA } from '../lib/translation/schemas.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const sseResponse = (text) => new Response(new TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

describe('GeminiProvider', () => {
  let provider;
  let requests;

  beforeEach(() => {
    provider = new GeminiProvider(PROVIDER_CONFIGS.gemini);
    requests = [];
  });

  it('sends temperature, JSON mime type and an ordered schema without additionalProperties', async () => {
    globalThis.fetch = vi.fn(async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"translation":"x"}' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', maxTokens: 900, temperature: 0.2, responseSchema: SENTENCE_SCHEMA, apiKey: 'AIza' });
    expect(result).toEqual({ text: '{"translation":"x"}', inputTokens: 4, outputTokens: 2, truncated: true });
    const { url, body } = requests[0];
    expect(url).toContain(':generateContent');
    expect(body.generationConfig.temperature).toBe(0.2);
    expect(body.generationConfig.maxOutputTokens).toBe(900);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.propertyOrdering[0]).toBe('translation');
    expect(JSON.stringify(body.generationConfig.responseSchema)).not.toContain('additionalProperties');
  });

  it('omits JSON config without a schema', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' });
    expect(result.truncated).toBe(false);
    expect(requests[0].generationConfig.responseMimeType).toBeUndefined();
    expect(requests[0].generationConfig.temperature).toBeUndefined();
  });

  it('maps 403 to INVALID_API_KEY', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: 'forbidden' } }, 403));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('streams through streamGenerateContent with alt=sse', async () => {
    const events = [
      'data: {"candidates":[{"content":{"parts":[{"text":"سلام "}]}}],"usageMetadata":{"promptTokenCount":3}}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"دنیا"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n'
    ].join('');
    globalThis.fetch = vi.fn(async (url) => {
      requests.push(url);
      return sseResponse(events);
    });
    const deltas = [];
    const result = await provider.stream({ systemPrompt: 's', userPrompt: 'u', maxTokens: 500, apiKey: 'k', onDelta: d => deltas.push(d) });
    expect(requests[0]).toContain(':streamGenerateContent?alt=sse');
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ text: 'سلام دنیا', inputTokens: 3, outputTokens: 2, truncated: false });
  });
});

describe('parseGeminiSseEvent', () => {
  it('extracts text, usage and truncation', () => {
    expect(parseGeminiSseEvent({ data: '{"candidates":[{"content":{"parts":[{"text":"a"},{"text":"b"}]},"finishReason":"MAX_TOKENS"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2}}' }))
      .toEqual({ delta: 'ab', inputTokens: 1, outputTokens: 2, truncated: true });
    expect(parseGeminiSseEvent({ data: 'garbage' })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gemini-provider.test.js`
Expected: FAIL ("parseGeminiSseEvent is not exported")

- [ ] **Step 3: Write the implementation**

```js
// lib/providers/gemini-provider.js
import { BaseProvider } from './base-provider.js';
import { withPropertyOrdering } from './schema-adapters.js';
import { withRetry } from '../retry.js';
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

/**
 * Parse one Gemini SSE event (a GenerateContentResponse) into the neutral shape.
 * @param {{event?: string, data: string}} event
 */
export function parseGeminiSseEvent({ data }) {
  if (!data) return {};
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return {};
  }
  const out = {};
  const candidate = json.candidates?.[0];
  const delta = (candidate?.content?.parts || []).map(part => part.text || '').join('');
  if (delta) out.delta = delta;
  if (candidate?.finishReason === 'MAX_TOKENS') out.truncated = true;
  if (typeof json.usageMetadata?.promptTokenCount === 'number') out.inputTokens = json.usageMetadata.promptTokenCount;
  if (typeof json.usageMetadata?.candidatesTokenCount === 'number') out.outputTokens = json.usageMetadata.candidatesTokenCount;
  return out;
}

/**
 * Gemini (Google) provider.
 */
export class GeminiProvider extends BaseProvider {
  headers(apiKey) {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
  }

  buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema }) {
    const generationConfig = {
      maxOutputTokens: maxTokens || this.config.maxTokens,
      thinkingConfig: { thinkingBudget: 0 }
    };
    if (typeof temperature === 'number') generationConfig.temperature = temperature;
    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = withPropertyOrdering(responseSchema);
    }
    return {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig
    };
  }

  async request(url, body, { apiKey, signal, timeoutMs }) {
    const response = await withRetry((reqSignal) => fetch(url, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(body),
      signal: reqSignal
    }), { signal, ...(timeoutMs ? { timeoutMs } : {}) });

    if (!response.ok) {
      await this.handleError(response);
    }
    return response;
  }

  async complete({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, apiKey, signal, timeoutMs }) {
    const url = `${this.config.endpoint}/${this.config.model}:generateContent`;
    const response = await this.request(url, this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema }), { apiKey, signal, timeoutMs });
    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || []).map(part => part.text || '').join('');
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      truncated: candidate?.finishReason === 'MAX_TOKENS'
    };
  }

  async stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs }) {
    const url = `${this.config.endpoint}/${this.config.model}:streamGenerateContent?alt=sse`;
    const response = await this.request(url, this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature }), { apiKey, signal });
    return this.consumeStream(response, parseGeminiSseEvent, { onDelta, signal, idleTimeoutMs });
  }

  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, apiKey, signal }) {
    const url = `${this.config.endpoint}/${this.config.visionModel}:generateContent`;
    const response = await withRetry((reqSignal) => fetch(url, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
        generationConfig: { maxOutputTokens: maxTokens || this.config.maxTokens, thinkingConfig: { thinkingBudget: 0 } }
      }),
      signal: reqSignal
    }), { signal, timeoutMs: 60000 });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0
    };
  }

  async validateApiKey(apiKey) {
    try {
      const url = `${this.config.endpoint}/${this.config.model}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 10 } })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async handleError(response) {
    let apiMessage = '';
    try {
      const errorData = await response.json();
      apiMessage = errorData.error?.message || '';
    } catch {
      apiMessage = '';
    }

    switch (response.status) {
      case 400:
        if (/API_KEY_INVALID|API key not valid/i.test(apiMessage)) throw new TranslationError(ERROR_CODES.INVALID_API_KEY);
        throw new TranslationError(ERROR_CODES.UNKNOWN, apiMessage || undefined);
      case 403:
        throw new TranslationError(ERROR_CODES.INVALID_API_KEY);
      case 429:
        throw new TranslationError(ERROR_CODES.RATE_LIMITED);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new TranslationError(ERROR_CODES.SERVER_ERROR);
      default:
        throw new TranslationError(ERROR_CODES.UNKNOWN, apiMessage || undefined);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gemini-provider.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/providers/gemini-provider.js tests/gemini-provider.test.js && git commit -m "feat(providers): structured output, temperature, truncation and streaming for Gemini"
```

---

### Task 9: OpenAI provider

**Files:**
- Modify: `lib/providers/openai-provider.js` (whole file)
- Test: `tests/openai-provider.test.js`

**Interfaces:**
- Consumes: `BaseProvider` (Task 7), `withAdditionalPropertiesFalse` (Task 4), `TranslationError` (Task 1).
- Produces: `OpenAIProvider.complete/stream` per the base contract; `parseOpenAISseEvent({ event, data })`.

- [ ] **Step 1: Write the failing test**

```js
// tests/openai-provider.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider, parseOpenAISseEvent } from '../lib/providers/openai-provider.js';
import { PROVIDER_CONFIGS } from '../lib/constants.js';
import { WORD_SCHEMA } from '../lib/translation/schemas.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const sseResponse = (text) => new Response(new TextEncoder().encode(text), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

describe('OpenAIProvider', () => {
  let provider;
  let requests;

  beforeEach(() => {
    provider = new OpenAIProvider(PROVIDER_CONFIGS.openai);
    requests = [];
  });

  it('sends temperature and a strict json_schema response format, reports truncation', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ choices: [{ message: { content: '{"translation":"x"}' }, finish_reason: 'length' }], usage: { prompt_tokens: 8, completion_tokens: 3 } });
    });
    const result = await provider.complete({ systemPrompt: 's', userPrompt: 'u', maxTokens: 700, temperature: 0.2, responseSchema: WORD_SCHEMA, apiKey: 'sk' });
    expect(result).toEqual({ text: '{"translation":"x"}', inputTokens: 8, outputTokens: 3, truncated: true });
    const body = requests[0];
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(700);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe('parsipad_result');
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.stream).toBeUndefined();
  });

  it('surfaces a refusal as an error instead of empty text', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ choices: [{ message: { refusal: 'I cannot help with that' }, finish_reason: 'stop' }], usage: {} }));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'UNKNOWN', message: 'I cannot help with that' });
  });

  it('maps 401 to INVALID_API_KEY', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: { message: 'bad' } }, 401));
    await expect(provider.complete({ systemPrompt: 's', userPrompt: 'u', apiKey: 'k' })).rejects.toMatchObject({ code: 'INVALID_API_KEY' });
  });

  it('streams deltas with usage and stops at [DONE]', async () => {
    const events = [
      'data: {"choices":[{"delta":{"content":"سلام "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"دنیا"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":6,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n'
    ].join('');
    globalThis.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return sseResponse(events);
    });
    const deltas = [];
    const result = await provider.stream({ systemPrompt: 's', userPrompt: 'u', maxTokens: 500, temperature: 0.2, apiKey: 'k', onDelta: d => deltas.push(d) });
    expect(requests[0].stream).toBe(true);
    expect(requests[0].stream_options).toEqual({ include_usage: true });
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ text: 'سلام دنیا', inputTokens: 6, outputTokens: 2, truncated: false });
  });
});

describe('parseOpenAISseEvent', () => {
  it('extracts deltas, truncation, usage and completion', () => {
    expect(parseOpenAISseEvent({ data: '{"choices":[{"delta":{"content":"a"},"finish_reason":"length"}]}' })).toEqual({ delta: 'a', truncated: true });
    expect(parseOpenAISseEvent({ data: '{"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2}}' })).toEqual({ inputTokens: 1, outputTokens: 2 });
    expect(parseOpenAISseEvent({ data: '[DONE]' })).toEqual({ done: true });
    expect(parseOpenAISseEvent({ data: 'nope' })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/openai-provider.test.js`
Expected: FAIL ("parseOpenAISseEvent is not exported")

- [ ] **Step 3: Write the implementation**

```js
// lib/providers/openai-provider.js
import { BaseProvider } from './base-provider.js';
import { withAdditionalPropertiesFalse } from './schema-adapters.js';
import { withRetry } from '../retry.js';
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

const SCHEMA_NAME = 'parsipad_result';

/**
 * Parse one Chat Completions SSE event into the neutral shape.
 * @param {{event?: string, data: string}} event
 */
export function parseOpenAISseEvent({ data }) {
  if (!data) return {};
  if (data === '[DONE]') return { done: true };
  let json;
  try {
    json = JSON.parse(data);
  } catch {
    return {};
  }
  const out = {};
  const choice = json.choices?.[0];
  if (choice?.delta?.content) out.delta = choice.delta.content;
  if (choice?.finish_reason === 'length') out.truncated = true;
  if (typeof json.usage?.prompt_tokens === 'number') out.inputTokens = json.usage.prompt_tokens;
  if (typeof json.usage?.completion_tokens === 'number') out.outputTokens = json.usage.completion_tokens;
  return out;
}

/**
 * OpenAI (ChatGPT) provider.
 */
export class OpenAIProvider extends BaseProvider {
  headers(apiKey) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
  }

  buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, stream }) {
    const body = {
      model: this.config.model,
      max_tokens: maxTokens || this.config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
    if (typeof temperature === 'number') body.temperature = temperature;
    if (responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: SCHEMA_NAME, schema: withAdditionalPropertiesFalse(responseSchema), strict: true }
      };
    }
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    return body;
  }

  async request(body, { apiKey, signal, timeoutMs }) {
    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(body),
      signal: reqSignal
    }), { signal, ...(timeoutMs ? { timeoutMs } : {}) });

    if (!response.ok) {
      await this.handleError(response);
    }
    return response;
  }

  async complete({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, apiKey, signal, timeoutMs }) {
    const response = await this.request(this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema }), { apiKey, signal, timeoutMs });
    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) {
      throw new TranslationError(ERROR_CODES.UNKNOWN, choice.message.refusal);
    }
    return {
      text: choice?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      truncated: choice?.finish_reason === 'length'
    };
  }

  async stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs }) {
    const response = await this.request(this.buildBody({ systemPrompt, userPrompt, maxTokens, temperature, stream: true }), { apiKey, signal });
    return this.consumeStream(response, parseOpenAISseEvent, { onDelta, signal, idleTimeoutMs });
  }

  async vision({ systemPrompt, userPrompt, imageBase64, mimeType, maxTokens, apiKey, signal }) {
    const response = await withRetry((reqSignal) => fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model: this.config.visionModel,
        max_tokens: maxTokens || this.config.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }
        ]
      }),
      signal: reqSignal
    }), { signal, timeoutMs: 60000 });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0
    };
  }

  async validateApiKey(apiKey) {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({ model: this.config.model, max_tokens: 10, messages: [{ role: 'user', content: 'Hi' }] })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async handleError(response) {
    let apiMessage = '';
    try {
      const errorData = await response.json();
      apiMessage = errorData.error?.message || '';
    } catch {
      apiMessage = '';
    }

    switch (response.status) {
      case 401:
        throw new TranslationError(ERROR_CODES.INVALID_API_KEY);
      case 429:
        throw new TranslationError(ERROR_CODES.RATE_LIMITED);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new TranslationError(ERROR_CODES.SERVER_ERROR);
      default:
        throw new TranslationError(ERROR_CODES.UNKNOWN, apiMessage || undefined);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/openai-provider.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test` (expected: all green, including the pre-existing 39 tests), then

```bash
npm run lint && git add lib/providers/openai-provider.js tests/openai-provider.test.js && git commit -m "feat(providers): structured output, temperature, truncation and streaming for OpenAI"
```

---

### Task 10: Cache keyed by ordered parts, storing whole results

**Files:**
- Create: `lib/translation/cache-key.js`
- Modify: `lib/cache.js` (`hashKey`, `get`, `set`)
- Test: `tests/cache.test.js` (rewrite), `tests/cache-key.test.js`

**Interfaces:**
- Produces: `translationCache.hashKey(parts: string[]): Promise<string>`, `translationCache.get(parts): Promise<object | null>`, `translationCache.set(parts, result): Promise<void>`; `hashContext(context): Promise<string>` (`''` when no before/after), `buildCacheKeyParts({ provider, mode, direction, text, contextHash }): string[]` returning `[provider, mode, direction, contextHash, text]`.
- `clear()`, `getStats()`, `evictIfNeeded()` keep their current behavior (used by `settings/settings.js`).

- [ ] **Step 1: Write the failing tests**

```js
// tests/cache-key.test.js
import { describe, it, expect } from 'vitest';
import { buildCacheKeyParts, hashContext } from '../lib/translation/cache-key.js';

describe('cache key', () => {
  it('orders parts as provider, mode, direction, contextHash, text', () => {
    expect(buildCacheKeyParts({ provider: 'claude', mode: 'word', direction: 'en-fa', text: 'charge', contextHash: 'abc' }))
      .toEqual(['claude', 'word', 'en-fa', 'abc', 'charge']);
    expect(buildCacheKeyParts({ provider: 'claude', mode: 'text', direction: 'en-fa', text: 'long' }))
      .toEqual(['claude', 'text', 'en-fa', '', 'long']);
  });
  it('hashes context only when there is some', async () => {
    expect(await hashContext(undefined)).toBe('');
    expect(await hashContext({ before: '', after: '' })).toBe('');
    const a = await hashContext({ before: 'they will ', after: ' you' });
    const b = await hashContext({ before: 'a bad ', after: ' of luck' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
```

```js
// tests/cache.test.js (replace the whole file)
import { describe, it, expect, beforeEach, vi } from 'vitest';

function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return data.has(key) ? { [key]: data.get(key) } : {};
          return {};
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) data.set(k, v);
        },
        async remove(key) {
          data.delete(key);
        }
      }
    }
  };
  return data;
}

describe('translationCache', () => {
  let translationCache;

  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    ({ translationCache } = await import('../lib/cache.js'));
    await translationCache.clear();
  });

  it('stores and returns the whole result object', async () => {
    const parts = ['claude', 'word', 'en-fa', '', 'charge'];
    const result = { translation: 'هزینه', mode: 'word', direction: 'en-fa', senses: [{ pos: 'noun', meaning: 'هزینه', example: { src: 'a', tgt: 'b' } }] };
    await translationCache.set(parts, result);
    expect(await translationCache.get(parts)).toEqual(result);
  });

  it('does not collide when two long texts share the same prefix', async () => {
    const prefix = 'a'.repeat(200);
    await translationCache.set(['claude', 'text', 'en-fa', '', `${prefix} apples`], { translation: 'A' });
    await translationCache.set(['claude', 'text', 'en-fa', '', `${prefix} zebras`], { translation: 'B' });
    expect((await translationCache.get(['claude', 'text', 'en-fa', '', `${prefix} apples`])).translation).toBe('A');
    expect((await translationCache.get(['claude', 'text', 'en-fa', '', `${prefix} zebras`])).translation).toBe('B');
  });

  it('separates providers, modes and context hashes', async () => {
    await translationCache.set(['claude', 'word', 'en-fa', 'ctx1', 'charge'], { translation: 'اتهام' });
    expect(await translationCache.get(['gemini', 'word', 'en-fa', 'ctx1', 'charge'])).toBeNull();
    expect(await translationCache.get(['claude', 'sentence', 'en-fa', 'ctx1', 'charge'])).toBeNull();
    expect(await translationCache.get(['claude', 'word', 'en-fa', 'ctx2', 'charge'])).toBeNull();
    expect((await translationCache.get(['claude', 'word', 'en-fa', 'ctx1', 'charge'])).translation).toBe('اتهام');
  });

  it('returns null for expired entries', async () => {
    const parts = ['claude', 'word', 'en-fa', '', 'old'];
    await translationCache.set(parts, { translation: 'x' });
    const raw = await translationCache.loadCache();
    const [hash] = Object.keys(raw);
    raw[hash].timestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await translationCache.saveCache(raw);
    expect(await translationCache.get(parts)).toBeNull();
  });

  it('reports stats and clears', async () => {
    await translationCache.set(['claude', 'word', 'en-fa', '', 'a'], { translation: 'x' });
    expect((await translationCache.getStats()).size).toBe(1);
    await translationCache.clear();
    expect((await translationCache.getStats()).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cache.test.js tests/cache-key.test.js`
Expected: FAIL (cache-key module missing; cache tests fail because `set` expects the old signature)

- [ ] **Step 3: Write the implementation**

```js
// lib/translation/cache-key.js
/**
 * Cache key composition for translation results.
 * Order: provider | mode | direction | contextHash | text.
 */

async function sha256Hex(value) {
  const buffer = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {{before?: string, after?: string} | undefined} context
 * @returns {Promise<string>} '' when there is no surrounding context
 */
export async function hashContext(context) {
  const before = context?.before || '';
  const after = context?.after || '';
  if (!before && !after) return '';
  return sha256Hex(`${before}|${after}`);
}

/**
 * @param {{provider: string, mode: string, direction: string, text: string, contextHash?: string}} params
 * @returns {string[]}
 */
export function buildCacheKeyParts({ provider, mode, direction, text, contextHash = '' }) {
  return [provider, mode, direction, contextHash || '', text];
}
```

Replace `hashKey`, `get` and `set` in `lib/cache.js` (keep the class header comment, `loadCache`, `saveCache`, `evictIfNeeded`, `clear`, `getStats`):

```js
  /**
   * Collision-resistant key from ordered parts (see lib/translation/cache-key.js).
   * @param {string[]} parts
   * @returns {Promise<string>} Hex SHA-256
   */
  async hashKey(parts) {
    const payload = parts.join('|');
    const buffer = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * @param {string[]} parts
   * @returns {Promise<object|null>} The stored result contract, or null
   */
  async get(parts) {
    const hash = await this.hashKey(parts);
    const cache = await this.loadCache();
    const entry = cache[hash];

    if (!entry || !entry.result) {
      return null;
    }

    if (Date.now() - entry.timestamp > CACHE_CONFIG.ttl) {
      delete cache[hash];
      await this.saveCache(cache);
      return null;
    }

    entry.lastAccess = Date.now();
    await this.saveCache(cache);
    return entry.result;
  }

  /**
   * @param {string[]} parts
   * @param {object} result - Result contract without token counts
   */
  async set(parts, result) {
    const hash = await this.hashKey(parts);
    const cache = await this.loadCache();
    cache[hash] = {
      result,
      timestamp: Date.now(),
      lastAccess: Date.now()
    };
    await this.evictIfNeeded(cache);
    await this.saveCache(cache);
  }
```

Also update the class header comment to: `Keys are SHA-256 of ordered parts (provider | mode | direction | contextHash | text). Entries written by 2.x (which keyed on provider | sourceLang | text and stored flat fields) have no "result" field and are treated as misses until their TTL removes them.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cache.test.js tests/cache-key.test.js`
Expected: PASS (5 + 2 tests). `background/service-worker.js` still calls the old signature; it is rewritten in Task 15, and until then `npm run build` still succeeds (runtime cache misses only).

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/cache.js lib/translation/cache-key.js tests/cache.test.js tests/cache-key.test.js && git commit -m "feat(cache): key translations by provider, mode, direction and context; store whole results"
```

---

### Task 11: History stores structured results

**Files:**
- Modify: `lib/history.js` (`addToHistory`)
- Test: `tests/history.test.js`

**Interfaces:**
- Produces: `addToHistory(entry: { original, translation, direction, mode?, result? })`; the legacy positional call `addToHistory(original, translation, direction)` keeps working. Entries gain optional `mode` and `result`; `original` and `translation` are capped at 4000 characters.

- [ ] **Step 1: Write the failing test**

```js
// tests/history.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return data.has(key) ? { [key]: data.get(key) } : {}; },
        async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, v); },
        async remove(key) { data.delete(key); }
      }
    }
  };
}

describe('translation history', () => {
  let history;

  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    history = await import('../lib/history.js');
    await history.clearHistory();
  });

  it('stores structured entries capped at 4000 characters', async () => {
    const long = 'x'.repeat(5000);
    await history.addToHistory({ original: long, translation: long, direction: 'en-fa', mode: 'text', result: { translation: long, note: 'n' } });
    const [entry] = await history.getHistory();
    expect(entry.original).toHaveLength(4000);
    expect(entry.translation).toHaveLength(4000);
    expect(entry.mode).toBe('text');
    expect(entry.result.note).toBe('n');
    expect(entry.direction).toBe('en-fa');
  });

  it('accepts the legacy positional signature', async () => {
    await history.addToHistory('hello', 'سلام', 'en-fa');
    const [entry] = await history.getHistory();
    expect(entry).toMatchObject({ original: 'hello', translation: 'سلام', direction: 'en-fa' });
    expect(entry.mode).toBeUndefined();
  });

  it('moves a repeated original to the top instead of duplicating', async () => {
    await history.addToHistory({ original: 'one', translation: '1', direction: 'en-fa' });
    await history.addToHistory({ original: 'two', translation: '2', direction: 'en-fa' });
    await history.addToHistory({ original: 'ONE', translation: '1b', direction: 'en-fa' });
    const list = await history.getHistory();
    expect(list.map(e => e.original)).toEqual(['ONE', 'two']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/history.test.js`
Expected: FAIL (first test: `original` has length 200, `mode` undefined)

- [ ] **Step 3: Write the implementation**

Replace `addToHistory` in `lib/history.js` and add the constant:

```js
const MAX_HISTORY_SIZE = 50;
const MAX_TEXT_LENGTH = 4000;

/**
 * Add a translation to history.
 * Accepts an entry object ({ original, translation, direction, mode, result })
 * or the legacy positional form (original, translation, direction).
 * @param {object|string} entryOrOriginal
 * @param {string} [legacyTranslation]
 * @param {string} [legacyDirection]
 */
export async function addToHistory(entryOrOriginal, legacyTranslation, legacyDirection) {
  const input = typeof entryOrOriginal === 'string'
    ? { original: entryOrOriginal, translation: legacyTranslation, direction: legacyDirection }
    : (entryOrOriginal || {});

  const original = String(input.original || '').slice(0, MAX_TEXT_LENGTH);
  const translation = String(input.translation || '').slice(0, MAX_TEXT_LENGTH);
  const history = await getHistory();

  const entry = {
    id: Date.now(),
    original,
    translation,
    direction: input.direction,
    timestamp: Date.now()
  };
  if (input.mode) entry.mode = input.mode;
  if (input.result && typeof input.result === 'object') entry.result = input.result;

  const existingIndex = history.findIndex(h => h.original.toLowerCase() === original.toLowerCase());
  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }

  history.unshift(entry);
  if (history.length > MAX_HISTORY_SIZE) {
    history.length = MAX_HISTORY_SIZE;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.translationHistory]: history
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/history.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/history.js tests/history.test.js && git commit -m "feat(history): store structured translation results up to 4000 characters"
```

---

### Task 12: Settings, constants and i18n for the new core

**Files:**
- Modify: `lib/constants.js` (`STORAGE_KEYS`, `ACTIONS`), `lib/storage.js`, `lib/i18n.js`, `settings/settings.html`, `settings/settings.js`
- Test: `tests/i18n-errors.test.js`, `tests/storage-settings.test.js`

**Interfaces:**
- Produces: `STORAGE_KEYS.translateOtherLanguages = 'translate_other_languages'`, `ACTIONS.EXPLAIN_GRAMMAR = 'EXPLAIN_GRAMMAR'`, `getTranslateOtherLanguages(): Promise<boolean>` (default `true`), `setTranslateOtherLanguages(enabled)`, i18n keys `errorEmptyInput`, `errorUnsupported`, `errorTruncated`, `errorParseFailed`, `errorNetwork`, `errorTimeout`, `errorAborted`, `errorInvalidApiKey`, `errorRateLimited`, `errorServerError`, `errorApiKeyNotSet`, `errorUnknown`, `translateOtherLanguages`, `enableTranslateOtherLanguages`, `translateOtherLanguagesHint` in `en` and `fa`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/i18n-errors.test.js
import { describe, it, expect } from 'vitest';
import { translations, t } from '../lib/i18n.js';
import { ERROR_CODES, errorI18nKey } from '../lib/translation/errors.js';

describe('i18n coverage for the translation core', () => {
  const keys = [...Object.keys(ERROR_CODES).map(errorI18nKey), 'translateOtherLanguages', 'enableTranslateOtherLanguages', 'translateOtherLanguagesHint'];
  it.each(keys)('%s exists in English and Persian', (key) => {
    expect(typeof translations.en[key]).toBe('string');
    expect(typeof translations.fa[key]).toBe('string');
    expect(t(key, 'fa')).not.toBe(key);
  });
});
```

```js
// tests/storage-settings.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return data.has(key) ? { [key]: data.get(key) } : {}; },
        async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, v); },
        async remove(key) { data.delete(key); }
      }
    }
  };
}

describe('translateOtherLanguages setting', () => {
  let storage;
  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    storage = await import('../lib/storage.js');
  });
  it('defaults to true and persists changes', async () => {
    expect(await storage.getTranslateOtherLanguages()).toBe(true);
    await storage.setTranslateOtherLanguages(false);
    expect(await storage.getTranslateOtherLanguages()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/i18n-errors.test.js tests/storage-settings.test.js`
Expected: FAIL (keys missing, function not exported)

- [ ] **Step 3: Write the implementation**

`lib/constants.js`: inside `STORAGE_KEYS` after `selectionPopup: 'selection_popup_enabled',` add

```js
  translateOtherLanguages: 'translate_other_languages',
```

and inside `ACTIONS` after `GET_GRAMMAR_LESSON: 'GET_GRAMMAR_LESSON',` add

```js
  EXPLAIN_GRAMMAR: 'EXPLAIN_GRAMMAR',
```

`lib/storage.js`: after `setSelectionPopupEnabled` add

```js
/**
 * Whether non-Persian, non-English text is translated into Persian (true)
 * or rejected with UNSUPPORTED (false).
 * @returns {Promise<boolean>}
 */
export async function getTranslateOtherLanguages() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.translateOtherLanguages);
  return result[STORAGE_KEYS.translateOtherLanguages] ?? true;
}

/**
 * @param {boolean} enabled
 */
export async function setTranslateOtherLanguages(enabled) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.translateOtherLanguages]: enabled
  });
}
```

`lib/i18n.js`: in the `en` block, right after `unintelligibleInput: ...,` add

```js
    errorEmptyInput: 'Select or type some text to translate.',
    errorUnsupported: 'ParsiPad only supports Persian and English. Please try a different selection.',
    errorTruncated: 'The translation was cut off. Select a shorter passage or translate in parts.',
    errorParseFailed: 'The translation could not be read. Please try again.',
    errorNetwork: 'Check your internet connection.',
    errorTimeout: 'The translation took too long. Please try again.',
    errorAborted: 'Translation cancelled.',
    errorInvalidApiKey: 'Invalid API key. Please check settings.',
    errorRateLimited: 'Too many requests. Please wait a moment.',
    errorServerError: 'Translation service unavailable. Please try again.',
    errorApiKeyNotSet: 'API key not set. Please configure it in settings.',
    errorUnknown: 'An unexpected error occurred.',
    translateOtherLanguages: 'Other Languages',
    enableTranslateOtherLanguages: 'Translate other languages into Persian',
    translateOtherLanguagesHint: 'When off, text that is neither Persian nor English is rejected instead of translated.',
```

and in the `fa` block, right after its `unintelligibleInput: ...,` add

```js
    errorEmptyInput: 'متنی را برای ترجمه انتخاب یا وارد کنید.',
    errorUnsupported: 'ParsiPad فقط از فارسی و انگلیسی پشتیبانی می‌کند. متن دیگری را انتخاب کنید.',
    errorTruncated: 'ترجمه ناقص ماند. بخش کوتاه‌تری را انتخاب کنید یا متن را تکه‌تکه ترجمه کنید.',
    errorParseFailed: 'خواندن ترجمه ممکن نشد. دوباره تلاش کنید.',
    errorNetwork: 'اتصال اینترنت خود را بررسی کنید.',
    errorTimeout: 'ترجمه بیش از حد طول کشید. دوباره تلاش کنید.',
    errorAborted: 'ترجمه لغو شد.',
    errorInvalidApiKey: 'کلید API نامعتبر است. تنظیمات را بررسی کنید.',
    errorRateLimited: 'درخواست‌ها بیش از حد زیاد است. کمی صبر کنید.',
    errorServerError: 'سرویس ترجمه در دسترس نیست. دوباره تلاش کنید.',
    errorApiKeyNotSet: 'کلید API تنظیم نشده است. آن را در تنظیمات وارد کنید.',
    errorUnknown: 'خطای غیرمنتظره‌ای رخ داد.',
    translateOtherLanguages: 'زبان‌های دیگر',
    enableTranslateOtherLanguages: 'ترجمه زبان‌های دیگر به فارسی',
    translateOtherLanguagesHint: 'وقتی خاموش باشد، متنی که فارسی یا انگلیسی نیست به جای ترجمه رد می‌شود.',
```

`settings/settings.html`: insert this card after the Selection Popup card's closing `</section>` and before `<!-- New Tab Card -->`:

```html
    <!-- Other Languages Card -->
    <section class="settings-card" data-settings-tab="general">
      <div class="card-header">
        <div class="card-icon bg-primary-100 dark:bg-primary-900/30">
          <svg class="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
          </svg>
        </div>
        <div>
          <h2 class="card-title" data-i18n="translateOtherLanguages">Other Languages</h2>
          <p class="card-subtitle" data-i18n="translateOtherLanguagesHint">When off, text that is neither Persian nor English is rejected instead of translated.</p>
        </div>
      </div>
      <div class="card-content">
        <label class="toggle-row">
          <div class="toggle-info">
            <span class="toggle-label-text" data-i18n="enableTranslateOtherLanguages">Translate other languages into Persian</span>
          </div>
          <div class="toggle-switch">
            <input type="checkbox" id="translate-other-languages-toggle">
            <span class="toggle-slider"></span>
          </div>
        </label>
      </div>
    </section>
```

`settings/settings.js`:
1. Add `getTranslateOtherLanguages, setTranslateOtherLanguages` to the existing import list from `../lib/storage.js`.
2. Next to `const selectionPopupToggle = document.getElementById('selection-popup-toggle');` add `const translateOtherLanguagesToggle = document.getElementById('translate-other-languages-toggle');`.
3. Next to `loadSelectionPopupSetting()` add:

```js
/**
 * Load the "translate other languages" setting
 */
async function loadTranslateOtherLanguagesSetting() {
  translateOtherLanguagesToggle.checked = await getTranslateOtherLanguages();
}
```

   and call `loadTranslateOtherLanguagesSetting()` wherever `loadSelectionPopupSetting()` is called during init.
4. Next to `selectionPopupToggle.addEventListener('change', handleSelectionPopupChange);` add `translateOtherLanguagesToggle.addEventListener('change', handleTranslateOtherLanguagesChange);`.
5. Next to `handleSelectionPopupChange` add:

```js
/**
 * Handle "translate other languages" setting change
 */
async function handleTranslateOtherLanguagesChange() {
  await setTranslateOtherLanguages(translateOtherLanguagesToggle.checked);
}
```

- [ ] **Step 4: Run tests, lint and build**

Run: `npx vitest run tests/i18n-errors.test.js tests/storage-settings.test.js` (expected: PASS, 15 + 1 tests), `npm run lint`, `npm run build` (expected: no errors).

- [ ] **Step 5: Commit**

```bash
git add lib/constants.js lib/storage.js lib/i18n.js settings/settings.html settings/settings.js tests/i18n-errors.test.js tests/storage-settings.test.js && git commit -m "feat(settings): translate-other-languages toggle, error strings and EXPLAIN_GRAMMAR action"
```

---

### Task 13: Detected language name in translation info

**Files:**
- Modify: `lib/language-detect.js` (`getTranslationInfo`)
- Test: `tests/translation-info.test.js`

**Interfaces:**
- Consumes: `getLanguageName` (Task 2).
- Produces: `getTranslationInfo(text, sourceLang)` returns `{ from, to, direction, displayDirection, detectedName, targetName }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/translation-info.test.js
import { describe, it, expect } from 'vitest';
import { getTranslationInfo } from '../lib/language-detect.js';

describe('getTranslationInfo', () => {
  it('adds English names for prompts', () => {
    expect(getTranslationInfo('hello world')).toMatchObject({ from: 'en', to: 'fa', direction: 'en-fa', detectedName: 'English', targetName: 'Persian' });
    expect(getTranslationInfo('سلام دنیا')).toMatchObject({ from: 'fa', to: 'en', detectedName: 'Persian', targetName: 'English' });
    expect(getTranslationInfo('Привет мир')).toMatchObject({ from: 'ru', to: 'fa', detectedName: 'Russian', targetName: 'Persian' });
  });
  it('honors a manual source language', () => {
    expect(getTranslationInfo('chetori', 'fa')).toMatchObject({ from: 'fa', to: 'en', detectedName: 'Persian' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/translation-info.test.js`
Expected: FAIL (`detectedName` undefined)

- [ ] **Step 3: Write the implementation**

In `lib/language-detect.js` add at the top:

```js
import { getLanguageName } from './translation/languages.js';
```

and replace the body of `getTranslationInfo`:

```js
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
```

(The arrow in `displayDirection` is the existing character; keep it unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/translation-info.test.js tests/language-detect.test.js tests/language-gate.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
npm run lint && git add lib/language-detect.js tests/translation-info.test.js && git commit -m "feat(language-detect): expose detected and target language names"
```

---

### Task 14: Rewrite `translate()` and add `explainGrammar()`

**Files:**
- Modify: `lib/api.js` (`translate`, new `explainGrammar`, `polish` temperature; remove `LANGUAGE_NAMES`, `getLanguageName`, batch inference), `lib/constants.js` (delete `SYSTEM_PROMPT` and `GRAMMAR_SYSTEM_PROMPT` with their comment blocks)
- Delete: `lib/page-translator.js`
- Test: `tests/api-translate.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5, 7 to 9.
- Produces: `translate(request)` where `request = { text, mode, fromName, toName, direction, detectedByScript?, context?, glossary?, signal?, onDelta? }` returns `{ ...coerced fields, truncated, inputTokens, outputTokens }` (streamed modes: `{ translation, truncated, inputTokens, outputTokens }`); `explainGrammar(source, translation, direction)` returns `{ grammar: Array<{point, explanation}>, inputTokens, outputTokens }`. Both throw `TranslationError`.
- Truncation policy: structured modes throw `TRUNCATED`; streamed modes return the partial text with `truncated: true` (the user has already seen it; the UI shows a notice).

- [ ] **Step 1: Write the failing test**

```js
// tests/api-translate.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ apiKey: 'key', provider: null }));

vi.mock('../lib/providers/index.js', () => ({
  getCurrentProvider: async () => state.provider,
  getCurrentApiKey: async () => state.apiKey
}));

import { translate, explainGrammar } from '../lib/api.js';
import { WORD_SCHEMA, SENTENCE_SCHEMA, GRAMMAR_POINTS_SCHEMA } from '../lib/translation/schemas.js';

function fakeProvider() {
  return {
    config: { displayName: 'Fake', maxTokens: 1024 },
    complete: vi.fn(),
    stream: vi.fn()
  };
}

const baseRequest = { text: 'charge', mode: 'word', fromName: 'English', toName: 'Persian', direction: 'en-fa' };

describe('translate', () => {
  beforeEach(() => {
    state.apiKey = 'key';
    state.provider = fakeProvider();
  });

  it('uses structured completion for word mode with the agreed settings', async () => {
    state.provider.complete.mockResolvedValue({ text: JSON.stringify({ translation: 'هزينه', detectedSource: 'en', senses: [] }), inputTokens: 3, outputTokens: 2, truncated: false });
    const result = await translate({ ...baseRequest, context: { before: 'they will ', after: ' you' } });
    expect(result.translation).toBe('هزينه');
    expect(result.senses).toEqual([]);
    expect(result.inputTokens).toBe(3);
    const call = state.provider.complete.mock.calls[0][0];
    expect(call.responseSchema).toBe(WORD_SCHEMA);
    expect(call.temperature).toBe(0.2);
    expect(call.maxTokens).toBe(700);
    expect(call.userPrompt).toContain('<context before>they will </context before>');
    expect(call.systemPrompt).toMatch(/up to five distinct senses/);
    expect(state.provider.stream).not.toHaveBeenCalled();
  });

  it('uses the sentence schema for sentence mode', async () => {
    state.provider.complete.mockResolvedValue({ text: '{"translation":"x","alternatives":[]}', inputTokens: 0, outputTokens: 0, truncated: false });
    await translate({ ...baseRequest, mode: 'sentence', text: 'Go home.' });
    expect(state.provider.complete.mock.calls[0][0].responseSchema).toBe(SENTENCE_SCHEMA);
    expect(state.provider.complete.mock.calls[0][0].maxTokens).toBe(900);
  });

  it('throws TRUNCATED for a cut-off structured reply', async () => {
    state.provider.complete.mockResolvedValue({ text: '{"translation":"x', inputTokens: 0, outputTokens: 0, truncated: true });
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'TRUNCATED' });
  });

  it('throws PARSE_FAILED when the reply is not JSON', async () => {
    state.provider.complete.mockResolvedValue({ text: 'plain text', inputTokens: 0, outputTokens: 0, truncated: false });
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('streams text mode and returns partial text with a truncated flag', async () => {
    state.provider.stream.mockImplementation(async ({ onDelta }) => {
      onDelta('سلام ');
      onDelta('دنیا');
      return { text: 'سلام دنیا', inputTokens: 4, outputTokens: 2, truncated: true };
    });
    const deltas = [];
    const result = await translate({ ...baseRequest, mode: 'text', text: 'Hello world. Bye.', onDelta: d => deltas.push(d) });
    expect(deltas).toEqual(['سلام ', 'دنیا']);
    expect(result).toEqual({ translation: 'سلام دنیا', truncated: true, inputTokens: 4, outputTokens: 2 });
    const call = state.provider.stream.mock.calls[0][0];
    expect(call.responseSchema).toBeUndefined();
    expect(call.maxTokens).toBe(400 + 2 * 'Hello world. Bye.'.length);
    expect(call.systemPrompt).toMatch(/Output only the translation/);
    expect(state.provider.complete).not.toHaveBeenCalled();
  });

  it('throws API_KEY_NOT_SET without a key', async () => {
    state.apiKey = null;
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'API_KEY_NOT_SET' });
  });

  it('wraps provider network failures', async () => {
    state.provider.complete.mockRejectedValue(new Error('Failed to fetch'));
    await expect(translate(baseRequest)).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('explainGrammar', () => {
  beforeEach(() => {
    state.apiKey = 'key';
    state.provider = fakeProvider();
  });

  it('asks for grammar points with the grammar schema and passes both sides', async () => {
    state.provider.complete.mockResolvedValue({ text: JSON.stringify({ grammar: [{ point: 'Present perfect', explanation: 'x' }] }), inputTokens: 1, outputTokens: 1, truncated: false });
    const result = await explainGrammar('I have been waiting.', 'منتظر بوده‌ام.', 'en-fa');
    expect(result.grammar).toEqual([{ point: 'Present perfect', explanation: 'x' }]);
    const call = state.provider.complete.mock.calls[0][0];
    expect(call.responseSchema).toBe(GRAMMAR_POINTS_SCHEMA);
    expect(call.temperature).toBe(0.3);
    expect(call.maxTokens).toBe(800);
    expect(call.userPrompt).toContain('<source lang="English">I have been waiting.</source>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-translate.test.js`
Expected: FAIL (`explainGrammar` not exported; `translate` signature mismatch)

- [ ] **Step 3: Write the implementation**

Replace the import block and `translate()` at the top of `lib/api.js` (everything from the first line through the end of the `translate` function; `validateApiKey`, `polish`, `regeneratePolishVariant`, `translateImage`, `getGrammarLesson` stay):

```js
import { POLISH_SYSTEM_PROMPT, POLISH_VARIANT_SYSTEM_PROMPT, GRAMMAR_LEARNING_PROMPT, IMAGE_SYSTEM_PROMPT, ERROR_MESSAGES } from './constants.js';
import { getCurrentProvider, getCurrentApiKey } from './providers/index.js';
import { extractJSON } from './json-utils.js';
import { buildSystemPrompt, buildUserMessage, GRAMMAR_POINTS_PROMPT, buildGrammarUserMessage } from './translation/prompts.js';
import { schemaForMode, coerceResult, coerceGrammarPoints, GRAMMAR_POINTS_SCHEMA } from './translation/schemas.js';
import { TEMPERATURES, computeMaxTokens, isStreamingMode } from './translation/budget.js';
import { TranslationError, ERROR_CODES, toTranslationError } from './translation/errors.js';

const GRAMMAR_POINTS_MAX_TOKENS = 800;

/**
 * Resolve the active provider and its key, or throw API_KEY_NOT_SET.
 */
async function getProviderAndKey() {
  const provider = await getCurrentProvider();
  const apiKey = await getCurrentApiKey();
  if (!apiKey) {
    throw new TranslationError(ERROR_CODES.API_KEY_NOT_SET, `${provider.config.displayName} API key not configured. Please set up in Settings.`);
  }
  return { provider, apiKey };
}

/**
 * Translate normalized text in a given mode.
 *
 * Word, phrase and sentence modes use native structured output and return the
 * coerced result contract. Text and batch modes stream plain text through
 * onDelta and return the assembled translation; when the provider stops at the
 * token limit the partial text is returned with truncated: true.
 *
 * @param {object} request
 * @param {string} request.text - Normalized source text
 * @param {'word'|'phrase'|'sentence'|'text'|'batch'} request.mode
 * @param {string} request.fromName - English name of the source language
 * @param {string} request.toName - English name of the target language
 * @param {string} request.direction - e.g. 'en-fa'
 * @param {boolean} [request.detectedByScript=true]
 * @param {{before?: string, after?: string, pageLang?: string, title?: string}} [request.context]
 * @param {Array} [request.glossary]
 * @param {AbortSignal} [request.signal]
 * @param {(text: string) => void} [request.onDelta]
 * @returns {Promise<object>}
 */
export async function translate(request) {
  const { provider, apiKey } = await getProviderAndKey();
  const { text, mode, fromName, toName, direction, detectedByScript = true, context, glossary = [], signal, onDelta } = request;

  const systemPrompt = buildSystemPrompt(mode);
  const userPrompt = buildUserMessage({ text, mode, fromName, toName, detectedByScript, context, glossary, direction });
  const maxTokens = computeMaxTokens(mode, text);

  try {
    if (isStreamingMode(mode)) {
      const result = await provider.stream({ systemPrompt, userPrompt, maxTokens, temperature: TEMPERATURES.translate, apiKey, signal, onDelta });
      const translation = result.text.trim();
      if (!translation) throw new TranslationError(ERROR_CODES.PARSE_FAILED);
      return { translation, truncated: Boolean(result.truncated), inputTokens: result.inputTokens, outputTokens: result.outputTokens };
    }

    const result = await provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: TEMPERATURES.translate,
      responseSchema: schemaForMode(mode),
      apiKey,
      signal
    });
    if (result.truncated) throw new TranslationError(ERROR_CODES.TRUNCATED);

    const parsed = extractJSON(result.text);
    if (!parsed) throw new TranslationError(ERROR_CODES.PARSE_FAILED);

    return { ...coerceResult(mode, parsed), truncated: false, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (error) {
    throw toTranslationError(error);
  }
}

/**
 * Explain the English grammar of a translation pair (2 to 4 points).
 * The translation shown to the user is never recomputed here.
 * @param {string} source
 * @param {string} translation
 * @param {string} direction - 'en-fa' | 'fa-en'
 * @returns {Promise<{grammar: Array<{point: string, explanation: string}>, inputTokens: number, outputTokens: number}>}
 */
export async function explainGrammar(source, translation, direction) {
  const { provider, apiKey } = await getProviderAndKey();
  try {
    const result = await provider.complete({
      systemPrompt: GRAMMAR_POINTS_PROMPT,
      userPrompt: buildGrammarUserMessage({ source, translation, direction }),
      maxTokens: GRAMMAR_POINTS_MAX_TOKENS,
      temperature: TEMPERATURES.grammar,
      responseSchema: GRAMMAR_POINTS_SCHEMA,
      apiKey
    });
    if (result.truncated) throw new TranslationError(ERROR_CODES.TRUNCATED);
    const parsed = extractJSON(result.text);
    if (!parsed) throw new TranslationError(ERROR_CODES.PARSE_FAILED);
    return { grammar: coerceGrammarPoints(parsed), inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  } catch (error) {
    throw toTranslationError(error);
  }
}
```

In `polish()` add `temperature: TEMPERATURES.polish,` to the `provider.complete({...})` call (after `maxTokens`). Leave the other functions unchanged.

In `lib/constants.js` delete the `SYSTEM_PROMPT` export together with its leading comment block (the block starting `// Translation System Prompt (structured JSON).`) and the `GRAMMAR_SYSTEM_PROMPT` export with its comment block (`// Grammar Explanation System Prompt` through the end of that template string). Keep `DICTIONARY_SYSTEM_PROMPT`, `POLISH_*`, `DOCUMENT_SYSTEM_PROMPT`, `GRAMMAR_LEARNING_PROMPT`, `IMAGE_SYSTEM_PROMPT`.

Delete `lib/page-translator.js`: `git rm lib/page-translator.js`.

- [ ] **Step 4: Verify nothing imports the removed symbols, run tests**

Run: `grep -rn "SYSTEM_PROMPT\b\|GRAMMAR_SYSTEM_PROMPT\|page-translator" --include='*.js' lib background popup content settings grammar history newtab favorites analytics scripts` (expected: no matches other than `*_SYSTEM_PROMPT` names that still exist), then `npx vitest run tests/api-translate.test.js` (expected: PASS, 8 tests) and `npm run build` (expected: success; the service worker still compiles because it only calls `translate` with positional args, which now produces a runtime error until Task 15 rewires it).

- [ ] **Step 5: Commit**

```bash
npm run lint && git add -A lib/api.js lib/constants.js lib/page-translator.js tests/api-translate.test.js && git commit -m "feat(api): mode-routed translate with structured output and streaming; explain-only grammar"
```

---

### Task 15: Service worker flow, stream port and shared client

**Files:**
- Create: `lib/translation/client.js`
- Modify: `background/service-worker.js` (imports, message listener error handling, `TRANSLATE` and `EXPLAIN_GRAMMAR` cases, `handleTranslate`, new `handleExplainGrammar`, new `translate-stream` port listener)
- Test: `tests/client.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 3, 5, 10 to 14.
- Produces: `requestTranslation(payload, { onDelta, signal }): Promise<result | { error, errorCode }>`; service worker responses for `TRANSLATE` are the result contract plus `cached`, `fromCache` (alias kept for the old UI), `provider`, `inputTokens`, `outputTokens`; errors are `{ error: localizedMessage, errorCode }`; port messages `{ type: 'delta', text }`, `{ type: 'done', result }`, `{ type: 'error', code, message }`; `EXPLAIN_GRAMMAR { source, translation, direction }` returns `{ grammar, cached }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/client.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestTranslation } from '../lib/translation/client.js';

function fakePort() {
  const listeners = { message: [], disconnect: [] };
  return {
    posted: [],
    disconnected: false,
    onMessage: { addListener: fn => listeners.message.push(fn) },
    onDisconnect: { addListener: fn => listeners.disconnect.push(fn) },
    postMessage(msg) { this.posted.push(msg); },
    disconnect() { this.disconnected = true; },
    emit(msg) { listeners.message.forEach(fn => fn(msg)); },
    drop() { listeners.disconnect.forEach(fn => fn()); }
  };
}

describe('requestTranslation', () => {
  let port;
  beforeEach(() => {
    port = fakePort();
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg) => ({ translation: 'x', echo: msg })),
        connect: vi.fn(() => port)
      }
    };
  });

  it('sends short inputs as a one-shot TRANSLATE message with the mode', async () => {
    const result = await requestTranslation({ text: 'charge', sourceLang: 'auto', context: { before: 'a' } });
    expect(chrome.runtime.connect).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'TRANSLATE', text: 'charge', sourceLang: 'auto', context: { before: 'a' }, mode: 'word' });
    expect(result.translation).toBe('x');
  });

  it('streams long inputs through the translate-stream port', async () => {
    const deltas = [];
    const promise = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' }, { onDelta: d => deltas.push(d) });
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'translate-stream' });
    expect(port.posted[0]).toEqual({ type: 'start', text: 'One. Two.', sourceLang: 'auto', mode: 'text' });
    port.emit({ type: 'delta', text: 'یک. ' });
    port.emit({ type: 'delta', text: 'دو.' });
    port.emit({ type: 'done', result: { translation: 'یک. دو.' } });
    expect(await promise).toEqual({ translation: 'یک. دو.' });
    expect(deltas).toEqual(['یک. ', 'دو.']);
    expect(port.disconnected).toBe(true);
  });

  it('resolves stream errors as error objects', async () => {
    const promise = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' });
    port.emit({ type: 'error', code: 'TRUNCATED', message: 'cut' });
    expect(await promise).toEqual({ error: 'cut', errorCode: 'TRUNCATED' });
  });

  it('resolves ABORTED when the port drops or the signal fires', async () => {
    const dropped = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' });
    port.drop();
    expect(await dropped).toMatchObject({ errorCode: 'ABORTED' });

    port = fakePort();
    const controller = new AbortController();
    const aborted = requestTranslation({ text: 'One. Two.', sourceLang: 'auto' }, { signal: controller.signal });
    controller.abort();
    expect(await aborted).toMatchObject({ errorCode: 'ABORTED' });
    expect(port.disconnected).toBe(true);
  });

  it('honors an explicit batch mode', async () => {
    requestTranslation({ text: '[1] a', mode: 'batch', sourceLang: 'en' });
    expect(port.posted[0].mode).toBe('batch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/client.test.js`
Expected: FAIL with "Failed to load url ../lib/translation/client.js"

- [ ] **Step 3: Write the client**

```js
// lib/translation/client.js
import { classifyMode } from './mode.js';
import { normalizeInput } from './normalize.js';
import { isStreamingMode } from './budget.js';

const PORT_NAME = 'translate-stream';
const ABORTED = { error: 'Translation cancelled.', errorCode: 'ABORTED' };

/**
 * Request a translation from the service worker. Short inputs go through a
 * one-shot TRANSLATE message; text and batch modes stream through a port.
 * Resolves with the result contract, or with { error, errorCode } so callers
 * keep their existing `if (response.error)` checks.
 *
 * @param {{text: string, sourceLang?: string, context?: object, mode?: string}} payload
 * @param {{onDelta?: (text: string) => void, signal?: AbortSignal}} [options]
 * @returns {Promise<object>}
 */
export function requestTranslation(payload, { onDelta, signal } = {}) {
  const mode = payload.mode || classifyMode(normalizeInput(payload.text));
  const message = { ...payload, mode };

  if (!isStreamingMode(mode)) {
    return chrome.runtime.sendMessage({ action: 'TRANSLATE', ...message });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch (error) {
      finish({ error: error?.message || 'Connection failed', errorCode: 'UNKNOWN' });
      return;
    }

    port.onMessage.addListener((msg) => {
      if (msg?.type === 'delta') {
        if (onDelta) onDelta(msg.text);
      } else if (msg?.type === 'done') {
        finish(msg.result);
        port.disconnect();
      } else if (msg?.type === 'error') {
        finish({ error: msg.message, errorCode: msg.code || 'UNKNOWN' });
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => finish(ABORTED));

    if (signal) {
      const onAbort = () => {
        finish(ABORTED);
        port.disconnect();
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    port.postMessage({ type: 'start', ...message });
  });
}
```

- [ ] **Step 4: Run the client test**

Run: `npx vitest run tests/client.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Rewire the service worker**

In `background/service-worker.js`:

1. Replace the import block with:

```js
import { translate, explainGrammar, polish, translateImage, regeneratePolishVariant, getGrammarLesson } from '../lib/api.js';
import { lookupWord } from '../lib/dictionary.js';
import { translateDocument } from '../lib/document-translator.js';
import { translationCache } from '../lib/cache.js';
import { hasApiKey, getDictionaryTranslationSettings, isTranslationCancelled, setTranslationCancelled, getSelectedProvider, getFavorites, addFavorite, removeFavorite, isFavorite, hasCompletedOnboarding, logUsageEvent, runCacheMigrations, getTranslateOtherLanguages, getLanguage } from '../lib/storage.js';
import { detectLanguageCode, isSupportedLanguage, getTranslationInfo } from '../lib/language-detect.js';
import { addToHistory, addToPolishHistory, addToDictionaryHistory, updatePolishVariant } from '../lib/history.js';
import { ACTIONS, PROVIDER_CONFIGS, ACTION_TYPES, ERROR_MESSAGES } from '../lib/constants.js';
import { classifyMode, MODES } from '../lib/translation/mode.js';
import { normalizeInput, normalizePersian } from '../lib/translation/normalize.js';
import { buildCacheKeyParts, hashContext } from '../lib/translation/cache-key.js';
import { TranslationError, ERROR_CODES, toTranslationError, errorI18nKey } from '../lib/translation/errors.js';
import { t } from '../lib/i18n.js';
```

2. Replace the `chrome.runtime.onMessage` listener with:

```js
/**
 * Localized error payload for UI consumers.
 * @param {unknown} error
 * @returns {Promise<{error: string, errorCode: string}>}
 */
async function localizeError(error) {
  const err = toTranslationError(error);
  let lang = 'en';
  try { lang = await getLanguage(); } catch { /* default */ }
  const message = err.code === ERROR_CODES.UNKNOWN ? err.message : t(errorI18nKey(err.code), lang);
  return { error: message, errorCode: err.code };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(async (error) => sendResponse(await localizeError(error)));
  return true;
});
```

3. In `handleMessage`, replace the `TRANSLATE` case with `return handleTranslate(message);` and add after the `GET_GRAMMAR_LESSON` case:

```js
    case ACTIONS.EXPLAIN_GRAMMAR:
      return handleExplainGrammar(message);
```

4. Replace the whole `handleTranslate` function (its JSDoc through its closing brace) with:

```js
const VALID_MODES = new Set(Object.values(MODES));
const CONTEXT_MODES = new Set([MODES.WORD, MODES.PHRASE, MODES.SENTENCE]);
const CONTEXT_HASH_MODES = new Set([MODES.WORD, MODES.PHRASE]);

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return undefined;
  const before = String(context.before || '').slice(-300);
  const after = String(context.after || '').slice(0, 300);
  const pageLang = String(context.pageLang || '').slice(0, 12);
  const title = String(context.title || '').slice(0, 120);
  if (!before && !after && !pageLang && !title) return undefined;
  return { before, after, pageLang, title };
}

/**
 * Normalize, gate, classify and build the cache key for a request.
 */
async function prepareTranslation(payload) {
  const sourceText = normalizeInput(payload.text);
  if (!sourceText) throw new TranslationError(ERROR_CODES.EMPTY_INPUT);

  const sourceLang = payload.sourceLang === 'en' || payload.sourceLang === 'fa' ? payload.sourceLang : 'auto';
  const mode = VALID_MODES.has(payload.mode) ? payload.mode : classifyMode(sourceText);

  if (sourceLang === 'auto' && mode !== MODES.BATCH && !(await getTranslateOtherLanguages())) {
    const gate = isSupportedLanguage(sourceText);
    if (!gate.supported) throw new TranslationError(ERROR_CODES.UNSUPPORTED);
  }

  const info = getTranslationInfo(sourceText, sourceLang);
  const context = CONTEXT_MODES.has(mode) ? sanitizeContext(payload.context) : undefined;
  const providerId = await getSelectedProvider();
  const contextHash = CONTEXT_HASH_MODES.has(mode) ? await hashContext(context) : '';
  const keyParts = buildCacheKeyParts({ provider: providerId, mode, direction: info.direction, text: sourceText, contextHash });

  return { sourceText, sourceLang, mode, info, context, providerId, keyParts };
}

/**
 * Apply detected-source corrections and Persian normalization to a raw
 * translate() result, producing the result contract.
 */
function finalizeResult(raw, { mode, info, sourceText }) {
  let finalInfo = info;
  if (raw.detectedSource === 'fa-latn' || (raw.detectedSource === 'fa' && info.from !== 'fa')) {
    finalInfo = getTranslationInfo(sourceText, 'fa');
  } else if (raw.detectedSource === 'en' && info.from === 'fa') {
    finalInfo = getTranslationInfo(sourceText, 'en');
  }
  const toPersian = finalInfo.to === 'fa';
  const fixTarget = (s) => (toPersian && s ? normalizePersian(s) : (s || ''));
  const fixSource = (s) => (!toPersian && s ? normalizePersian(s) : (s || ''));

  const result = {
    translation: fixTarget(raw.translation),
    mode,
    direction: finalInfo.direction,
    displayDirection: finalInfo.displayDirection,
    detectedSource: raw.detectedSource || info.from,
    sourceText,
    normalized: raw.normalized ? normalizePersian(raw.normalized) : '',
    correction: raw.correction || '',
    truncated: Boolean(raw.truncated)
  };

  if (mode === MODES.WORD || mode === MODES.PHRASE) {
    Object.assign(result, {
      pronunciation: raw.pronunciation || '',
      pos: raw.pos || '',
      register: raw.register || 'neutral',
      inContext: raw.inContext || '',
      senses: (raw.senses || []).map(s => ({
        pos: s.pos,
        meaning: fixTarget(s.meaning),
        example: { src: fixSource(s.example?.src), tgt: fixTarget(s.example?.tgt) }
      })),
      synonyms: (raw.synonyms || []).map(fixSource),
      antonyms: (raw.antonyms || []).map(fixSource)
    });
  } else if (mode === MODES.SENTENCE) {
    Object.assign(result, {
      register: raw.register || 'neutral',
      alternatives: (raw.alternatives || []).map(a => ({ text: fixTarget(a.text), label: a.label })),
      note: raw.note || ''
    });
  }
  return result;
}

/**
 * Handle a translation request (one-shot or streamed).
 * @param {object} payload - { text, sourceLang, context, mode }
 * @param {{signal?: AbortSignal, onDelta?: (text: string) => void}} [options]
 * @returns {Promise<object>} Result contract plus cached/fromCache/provider/token fields
 */
async function handleTranslate(payload, { signal, onDelta } = {}) {
  const prep = await prepareTranslation(payload);
  const providerName = PROVIDER_CONFIGS[prep.providerId]?.name || 'AI';

  const cached = await translationCache.get(prep.keyParts);
  if (cached) {
    return { ...cached, cached: true, fromCache: true, provider: providerName, inputTokens: 0, outputTokens: 0 };
  }

  const raw = await translate({
    text: prep.sourceText,
    mode: prep.mode,
    fromName: prep.info.detectedName,
    toName: prep.info.targetName,
    direction: prep.info.direction,
    detectedByScript: prep.sourceLang === 'auto',
    context: prep.context,
    glossary: [],
    signal,
    onDelta
  });

  const result = finalizeResult(raw, prep);

  if (!result.truncated) {
    await translationCache.set(prep.keyParts, result);
  }
  await addToHistory({ original: prep.sourceText, translation: result.translation, direction: result.direction, mode: prep.mode, result });
  await logUsageEvent({
    action: ACTION_TYPES.TRANSLATE, provider: prep.providerId,
    inputTokens: raw.inputTokens || 0,
    outputTokens: raw.outputTokens || 0
  });

  return { ...result, cached: false, fromCache: false, provider: providerName, inputTokens: raw.inputTokens || 0, outputTokens: raw.outputTokens || 0 };
}

/**
 * Explain the grammar of an existing translation pair (cached per pair).
 * @param {{source: string, translation: string, direction: string}} payload
 */
async function handleExplainGrammar({ source, translation, direction }) {
  if (!source || !translation) throw new TranslationError(ERROR_CODES.EMPTY_INPUT);
  const providerId = await getSelectedProvider();
  const keyParts = [providerId, 'grammar', direction || '', '', `${source}\n${translation}`];

  const cached = await translationCache.get(keyParts);
  if (cached) return { ...cached, cached: true };

  const result = await explainGrammar(source, translation, direction);
  const payload = { grammar: result.grammar };
  await translationCache.set(keyParts, payload);
  await logUsageEvent({
    action: ACTION_TYPES.GRAMMAR, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });
  return { ...payload, cached: false };
}
```

5. Directly after the existing `translate-document` `chrome.runtime.onConnect` listener add:

```js
/**
 * Streaming translation port. Client sends { type: 'start', ...payload }; the
 * worker replies with delta messages, then done (or error). Disconnecting the
 * port aborts the provider request.
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'translate-stream') return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  const post = (msg) => {
    try { port.postMessage(msg); } catch { /* port closed */ }
  };

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'start') return;
    try {
      const result = await handleTranslate(msg, {
        signal: controller.signal,
        onDelta: (text) => post({ type: 'delta', text })
      });
      post({ type: 'done', result });
    } catch (error) {
      const { error: message, errorCode } = await localizeError(error);
      post({ type: 'error', code: errorCode, message });
    }
  });
});
```

6. In `handleDictionaryLookup`, `handlePolish` and the other handlers nothing changes. `detectLanguageCode` stays imported if still used (check with grep; remove from the import if unused so lint passes).

- [ ] **Step 6: Lint, build, run the suite**

Run: `npm run lint && npm run build && npm test`
Expected: all green. Load the unpacked extension from the repo root in Chrome (chrome://extensions, Reload), select a word on any page and use the context menu: the floating box still shows a translation (via the adapter-free path: `showTranslation` reads `translation` and `direction`, which the new contract still provides).

- [ ] **Step 7: Commit**

```bash
git add lib/translation/client.js background/service-worker.js tests/client.test.js && git commit -m "feat(background): mode-aware translate handler, stream port, explain-grammar action and localized errors"
```

---

### Task 16: Content script: selection context and adapters

**Files:**
- Create: `content/context.js`
- Modify: `content/main.js` (imports, `translateAndShow`, new `showStreamingText`, `showTranslation`, `appendInlineGrammarAffordance`, page-translation batch call), `content/styles/index.js` (one rule)
- Test: `tests/context.test.js`

**Interfaces:**
- Consumes: `requestTranslation` (Task 15), `getTextDirection` from `lib/language-detect.js`, `t` from `lib/i18n.js`.
- Produces: `sliceContext(blockText, selectedText, { maxChars, anchorOffset }): { before, after } | undefined` (pure), `captureSelectionContext(selection): { before, after, pageLang, title } | undefined` (DOM).

- [ ] **Step 1: Write the failing test**

```js
// tests/context.test.js
import { describe, it, expect } from 'vitest';
import { sliceContext } from '../content/context.js';

const block = 'Library policies apply to everyone. They will charge you a fee for late returns, and a second charge applies after thirty days.';

describe('sliceContext', () => {
  it('returns text before and after the first occurrence at or after the anchor', () => {
    const ctx = sliceContext(block, 'charge', { maxChars: 30, anchorOffset: 0 });
    expect(ctx.before.endsWith('They will ')).toBe(true);
    expect(ctx.after.startsWith(' you a fee')).toBe(true);
    expect(ctx.before.length).toBeLessThanOrEqual(30);
    expect(ctx.after.length).toBeLessThanOrEqual(30);
  });
  it('uses the anchor offset to pick the right occurrence', () => {
    const second = block.indexOf('second');
    const ctx = sliceContext(block, 'charge', { maxChars: 40, anchorOffset: second });
    expect(ctx.before.endsWith('a second ')).toBe(true);
    expect(ctx.after.startsWith(' applies')).toBe(true);
  });
  it('cuts at word boundaries when the window is clipped', () => {
    const ctx = sliceContext(block, 'charge', { maxChars: 12, anchorOffset: 0 });
    expect(ctx.before).toBe('They will ');
    expect(ctx.after).toBe(' you a fee');
  });
  it('collapses whitespace and tolerates a missing selection', () => {
    expect(sliceContext('a\n\n  b  charge c', 'charge', { maxChars: 50 })).toEqual({ before: 'a b ', after: ' c' });
    expect(sliceContext(block, 'missing')).toBeUndefined();
    expect(sliceContext('', 'charge')).toBeUndefined();
  });
  it('returns undefined when the selection is the whole block', () => {
    expect(sliceContext('charge', 'charge')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/context.test.js`
Expected: FAIL with "Failed to load url ../content/context.js"

- [ ] **Step 3: Write `content/context.js`**

```js
// content/context.js
/**
 * Surrounding-sentence capture for word, phrase and sentence selections.
 * sliceContext is pure (tested); captureSelectionContext reads the DOM.
 */

const BLOCK_SELECTOR = 'p, li, td, th, dd, dt, blockquote, h1, h2, h3, h4, h5, h6, figcaption, pre, article, section, div';
const MAX_CONTEXT_CHARS = 300;
const MAX_SELECTION_FOR_CONTEXT = 280;

/**
 * @param {string} blockText
 * @param {string} selectedText
 * @param {{maxChars?: number, anchorOffset?: number}} [options]
 * @returns {{before: string, after: string} | undefined}
 */
export function sliceContext(blockText, selectedText, { maxChars = MAX_CONTEXT_CHARS, anchorOffset = 0 } = {}) {
  if (!blockText || !selectedText) return undefined;
  const text = String(blockText).replace(/\s+/g, ' ');
  const needle = String(selectedText).replace(/\s+/g, ' ').trim();
  if (!needle) return undefined;

  const start = Math.max(0, Math.min(anchorOffset, text.length));
  let idx = text.indexOf(needle, start);
  if (idx === -1) idx = text.indexOf(needle);
  if (idx === -1) return undefined;

  const beforeStart = Math.max(0, idx - maxChars);
  const afterEnd = Math.min(text.length, idx + needle.length + maxChars);
  let before = text.slice(beforeStart, idx);
  let after = text.slice(idx + needle.length, afterEnd);
  if (beforeStart > 0) before = before.replace(/^\S*\s/, '');
  if (afterEnd < text.length) after = after.replace(/\s\S*$/, '');

  if (!before && !after) return undefined;
  return { before, after };
}

function toElement(node) {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

/**
 * @param {Selection} selection
 * @returns {{before: string, after: string, pageLang: string, title: string} | undefined}
 */
export function captureSelectionContext(selection) {
  try {
    if (!selection || selection.rangeCount === 0) return undefined;
    const selected = selection.toString();
    if (!selected.trim() || selected.length > MAX_SELECTION_FOR_CONTEXT) return undefined;

    const range = selection.getRangeAt(0);
    const block = toElement(range.startContainer)?.closest(BLOCK_SELECTOR);
    const endElement = toElement(range.endContainer);
    if (!block || !endElement || !block.contains(endElement)) return undefined;

    const preRange = document.createRange();
    preRange.selectNodeContents(block);
    preRange.setEnd(range.startContainer, range.startOffset);
    const anchorOffset = preRange.toString().replace(/\s+/g, ' ').length;

    const slice = sliceContext(block.textContent || '', selected, { anchorOffset: Math.max(0, anchorOffset - 5) });
    const pageLang = (document.documentElement.lang || '').slice(0, 12);
    const title = (document.title || '').trim().slice(0, 120);
    if (!slice && !pageLang && !title) return undefined;
    return { before: slice?.before || '', after: slice?.after || '', pageLang, title };
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run the context test**

Run: `npx vitest run tests/context.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Adapt `content/main.js`**

1. Add imports near the other imports:

```js
import { requestTranslation } from '../lib/translation/client.js';
import { captureSelectionContext } from './context.js';
```

   and make sure `getTextDirection` is in the existing import from `../lib/language-detect.js` (add it if absent).

2. Replace `translateAndShow` with:

```js
/**
 * Translate text and show floating box. Long selections stream into the box.
 */
async function translateAndShow(text) {
  if (!text || text.trim().length === 0) {
    return;
  }

  const selection = window.getSelection();
  const position = getBoxPosition(selection);
  const context = captureSelectionContext(selection);

  createFloatingBox(position);
  showLoading();

  let streamed = '';
  try {
    const response = await requestTranslation({ text, sourceLang: 'auto', context }, {
      onDelta: (delta) => {
        streamed += delta;
        showStreamingText(streamed);
      }
    });

    if (response.error) {
      showError(response.error);
    } else {
      showTranslation(response, text);
    }
  } catch (error) {
    showError(error.message || 'Translation failed');
  }
}

/**
 * Render partial streamed text in place of the loading skeleton.
 */
function showStreamingText(text) {
  if (!shadowRoot) return;
  const content = shadowRoot.querySelector('.parsipad-content');
  let textEl = content.querySelector('.parsipad-text');
  if (!textEl) {
    content.replaceChildren();
    textEl = document.createElement('div');
    textEl.className = 'parsipad-text';
    content.appendChild(textEl);
  }
  textEl.setAttribute('dir', getTextDirection(text));
  textEl.textContent = text;
}
```

3. In `showTranslation`, replace the destructuring line with:

```js
  const { translation, direction, displayDirection, fromCache, provider, correction, alternatives, senses, note, inContext, truncated } = result;
  const corrections = correction ? [{ original: (originalText || '').trim(), corrected: correction }] : [];
  const alternativeItems = Array.isArray(alternatives) && alternatives.length
    ? alternatives.map(a => a.text)
    : (Array.isArray(senses) ? senses.map(s => s.meaning).filter(Boolean) : []);
  const nuance = note || inContext || '';
```

   then in the body: replace every `alternatives` reference inside the rich-context block with `alternativeItems`, and inside the `alternativeItems.forEach(alt => { ... })` loop set the direction per item:

```js
      alternativeItems.forEach(alt => {
        const li = document.createElement('li');
        li.textContent = alt;
        li.setAttribute('dir', getTextDirection(alt));
        list.appendChild(li);
      });
```

   Delete the comment that says alternatives are always English. After the rich-context block and before `appendInlineGrammarAffordance(...)`, add:

```js
  if (truncated) {
    const notice = document.createElement('div');
    notice.className = 'parsipad-truncated-note';
    notice.setAttribute('role', 'status');
    notice.textContent = t('errorTruncated', userLang);
    content.appendChild(notice);
  }
```

4. In `appendInlineGrammarAffordance`, replace the `chrome.runtime.sendMessage({ action: 'TRANSLATE', text: originalText, sourceLang: 'auto', withGrammar: true })` call with:

```js
      const response = await chrome.runtime.sendMessage({
        action: 'EXPLAIN_GRAMMAR',
        source: originalText,
        translation,
        direction
      });
```

   and update the function's JSDoc to say it calls `EXPLAIN_GRAMMAR` with the translation already on screen.

5. In `handleTranslatePage`, replace the `Promise.race([...])` block (from `const response = await Promise.race([` through `]);`) with:

```js
        const response = await requestTranslation({
          text: batchText,
          sourceLang: pageTranslationState.sourceLanguage,
          mode: 'batch'
        }, { signal: abortSignal });

        if (response.errorCode === 'ABORTED') {
          break;
        }
```

   The existing `if (response.error) { ... }` block that follows stays.

6. In `content/styles/index.js`, next to the `.parsipad-rich-context` rules add:

```css
.parsipad-truncated-note {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
}
```

- [ ] **Step 6: Lint, build and check in the browser**

Run: `npm run lint && npm run build`. Reload the unpacked extension. On a page, select a single word inside a sentence and translate via the context menu: the box shows the translation and the senses as the list; select three paragraphs: the box fills progressively; press "Explain grammar" on a sentence: points appear without the translation changing.

- [ ] **Step 7: Commit**

```bash
git add content/context.js content/main.js content/styles/index.js tests/context.test.js && git commit -m "feat(content): send selection context, stream long translations, explain grammar without retranslating"
```

---

### Task 17: Popup adapters

**Files:**
- Modify: `popup/popup.js` (imports, `handleTranslate`, `displayTranslation`, `renderTranslationRichContext`, `displayGrammarExplanation`)

**Interfaces:**
- Consumes: `requestTranslation` (Task 15), `EXPLAIN_GRAMMAR` (Task 15), existing `getTextDirection`, `t`, `escapeHtml`.

- [ ] **Step 1: Adapt `popup/popup.js`**

1. Add the import:

```js
import { requestTranslation } from '../lib/translation/client.js';
```

2. Replace the body of the `try` block in `handleTranslate` (from `const response = await chrome.runtime.sendMessage({` through `displayTranslation(response);`) with:

```js
    let streamed = '';
    const response = await requestTranslation({ text, sourceLang: 'auto' }, {
      onDelta: (delta) => {
        streamed += delta;
        outputText.dir = getTextDirection(streamed);
        outputText.textContent = streamed;
        outputSection.hidden = false;
      }
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    await displayTranslation(response);

    if (withGrammar && response.translation) {
      const grammarResponse = await chrome.runtime.sendMessage({
        action: 'EXPLAIN_GRAMMAR',
        source: text,
        translation: response.translation,
        direction: response.direction
      });
      if (!grammarResponse?.error && Array.isArray(grammarResponse?.grammar) && grammarResponse.grammar.length) {
        displayGrammarExplanation(grammarResponse.grammar);
        if (grammarLearnMoreBtn) grammarLearnMoreBtn.hidden = false;
      }
    }
```

3. In `displayTranslation`, replace the destructuring line with:

```js
  const { translation, direction, displayDirection, fromCache, correction, alternatives, senses, note, inContext, truncated } = result;
  const corrections = correction ? [{ original: inputText.value.trim(), corrected: correction }] : [];
  const alternativeItems = Array.isArray(alternatives) && alternatives.length
    ? alternatives.map(a => a.text)
    : (Array.isArray(senses) ? senses.map(s => s.meaning).filter(Boolean) : []);
  const examples = Array.isArray(senses)
    ? senses.filter(s => s.example && (s.example.src || s.example.tgt)).map(s => ({ source: s.example.src, target: s.example.tgt }))
    : [];
  const nuance = truncated ? `${t('errorTruncated', currentLang)}${note || inContext ? ' ' : ''}${note || inContext || ''}` : (note || inContext || '');
```

   then change the two render calls to `renderTranslationCorrections(corrections);` and `renderTranslationRichContext({ alternatives: alternativeItems, examples, nuance, direction });`, and replace the `if (grammar && grammar.length > 0) { ... } else { ... }` block with:

```js
  grammarSection.hidden = true;
  if (grammarLearnMoreBtn) {
    grammarLearnMoreBtn.hidden = true;
  }
```

4. In `renderTranslationRichContext`, remove `if (targetIsRtl) list.dir = 'rtl';` and set direction per item inside the `alternatives.forEach` loop: `li.dir = getTextDirection(alt);`. In the examples loop replace `if (targetIsRtl) tgt.dir = 'rtl';` with `tgt.dir = getTextDirection(ex.target || '');` and add `src.dir = getTextDirection(ex.source || '');`. Remove the now-unused `targetLang` and `targetIsRtl` constants from that function.

5. Replace `displayGrammarExplanation` with (grammar is always English since 2.11.4):

```js
/**
 * Display grammar explanation (always English, always LTR)
 * @param {Array<{point: string, explanation: string}>} grammarPointsList
 */
function displayGrammarExplanation(grammarPointsList) {
  grammarPoints.innerHTML = grammarPointsList.map(item => `
    <div class="grammar-point" dir="ltr">
      <div class="grammar-point-title">${escapeHtml(item.point)}</div>
      <div class="grammar-point-explanation">${escapeHtml(item.explanation)}</div>
    </div>
  `).join('');

  grammarSection.hidden = false;
}
```

   and update any other call sites of `displayGrammarExplanation(x, direction)` to `displayGrammarExplanation(x)` (grep `displayGrammarExplanation(`).

- [ ] **Step 2: Lint, build, check in the browser**

Run: `npm run lint && npm run build && npm test`. Reload the extension, open the popup: translate a word (senses appear in "Linguistic context"), a paragraph (text streams into the output), and a sentence with the grammar checkbox ticked (points render LTR under the unchanged translation). Click a history item: it still restores the translation.

- [ ] **Step 3: Commit**

```bash
git add popup/popup.js && git commit -m "feat(popup): stream long translations, render senses and alternatives per direction, grammar via EXPLAIN_GRAMMAR"
```

---

### Task 18: Verification, live probes, changelog

**Files:**
- Modify: `CHANGELOG.md` (new Unreleased section), `docs/superpowers/specs/2026-08-20-translation-core-design.md` (truncation policy note)

- [ ] **Step 1: Full verification**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean, every test file green (the pre-existing 39 plus the new suites), `dist/` rebuilt.

- [ ] **Step 2: Live probe set (Chrome automation, user's provider keys)**

Enable Settings > General > Selection Popup if it is still off (sub-project 2 turns it on by default). On a test page containing the sentences below, drive the selection popup's translate icon and record the card contents for each probe. Repeat with a second provider where keys exist.

| Probe | Selection | Expected |
|---|---|---|
| Sense by context | "charge" inside "They will charge you a fee" | word mode, translation is the fee sense, senses list present, `inContext` non-empty |
| Sense by context | "charge" inside "a charge of fraud" | a different first sense than above |
| Phrase | "run the migration" | phrase mode, idiomatic Persian, no English alternatives |
| Idiom | "as a matter of fact" | phrase mode, meaning-based rendering |
| Colloquial Persian | "نمیدونم چی بگم" | sentence mode, casual English, `correction` empty |
| Finglish | "chetori, khoobi?" | `detectedSource` fa-latn, direction FA to EN, `normalized` in Persian script |
| Long text | a 700-word passage | text mode, progressive rendering, no truncation notice, paragraphs preserved |
| Other language, setting on | "Привет, как дела?" | translated into Persian |
| Other language, setting off | same | UNSUPPORTED message in the UI language |
| Citation prefix | "[1] Smith et al., 2020" | translated as a phrase or sentence, not parsed as a batch |
| Orthography | any English to Persian result | no Arabic ي or ك in the output, ZWNJ present in می‌ forms |

Record any probe that fails with the raw response, fix the prompt or coercion, and rerun before moving on.

- [ ] **Step 3: Changelog and spec note**

Add to the top of `CHANGELOG.md` under the header:

```markdown
## [Unreleased]

### Changed
- **Translation core rebuilt around modes and context.** Selections are classified as word, phrase, sentence or text. Words and phrases are translated using the sentence around them and return senses by part of speech, synonyms, antonyms, IPA and register; sentences return labelled alternatives in the target language; long text streams into the card progressively.
- Providers use native structured output (Claude `output_config.format`, Gemini `responseSchema`, OpenAI strict `json_schema`), temperature 0.2 for translation, token budgets scaled to the input, and report truncation instead of showing cut-off JSON.
- Grammar explanations no longer re-translate the text; "Explain grammar" explains the translation already on screen (`EXPLAIN_GRAMMAR`) and is cached per pair.
- Persian output is normalized (Persian ی and ک, spacing before punctuation) before display, caching, history and copy.
- History keeps the full translation (up to 4000 characters) and the structured result.
- New setting: "Translate other languages into Persian" (default on). When off, non-Persian, non-English text is rejected as before.

### Removed
- `lib/page-translator.js` (unused).
- Numbered-batch detection on user selections; page translation now passes the batch mode explicitly.
```

In the spec, section 7.3, append: "Streamed modes (text, batch) return the partial text with `truncated: true` instead of throwing, because the user has already seen the text; the UI shows the TRUNCATED message beneath it. Structured modes throw `TRUNCATED`."

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-08-20-translation-core-design.md && git commit -m "docs: changelog for the translation core and truncation policy note"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| 3 Request contract, 3.1 context capture | 15 (sanitizeContext), 16 (captureSelectionContext) |
| 4.1 Mode router | 2 |
| 4.2 Normalizers | 3 |
| 4.3 Direction, translateOtherLanguages, detectedSource | 12, 13, 15 (prepareTranslation, finalizeResult) |
| 5.1 Prompts and glossary hook | 5 |
| 5.2 Schemas and coercion | 4 |
| 5.3 Result contract | 15 (finalizeResult) |
| 6 Grammar | 5 (prompt), 14 (explainGrammar), 15 (handler), 16 and 17 (callers) |
| 7.1 to 7.4 Providers, budgets, SSE | 6, 7, 8, 9, 5 (budget) |
| 8.1 Service worker flow, 8.2 port, 8.3 adapters | 15, 16, 17 |
| 9 Errors | 1, 12 (strings), 15 (localizeError) |
| 10 Cache and history | 10, 11 |
| 11 Settings and i18n | 12 |
| 12 Tests | every task; live probes in 18 |
| 13 Out of scope | respected; dictionary, polish and document paths untouched apart from polish temperature |

**Placeholder scan:** no TBD/TODO; every code step contains the code; schema and prompt text are spelled out.

**Type consistency:** `requestTranslation(payload, { onDelta, signal })` (Tasks 15, 16, 17); `translate(request)` fields `text, mode, fromName, toName, direction, detectedByScript, context, glossary, signal, onDelta` (Tasks 14, 15); `coerceResult` base fields `translation, detectedSource, normalized, correction` (Tasks 4, 15); cache `get(parts)` / `set(parts, result)` (Tasks 10, 15); `addToHistory({ original, translation, direction, mode, result })` (Tasks 11, 15); provider `complete` returns `{ text, inputTokens, outputTokens, truncated }` (Tasks 7 to 9, 14); `parse*SseEvent` returns `{ delta?, inputTokens?, outputTokens?, truncated?, done? }` (Tasks 7 to 9); `getTranslationInfo` adds `detectedName`, `targetName` (Tasks 13, 15).
