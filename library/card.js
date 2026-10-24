/**
 * One Library entry as a card. Built with createElement and textContent only:
 * entries hold text the user typed and text a model returned, so none of it is
 * ever parsed as markup. The page wires the actions by delegating on
 * data-action, so the card carries no handlers of its own.
 */
import { t } from '../lib/i18n.js';
import { formatRelativeTime, formatDate } from '../lib/format.js';
import { directionLabel } from '../lib/direction-label.js';
import { getTextDirection } from '../lib/language-detect.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const KIND_LABEL_KEYS = {
  translation: 'libraryKindTranslation',
  dictionary: 'libraryKindDictionary',
  polish: 'libraryKindPolish',
  grammar: 'libraryKindLesson'
};

const VARIANTS = ['professional', 'conversational', 'concise'];

const ICONS = {
  favorite: [['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]],
  copy: [
    ['rect', { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' }],
    ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]
  ],
  'open-in-panel': [
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2' }],
    ['line', { x1: '15', y1: '3', x2: '15', y2: '21' }]
  ],
  delete: [
    ['polyline', { points: '3 6 5 6 21 6' }],
    ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }],
    ['path', { d: 'M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }]
  ]
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[name]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
    svg.appendChild(shape);
  }
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A real button with an icon and an accessible name.
 * @param {string} action - The data-action the page delegates on
 * @param {string} label - Accessible name, also shown as the tooltip
 */
function actionButton(action, label, { title = label } = {}) {
  const button = el('button', `lib-action lib-action-${action}`);
  button.type = 'button';
  button.setAttribute('data-action', action);
  button.setAttribute('aria-label', label);
  button.title = title;
  button.appendChild(icon(action));
  return button;
}

/**
 * Mark a node with the direction and language of the text it holds. Persian
 * runs are right to left; text with no letters in it (digits, punctuation) or
 * no text at all follows its context.
 */
function setTextDirection(node, text) {
  if (!/\p{L}/u.test(text)) {
    node.setAttribute('dir', 'auto');
    return;
  }
  const dir = getTextDirection(text);
  node.setAttribute('dir', dir);
  node.setAttribute('lang', dir === 'rtl' ? 'fa' : 'en');
}

/** One side of the pair: a block that carries the direction around a .lib-text. */
function textBlock(className, text) {
  const block = el('div', className);
  setTextDirection(block, text);
  block.appendChild(el('p', 'lib-text', text));
  return block;
}

function metaRow(entry, lang, now) {
  const meta = el('div', 'lib-meta');
  meta.appendChild(el('span', `lib-badge lib-badge-${entry.kind}`, t(KIND_LABEL_KEYS[entry.kind] || KIND_LABEL_KEYS.translation, lang)));

  const label = directionLabel(entry.direction);
  if (label) {
    const direction = el('bdi', 'lib-direction', label);
    direction.setAttribute('dir', 'ltr');
    meta.appendChild(direction);
  }

  // A timestamp of 0 means "unknown", which would otherwise read as 1970.
  if (entry.timestamp > 0) {
    const time = el('time', 'lib-time', formatRelativeTime(entry.timestamp, lang, now));
    time.setAttribute('datetime', new Date(entry.timestamp).toISOString());
    time.title = formatDate(entry.timestamp, lang);
    meta.appendChild(time);
  }
  return meta;
}

function variantBlock(name, text, lang) {
  const block = el('div', 'lib-variant');
  block.setAttribute('data-variant', name);
  const head = el('div', 'lib-variant-head');
  head.appendChild(el('span', 'lib-variant-label', t(name, lang)));
  const copy = actionButton('copy', `${t('libraryCopy', lang)}: ${t(name, lang)}`);
  copy.setAttribute('data-variant', name);
  head.appendChild(copy);
  block.appendChild(head);
  const body = el('p', 'lib-text', text);
  setTextDirection(body, text);
  block.appendChild(body);
  return block;
}

function resultSide(entry, lang) {
  if (!entry.variants) return textBlock('lib-result', entry.result);
  const side = el('div', 'lib-result lib-variants');
  for (const name of VARIANTS) side.appendChild(variantBlock(name, entry.variants[name] || '', lang));
  return side;
}

function actionsRow(entry, lang, favorite) {
  const actions = el('div', 'lib-actions');

  if (entry.kind === 'translation' || entry.kind === 'dictionary') {
    const button = actionButton('favorite', t('libraryFavorite', lang), {
      title: favorite ? t('libraryUnfavorite', lang) : t('libraryFavorite', lang)
    });
    button.setAttribute('aria-pressed', favorite ? 'true' : 'false');
    actions.appendChild(button);
  }

  // A polish entry copies per variant, from the variant blocks.
  if (!entry.variants) actions.appendChild(actionButton('copy', t('libraryCopy', lang)));

  if (entry.kind === 'grammar') {
    const link = el('a', 'lib-action lib-action-link', t('libraryOpenLesson', lang));
    link.setAttribute('data-action', 'open-lesson');
    link.setAttribute('href', `../grammar/grammar.html?saved=${encodeURIComponent(entry.id)}`);
    actions.appendChild(link);
  } else {
    actions.appendChild(actionButton('open-in-panel', t('libraryOpenInPanel', lang)));
  }

  actions.appendChild(actionButton('delete', t('libraryDelete', lang)));
  return actions;
}

/**
 * @param {import('../lib/library-model.js').LibraryEntry} entry
 * @param {{ lang: string, favorite: boolean, now?: number }} options
 * @returns {HTMLElement}
 */
export function renderLibraryCard(entry, { lang, favorite, now = Date.now() }) {
  const card = el('article', `lib-card lib-card-${entry.kind}`);
  card.setAttribute('data-key', entry.key);

  card.appendChild(metaRow(entry, lang, now));

  if (entry.kind === 'grammar' && entry.lesson?.title) {
    card.appendChild(el('h3', 'lib-lesson-title', entry.lesson.title));
  }

  const pair = el('div', 'lib-pair');
  pair.appendChild(textBlock('lib-original', entry.original));
  pair.appendChild(resultSide(entry, lang));
  card.appendChild(pair);

  card.appendChild(actionsRow(entry, lang, favorite));
  return card;
}
