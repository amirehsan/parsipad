/**
 * The Library page: translation, polish and dictionary history, favorites and
 * saved grammar lessons in one place. The page keeps its tab and filters in
 * the URL, renders cards from library/card.js, and wires their actions by
 * delegating on data-action.
 *
 * Deletes are written straight away and can be undone for a few seconds
 * (lib/undo-queue.js). Every delete and restore settles through the promise
 * the queue returns; when one fails the page reads storage again, so it never
 * shows a list that differs from what is stored.
 */
import {
  getHistory, clearHistory,
  getPolishHistory, clearPolishHistory,
  getDictionaryHistory, clearDictionaryHistory
} from '../lib/history.js';
import {
  getFavorites, addFavorite, removeFavorite, isFavorite,
  getTheme, setTheme, getLanguage
} from '../lib/storage.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { applyThemeToRoot } from '../lib/theme.js';
import {
  toHistoryEntries, toFavoriteEntries, filterEntries, groupEntries,
  parseLibraryQuery, buildLibraryQuery
} from '../lib/library-model.js';
import { debounce } from '../lib/debounce.js';
import { directionLabel } from '../lib/direction-label.js';
import { dayGroupLabel } from '../lib/format.js';
import { createUndoQueue } from '../lib/undo-queue.js';
import { removeLibraryEntry, restoreLibraryEntry } from '../lib/library-actions.js';
import { renderLibraryCard } from './card.js';
import { openSidebar } from '../lib/platform.js';

// How long Undo stays offered; the status message for a copy lasts as long.
const UNDO_WINDOW_MS = 5000;
// A status message is written this long after the region is emptied, so the
// same words twice in a row are still a change a screen reader announces.
const ANNOUNCE_DELAY_MS = 50;
const TABS = ['history', 'favorites', 'lessons'];

// DOM Elements
const themeBtn = document.getElementById('theme-btn');
const tabButtons = [...document.querySelectorAll('[role="tab"]')];
const tabPanel = document.getElementById('library-panel');
const searchInput = document.getElementById('library-search');
const typeGroup = document.getElementById('library-types');
const typeChips = [...typeGroup.querySelectorAll('[data-type]')];
const directionSelect = document.getElementById('library-direction');
const clearBtn = document.getElementById('library-clear');
const emptyState = document.getElementById('library-empty');
const list = document.getElementById('library-list');
const statusRegion = document.getElementById('library-status');
const statusText = document.getElementById('library-status-text');
const undoBtn = document.getElementById('library-undo');

// State
let state = parseLibraryQuery(location.search);
let currentLang = 'en';
let historyEntries = [];
let favoriteEntries = [];
// The window this tab is in, read once so opening the panel needs no await.
let windowId = null;
let statusTimer = null;
let statusTextTimer = null;
let undoKey = null;

const undoQueue = createUndoQueue({
  commit: removeLibraryEntry,
  restore: restoreLibraryEntry,
  delay: UNDO_WINDOW_MS
});

/**
 * Initialize the library page
 */
async function init() {
  cacheWindowId();
  currentLang = await getLanguage();
  applyTranslations(currentLang);
  applyThemeToRoot(await getTheme());
  searchInput.value = state.q;
  await loadEntries();
  setupEventListeners();
  render();
}

async function cacheWindowId() {
  try {
    windowId = (await chrome.windows.getCurrent()).id;
  } catch {
    // Opening the panel then fails and says so in the console
  }
}

/**
 * Read every list the Library shows. A read that fails leaves the page empty
 * rather than half drawn.
 */
async function loadEntries() {
  try {
    const [translations, polishes, dictionary, favorites] = await Promise.all([
      getHistory(), getPolishHistory(), getDictionaryHistory(), getFavorites()
    ]);
    historyEntries = toHistoryEntries({ translations, polishes, dictionary });
    favoriteEntries = toFavoriteEntries(favorites);
  } catch (error) {
    console.error('ParsiPad: could not read the library', error);
    historyEntries = [];
    favoriteEntries = [];
  }
}

async function reloadAndRender() {
  await loadEntries();
  render();
}

async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  await setTheme(newTheme);
  applyThemeToRoot(newTheme);
}

