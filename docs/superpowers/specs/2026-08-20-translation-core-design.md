# Translation Core Redesign (ParsiPad 3.0, sub-project 1 of 3)

Date: 2026-08-20
Status: approved design, pending implementation plan
Scope: `lib/translation/*` (new), `lib/api.js`, `lib/providers/*`, `lib/language-detect.js`, `lib/history.js`, `lib/cache.js`, `lib/constants.js`, `lib/storage.js`, `lib/i18n.js`, `background/service-worker.js`, thin adapters in `content/main.js` and `popup/popup.js`, tests.

## 1. Goal

Make ParsiPad translate like a translator rather than like a chat model that is asked to translate. The core must:

- translate words and phrases in the context of the sentence they were selected from;
- treat a word, a phrase, a sentence and a block of text as different jobs with fixed, predictable output shapes;
- return senses, alternatives and notes in the target language;
- never show truncated or raw JSON as a translation;
- stream long translations so they appear progressively;
- keep the app working at every commit so sub-projects 2 (result experience) and 3 (workspace features) can build on it.

This sub-project does not change the visible UI beyond a thin adapter. The card, popup, dictionary merge, side panel and glossary editor follow in sub-projects 2 and 3.

## 2. Decisions already made

| Decision | Choice |
|---|---|
| Release | One 3.0.0 release on branch `feat/translator-3`, commit per phase, publish when all three sub-projects are done |
| Consolidation | Dictionary, polish, grammar, stats relocate into the unified card and popup; only provider and cache badges and the grammar checkbox disappear; selection popup on by default for everyone (sub-project 2) |
| Side panel | Added alongside the popup, not replacing it (sub-project 3) |
| Streaming | Word, phrase and sentence use native structured output without streaming; text and batch stream plain text; no partial-JSON parsing |
| Content script | Progressive extraction into `content/card/` modules (sub-project 2), not a rewrite |
| Transport | One-shot modes use `chrome.runtime.sendMessage`; streamed modes use a `chrome.runtime.connect` port named `translate-stream` |
| Testing | Vitest for every pure module and for provider request shapes with mocked fetch; live checks through Chrome automation with the user's provider keys |

## 3. Request contract

All entry points (content script, popup, later side panel) send the same payload, either as a `TRANSLATE` message or as the `start` message on the stream port:

```js
{
  text: string,                       // raw selection or typed text
  sourceLang: 'auto' | 'en' | 'fa',   // 'auto' by default; manual override from the direction pill
  context: {                          // optional, captured by the content script
    before: string,                   // up to 300 chars preceding the selection in the same block
    after: string,                    // up to 300 chars following it
    pageLang: string,                 // document.documentElement.lang or ''
    title: string                     // document.title, trimmed to 120 chars
  } | undefined,
  mode: 'word' | 'phrase' | 'sentence' | 'text' | 'batch' | undefined,  // override; batch only from page translation
  stream: boolean | undefined         // hint; the service worker decides by mode
}
```

The `withGrammar` flag is removed from `TRANSLATE`. Grammar is a separate action (section 6).

### 3.1 Context capture (content script)

`content/context.js` exports `captureSelectionContext(selection)`:

- find the closest block ancestor of `selection.anchorNode` among `p, li, td, th, dd, dt, blockquote, h1-h6, figcaption, article, section, div` (first match walking up);
- take the block's `innerText`, locate the selected string (first occurrence at or after the anchor offset; fall back to first occurrence), and slice up to 300 characters before and after, cut at word boundaries;
- if the selection spans blocks or is longer than 280 characters, return `undefined` (context is only useful for word, phrase and sentence modes);
- never include the URL.

The popup sends no context (the user typed the text).

## 4. Mode router and normalization

### 4.1 `lib/translation/mode.js`

```js
export function classifyMode(text) -> 'word' | 'phrase' | 'sentence' | 'text'
```

Rules, applied to the normalized text in order:

1. `word`: exactly one whitespace-delimited token, length <= 40, no sentence terminator.
2. `phrase`: <= 6 tokens, length <= 60, no terminal punctuation at the end (`. ! ? ؟ …`).
3. `sentence`: at most one terminator occurrence (a run of `.!?؟` followed by whitespace or end), length <= 280.
4. `text`: everything else.

