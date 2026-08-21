import { sourceLine, translationLine, note, disclosure, correctionLine, footer, applyTextDirection } from './parts.js';
import { cardLabel } from './labels.js';
import { getTextDirection } from '../../lib/language-detect.js';

// Past this length the source line clamps to two lines and offers an
// expand control, so a long sentence does not push the translation, the
// card's visual anchor, out of view.
const SOURCE_CLAMP_LENGTH = 160;

/**
 * One alternative: its register label above its text, the text carrying
 * its own direction. Alternatives are different ways to say the same
 * thing, unlike a word card's senses, which are different meanings, so
 * this list item shape is specific to the sentence card.
 * @param {Object} alternative
 * @param {string} alternative.text
 * @param {string} alternative.label
 * @param {Document} doc
 * @returns {HTMLElement}
 */
function alternativeItem(alternative, doc) {
  const li = doc.createElement('li');

  const labelEl = doc.createElement('span');
  labelEl.className = 'pp-card-alternative-label';
  labelEl.textContent = alternative.label || '';
  li.appendChild(labelEl);

  const textEl = doc.createElement('span');
  textEl.className = 'pp-card-alternative-text';
  const text = alternative.text || '';
  applyTextDirection(textEl, text);
  textEl.textContent = text;
  li.appendChild(textEl);

  return li;
}

/**
 * The disclosure content: every alternative, in order.
 * @param {Array<Object>} alternatives
 * @param {Document} doc
 * @returns {HTMLElement}
 */
function alternativesList(alternatives, doc) {
  const list = doc.createElement('ul');
  list.className = 'pp-card-alternatives';
  alternatives.forEach(alternative => list.appendChild(alternativeItem(alternative, doc)));
  return list;
}

/**
 * The source line, with an expand control wired up when the sentence
 * exceeds the clamp length. The control removes the clamp on activation;
 * there is no collapse back, matching the single "Show full text" label.
 * @param {Object} params
 * @param {string} params.sourceText
 * @param {string} params.lang
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
function clampedSourceLine({ sourceText, lang, doc }) {
  const needsClamp = sourceText.length > SOURCE_CLAMP_LENGTH;
  // A plain holder, not the element itself, because the expand callback
  // has to close over the element before sourceLine has returned it.
  const holder = {};
  const onExpand = needsClamp ? () => {
    holder.el.classList.remove('pp-card-source-clamped');
    const expandBtn = holder.el.querySelector('.pp-card-source-expand');
    if (expandBtn) expandBtn.hidden = true;
  } : undefined;

  holder.el = sourceLine({ text: sourceText, onExpand, lang, doc });
  if (needsClamp) holder.el.classList.add('pp-card-source-clamped');
  return holder.el;
}

/**
 * Render a sentence translation result: the source sentence, the
 * translation, a note explaining a register or idiom choice, and
 * alternative phrasings collapsed behind a disclosure.
 * @param {Object} result - the result contract for mode 'sentence'
 * @param {Object} options - lang, doc, sensesExpanded, onToggleSenses and
 *   the action callbacks (onListen, onCopy, onSave, onExplainGrammar,
 *   onOpenSettings, provider). onTranslateSentence is accepted but never
 *   used, since this card already is a sentence translation.
 * @returns {HTMLElement}
 */
export function renderSentenceCard(result, options) {
  const {
    translation = '',
    direction = '',
    sourceText = '',
    alternatives = [],
    note: noteText = '',
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
    onExplainGrammar,
    provider,
    onOpenSettings
  } = options || {};

  const el = doc.createElement('div');
  el.className = 'pp-card-root';

  if (correction) {
    el.appendChild(correctionLine({ original: sourceText, corrected: correction, lang, doc }));
  }

  el.appendChild(clampedSourceLine({ sourceText, lang, doc }));
  el.appendChild(translationLine({ text: translation, doc }));

  if (noteText) {
    el.appendChild(note({ lead: cardLabel('cardNote', lang), text: noteText, lang, doc }));
  }

  if (alternatives.length > 0) {
    const content = alternativesList(alternatives, doc);
    el.appendChild(disclosure({
      label: `${cardLabel('cardAlso', lang)} (${alternatives.length})`,
      expanded: sensesExpanded,
      onToggle: onToggleSenses,
      content,
      lang,
      doc,
      idSuffix: 'sentence-alternatives'
    }));
  }

  const textToSpeak = direction.startsWith('en') ? sourceText : translation;
  const canListen = Boolean(onListen) && getTextDirection(textToSpeak) === 'ltr';

  const footerEl = footer({
    actions: [
      { key: 'cardListen', onActivate: canListen ? () => onListen(textToSpeak) : null },
      { key: 'cardCopy', onActivate: onCopy ? () => onCopy(translation) : null },
      { key: 'cardSave', onActivate: onSave ? () => onSave(result) : null },
      { key: 'cardExplain', onActivate: onExplainGrammar ? () => onExplainGrammar() : null }
    ],
    provider,
    onOpenSettings,
    lang,
    doc
  });
  if (footerEl) el.appendChild(footerEl);

  return el;
}
