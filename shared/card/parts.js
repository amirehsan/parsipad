import { cardLabel } from './labels.js';
import { getTextDirection } from '../../lib/language-detect.js';

/**
 * The building blocks the card shapes (word, sentence, text) are assembled
 * from. Every builder takes an explicit `doc` so it can render into a
 * shadow root, a popup document, or a side panel without knowing which.
 * A builder whose content would be empty returns null instead of an empty
 * element, so callers can append with a falsy guard.
 */

/**
 * Set dir and, for right to left text, lang="fa" on an element, both
 * derived from the same source text. Every node the card marks rtl must
 * also carry lang="fa" so a screen reader picks a Persian voice.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function applyTextDirection(el, text) {
  const dir = getTextDirection(text);
  el.setAttribute('dir', dir);
  if (dir === 'rtl') el.setAttribute('lang', 'fa');
}

/**
 * The direction pill's text, for example 'en-fa' becomes 'EN to FA'
 * rendered with an arrow glyph between the two codes.
 * @param {string} direction - '<from>-<to>'
 * @returns {string}
 */
export function directionText(direction) {
  const [from, to] = String(direction).split('-');
  return `${(from || '').toUpperCase()} → ${(to || '').toUpperCase()}`;
}

/**
 * The pill showing the resolved translation direction, with an optional
 * swap control.
 * @param {Object} params
 * @param {string} params.direction - '<from>-<to>'
 * @param {Function} [params.onSwap] - called with the language code that
 *   should become the new source, when the swap control is activated
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
export function directionPill({ direction, onSwap, lang, doc }) {
  const el = doc.createElement('div');
  el.className = 'pp-card-pill';

  const text = doc.createElement('span');
  text.className = 'pp-card-pill-text';
  text.textContent = directionText(direction);
  el.appendChild(text);

  if (onSwap) {
    const [, to] = String(direction).split('-');
    const swap = doc.createElement('button');
    swap.type = 'button';
    swap.className = 'pp-card-pill-swap';
    swap.setAttribute('aria-label', cardLabel('cardSwap', lang));
    swap.textContent = '⇄';
    swap.addEventListener('click', () => onSwap(to));
    el.appendChild(swap);
  }

  return el;
}

/**
 * The source text line: the text itself, plus optional pronunciation and
 * part of speech, plus an optional expand control for long text.
 * @param {Object} params
 * @param {string} params.text
 * @param {string} [params.pronunciation]
 * @param {string} [params.pos]
 * @param {Function} [params.onExpand]
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
export function sourceLine({ text, pronunciation, pos, onExpand, lang, doc }) {
  const el = doc.createElement('div');
  el.className = 'pp-card-source';
  applyTextDirection(el, text);

  const textEl = doc.createElement('span');
  textEl.className = 'pp-card-source-text';
  textEl.textContent = text;
  el.appendChild(textEl);

  if (pronunciation) {
    const ipa = doc.createElement('span');
    ipa.className = 'pp-card-source-ipa';
    ipa.textContent = pronunciation;
    el.appendChild(ipa);
  }

  if (pos) {
    const posEl = doc.createElement('span');
    posEl.className = 'pp-card-source-pos';
    posEl.textContent = pos;
    el.appendChild(posEl);
  }

  if (onExpand) {
    const expand = doc.createElement('button');
    expand.type = 'button';
    expand.className = 'pp-card-source-expand';
    expand.textContent = cardLabel('cardExpandSource', lang);
    expand.setAttribute('aria-label', cardLabel('cardExpandSource', lang));
    expand.addEventListener('click', () => onExpand());
    el.appendChild(expand);
  }

  return el;
}

/**
 * The translation line: the resolved answer, the visual anchor of the
 * card. Every card mode (word, sentence, text) renders one, so it lives
 * here rather than being rebuilt per mode.
 * @param {Object} params
 * @param {string} params.text
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
export function translationLine({ text, doc }) {
  const el = doc.createElement('div');
  el.className = 'pp-card-translation';
  applyTextDirection(el, text);
  el.textContent = text;
  return el;
}

/**
 * The auto-correction hint: what the user selected, and what the model
 * treated it as after fixing a real spelling error. Every mode that can
 * receive a correction (word, sentence) renders the same line, so it
 * lives here rather than being rebuilt per mode.
 * @param {Object} params
 * @param {string} params.original
 * @param {string} params.corrected
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
export function correctionLine({ original, corrected, lang, doc }) {
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
 * A short note, a lead word followed by a colon and the note text.
 * @param {Object} params
 * @param {string} params.lead
 * @param {string} params.text
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
export function note({ lead, text, lang: _lang, doc }) {
  const el = doc.createElement('div');
  el.className = 'pp-card-note';
  applyTextDirection(el, text);

  const leadEl = doc.createElement('span');
  leadEl.className = 'pp-card-note-lead';
  leadEl.textContent = `${lead}: `;
  el.appendChild(leadEl);

  el.appendChild(doc.createTextNode(text));

  return el;
}

// Incremented on every disclosure() call so the content id is unique even
// when two disclosures render into the same document (a live result next
// to a restored history entry, for instance) and neither caller happens
// to pass a distinct idSuffix. Uniqueness lives here, in the one place
// that owns the id, rather than being a rule every caller must remember.
let disclosureCount = 0;

/**
 * A disclosure: a button wired to aria-expanded/aria-controls, and the
 * content container it reveals. The caret span lets the stylesheet rotate
 * it on expansion.
 * @param {Object} params
 * @param {string} params.label
 * @param {boolean} params.expanded
 * @param {Function} [params.onToggle] - called with the next expanded state
 * @param {HTMLElement} params.content
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @param {string} [params.idSuffix] - optional, for a readable id; never
 *   the sole source of uniqueness, since a caller can omit or repeat it
 * @returns {HTMLElement}
 */
