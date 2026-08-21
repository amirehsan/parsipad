import { sourceLine, translationLine, note, disclosure, wordList, correctionLine, footer, applyTextDirection } from './parts.js';
import { cardLabel } from './labels.js';
import { getTextDirection } from '../../lib/language-detect.js';

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
  el.className = 'pp-card-root';

  if (correction) {
    el.appendChild(correctionLine({ original: sourceText, corrected: correction, lang, doc }));
  }

  el.appendChild(sourceLine({ text: sourceText, pronunciation, pos, lang, doc }));
  el.appendChild(translationLine({ text: translation, doc }));

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
