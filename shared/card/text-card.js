import { directionPill, detectionNote, translationLine, truncationNotice, footer } from './parts.js';
import { cardLabel } from './labels.js';

/**
 * Render a text (or batch) translation result: the translation only. No
 * source line, because the user selected the text and can still see it
 * on the page, and repeating it would spend the card's scarcest resource,
 * vertical space. The translation element is always present, even when
 * `result.translation` is empty, so a streaming host has a target to
 * write into before the first delta arrives.
 * @param {Object} result - the result contract for mode 'text' or 'batch'
 * @param {Object} options - lang, doc and the action callbacks (onCopy,
 *   onSave, onOpenSettings, provider). onTranslateSentence and
 *   onExplainGrammar are accepted but never used: this card never offers
 *   Sentence or Explain, even when handlers are supplied.
 * @returns {HTMLElement}
 */
export function renderTextCard(result, options) {
  const {
    translation = '',
    direction = '',
    detectedSource = '',
    truncated = false
  } = result || {};
  const {
    lang,
    doc,
    onCopy,
    onSave,
    isSaved = false,
    onSwapDirection,
    provider,
    onOpenSettings
  } = options || {};

  const el = doc.createElement('div');
  el.className = 'pp-card-root';

  const pill = directionPill({ direction, onSwap: onSwapDirection, lang, doc });
  if (pill) el.appendChild(pill);

  const detected = detectionNote({ detectedSource, direction, lang, doc });
  if (detected) el.appendChild(detected);
  el.appendChild(translationLine({ text: translation, doc }));

  if (truncated) {
    el.appendChild(truncationNotice({ text: cardLabel('errorTruncated', lang), doc }));
  }

  const footerEl = footer({
    actions: [
      { key: 'cardCopy', onActivate: onCopy ? () => onCopy(translation) : null },
      { key: 'cardSave', onActivate: onSave ? () => onSave(result) : null, pressed: Boolean(isSaved) }
    ],
    provider,
    onOpenSettings,
    lang,
    doc
  });
  if (footerEl) el.appendChild(footerEl);

  return el;
}
