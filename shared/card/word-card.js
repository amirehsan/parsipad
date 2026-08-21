import { sourceLine, note, disclosure, wordList, providerButton, actionsRow } from './parts.js';
import { cardLabel } from './labels.js';
import { getTextDirection } from '../../lib/language-detect.js';

/**
 * Set dir and, for right to left text, lang="fa" on an element, both
 * derived from the same source text. Mirrors the private helper in
 * parts.js: this module builds a few pieces (the translation line, the
 * correction line, each sense) that have no matching part in parts.js, so
 * it needs the same rule for pairing dir="rtl" with lang="fa".
 * @param {HTMLElement} el
 * @param {string} text
 */
function applyTextDirection(el, text) {
  const dir = getTextDirection(text);
  el.setAttribute('dir', dir);
  if (dir === 'rtl') el.setAttribute('lang', 'fa');
}

/**
 * The translation line: the resolved answer for this context, the visual
 * anchor of the card.
 * @param {string} text
 * @param {Document} doc
 * @returns {HTMLElement}
 */
function translationLine(text, doc) {
  const el = doc.createElement('div');
  el.className = 'pp-card-translation';
  applyTextDirection(el, text);
  el.textContent = text;
  return el;
}

/**
 * The auto-correction hint: what the user selected, and what the model
 * treated it as after fixing a real spelling error.
 * @param {Object} params
 * @param {string} params.original
 * @param {string} params.corrected
 * @param {string} params.lang
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
function correctionLine({ original, corrected, lang, doc }) {
  const el = doc.createElement('div');
  el.className = 'pp-card-correction';
  el.setAttribute('role', 'status');
  // Keep the line itself LTR so "<original> -> <corrected>" reads in a
  // stable order regardless of which side is Persian.
  el.setAttribute('dir', 'ltr');

  const label = doc.createElement('span');
  label.className = 'pp-card-correction-label';
  label.textContent = `${cardLabel('didYouMean', lang)} `;
  el.appendChild(label);

  const originalEl = doc.createElement('span');
  originalEl.className = 'pp-card-correction-original';
  applyTextDirection(originalEl, original);
  originalEl.textContent = original;
  el.appendChild(originalEl);

  el.appendChild(doc.createTextNode(' → '));

  const correctedEl = doc.createElement('strong');
  correctedEl.className = 'pp-card-correction-corrected';
  applyTextDirection(correctedEl, corrected);
  correctedEl.textContent = corrected;
  el.appendChild(correctedEl);

  return el;
}

/**
 * One example pair, source then target, each carrying its own direction.
 * @param {Object} example
 * @param {string} example.src
 * @param {string} example.tgt
 * @param {Document} doc
 * @returns {HTMLElement|null}
 */
function exampleLine(example, doc) {
  const src = (example && example.src) || '';
  const tgt = (example && example.tgt) || '';
  if (!src && !tgt) return null;

  const el = doc.createElement('div');
  el.className = 'pp-card-example';

  const srcEl = doc.createElement('span');
  applyTextDirection(srcEl, src);
  srcEl.textContent = src;
  el.appendChild(srcEl);

  el.appendChild(doc.createTextNode(' → '));

  const tgtEl = doc.createElement('span');
  applyTextDirection(tgtEl, tgt);
  tgtEl.textContent = tgt;
  el.appendChild(tgtEl);

  return el;
}

/**
 * One remaining sense: its part of speech, its meaning, and its example.
 * @param {Object} sense
 * @param {Document} doc
 * @returns {HTMLElement}
 */
function senseItem(sense, doc) {
  const li = doc.createElement('li');

  const head = doc.createElement('div');
  head.className = 'pp-card-sense-head';

  const posEl = doc.createElement('span');
  posEl.className = 'pp-card-sense-pos';
  posEl.textContent = sense.pos || '';
  head.appendChild(posEl);

  const meaningEl = doc.createElement('span');
  meaningEl.className = 'pp-card-sense-meaning';
  applyTextDirection(meaningEl, sense.meaning || '');
  meaningEl.textContent = sense.meaning || '';
  head.appendChild(meaningEl);

  li.appendChild(head);

  const example = exampleLine(sense.example, doc);
  if (example) li.appendChild(example);

  return li;
}

/**
 * The senses excluding the one already shown as the translation, matched
 * by comparing trimmed meaning against the trimmed translation. When
 * nothing matches, every sense is kept.
 * @param {Array<Object>} senses
 * @param {string} translation
 * @returns {Array<Object>}
 */
