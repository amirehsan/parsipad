/**
 * The New Tab page: one saved word in large type, the time and a greeting,
 * a Bookmarks drawer and, if the user wants them, the Most visited tiles.
 *
 * The word is dealt from the same deck as Practice (lib/practice.js): the
 * saved translation shows first and flipping reveals the original. The card
 * is one button holding both faces, so Space and Enter flip it when it has
 * focus; from the page they flip it too, c copies the face that is showing
 * and / opens the bookmarks, unless focus is in a form control.
 *
 * Settings > Flashcards > New tab turns the page off. Off, it shows the page
 * background, a quiet clock and a button to Chrome's own New Tab. Both views
 * start hidden in the markup and the setting is read before either is shown,
 * so the full page never flashes when it is off.
 *
 * Nothing here talks to an AI provider, and bookmarks and Most visited are
 * only read when they are about to be shown.
 */
import { getNewTabEnabled, getNewTabPanels, getFavorites, getLanguage, getTheme, setTheme } from '../lib/storage.js';
import { STORAGE_KEYS } from '../lib/constants.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { applyThemeToRoot } from '../lib/theme.js';
import { formatTime, formatDate } from '../lib/format.js';
import { buildDeck, PRACTICE_SIZE } from '../lib/practice.js';
import { textSizeStep } from '../lib/text-size.js';
import { debounce } from '../lib/debounce.js';
import { getTopSites, faviconUrl, hasTopSitesPermission, isLinkableUrl, hostLabel, tileInitial } from '../lib/top-sites.js';
import { greetingKeyForHour, msUntilNextMinute } from './glance.js';
import { browserNewTabUrl, isFirefox } from '../lib/platform.js';

// How long a copy confirmation stays on screen.
const TOAST_MS = 3000;
// A status message is written this long after the region is emptied, so the
// same words twice in a row are still a change a screen reader announces.
const ANNOUNCE_DELAY_MS = 50;
const SEARCH_DELAY_MS = 150;

// DOM Elements
const pageView = document.getElementById('nt-page');
const offView = document.getElementById('nt-off');
const themeBtn = document.getElementById('theme-btn');
const bookmarksBtn = document.getElementById('nt-bookmarks-btn');
const clockEl = document.getElementById('nt-clock');
const dateEl = document.getElementById('nt-date');
const greetingPrimary = document.getElementById('nt-greeting-primary');
const greetingSecondary = document.getElementById('nt-greeting-secondary');
const wordView = document.getElementById('nt-word');
const emptyView = document.getElementById('nt-empty');
const cardButton = document.getElementById('nt-card');
const frontFace = document.getElementById('nt-face-front');
const backFace = document.getElementById('nt-face-back');
const frontText = document.getElementById('nt-front-text');
const backText = document.getElementById('nt-back-text');
const copyBtn = document.getElementById('nt-copy');
const anotherBtn = document.getElementById('nt-another');
const recentsPanel = document.getElementById('nt-recents');
const tileList = document.getElementById('nt-tiles');
const statusRegion = document.getElementById('nt-status');
const offClock = document.getElementById('nt-off-clock');
const openChromeBtn = document.getElementById('nt-open-chrome');
const offFallback = document.getElementById('nt-off-fallback');
const drawer = document.getElementById('nt-drawer');
const scrim = document.getElementById('nt-scrim');
const drawerClose = document.getElementById('nt-drawer-close');
const bookmarkSearch = document.getElementById('nt-bookmark-search');
const bookmarkTree = document.getElementById('nt-bookmark-tree');
const bookmarkEmpty = document.getElementById('nt-bookmark-empty');

// State
let currentLang = 'en';
let currentTheme = 'light';
let enabled = true;
let panels = { bookmarks: true, recents: false };
let deck = null;
let index = 0;
let flipped = false;
let drawerOpen = false;
let drawerInvoker = null;
let bookmarkNodes = null;
let clockTimer = null;
let statusTimer = null;
let statusTextTimer = null;

/**
 * Read the setting, the language and the theme, then show one view.
 */
async function init() {
  const [isEnabled, lang, theme] = await Promise.all([getNewTabEnabled(), getLanguage(), getTheme()]);
  applyLanguage(lang);
  applyTheme(theme);
  setupEventListeners();
  startClock();
  await showView(isEnabled);
}

/**
 * @param {boolean} on
 */