Abbreviation dots inside tokens (`e.g.`, `U.S.`) do not count as terminators: a terminator is a run of `.!?؟` followed by whitespace or end of string, and a single dot preceded by a one- or two-letter token is ignored.

`batch` is never inferred. Page translation passes `mode: 'batch'` explicitly. The `/^\[1\]\s/` check in `lib/api.js` is deleted.

### 4.2 `lib/translation/normalize.js`

```js
export function normalizeInput(text) -> string
export function normalizePersian(text) -> string
```

`normalizeInput`:
- convert CRLF to LF; trim;
- remove soft hyphens (U+00AD) and zero-width characters (U+200B, U+200C, U+200D, U+FEFF) from Latin-script runs only (ZWNJ U+200C must be preserved in Persian);
- join a single line break with a space when the character before it is not sentence-terminal punctuation and the next line does not start a list item (`-`, `*`, digit followed by `.` or `)`); keep runs of two or more line breaks as a paragraph break;
- collapse runs of spaces and tabs to one space;
- drop tokens that are only a bracketed number (`[12]`) when they are the whole token.

`normalizePersian`:
- map Arabic Yeh (U+064A) and Arabic Kaf (U+0643) to Persian Yeh (U+06CC) and Keheh (U+06A9);
- map Arabic-Indic digits to Extended Arabic-Indic (Persian) digits only when the source used Persian digits; otherwise leave digits as returned;
- collapse double spaces, remove spaces before `،؛؟.!`;
- applied to every Persian-target result before display, caching, history and copy.

### 4.3 Direction

`lib/language-detect.js` keeps `detectLanguageCode` and `getTranslationInfo`. Changes:

- `getTranslationInfo(text, sourceLang)` also returns `detectedName` (English name of the detected language, from the existing `LANGUAGE_NAMES` table moved into `lib/translation/languages.js`) so the prompt can say "Source: Russian (detected)".
- New setting `translateOtherLanguages` (storage key `translate_other_languages`, default `true`) exposed through `getTranslateOtherLanguages()` / `setTranslateOtherLanguages()` in `lib/storage.js`. When `true`, a non-Persian, non-English script translates into Persian. When `false`, the existing `isSupportedLanguage` gate applies and `UNSUPPORTED` is raised as today.
- Finglish is not detected client-side. The prompt tells the model the detected source may be wrong; the result carries `detectedSource` (`en | fa | fa-latn | other`). When the model reports `fa-latn`, the service worker sets `direction` to `fa-en` and the `normalized` field carries the Persian-script form.

The settings page gains a toggle for `translateOtherLanguages` under General (label in both UI languages).

## 5. Prompts and schemas

### 5.1 `lib/translation/prompts.js`

`CORE_PROMPT` (stable, identical across modes so provider-side prompt caching applies):

```
You are ParsiPad, a professional translator between English and Persian
for Persian speakers who read and study English.

Translate meaning, not words. Write the way an educated native speaker
of the target language would write the same thing, in the same register
as the source: casual stays casual, formal stays formal, technical stays
technical.

Persian output: standard written Persian unless the source is casual.
Use Persian ی and ک, never Arabic ي and ك. Use the zero-width non-joiner
in prefixes and suffixes (می‌روم, کتاب‌ها, بزرگ‌تر). Use Persian
punctuation (، ؛ ؟). Keep numerals as written in the source.

English output: American spelling, natural word order, contractions only
when the source is casual.

Keep unchanged: proper nouns that have no standard Persian form, product
and brand names, code, URLs, email addresses, @handles, hashtags, units
and symbols. Preserve paragraph breaks, list structure and emphasis.

The source language was detected by script and may be wrong. If the text
is Persian written in Latin letters (Finglish), treat it as Persian:
translate it to English and return the Persian-script form in
"normalized". If the text is neither English nor Persian, translate it
into Persian.

Report a correction only when the source contains an error that changes
meaning or blocks translation (a real misspelling, a missing word).
Colloquial spelling and informal register are not errors.

Never add commentary, quotation marks or notes inside a translation.
```