export function disclosure({ label, expanded, onToggle, content, lang: _lang, doc, idSuffix }) {
  disclosureCount += 1;
  const suffix = idSuffix ? `${idSuffix}-${disclosureCount}` : String(disclosureCount);
  const contentId = `pp-card-disclosure-${suffix}`;

  const el = doc.createElement('div');
  el.className = 'pp-card-disclosure-wrap';

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'pp-card-disclosure';
  btn.setAttribute('aria-expanded', String(!!expanded));
  btn.setAttribute('aria-controls', contentId);

  const caret = doc.createElement('span');
  caret.className = 'pp-card-disclosure-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.textContent = '▸';
  btn.appendChild(caret);

  const labelEl = doc.createElement('span');
  labelEl.className = 'pp-card-disclosure-label';
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  content.id = contentId;
  content.hidden = !expanded;

  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(next));
    content.hidden = !next;
    if (onToggle) onToggle(next);
  });

  el.appendChild(btn);
  el.appendChild(content);

  return el;
}

/**
 * A labelled list of words, for synonyms, antonyms and similar sets.
 * Returns null when there are no words to show.
 * @param {Object} params
 * @param {string} params.label
 * @param {string[]} params.words
 * @param {Document} params.doc
 * @returns {HTMLElement|null}
 */
export function wordList({ label, words, doc }) {
  if (!words || words.length === 0) return null;

  const el = doc.createElement('div');
  el.className = 'pp-card-wordlist';

  const labelEl = doc.createElement('span');
  labelEl.className = 'pp-card-wordlist-label';
  labelEl.textContent = `${label}: `;
  el.appendChild(labelEl);

  el.appendChild(doc.createTextNode(words.join(', ')));

  return el;
}

/**
 * The notice shown when a translation was cut off.
 * @param {Object} params
 * @param {string} params.text
 * @param {Document} params.doc
 * @returns {HTMLElement}
 */
export function truncationNotice({ text, doc }) {
  const el = doc.createElement('div');
  el.className = 'pp-card-truncated';
  el.setAttribute('role', 'status');
  applyTextDirection(el, text);
  el.textContent = text;
  return el;
}

/**
 * The small button naming which provider produced the result and opening
 * its settings. Returns null when there is no provider to name.
 * @param {Object} params
 * @param {string} params.provider
 * @param {Function} [params.onOpenSettings]
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @returns {HTMLElement|null}
 */
export function providerButton({ provider, onOpenSettings, lang, doc }) {
  if (!provider) return null;

  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'pp-card-provider';
  el.textContent = provider;
  el.setAttribute('aria-label', cardLabel('cardProviderHint', lang, { provider }));
  el.addEventListener('click', () => {
    if (onOpenSettings) onOpenSettings();
  });

  return el;
}

/**
 * The row of card actions (copy, listen, save, and so on). Each entry
 * without a handler is skipped, so a host can omit a control simply by
 * passing a null callback. Returns null when nothing is actionable.
 * @param {Object} params
 * @param {Array<{key: string, onActivate: Function|null}>} params.actions
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @returns {HTMLElement|null}
 */
export function actionsRow({ actions, lang, doc }) {
  const active = (actions || []).filter(action => action && action.onActivate);
  if (active.length === 0) return null;

  const el = doc.createElement('div');
  el.className = 'pp-card-actions';

  active.forEach(({ key, onActivate }) => {
    const label = cardLabel(key, lang);
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-card-action';
    btn.setAttribute('aria-label', label);
    btn.textContent = label;
    btn.addEventListener('click', () => onActivate());
    el.appendChild(btn);
  });

  return el;
}

/**
 * The footer: the actions row at one end, the provider button at the
 * other. Either side is omitted when empty, and so is the footer itself.
 * Every card mode composes its footer the same way, so it lives here
 * rather than being rebuilt per mode.
 * @param {Object} params
 * @param {Array<{key: string, onActivate: Function|null}>} params.actions
 * @param {string} [params.provider]
 * @param {Function} [params.onOpenSettings]
 * @param {string} params.lang - interface language
 * @param {Document} params.doc
 * @returns {HTMLElement|null}
 */
export function footer({ actions, provider, onOpenSettings, lang, doc }) {
  const actionsEl = actionsRow({ actions, lang, doc });
  const providerEl = providerButton({ provider, onOpenSettings, lang, doc });
  if (!actionsEl && !providerEl) return null;

  const el = doc.createElement('div');
  el.className = 'pp-card-footer';
  if (actionsEl) el.appendChild(actionsEl);
  if (providerEl) el.appendChild(providerEl);
  return el;
}