async function showView(on) {
  enabled = on;
  if (!on) {
    closeDrawer();
    pageView.hidden = true;
    offFallback.hidden = true;
    offView.hidden = false;
    return;
  }
  // The word is the first thing on the page, so it is read and rendered
  // before anything else is asked for.
  [deck, panels] = await Promise.all([deck ? deck : loadDeck(), getNewTabPanels()]);
  renderWord();
  applyPanels();
  offView.hidden = true;
  pageView.hidden = false;
  loadTopSites();
}

/** A read that fails deals no cards rather than a partial deck. */
async function loadDeck() {
  try {
    return buildDeck(await getFavorites(), { size: PRACTICE_SIZE.max });
  } catch (error) {
    console.error('ParsiPad: could not read the favorites for the New Tab', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Language and theme
// ---------------------------------------------------------------------------

function applyLanguage(lang) {
  currentLang = lang === 'fa' ? 'fa' : 'en';
  applyTranslations(currentLang);
  document.title = t('newTabTitle', currentLang);
  // The hints sit inside faces that carry the card's language; they are in
  // the interface's language, and say so.
  for (const hint of document.querySelectorAll('.nt-hint')) {
    hint.lang = currentLang;
    hint.dir = currentLang === 'fa' ? 'rtl' : 'ltr';
  }
  renderClock();
}

function applyTheme(theme) {
  currentTheme = theme;
  applyThemeToRoot(theme);
}

async function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  await setTheme(next);
  applyTheme(next);
}

/**
 * A change made in Settings, or on another page, shows up here without a
 * reload: the theme, the language, the switch and the panels.
 */
function handleStorageChange(changes, area) {
  if (area !== 'local') return;
  if (changes[STORAGE_KEYS.theme]) applyTheme(changes[STORAGE_KEYS.theme].newValue || 'light');
  if (changes[STORAGE_KEYS.language]) applyLanguage(changes[STORAGE_KEYS.language].newValue);
  if (changes[STORAGE_KEYS.newTabEnabled]) {
    showView(changes[STORAGE_KEYS.newTabEnabled].newValue !== false);
  } else if (changes[STORAGE_KEYS.newTabPanels] && enabled) {
    getNewTabPanels().then((next) => {
      panels = next;
      applyPanels();
      loadTopSites();
    });
  }
}

// ---------------------------------------------------------------------------
// The clock and greeting
// ---------------------------------------------------------------------------

/**
 * Redraw on the top of each minute rather than on a plain 60s interval, so a
 * tab opened at :59 does not sit a whole minute behind.
 */
function startClock() {
  clearTimeout(clockTimer);
  clockTimer = setTimeout(function tick() {
    renderClock();
    clockTimer = setTimeout(tick, msUntilNextMinute(new Date()));
  }, msUntilNextMinute(new Date()));
}

function renderClock() {
  const now = new Date();
  const time = formatTime(now, currentLang);
  clockEl.textContent = time;
  offClock.textContent = time;
  dateEl.textContent = formatDate(now, currentLang, { dateStyle: 'full' });

  // Both languages, the reader's own first: the product in one line.
  const key = greetingKeyForHour(now.getHours());
  const other = currentLang === 'fa' ? 'en' : 'fa';
  greetingPrimary.textContent = t(key, currentLang);
  greetingSecondary.textContent = t(key, other);
  greetingSecondary.lang = other;
  greetingSecondary.dir = other === 'fa' ? 'rtl' : 'ltr';
}

// ---------------------------------------------------------------------------
// The word
// ---------------------------------------------------------------------------

function renderWord() {
  const hasCards = deck.length > 0;
  wordView.hidden = !hasCards;
  emptyView.hidden = hasCards;
  if (!hasCards) return;

  const card = deck[index];
  fillFace(frontFace, frontText, card.front, card.frontLang);
  fillFace(backFace, backText, card.back, card.backLang);
  cardButton.setAttribute('aria-pressed', flipped ? 'true' : 'false');
  // Both faces sit in the button; only the one facing up is read out.
  frontFace.setAttribute('aria-hidden', flipped ? 'true' : 'false');
  backFace.setAttribute('aria-hidden', flipped ? 'false' : 'true');
  anotherBtn.hidden = deck.length < 2;
}

function fillFace(face, textNode, text, lang) {
  face.lang = lang;
  face.dir = lang === 'fa' ? 'rtl' : 'ltr';
  textNode.textContent = text;
  textNode.dataset.size = textSizeStep(text);
}

function flip() {
  if (!deck?.length) return;
  flipped = !flipped;
  renderWord();
}

/** The next card in the shuffled deck, face up, coming round at the end. */
function showAnother() {
  if (!deck?.length) return;
  index = (index + 1) % deck.length;
  flipped = false;
  renderWord();
}

async function copyShownFace() {
  if (!deck?.length) return;
  const card = deck[index];
  try {
    await navigator.clipboard.writeText(flipped ? card.back : card.front);
    announce(t('libraryCopied', currentLang));
  } catch {
    announce(t('libraryCopyFailed', currentLang));
  }
}

function announce(message) {
  clearTimeout(statusTimer);
  clearTimeout(statusTextTimer);
  statusRegion.textContent = '';
  statusTextTimer = setTimeout(() => { statusRegion.textContent = message; }, ANNOUNCE_DELAY_MS);
  statusRegion.classList.add('nt-toast-open');
  statusTimer = setTimeout(() => statusRegion.classList.remove('nt-toast-open'), TOAST_MS);
}

// ---------------------------------------------------------------------------
// The off state's way back
// ---------------------------------------------------------------------------

/**
 * Load the browser's own New Tab in this tab: Chrome's New Tab, or Firefox
 * Home. A plain link cannot reach either from an extension page, but the
 * tabs API can. If the browser refuses, say so and point to the switch in
 * Settings.
 */
async function openBrowserNewTab() {
  offFallback.hidden = true;
  const url = browserNewTabUrl();
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) {
      await chrome.tabs.update(tab.id, { url });
    } else {
      await chrome.tabs.update({ url });
    }
  } catch (error) {
    console.warn("ParsiPad: could not open the browser's New Tab", error);
    offFallback.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function applyPanels() {
  bookmarksBtn.hidden = !panels.bookmarks;
  if (!panels.bookmarks) closeDrawer();
  if (!panels.recents) recentsPanel.hidden = true;
}

/**
 * The Most visited tiles, only while the panel is on and Chrome has granted
 * topSites. Without the permission the panel shows nothing: asking for it is
 * Settings' job, from a click.
 */
async function loadTopSites() {
  if (!panels.recents || !await hasTopSitesPermission()) {
    recentsPanel.hidden = true;
    return;
  }
  const tiles = await getTopSites();
  tileList.replaceChildren(...tiles.map(renderTile));
  recentsPanel.hidden = !tiles.length || !enabled || !panels.recents;
}

/**
 * One tile, built with DOM calls: the title and host come from pages the
 * user has visited, and this page has no business parsing markup from them.
 * @param {{url: string, title: string, host: string, initial: string}} tile
 */
function renderTile(tile) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'nt-tile';
  link.href = tile.url;
  link.title = `${tile.title}\n${tile.host}`;

  const icon = document.createElement('span');
  icon.className = 'nt-tile-icon';
  const initial = document.createElement('span');
  initial.className = 'nt-tile-initial';
  initial.textContent = tile.initial;
  initial.hidden = true;
  initial.setAttribute('aria-hidden', 'true');
  icon.append(siteIcon(tile.url, initial, tile.favicon), initial);

  const label = document.createElement('span');
  label.className = 'nt-tile-label';
  // Titles come in any language; each reads in its own direction.
  label.dir = 'auto';
  label.textContent = tile.title;

  link.append(icon, label);
  item.append(link);
  return item;
}

/**
 * The site's icon from the browser's own favicon cache. A host it has never
 * seen yields nothing, so the fallback takes its place instead of a broken
 * image glyph. Firefox has no favicon service for extensions; there the icon
 * is the one its topSites reply carried, if any.
 * @param {string} url
 * @param {HTMLElement} [fallback]
 * @param {string} [favicon] - Firefox only: an inline image from topSites
 * @returns {Node}
 */
function siteIcon(url, fallback, favicon) {
  if (isFirefox() && !favicon) {
    if (fallback) fallback.hidden = false;
    return document.createDocumentFragment();
  }
  const img = document.createElement('img');
  img.src = isFirefox() ? favicon : faviconUrl(url);
  img.alt = '';
  img.width = 16;
  img.height = 16;
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    img.remove();
    if (fallback) fallback.hidden = false;
  });
  return img;
}