Per-mode addenda appended to `CORE_PROMPT`:

- **word / phrase**: "The selection is a single word or short phrase. Give the best rendering for this context in "translation". Then list up to five distinct senses ordered by frequency, each with a part of speech, a target-language meaning and one short example pair. Synonyms and antonyms are in the same language as the headword. Pronunciation is IPA for English headwords and empty otherwise. "inContext" is one sentence explaining why the chosen sense fits the surrounding text; leave it empty when no context was given. Respond with JSON matching the schema and nothing else."
- **sentence**: "The selection is one sentence. Give the most natural rendering in "translation". Then give up to three alternatives in the target language, each labelled "more formal", "colloquial", "literal" or "other sense". "note" is one sentence about an idiom, cultural reference or ambiguity, or empty. Respond with JSON matching the schema and nothing else."
- **text**: "Translate the whole text. Output only the translation, preserving paragraphs. No JSON, no preface."
- **batch**: "Translate each numbered item. Keep the [1], [2] markers and the order. Output only the numbered translations."

`buildUserMessage({ text, mode, from, to, detectedName, context, glossary })`:

```
<task>
Mode: word. Source: English (detected, may be wrong). Target: Persian.
Translate only the text inside <selection>. Use <context> to choose the
right sense; do not translate the context.
</task>
<glossary>
term => preferred translation
</glossary>
<context before>...they will </context before>
<selection>charge</selection>
<context after> you a fee for late returns.</context after>
<page lang="en" title="Library policies"/>
```

Rules: `<glossary>` appears only when at least one glossary entry's source term occurs in the selection (case-insensitive, word-boundary match); `<context before>`, `<context after>` and `<page>` appear only when provided; for text and batch modes the message is `<task>` plus `<text>...</text>`. The glossary parameter is an array of `{ source, target, direction }`; the editor ships in sub-project 3.

### 5.2 `lib/translation/schemas.js`

