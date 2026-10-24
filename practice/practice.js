/**
 * The Practice page: a short session of flashcards dealt from favorites.
 *
 * A card shows the saved translation; flipping it reveals the original. The
 * card is one button holding both faces, so Space and Enter flip it when it
 * has focus, and aria-pressed says which face is up. From the page (nothing
 * focused), Space and Enter flip it too, the arrow keys move between cards
 * and c copies the face that is showing, unless focus is in a form control.
 * One role="status" region announces the counter, the revealed original (in
 * its own language) and copies; it shows itself only for copies.
 *
 * Opened from the side panel the URL carries ?surface=panel: the page then
 * fits the panel and offers a way back to it.
 */
import { getFavorites, getTheme, setTheme, getLanguage, getPracticeSessionSize } from '../lib/storage.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { applyThemeToRoot } from '../lib/theme.js';
import { formatNumber } from '../lib/format.js';
import { buildDeck } from '../lib/practice.js';
import { textSizeStep } from '../lib/text-size.js';

// How long a copy confirmation stays on screen.
const TOAST_MS = 3000;
// A status message is written this long after the region is emptied, so the
// same words twice in a row are still a change a screen reader announces.
const ANNOUNCE_DELAY_MS = 50;

// DOM Elements
const themeBtn = document.getElementById('theme-btn');
const backLink = document.getElementById('practice-back');
const deckView = document.getElementById('practice-deck');
const progressText = document.getElementById('practice-progress');
const cardButton = document.getElementById('practice-card');
const frontFace = document.getElementById('practice-face-front');
const backFace = document.getElementById('practice-face-back');
const frontText = document.getElementById('practice-front-text');
const backText = document.getElementById('practice-back-text');
const prevBtn = document.getElementById('practice-prev');
const nextBtn = document.getElementById('practice-next');
const copyBtn = document.getElementById('practice-copy');
const emptyView = document.getElementById('practice-empty');
const emptyLink = document.getElementById('practice-empty-link');
const statusRegion = document.getElementById('practice-status');

// State
let currentLang = 'en';
let deck = [];
let index = 0;
let flipped = false;
let statusTimer = null;
let statusTextTimer = null;

/**
 * Initialize the practice page
 */
async function init() {
  applySurface();
  currentLang = await getLanguage();
  applyTranslations(currentLang);
  markHintLanguage();
  applyThemeToRoot(await getTheme());
  deck = await loadDeck();
  setupEventListeners();
  // Nothing takes focus on load: the arrow keys and c work from the page,
  // and a screen reader starts at the heading and the counter.
  render();
}

/** Inside the side panel: fit it, offer the way back, and open the Library in a tab. */
function applySurface() {
  if (new URLSearchParams(location.search).get('surface') !== 'panel') return;
  document.body.dataset.surface = 'panel';
  backLink.hidden = false;
  emptyLink.target = '_blank';
  emptyLink.rel = 'noopener';
}

/**
 * The hints sit inside faces that carry the card's language; they are in the
 * interface's language, and say so.
 */
function markHintLanguage() {
  for (const hint of document.querySelectorAll('.practice-hint')) {
    hint.lang = currentLang;
    hint.dir = currentLang === 'fa' ? 'rtl' : 'ltr';
  }
}

/** A read that fails deals no cards rather than a partial deck. */
async function loadDeck() {
  try {
    const [favorites, size] = await Promise.all([getFavorites(), getPracticeSessionSize()]);
    return buildDeck(favorites, { size });
  } catch (error) {
    console.error('ParsiPad: could not read the favorites to practice', error);
    return [];
  }
}

async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  await setTheme(newTheme);
  applyThemeToRoot(newTheme);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  deckView.hidden = deck.length === 0;
  emptyView.hidden = deck.length > 0;
  if (!deck.length) return;

  const card = deck[index];
  progressText.textContent = progressLabel();
  fillFace(frontFace, frontText, card.front, card.frontLang);
  fillFace(backFace, backText, card.back, card.backLang);

  cardButton.setAttribute('aria-pressed', flipped ? 'true' : 'false');
  // Both faces sit in the button; only the one facing up is read out.
  frontFace.setAttribute('aria-hidden', flipped ? 'true' : 'false');
  backFace.setAttribute('aria-hidden', flipped ? 'false' : 'true');

  prevBtn.setAttribute('aria-disabled', index === 0 ? 'true' : 'false');
  nextBtn.setAttribute('aria-disabled', index === deck.length - 1 ? 'true' : 'false');
}