// ---------------------------------------------------------------------------
// The bookmarks drawer
// ---------------------------------------------------------------------------

/**
 * @param {HTMLElement|null} invoker - What to hand focus back to on close.
 */
async function openDrawer(invoker) {
  if (drawerOpen || !enabled || !panels.bookmarks) return;
  drawerOpen = true;
  drawerInvoker = invoker && invoker !== document.body ? invoker : bookmarksBtn;
  drawer.removeAttribute('inert');
  drawer.classList.add('nt-drawer-open');
  scrim.classList.add('nt-scrim-open');
  bookmarksBtn.setAttribute('aria-expanded', 'true');
  bookmarkSearch.focus();
  // The tree is read the first time it is asked for, which keeps every
  // bookmark off the path of every new tab.
  if (!bookmarkNodes) await loadBookmarks();
}

function closeDrawer() {
  if (!drawerOpen) return;
  drawerOpen = false;
  // Blur before making the subtree inert, or focus is left on an element the
  // browser is about to take out of the accessibility tree.
  if (drawer.contains(document.activeElement)) document.activeElement.blur();
  drawer.classList.remove('nt-drawer-open');
  scrim.classList.remove('nt-scrim-open');
  drawer.setAttribute('inert', '');
  bookmarksBtn.setAttribute('aria-expanded', 'false');
  const invoker = drawerInvoker;
  drawerInvoker = null;
  // The bookmarks button may have been switched off while the drawer was open.
  if (invoker?.isConnected && !invoker.hidden) invoker.focus();
  else if (enabled && !pageView.hidden) cardButton.focus();
}