// ---------------------------------------------------------------------------
// State and URL
// ---------------------------------------------------------------------------

/** Everything on a tab, before the type, direction and search filters. */
function tabEntries() {
  return state.tab === 'history' ? historyEntries : filterEntries(favoriteEntries, { tab: state.tab });
}

/** Lessons have one kind, so the type chip does not apply there. */
function activeType() {
  return state.tab === 'lessons' ? 'all' : state.type;
}

function setState(changes) {
  state = { ...state, ...changes };
  history.replaceState(null, '', buildLibraryQuery(state) || location.pathname);
  render();
}

function applySearch() {
  setState({ q: searchInput.value.trim() });
}

const searchSoon = debounce(applySearch, 200);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  renderTabs();
  renderFilters();

  const all = tabEntries();
  const shown = filterEntries(all, { type: activeType(), dir: state.dir, q: state.q });
  clearBtn.hidden = filterEntries(all, { type: activeType() }).length === 0;

  list.replaceChildren();
  emptyState.hidden = shown.length > 0;
  if (!shown.length) {
    emptyState.textContent = t(all.length ? 'libraryNoMatches' : 'libraryEmpty', currentLang);
    return;
  }

  const now = Date.now();
  for (const { group, entries } of groupEntries(shown, now)) {
    const section = document.createElement('section');
    section.className = 'lib-group';
    const heading = document.createElement('h2');
    heading.className = 'lib-group-title';
    heading.id = `library-group-${group}`;
    heading.textContent = dayGroupLabel(group, currentLang);
    section.setAttribute('aria-labelledby', heading.id);
    section.appendChild(heading);
    for (const entry of entries) {
      section.appendChild(renderLibraryCard(entry, { lang: currentLang, favorite: isStarred(entry), now }));
    }
    list.appendChild(section);
  }
}

function renderTabs() {
  for (const tab of tabButtons) {
    const selected = tab.dataset.tab === state.tab;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
    if (selected) tabPanel.setAttribute('aria-labelledby', tab.id);
  }
}

function renderFilters() {
  typeGroup.hidden = state.tab === 'lessons';
  for (const chip of typeChips) {
    chip.setAttribute('aria-pressed', chip.dataset.type === state.type ? 'true' : 'false');
  }

  // All, then every direction this tab has, plus the one the URL asked for.
  const keys = new Set(tabEntries().map(entry => entry.direction).filter(Boolean));
  if (state.dir !== 'all') keys.add(state.dir);
  const options = [option('all', t('libraryDirectionAll', currentLang))];
  for (const key of [...keys].sort()) options.push(option(key, directionLabel(key)));
  directionSelect.replaceChildren(...options);
  directionSelect.value = state.dir;
}

function option(value, label) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}

/** A translation or lookup is starred when a favorite holds the same pair. */
function isStarred(entry) {
  return favoriteEntries.some(f => f.kind !== 'grammar' && f.original === entry.original && f.result === entry.result);
}

function findEntry(key) {
  return historyEntries.find(e => e.key === key) || favoriteEntries.find(e => e.key === key);
}

function renderedCards() {
  return [...list.querySelectorAll('.lib-card')];
}

function focusCardAction(key, action) {
  const card = renderedCards().find(c => c.getAttribute('data-key') === key);
  const target = card?.querySelector(`[data-action="${action}"]`) || card?.querySelector('[data-action]');
  if (target) target.focus();
  else searchInput.focus();
}

// ---------------------------------------------------------------------------
// Status region: one message at a time, Undo only for the latest delete
// ---------------------------------------------------------------------------

function announce(message, { undo = null } = {}) {
  clearTimeout(statusTimer);
  clearTimeout(statusTextTimer);
  undoKey = undo;
  statusText.textContent = '';
  statusTextTimer = setTimeout(() => {
    statusText.textContent = message;
  }, ANNOUNCE_DELAY_MS);
  undoBtn.hidden = !undo;
  statusRegion.classList.add('lib-toast-open');
  statusTimer = setTimeout(closeStatus, UNDO_WINDOW_MS);
}

function closeStatus() {
  clearTimeout(statusTimer);
  clearTimeout(statusTextTimer);
  undoKey = null;
  statusText.textContent = '';
  undoBtn.hidden = true;
  statusRegion.classList.remove('lib-toast-open');
}