Schemas are plain JSON Schema objects written once in the subset every provider accepts: `type`, `properties`, `required` (listing every property), `enum`, `items`, `description`. They contain no `maxItems` (Claude rejects it) and no `additionalProperties` (Gemini's `responseSchema` rejects it). Each provider adapts the canonical schema in a pure `toProviderSchema(schema)`:

- Claude and OpenAI: add `additionalProperties: false` to every object (both require it in strict mode).
- Gemini: add `propertyOrdering` equal to the `properties` key order on every object, so `translation` is emitted first.

Array caps (senses 5, synonyms 5, antonyms 3, alternatives 3, grammar 4) are stated in the prompt text and enforced in `coerceResult`. `translation` is always the first property so it streams first if a provider ever streams structured output.

**WORD_SCHEMA** (word and phrase):

```js
{
  translation: string,
  detectedSource: 'en' | 'fa' | 'fa-latn' | 'other',
  normalized: string,          // Persian-script form for Finglish, else ''
  pronunciation: string,       // IPA with slashes for English headwords, else ''
  pos: string,                 // primary part of speech, '' for phrases
  register: 'formal' | 'neutral' | 'informal' | 'slang' | 'technical',
  inContext: string,           // '' when no context
  senses: [{ pos: string, meaning: string, example: { src: string, tgt: string } }],  // capped at 5 in coerceResult
  synonyms: [string],          // capped at 5, same language as headword
  antonyms: [string],          // capped at 3
  correction: string           // corrected source, '' when none
}
```

**SENTENCE_SCHEMA**:

```js
{
  translation: string,
  detectedSource: 'en' | 'fa' | 'fa-latn' | 'other',
  normalized: string,
  register: 'formal' | 'neutral' | 'informal' | 'slang' | 'technical',
  alternatives: [{ text: string, label: 'more formal' | 'colloquial' | 'literal' | 'other sense' }],  // capped at 3
  note: string,
  correction: string
}
```

**GRAMMAR_POINTS_SCHEMA**: `{ grammar: [{ point: string, explanation: string }] }` (capped at 4).

`coerceResult(mode, obj)` returns a normalized result object: missing strings become `''`, arrays are capped at the limits above, unknown enum values fall back to `'neutral'` / `'other sense'`, `senses` entries without `meaning` are dropped, and `translation` is required (throws `PARSE_FAILED` when absent or empty).

### 5.3 Result contract (what the UI receives)

```js
{
  translation: string,
  mode: 'word' | 'phrase' | 'sentence' | 'text' | 'batch',
  direction: 'en-fa' | 'fa-en' | 'xx-fa',   // xx is the detected code for other languages
  displayDirection: string,                // existing display string
  detectedSource: string,
  sourceText: string,                       // normalized input actually translated
  normalized: string,
  pronunciation: string, pos: string, register: string, inContext: string,
  senses: [], synonyms: [], antonyms: [],   // word and phrase
  alternatives: [], note: string,           // sentence
  correction: string,
  cached: boolean,
  inputTokens: number, outputTokens: number
}
```

Text and batch results fill `translation` and the common fields only.

## 6. Grammar

- `ACTIONS.EXPLAIN_GRAMMAR` with `{ source, translation, direction }` replaces `TRANSLATE { withGrammar: true }`.
- `lib/api.js` exports `explainGrammar(source, translation, direction)` using the rewritten `GRAMMAR_SYSTEM_PROMPT` (explain-only, English, 2 to 4 points, quotes the English side) with `GRAMMAR_POINTS_SCHEMA`, temperature 0.3, max tokens 800.
- Cached in the translation cache under key `provider | grammar | hash(source + translation)`, TTL as for translations.
- `getGrammarLesson` (full lesson page) is unchanged.
- The floating box affordance (`appendInlineGrammarAffordance`) and the popup grammar checkbox call `EXPLAIN_GRAMMAR` and keep the existing translation on screen. The checkbox itself is removed in sub-project 2.

## 7. Providers

### 7.1 Base interface (`lib/providers/base-provider.js`)

```js
complete({ systemPrompt, userPrompt, maxTokens, temperature, responseSchema, apiKey, signal, timeoutMs })
  -> { text, inputTokens, outputTokens, truncated }

stream({ systemPrompt, userPrompt, maxTokens, temperature, apiKey, signal, onDelta, idleTimeoutMs })
  -> { text, inputTokens, outputTokens, truncated }
```

`responseSchema` is a JSON Schema or `null`. When set, the provider enables its native structured output mode. `truncated` is `true` when the provider reports that the output hit the token limit. `vision`, `validateApiKey`, `handleError` are unchanged; `getMaxTokens(double)` is removed in favor of explicit budgets.

### 7.2 Provider specifics

| | Claude | Gemini | OpenAI |
|---|---|---|---|
| Temperature | `temperature` | `generationConfig.temperature` | `temperature` |
| Structured output | `output_config: { format: { type: 'json_schema', schema } }`; no beta header; supported on `claude-haiku-4-5-20251001`; schema needs `additionalProperties: false` on every object and no `maxItems` | `generationConfig.responseMimeType: 'application/json'` plus `generationConfig.responseSchema` (OpenAPI subset: no `additionalProperties`; `propertyOrdering` controls key order) | `response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }`; strict mode needs every property in `required` and `additionalProperties: false`; supported on `gpt-4o-mini` |
| Streaming | `stream: true`, SSE events `content_block_delta` (`delta.text`), `message_delta` (`delta.stop_reason`, `usage.output_tokens`), `message_start` (`usage.input_tokens`) | `POST {model}:streamGenerateContent?alt=sse`, each event a `GenerateContentResponse`; text in `candidates[0].content.parts[].text`, `finishReason`, `usageMetadata` | `stream: true`, `stream_options: { include_usage: true }`, `choices[0].delta.content`, `finish_reason`, final `usage` chunk, terminated by `[DONE]` |
| Truncation | `stop_reason === 'max_tokens'` | `finishReason === 'MAX_TOKENS'` | `finish_reason === 'length'` |
| Thinking | not used (Haiku 4.5) | `thinkingConfig.thinkingBudget: 0` kept | n/a |

Each provider module exports a pure `parseSseEvent(eventText)` returning `{ delta?: string, inputTokens?: number, outputTokens?: number, truncated?: boolean, done?: boolean }` so stream parsing is tested without network. A shared `lib/providers/sse.js` splits a `ReadableStream` into SSE events (`data:` lines joined, blank-line delimited).

### 7.3 Sampling and budgets (`lib/translation/budget.js`)

- Temperature: translation 0.2, grammar points 0.3, polish 0.5 (passed by `polish()`; the polish prompt is unchanged).
- `computeMaxTokens(mode, text)`: word and phrase 700; sentence 900; text `min(4096, 400 + 2 * text.length)`; batch `min(4096, 400 + 2 * text.length)`.
- Non-stream timeout stays 30 s through `withRetry`. Streams use a 20 s idle timeout (reset on every chunk). Retries apply only before the first byte arrives.

### 7.4 Models

Model ids stay as configured (`claude-haiku-4-5-20251001`, `gemini-2.5-flash`, `gpt-4o-mini`). `PROVIDER_CONFIGS.maxTokens` remains as the fallback for callers that do not pass a budget (vision, polish variants).

## 8. Service worker flow

### 8.1 `handleTranslate(payload)`

1. `sourceText = normalizeInput(text)`; reject empty input with `EMPTY_INPUT`.
2. If `translateOtherLanguages` is `false`, run `isSupportedLanguage`; raise `UNSUPPORTED` when it fails.
3. `mode = payload.mode || classifyMode(sourceText)`.
4. `info = getTranslationInfo(sourceText, sourceLang)`; direction and names.
5. Cache key: `provider | mode | direction | sourceText | contextHash` where `contextHash` is SHA-256 of `before + '|' + after` for word and phrase modes and `''` otherwise. On a hit return the stored result with `cached: true`.
6. Call `translate(payload, info, mode)` in `lib/api.js`, which builds prompts, picks schema and budget, calls `provider.complete` (word, phrase, sentence) or `provider.stream` (text, batch).
7. If `detectedSource === 'fa-latn'`, set direction `fa-en`. If the target is Persian, `translation = normalizePersian(translation)`; also normalize `senses[].meaning`, `senses[].example.tgt`, `alternatives[].text` when Persian.
8. Cache, `addToHistory`, `logUsageEvent`, `updateUsageStats` as today.
9. Return the result contract.

### 8.2 Stream port

`chrome.runtime.onConnect` handles `port.name === 'translate-stream'` next to the existing `translate-document` listener:

- client sends `{ type: 'start', ...payload }`;
- service worker runs steps 1 to 5; on a cache hit it posts `{ type: 'done', result }` immediately;
- otherwise it posts `{ type: 'delta', text }` for every chunk and `{ type: 'done', result }` at the end (result includes the full normalized translation), or `{ type: 'error', code, message }`;
- `port.onDisconnect` aborts the in-flight request through an `AbortController`;
- only text and batch modes stream; if a client opens the port for a word or sentence, the service worker completes non-streamed and posts a single `done`.

### 8.3 Adapters (keep the app working)

- `content/main.js` `translateAndShow` sends `context` from `captureSelectionContext`; `showTranslation` maps `correction` to the existing "Did you mean" hint, `alternatives[].text` or `senses[].meaning` to the existing alternatives list (target language, direction per item), `note` or `inContext` to the nuance slot; the grammar affordance calls `EXPLAIN_GRAMMAR`. Text mode uses the stream port and appends deltas into the existing translation element.
- `popup/popup.js` `handleTranslate` does the same for its result panel; the grammar checkbox calls `EXPLAIN_GRAMMAR` after the translation.
- Page translation (`handleTranslatePage`) sends `mode: 'batch'` and keeps parsing `[n]` markers.
- `handleDictionaryLookup` and `lib/dictionary.js` are untouched.

## 9. Errors

`lib/translation/errors.js` exports `class TranslationError extends Error { code }` and `ERROR_CODES`: `EMPTY_INPUT`, `UNSUPPORTED`, `TRUNCATED`, `PARSE_FAILED`, `NETWORK`, `TIMEOUT`, `INVALID_API_KEY`, `RATE_LIMITED`, `SERVER_ERROR`, `API_KEY_NOT_SET`, `UNKNOWN`. Provider `handleError` throws `TranslationError` with the matching code; `withRetry` timeouts map to `TIMEOUT`; `Failed to fetch` maps to `NETWORK`.

Messages live in `lib/i18n.js` under `errors.<code>` for `en` and `fa`; the service worker returns `{ error: { code, message } }` and the UI shows `message`. `TRUNCATED` reads "The translation was cut off. Select a shorter passage or translate in parts." `ERROR_MESSAGES` in `constants.js` stays as the English fallback.

## 10. Cache and history

- `TranslationCache.hashKey(parts[])` accepts an ordered array joined with `|`; `get` / `set` store the full result contract. Existing v2 entries stay valid for their TTL because the new key shape never collides with the old one (an extra `mode` segment), so no migration is needed; old entries simply expire.
- `addToHistory(entry)` takes `{ original, translation, direction, mode, result }`; `original` and `translation` are capped at 4,000 characters, `result` is stored as returned (senses, alternatives, note). Readers (`popup`, `history/`, `newtab/`) treat `mode` and `result` as optional so pre-3.0 entries still render. Duplicate detection compares the capped `original` case-insensitively as today.
- `MAX_HISTORY_SIZE` stays 50.

## 11. Settings and i18n

- New General toggle "Translate other languages into Persian" (`translateOtherLanguages`), default on.
- New i18n keys: `errors.*` (section 9), `translateOtherLanguages`, `translateOtherLanguagesHint`. Both `en` and `fa`.
- `ACTIONS.EXPLAIN_GRAMMAR` added; `DICTIONARY_LOOKUP` kept until sub-project 2.

## 12. Tests

All in `tests/`, Vitest, node environment, no network.

| Module | Cases |
|---|---|
| `mode.test.js` | word, phrase, sentence, text boundaries; abbreviations; Persian terminators; whitespace-only |
| `normalize.test.js` | PDF line joins, paragraph preservation, list items kept, soft hyphen and ZW removal in Latin only, ZWNJ preserved in Persian, footnote tokens, Arabic Yeh/Kaf mapping, space before punctuation |
| `prompts.test.js` | user message composition per mode, context tags only when provided, glossary filtering by word boundary, page tag, batch message |
| `schemas.test.js` | coercion defaults, caps, enum fallbacks, missing translation throws `PARSE_FAILED`, canonical schemas contain no `maxItems` or `additionalProperties`, each `toProviderSchema` adds exactly its provider's keywords |
| `budget.test.js` | max-token table, temperature table |
| `sse.test.js` | event splitting across chunk boundaries, multi-line data, `[DONE]` |
| `claude-provider.test.js`, `gemini-provider.test.js`, `openai-provider.test.js` | request body contains temperature, schema and stream flags in the right place; `truncated` detection; `parseSseEvent` on recorded events; error mapping to `TranslationError` codes |
| `cache.test.js` (extended) | key composition with mode and context hash; old key shape does not collide |
| `history.test.js` | entry shape, 4,000-char cap, optional fields for legacy entries |
| `errors.test.js` | code to message mapping in both languages |

`chrome.storage` is stubbed with an in-memory object as the existing `cache.test.js` does.

Live verification (after the unit suite passes, through Chrome automation with the user's keys): a fixed probe set on a test page covering "charge" inside two different sentences, "run the migration", "as a matter of fact", a Persian colloquial sentence, a Finglish line, a 700-word passage (streaming and no truncation), a Russian sentence with the gate on and off, and a selection starting with "[1]". Results are compared against the expected shapes and spot-checked for Persian orthography.

## 13. Out of scope for this sub-project

Card redesign, selection bubble, direction pill UI, dictionary removal, popup restructuring, Listen, Sentence expansion, accessibility fixes (sub-project 2); side panel, glossary editor, tap-to-look-up, formal and casual rewrites, page-translation progress UI (sub-project 3). The core exposes the hooks they need: `context`, `mode` override, `sourceLang` override, `glossary` parameter, stream port, `EXPLAIN_GRAMMAR`.