async function loadBookmarks() {
  try {
    const tree = await chrome.bookmarks.getTree();
    bookmarkNodes = tree?.[0]?.children || [];
  } catch (error) {
    console.warn('ParsiPad: could not read bookmarks', error);
    bookmarkNodes = [];
  }
  filterBookmarks(bookmarkSearch.value.trim());
}

function hasBookmarks(node) {
  // Firefox's tree carries place: queries and file: entries it will not
  // open from here, so a folder of only those counts as empty there.
  if (!node.children) return isFirefox() ? isOpenable(node.url) : Boolean(node.url);
  return node.children.some(hasBookmarks);
}

/**
 * Bookmarklets run script; this page opens places, not code. Firefox also
 * refuses place:, file: and privileged about: addresses from an extension
 * page, so there only web addresses are kept.
 */
function isOpenable(url) {
  if (typeof url !== 'string' || /^\s*(javascript|data):/i.test(url)) return false;
  return !isFirefox() || isLinkableUrl(url);
}

function renderTree(nodes) {
  const list = document.createElement('ul');
  list.className = 'nt-bookmark-list';
  for (const node of nodes) {
    const item = renderNode(node);
    if (item) list.append(item);
  }
  return list;
}

/**
 * A folder is a native disclosure, so it opens with Enter or Space and says
 * whether it is open without any script. The top level starts open.
 */
function renderNode(node, depth = 0) {
  if (node.children) {
    if (!hasBookmarks(node)) return null;
    const item = document.createElement('li');
    const folder = document.createElement('details');
    folder.className = 'nt-folder';
    folder.open = depth === 0;
    const summary = document.createElement('summary');
    summary.className = 'nt-folder-title';
    summary.dir = 'auto';
    summary.textContent = node.title || t('bookmarks', currentLang);
    const children = document.createElement('ul');
    children.className = 'nt-bookmark-list';
    for (const child of node.children) {
      const childItem = renderNode(child, depth + 1);
      if (childItem) children.append(childItem);
    }
    folder.append(summary, children);
    item.append(folder);
    return item;
  }
  if (!isOpenable(node.url)) return null;
  const item = document.createElement('li');
  item.append(bookmarkLink(node));
  return item;
}

/**
 * A bookmark's icon: the favicon in Chrome, the initial in Firefox, which has
 * no favicon source for bookmarks.
 * @param {{title?: string, url: string}} node
 * @returns {Node}
 */
function bookmarkIcon(node) {
  if (!isFirefox()) return siteIcon(node.url);
  const initial = document.createElement('span');
  initial.className = 'nt-bookmark-initial';
  initial.setAttribute('aria-hidden', 'true');
  initial.textContent = tileInitial({ title: node.title, url: node.url });
  return initial;
}

/**
 * @param {{title?: string, url: string}} node
 * @param {string} [query] - Lowercased; its first match in the title is marked
 */
function bookmarkLink(node, query) {
  const link = document.createElement('a');
  link.className = 'nt-bookmark';
  link.href = node.url;
  link.title = node.url;
  const title = document.createElement('span');
  title.className = 'nt-bookmark-title';
  title.dir = 'auto';
  appendMarked(title, node.title || node.url, query);
  link.append(bookmarkIcon(node), title);
  if (query) {
    const host = document.createElement('span');
    host.className = 'nt-bookmark-host';
    host.dir = 'ltr';
    host.textContent = hostLabel(node.url) || node.url;
    link.append(host);
  }
  return link;
}