async function reportWriteFailure() {
  // Let deletes queued behind the failed one land first, or the reread shows them again.
  await undoQueue.flushWrites();
  await reloadAndRender();
  announce(t('libraryWriteFailed', currentLang));
}

// ---------------------------------------------------------------------------
// Card actions
// ---------------------------------------------------------------------------

/**
 * @param {object} entry
 * @param {{ message?: string, focusAction?: string }} [options] - What the status
 *   says, and which action of the neighbouring card takes focus
 */
async function deleteEntry(entry, { message = 'libraryDeleted', focusAction = 'delete' } = {}) {
  // One Undo at a time: a new delete closes the previous one's window.
  undoQueue.flush();

  const cards = renderedCards();
  const index = cards.findIndex(c => c.getAttribute('data-key') === entry.key);
  const neighbour = cards[index + 1] || cards[index - 1];

  historyEntries = historyEntries.filter(e => e.key !== entry.key);
  favoriteEntries = favoriteEntries.filter(e => e.key !== entry.key);
  render();
  focusCardAction(neighbour?.getAttribute('data-key'), focusAction);
  announce(t(message, currentLang), { undo: entry.key });

  const ok = await undoQueue.remove(entry);
  if (!ok) await reportWriteFailure();
}

async function undoDelete() {
  const key = undoKey;
  closeStatus();
  if (!key) return;
  const ok = await undoQueue.undoAndWait(key);
  // A delete clicked while the restore was written must land before the reread.
  await undoQueue.flushWrites();
  await reloadAndRender();
  if (ok) focusCardAction(key, 'delete');
  else announce(t('libraryWriteFailed', currentLang));
}

async function copyEntry(entry, button) {
  const variant = button.dataset.variant;
  const text = variant && entry.variants?.[variant] ? entry.variants[variant] : entry.result;
  try {
    await navigator.clipboard.writeText(text);
    announce(t('libraryCopied', currentLang));
  } catch {
    announce(t('libraryCopyFailed', currentLang));
  }
}

async function toggleFavorite(entry, button) {
  // On the Favorites tab the star is the favorite itself: unstarring removes
  // it like Delete does, Undo included.
  if (entry.source === 'favorites') {
    await deleteEntry(entry, { message: 'libraryRemovedFavorite', focusAction: 'favorite' });
    return;
  }
  try {
    const match = await isFavorite(entry.original, entry.result);
    if (match) {
      await removeFavorite(match.id);
    } else {
      await addFavorite({ type: entry.kind, originalText: entry.original, savedText: entry.result, direction: entry.direction });
    }
    button.setAttribute('aria-pressed', match ? 'false' : 'true');
    button.title = t(match ? 'libraryFavorite' : 'libraryUnfavorite', currentLang);
    // The card stays where it is, so a mistaken click can be undone with a second one.
    favoriteEntries = toFavoriteEntries(await getFavorites());
  } catch (error) {
    console.error('ParsiPad: could not change the favorite', error);
    await reportWriteFailure();
  }
}

/**
 * Hand the entry's text to the side panel and open it, in Polish for a polish
 * entry and Translate otherwise. Opening the panel (the sidebar in Firefox)
 * only works inside the click's user gesture, so nothing is awaited before
 * it; the panel picks the text up from session storage when it loads, or
 * through onChanged when it is already open (sidepanel/panel.js).
 */
function openInPanel(entry) {
  const mode = entry.kind === 'polish' ? 'polish' : 'translate';
  chrome.storage.session.set({ panel_prefill: { text: entry.original, at: Date.now(), windowId, mode } })
    .catch(error => console.error('ParsiPad: could not hand the text to the side panel', error));
  openSidebar({ windowId })
    .catch(error => console.error('ParsiPad: could not open the side panel', error));
}

function handleCardAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  // The lesson link navigates on its own.
  if (button.dataset.action === 'open-lesson') return;
  const entry = findEntry(button.closest('.lib-card')?.getAttribute('data-key'));
  if (!entry) return;

  switch (button.dataset.action) {
    case 'delete': deleteEntry(entry); break;
    case 'copy': copyEntry(entry, button); break;
    case 'favorite': toggleFavorite(entry, button); break;
    case 'open-in-panel': openInPanel(entry); break;
  }
}