function otherSenses(senses, translation) {
  const shown = translation.trim();
  const rest = senses.filter(sense => (sense.meaning || '').trim() !== shown);
  return rest.length === senses.length ? senses : rest;
}

/**
 * The disclosure content: the remaining senses, then synonyms and
 * antonyms when present.
 * @param {Object} params
 * @returns {HTMLElement}
 */
function disclosureContent({ senses, synonyms, antonyms, lang, doc }) {
  const content = doc.createElement('div');

  const list = doc.createElement('ul');
  list.className = 'pp-card-senses';
  senses.forEach(sense => list.appendChild(senseItem(sense, doc)));
  content.appendChild(list);

  const synonymsEl = wordList({ label: cardLabel('cardSynonyms', lang), words: synonyms, doc });
  if (synonymsEl) content.appendChild(synonymsEl);

  const antonymsEl = wordList({ label: cardLabel('cardAntonyms', lang), words: antonyms, doc });
  if (antonymsEl) content.appendChild(antonymsEl);

  return content;
}

/**
 * The footer: the actions row at one end, the provider button at the
 * other. Either side is omitted when empty, and so is the footer itself.
 * @param {Object} params
 * @returns {HTMLElement|null}
 */
function footer({ actions, provider, onOpenSettings, lang, doc }) {
  const actionsEl = actionsRow({ actions, lang, doc });
  const providerEl = providerButton({ provider, onOpenSettings, lang, doc });
  if (!actionsEl && !providerEl) return null;

  const el = doc.createElement('div');
  el.className = 'pp-card-footer';
  if (actionsEl) el.appendChild(actionsEl);
  if (providerEl) el.appendChild(providerEl);
  return el;
}

/**
 * Render a word or phrase translation result: the contextual answer
 * first, the source word above it, the note explaining why this sense
 * fits, and the other meanings collapsed behind a disclosure.
 * @param {Object} result - the result contract for mode 'word' or 'phrase'
 * @param {Object} options - lang, doc, sensesExpanded, onToggleSenses and
 *   the action callbacks (onListen, onCopy, onSave, onTranslateSentence,
 *   onExplainGrammar, onOpenSettings, provider)
 * @returns {HTMLElement}
 */
export function renderWordCard(result, options) {
  const {
    translation = '',
    mode = 'word',
    direction = '',
    sourceText = '',
    pronunciation = '',
    pos = '',
    inContext = '',
    senses = [],
    synonyms = [],
    antonyms = [],
    correction = ''
  } = result || {};
  const {
    lang,
    doc,
    sensesExpanded = false,
    onToggleSenses,
    onListen,
    onCopy,
    onSave,
    onTranslateSentence,
    onExplainGrammar,
    provider,
    onOpenSettings
  } = options || {};

  const el = doc.createElement('div');
  el.className = 'pp-card';

  if (correction) {
    el.appendChild(correctionLine({ original: sourceText, corrected: correction, lang, doc }));
  }

  el.appendChild(sourceLine({ text: sourceText, pronunciation, pos, lang, doc }));
  el.appendChild(translationLine(translation, doc));

  if (inContext) {
    el.appendChild(note({ lead: cardLabel('cardHere', lang), text: inContext, lang, doc }));
  }

  const remaining = otherSenses(senses, translation);
  if (remaining.length > 0) {
    const content = disclosureContent({ senses: remaining, synonyms, antonyms, lang, doc });
    el.appendChild(disclosure({
      label: `${cardLabel('cardOtherMeanings', lang)} (${remaining.length})`,
      expanded: sensesExpanded,
      onToggle: onToggleSenses,
      content,
      lang,
      doc,
      idSuffix: 'word-senses'
    }));
  }

  const textToSpeak = direction.startsWith('en') ? sourceText : translation;
  const canListen = Boolean(onListen) && getTextDirection(textToSpeak) === 'ltr';
  const canExplain = mode !== 'word' && Boolean(onExplainGrammar);

  const footerEl = footer({
    actions: [
      { key: 'cardListen', onActivate: canListen ? () => onListen(textToSpeak) : null },
      { key: 'cardCopy', onActivate: onCopy ? () => onCopy(translation) : null },
      { key: 'cardSave', onActivate: onSave ? () => onSave(result) : null },
      { key: 'cardSentence', onActivate: onTranslateSentence ? () => onTranslateSentence() : null },
      { key: 'cardExplain', onActivate: canExplain ? () => onExplainGrammar() : null }
    ],
    provider,
    onOpenSettings,
    lang,
    doc
  });
  if (footerEl) el.appendChild(footerEl);

  return el;
}