/** Text with the first match wrapped in <mark>, all as text nodes. */
function appendMarked(parent, text, query) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at === -1) {
    parent.textContent = text;
    return;
  }
  const mark = document.createElement('mark');
  mark.textContent = text.slice(at, at + query.length);
  parent.append(text.slice(0, at), mark, text.slice(at + query.length));
}

function collectMatches(nodes, query, out) {
  for (const node of nodes) {
    if (node.children) {
      collectMatches(node.children, query, out);
    } else if (isOpenable(node.url)) {
      const title = (node.title || '').toLowerCase();
      if (title.includes(query) || node.url.toLowerCase().includes(query)) out.push(node);
    }
  }
  return out;
}

function filterBookmarks(rawQuery) {
  if (!bookmarkNodes) return;
  const query = rawQuery.toLowerCase();
  if (!query) {
    const tree = renderTree(bookmarkNodes);
    bookmarkTree.replaceChildren(tree);
    bookmarkEmpty.hidden = tree.children.length > 0;
    return;
  }
  const matches = collectMatches(bookmarkNodes, query, []);
  const list = document.createElement('ul');
  list.className = 'nt-bookmark-list nt-bookmark-results';
  for (const node of matches) {
    const item = document.createElement('li');
    item.append(bookmarkLink(node, query));
    list.append(item);
  }
  bookmarkTree.replaceChildren(list);
  bookmarkEmpty.hidden = matches.length > 0;
}

const filterSoon = debounce(() => filterBookmarks(bookmarkSearch.value.trim()), SEARCH_DELAY_MS);

/**
 * A plain link cannot open a chrome:// or file:// bookmark from an extension
 * page, so those go through the tabs API.
 */
function handleBookmarkClick(event) {
  const link = event.target.closest?.('a.nt-bookmark');
  if (!link || isLinkableUrl(link.href) || event.button > 1) return;
  event.preventDefault();
  const url = link.getAttribute('href');
  // As for a plain link: Shift opens a window, Cmd, Ctrl or the middle button a background tab.
  let opening;
  if (event.shiftKey) opening = chrome.windows.create({ url });
  else if (event.button === 1 || event.metaKey || event.ctrlKey) opening = chrome.tabs.create({ url, active: false });
  else opening = chrome.tabs.update({ url });
  opening.catch((error) => {
    console.warn('ParsiPad: could not open the bookmark', error);
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const FORM_CONTROL = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// Space and Enter already press these, the card included, so the page leaves them be.
const ACTIVATES_ON_KEY = `button, a[href], summary, ${FORM_CONTROL}`;

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

function handleKeydown(event) {
  if (event.key === 'Escape' && drawerOpen) {
    // In the search box, Escape clears first and closes once it is empty.
    if (event.target === bookmarkSearch && bookmarkSearch.value) {
      bookmarkSearch.value = '';
      filterSoon.cancel();
      filterBookmarks('');
    } else {
      closeDrawer();
    }
    event.preventDefault();
    return;
  }

  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (isFormControl(event.target) || isFormControl(document.activeElement)) return;
  // The open drawer is modal: the card behind the scrim takes no keys.
  if (!enabled || drawerOpen) return;

  if (event.key === '/') {
    if (!panels.bookmarks) return;
    event.preventDefault();
    openDrawer(event.target instanceof HTMLElement ? event.target : null);
  } else if (event.key === ' ' || event.key === 'Enter') {
    // A focused button or link acts on the key itself; flipping here too
    // would flip the card twice, or flip it when another control was meant.
    if (event.shiftKey || activatesOnKey(event.target) || !deck?.length) return;
    event.preventDefault();
    flip();
  } else if (isCopyKey(event)) {
    copyShownFace();
  }
}

function setupEventListeners() {
  themeBtn.addEventListener('click', toggleTheme);
  cardButton.addEventListener('click', flip);
  copyBtn.addEventListener('click', copyShownFace);
  anotherBtn.addEventListener('click', showAnother);
  openChromeBtn.addEventListener('click', openBrowserNewTab);
  bookmarksBtn.addEventListener('click', () => {
    if (drawerOpen) closeDrawer();
    else openDrawer(bookmarksBtn);
  });
  drawerClose.addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  bookmarkSearch.addEventListener('input', filterSoon);
  bookmarkTree.addEventListener('click', handleBookmarkClick);
  bookmarkTree.addEventListener('auxclick', handleBookmarkClick);
  document.addEventListener('keydown', handleKeydown);
  chrome.storage.onChanged.addListener(handleStorageChange);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'system') applyThemeToRoot('system');
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init, { once: true });
