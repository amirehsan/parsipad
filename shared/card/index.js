import { renderWordCard } from './word-card.js';
import { renderSentenceCard } from './sentence-card.js';
import { renderTextCard } from './text-card.js';

export { CARD_STYLES, injectCardStyles } from './styles.js';

/**
 * Turn a translation result into DOM.
 *
 * The card knows nothing about Chrome, storage or the network. Hosts pass
 * their document and a set of callbacks; an omitted callback omits its
 * control, which is how a surface with no page selection drops the
 * Sentence action without the card knowing hosts exist.
 *
 * @param {object} result - the result contract from the service worker
 * @param {object} options - lang, doc, sensesExpanded, provider and callbacks
 * @returns {HTMLElement}
 */
export function renderCard(result, options) {
  switch (result?.mode) {
    case 'word':
    case 'phrase':
      return renderWordCard(result, options);
    case 'sentence':
      return renderSentenceCard(result, options);
    default:
      return renderTextCard(result, options);
  }
}