// ---------------------------------------------------------------------------
// Clear all
// ---------------------------------------------------------------------------

const HISTORY_CLEARERS = {
  translation: clearHistory,
  polish: clearPolishHistory,
  dictionary: clearDictionaryHistory
};

const CLEAR_TYPE_NAMES = {
  translation: 'clearTypeTranslation',
  polish: 'clearTypePolish',
  dictionary: 'clearTypeDictionary'
};

/**
 * The question Clear all asks, naming exactly what goes. The search and the
 * direction filter are mentioned only when they hide part of it.
 * @param {import('../lib/library-model.js').LibraryEntry[]} scope - What will be cleared
 */
function clearQuestion(scope) {
  let key;
  if (state.tab === 'lessons') key = 'confirmClearLessons';
  else if (state.tab === 'favorites') key = state.type === 'all' ? 'confirmClearFavorites' : 'confirmClearFavoritesType';
  else key = state.type === 'all' ? 'confirmClearAllHistory' : 'confirmClearHistoryType';

  const someHidden = filterEntries(scope, { dir: state.dir, q: state.q }).length < scope.length;
  return t(key, currentLang)
    .replace('{type}', CLEAR_TYPE_NAMES[state.type] ? t(CLEAR_TYPE_NAMES[state.type], currentLang) : '')
    .replace('{hidden}', someHidden ? t('confirmClearHidden', currentLang) : '');
}

/**
 * Clear what the active tab and type chip hold; search and direction narrow
 * what is shown, not what Clear all means, and the question says so. History
 * under All clears the dictionary lookups too: they have no other place to be
 * cleared from.
 */
async function handleClearAll() {
  const scope = filterEntries(tabEntries(), { type: activeType() });
  if (!scope.length) return;
  if (!confirm(clearQuestion(scope))) return;

  // Settle pending deletes first, so no Undo can bring back what is cleared.
  closeStatus();
  await undoQueue.flush();

  try {
    if (state.tab !== 'history') {
      for (const entry of scope) await removeFavorite(entry.id);
    } else if (state.type === 'all') {
      await clearHistory();
      await clearPolishHistory();
      await clearDictionaryHistory();
    } else {
      await HISTORY_CLEARERS[state.type]();
    }
  } catch (error) {
    console.error('ParsiPad: could not clear the library', error);
    await reportWriteFailure();
    return;
  }
  await reloadAndRender();
  searchInput.focus();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Arrow keys move between tabs (mirrored right to left), Home and End jump to the ends. */
function handleTabKeydown(event) {
  const index = tabButtons.indexOf(event.currentTarget);
  const rtl = document.documentElement.dir === 'rtl';
  const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
  let next;
  if (step) next = (index + step + tabButtons.length) % tabButtons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabButtons.length - 1;
  else return;

  event.preventDefault();
  setState({ tab: TABS[next] });
  tabButtons[next].focus();
}

function setupEventListeners() {
  themeBtn.addEventListener('click', toggleTheme);

  for (const tab of tabButtons) {
    tab.addEventListener('click', () => setState({ tab: tab.dataset.tab }));
    tab.addEventListener('keydown', handleTabKeydown);
  }

  searchInput.addEventListener('input', searchSoon);
  // Enter applies the search at once rather than after the pause.
  searchInput.addEventListener('search', () => {
    searchSoon.cancel();
    applySearch();
  });

  for (const chip of typeChips) {
    chip.addEventListener('click', () => setState({ type: chip.dataset.type }));
  }
  directionSelect.addEventListener('change', () => setState({ dir: directionSelect.value }));

  list.addEventListener('click', handleCardAction);
  clearBtn.addEventListener('click', handleClearAll);
  undoBtn.addEventListener('click', undoDelete);

  // Deletes are already written; this closes the undo windows and lets the
  // last writes finish while the page can still run them. The status goes
  // too, or a page restored from the back-forward cache shows a dead Undo.
  window.addEventListener('pagehide', () => {
    closeStatus();
    undoQueue.flush();
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init, { once: true });
