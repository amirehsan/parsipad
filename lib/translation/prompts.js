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

const WORD_ADDENDUM = 'The selection is a single word or short phrase. Give the best rendering for this context in "translation". Then list up to five distinct senses ordered by frequency, each with a part of speech, a target-language meaning and one short example pair. Synonyms (up to five) and antonyms (up to three) are in the same language as the headword. Pronunciation is IPA between slashes for English headwords and empty otherwise. "inContext" is one sentence explaining why the chosen sense fits the surrounding text; leave it empty when no context was given. Respond with JSON matching the schema and nothing else.';

const SENTENCE_ADDENDUM = 'The selection is one sentence. Give the most natural rendering in "translation". Then give up to three alternatives in the target language, each labelled "more formal", "colloquial", "literal" or "other sense". "note" is one sentence about an idiom, cultural reference or ambiguity, or empty. Respond with JSON matching the schema and nothing else.';

const TEXT_ADDENDUM = 'Translate the whole text. Output only the translation, preserving paragraphs. No JSON, no preface, no notes.';

const BATCH_ADDENDUM = 'Translate each numbered item. Keep the [1], [2] markers and the order, one item per line. Output only the numbered translations.';

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

  lines.push('Translate only the text inside the selection below. Use <context> to choose the right sense; do not translate the context.', '</task>');
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