function fillFace(face, textNode, text, lang) {
  face.lang = lang;
  face.dir = lang === 'fa' ? 'rtl' : 'ltr';
  textNode.textContent = text;
  textNode.dataset.size = textSizeStep(text);
}

function progressLabel() {
  return t('practiceProgress', currentLang)
    .replace('{n}', formatNumber(index + 1, currentLang))
    .replace('{total}', formatNumber(deck.length, currentLang));
}

// ---------------------------------------------------------------------------
// Status region
// ---------------------------------------------------------------------------

/**
 * @param {string} message
 * @param {{ visible?: boolean, lang?: 'en'|'fa' }} [options] - Show the message
 *   on screen as well (otherwise only screen readers hear it), and the language
 *   of card text, so a Persian answer is spoken with a Persian voice
 */
function announce(message, { visible = false, lang = null } = {}) {
  clearTimeout(statusTimer);
  clearTimeout(statusTextTimer);
  statusRegion.textContent = '';
  statusTextTimer = setTimeout(() => {
    statusRegion.replaceChildren(lang ? inLanguage(message, lang) : message);
  }, ANNOUNCE_DELAY_MS);
  statusRegion.classList.toggle('practice-toast-open', visible);
  if (visible) {
    statusTimer = setTimeout(() => statusRegion.classList.remove('practice-toast-open'), TOAST_MS);
  }
}

function inLanguage(text, lang) {
  const span = document.createElement('span');
  span.lang = lang;
  span.dir = lang === 'fa' ? 'rtl' : 'ltr';
  span.textContent = text;
  return span;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Move by one card; a new card always starts face up. */
function move(step) {
  if (!deck.length) return;
  const next = Math.min(deck.length - 1, Math.max(0, index + step));
  if (next === index) return;
  index = next;
  flipped = false;
  render();
  announce(progressLabel());
}

function flip() {
  flipped = !flipped;
  render();
  if (flipped) announce(deck[index].back, { lang: deck[index].backLang });
}

async function copyShownFace() {
  if (!deck.length) return;
  const card = deck[index];
  try {
    await navigator.clipboard.writeText(flipped ? card.back : card.front);
    announce(t('libraryCopied', currentLang), { visible: true });
  } catch {
    announce(t('libraryCopyFailed', currentLang), { visible: true });
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const FORM_CONTROL = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// Space and Enter already press these, the card included, so the page leaves them be.
const ACTIVATES_ON_KEY = `button, a[href], ${FORM_CONTROL}`;

function isFormControl(node) {
  return Boolean(node?.closest?.(FORM_CONTROL));
}

function activatesOnKey(node) {
  return Boolean(node?.closest?.(ACTIVATES_ON_KEY));
}

/**
 * The c key, matched by where it sits as well as by what it types, so it
 * still copies on a Persian layout, where that key types ز.
 */
function isCopyKey(event) {
  return event.code === 'KeyC' || event.key === 'c' || event.key === 'C';
}

/**
 * Arrow keys move between cards (mirrored right to left, like the reading
 * order), Space and Enter flip the card and c copies. Shortcuts with a
 * modifier, such as Cmd+C, stay the browser's.
 */
function handleKeydown(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (isFormControl(event.target) || isFormControl(document.activeElement)) return;

  const rtl = document.documentElement.dir === 'rtl';
  const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
  if (step) {
    event.preventDefault();
    move(step);
  } else if (event.key === ' ' || event.key === 'Enter') {
    // A focused button or link acts on the key itself; flipping here too
    // would flip the card twice, or flip it when Next was meant.
    if (event.shiftKey || activatesOnKey(event.target) || !deck.length) return;
    event.preventDefault();
    flip();
  } else if (isCopyKey(event)) {
    copyShownFace();
  }
}

function setupEventListeners() {
  themeBtn.addEventListener('click', toggleTheme);
  cardButton.addEventListener('click', flip);
  prevBtn.addEventListener('click', () => move(-1));
  nextBtn.addEventListener('click', () => move(1));
  copyBtn.addEventListener('click', copyShownFace);
  document.addEventListener('keydown', handleKeydown);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init, { once: true });
