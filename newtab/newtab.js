import { getRandomFavorites, getNewTabEnabled, getTheme, setTheme, getNewTabPhraseCount, getLanguage, getNewTabPanels, setNewTabPanels, NEWTAB_PANELS } from '../lib/storage.js';
import { getTopSites, faviconUrl, hasTopSitesPermission, requestTopSitesPermission } from '../lib/top-sites.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { greetingKeyForHour, formatClock, msUntilNextMinute } from './glance.js';
import { heroSizeStep, stepBelow } from './hero-scale.js';
import { applyThemeToRoot } from '../lib/theme.js';

// DOM Elements - Bookmarks (now inside the drawer)
const bookmarkSearch = document.getElementById('bookmark-search');
const bookmarkTree = document.getElementById('bookmark-tree');
const bookmarkEmpty = document.getElementById('bookmark-empty');

// DOM Elements
const hero = document.getElementById('hero');
const heroFooter = document.getElementById('hero-footer');
const flashcard = document.getElementById('flashcard');
const cardBadge = document.getElementById('card-badge');
const cardBadgeBack = document.getElementById('card-badge-back');
const cardSaved = document.getElementById('card-saved');
const cardOriginal = document.getElementById('card-original');
const cardSavedBack = document.getElementById('card-saved-back');
const progressDots = document.getElementById('progress-dots');
const emptyState = document.getElementById('empty-state');
const disabledState = document.getElementById('disabled-state');
const refreshBtn = document.getElementById('refresh-btn');
const themeBtn = document.getElementById('theme-btn');
const copyBtn = document.getElementById('copy-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const viewAllLink = document.getElementById('view-all-link');
const openSettingsLink = document.getElementById('open-settings-link');
const keyboardHints = document.getElementById('keyboard-hints');
const clockEl = document.getElementById('clock');
const greetingPrimary = document.getElementById('greeting-primary');
const greetingSecondary = document.getElementById('greeting-secondary');
const drawer = document.getElementById('bookmarks-drawer');
const drawerScrim = document.getElementById('drawer-scrim');
const drawerClose = document.getElementById('drawer-close');
const chipBookmarks = document.getElementById('chip-bookmarks');
const recentsPanel = document.getElementById('recents-panel');
const tileGrid = document.getElementById('tile-grid');
const recentsPermission = document.getElementById('recents-permission');
const recentsEmpty = document.getElementById('recents-empty');
const recentsGrantBtn = document.getElementById('recents-grant-btn');

// State
let favorites = [];
let currentIndex = 0;
let isFlipped = false;
let currentLang = 'en';
let bookmarkData = [];
// `panels.bookmarks` is legacy. Bookmarks stopped being a panel when it
// became a drawer, and a drawer is per-tab state that is never persisted.
// The stored key is left alone so an older build still reads a coherent
// object; this page simply does not consult it.
let panels = { flashcard: true, bookmarks: true, recents: false };
let drawerOpen = false;
let bookmarksLoaded = false;
let drawerInvoker = null;
let clockTimer = null;

/**
 * Initialize the new tab page
 */
async function init() {
  await initLanguage();
  await initTheme();

  // Check 3D transform support
  check3DSupport();

  // Setup common event listeners first (theme, settings links, etc.)
  setupCommonEventListeners();

  // Panels first: it decides what is on screen, so doing it before the data
  // loads avoids a frame where a hidden panel is briefly visible.
  await initPanels();

  startGlance();
  setupDrawer();

  // Check if feature is enabled
  const isEnabled = await getNewTabEnabled();

  if (!isEnabled) {
    showDisabledState();
    setupKeyboardShortcuts();
    return;
  }

  await loadFavorites();
  setupFlashcardEventListeners();
  setupKeyboardShortcuts();
}

/**
 * Initialize language
 */
async function initLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
}

/**
 * Check if browser supports 3D transforms
 */
function check3DSupport() {
  const el = document.createElement('div');
  el.style.transform = 'rotateY(180deg)';
  const has3D = el.style.transform !== '';
  if (has3D) {
    flashcard.classList.add('has-3d');
  }
}

/**
 * Initialize theme from storage or system preference
 */
async function initTheme() {
  const storedTheme = await getTheme();
  applyTheme(storedTheme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (_e) => {
    const currentTheme = await getTheme();
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });
}

/**
 * Apply theme to the document
 */
function applyTheme(theme) {
  // Both conventions, always. Writing only data-theme leaves a stale `.dark`
  // class from theme-boot matching :root.dark, which pins the page dark.
  applyThemeToRoot(theme);
}

/**
 * Toggle between light and dark theme
 */
async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  await setTheme(newTheme);
  applyTheme(newTheme);
}

/**
 * Load random favorites
 */
async function loadFavorites() {
  try {
    const count = await getNewTabPhraseCount();
    favorites = await getRandomFavorites(count);
    currentIndex = 0;
    isFlipped = false;

    if (favorites.length === 0) {
      showEmptyState();
    } else {
      showFlashcardView();
      renderCurrentCard();
      renderProgressDots();
      updateNavigation();
    }
  } catch (error) {
    favorites = [];
    showEmptyState();
  }
}

/**
 * Show flashcard view
 */
function showFlashcardView() {
  setStage('cards');
}

/**
 * Show empty state
 */
function showEmptyState() {
  setStage('empty');
}

/**
 * Show disabled state
 */
function showDisabledState() {
  setStage('disabled');
}

/**
 * The stage holds exactly one of three things. Routing them through one
 * function keeps them mutually exclusive by construction.
 *
 * @param {'cards'|'empty'|'disabled'} which
 */
function setStage(which) {
  const cards = which === 'cards' && panels.flashcard;
  if (hero) hero.hidden = !cards;
  if (heroFooter) heroFooter.hidden = !cards;
  emptyState.hidden = which !== 'empty' || !panels.flashcard;
  disabledState.hidden = which !== 'disabled' || !panels.flashcard;

  // The card keys mean nothing without a card, but the bookmarks key still
  // works, so the pill stays and only its card items go.
  keyboardHints?.querySelectorAll('[data-hint="card"]').forEach(item => {
    item.hidden = !cards;
  });
}

/**
 * Render the current card
 */
function renderCurrentCard() {
  if (favorites.length === 0) return;

  const item = favorites[currentIndex];

  // Reset flip state
  isFlipped = false;
  flashcard.classList.remove('flipped');

  // Update badge
  const badgeInfo = getBadgeInfo(item);
  cardBadge.textContent = badgeInfo.text;
  cardBadge.className = `hero-eyebrow ${badgeInfo.type}`;
  cardBadgeBack.textContent = badgeInfo.text;
  cardBadgeBack.className = `hero-eyebrow ${badgeInfo.type}`;

  // Update text content (support both new and legacy field names)
  const savedText = item.savedText || item.saved;
  const originalText = item.originalText || item.original;

  cardSaved.textContent = savedText;
  cardSaved.dir = detectRTL(savedText) ? 'rtl' : 'ltr';

  cardOriginal.textContent = originalText;
  cardOriginal.dir = detectRTL(originalText) ? 'rtl' : 'ltr';

  cardSavedBack.textContent = savedText;
  cardSavedBack.dir = detectRTL(savedText) ? 'rtl' : 'ltr';

  // A favourite can be one word or a whole sentence and the hero has no box
  // to overflow into, so the length picks the display size. The flipped side
  // sits a step below its own so the original and its translation read as a
  // hierarchy rather than competing.
  const frontStep = heroSizeStep(savedText);
  cardSaved.dataset.size = frontStep;
  cardOriginal.dataset.size = stepBelow(heroSizeStep(originalText));
}

/**
 * Get badge info for an item
 */
function getBadgeInfo(item) {
  if (item.type === 'translation') {
    const direction = item.direction || 'EN → FA';
    return { text: direction, type: 'translation' };
  } else if (item.type === 'polish') {
    const variantKey = item.variant || 'polish';
    const variantLabel = t(variantKey, currentLang) || item.variant?.charAt(0).toUpperCase() + item.variant?.slice(1) || t('polish', currentLang);
    return { text: variantLabel, type: 'polish' };
  } else if (item.type === 'dictionary') {
    return { text: t('dictionary', currentLang), type: 'translation' };
  }
  return { text: t('favorites', currentLang), type: 'translation' };
}

/**
 * Render progress dots
 */
function renderProgressDots() {
  progressDots.innerHTML = favorites.map((_, index) =>
    `<div class="progress-dot ${index === currentIndex ? 'active' : ''}" data-index="${index}"></div>`
  ).join('');

  updateProgressLabel();

  // Add click handlers to dots
  progressDots.querySelectorAll('.progress-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const index = parseInt(dot.dataset.index, 10);
      goToCard(index);
    });
  });
}

/**
 * Update navigation buttons
 */
function updateNavigation() {
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === favorites.length - 1;
  updateProgressLabel();

  // Update active dot
  progressDots.querySelectorAll('.progress-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === currentIndex);
  });
}

/**
 * Go to a specific card
 */
function goToCard(index) {
  if (index < 0 || index >= favorites.length || index === currentIndex) return;

  // Add transition animation
  flashcard.classList.add('transitioning');

  setTimeout(() => {
    currentIndex = index;
    renderCurrentCard();
    updateNavigation();
    flashcard.classList.remove('transitioning');
  }, 150);
}

/**
 * Go to previous card
 */
function prevCard() {
  if (currentIndex > 0) {
    goToCard(currentIndex - 1);
  }
}

/**
 * Go to next card
 */
function nextCard() {
  if (currentIndex < favorites.length - 1) {
    goToCard(currentIndex + 1);
  }
}

/**
 * Flip the current card
 */
function flipCard() {
  isFlipped = !isFlipped;
  flashcard.classList.toggle('flipped', isFlipped);
}

/**
 * Copy current card text to clipboard
 */
async function copyCurrentCard() {
  if (favorites.length === 0) return;

  const item = favorites[currentIndex];
  // Same fallback the renderer uses. Reading only `saved` copied undefined
  // for any favourite stored under the newer field name.
  const text = item.savedText || item.saved;

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.classList.add('copied');

    // Change button text temporarily
    const span = copyBtn.querySelector('span');
    const originalText = span.textContent;
    span.textContent = 'Copied!';

    // Change icon to checkmark
    const svg = copyBtn.querySelector('svg');
    const originalSvg = svg.innerHTML;
    svg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';

    setTimeout(() => {
      copyBtn.classList.remove('copied');
      span.textContent = originalText;
      svg.innerHTML = originalSvg;
    }, 1500);
  } catch (error) {
    // Silently handle copy errors
  }
}

/**
 * Setup common event listeners (work in all states)
 */
function setupCommonEventListeners() {
  // Theme toggle
  themeBtn.addEventListener('click', toggleTheme);

  // Open settings button (disabled state)
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // View all link
  if (viewAllLink) {
    viewAllLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('favorites/favorites.html') });
    });
  }

  // Settings link in footer
  if (openSettingsLink) {
    openSettingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
}

/**
 * Setup flashcard-specific event listeners
 */
function setupFlashcardEventListeners() {
  // Refresh button
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = '0.5';

    await loadFavorites();

    setTimeout(() => {
      refreshBtn.disabled = false;
      refreshBtn.style.opacity = '1';
    }, 500);
  });

  // Flashcard click to flip
  flashcard.addEventListener('click', flipCard);

  // Copy button
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyCurrentCard();
  });

  // Navigation buttons
  prevBtn.addEventListener('click', prevCard);
  nextBtn.addEventListener('click', nextCard);
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape in the search box clears it first, and only closes the drawer
    // once there is nothing left to clear.
    if (e.key === 'Escape' && e.target === bookmarkSearch) {
      if (bookmarkSearch.value) {
        bookmarkSearch.value = '';
        filterBookmarks('');
      } else {
        closeDrawer();
      }
      return;
    }

    if (e.key === 'Escape' && drawerOpen) {
      closeDrawer();
      return;
    }

    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Open the bookmarks drawer with /
    if (e.key === '/') {
      e.preventDefault();
      openDrawer(e.target instanceof HTMLElement ? e.target : null);
      return;
    }

    // Ignore if no favorites
    if (favorites.length === 0) return;

    const isRTL = document.documentElement.dir === 'rtl';

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        isRTL ? nextCard() : prevCard();
        break;
      case 'ArrowRight':
        e.preventDefault();
        isRTL ? prevCard() : nextCard();
        break;
      case ' ':
        e.preventDefault();
        flipCard();
        break;
      case 'c':
      case 'C':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          copyCurrentCard();
        }
        break;
      case 'r':
      case 'R':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          loadFavorites();
        }
        break;
    }
  });
}

/**
 * Detect if text is RTL (Persian/Arabic/Hebrew)
 */
function detectRTL(text) {
  if (!text) return false;
  const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/;
  return rtlRegex.test(text);
}

// ============================================
// Bookmarks
// ============================================

/**
 * Load Chrome bookmarks
 */
async function loadBookmarks() {
  try {
    const tree = await chrome.bookmarks.getTree();
    bookmarkData = tree[0].children || [];
    renderBookmarkTree(bookmarkData);
    setupBookmarkEventListeners();
  } catch (error) {
    // The drawer was opened deliberately, so say there is nothing rather than
    // presenting an empty box with no explanation.
    if (bookmarkTree) bookmarkTree.innerHTML = '';
    if (bookmarkEmpty) bookmarkEmpty.hidden = false;
  }
}

/**
 * Render the bookmark tree into the container
 */
function renderBookmarkTree(nodes) {
  bookmarkTree.innerHTML = '';
  bookmarkEmpty.hidden = true;

  for (const node of nodes) {
    const el = createBookmarkNode(node, true);
    if (el) bookmarkTree.appendChild(el);
  }
}

/**
 * Create a DOM element for a bookmark node (recursive)
 */
function createBookmarkNode(node, isTopLevel) {
  if (node.children) {
    // It's a folder
    // Skip empty folders (no children with URLs or sub-folders with URLs)
    if (!hasBookmarks(node)) return null;

    const folder = document.createElement('div');
    folder.className = 'bookmark-folder';
    if (isTopLevel) folder.classList.add('open');

    const header = document.createElement('div');
    header.className = 'bookmark-folder-header';
    header.innerHTML = `
      <svg class="folder-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="folder-title">${escapeHtml(node.title || 'Bookmarks')}</span>
    `;
    folder.appendChild(header);

    const children = document.createElement('div');
    children.className = 'bookmark-folder-children';

    for (const child of node.children) {
      const childEl = createBookmarkNode(child, false);
      if (childEl) children.appendChild(childEl);
    }

    folder.appendChild(children);
    return folder;
  } else if (node.url) {
    // It's a bookmark
    const item = document.createElement('a');
    item.className = 'bookmark-item';
    item.href = node.url;
    item.title = node.url;
    item.innerHTML = `
      <svg class="bookmark-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <span class="bookmark-title">${escapeHtml(node.title || node.url)}</span>
    `;
    return item;
  }
  return null;
}

/**
 * Check if a folder node contains any bookmarks (recursively)
 */
function hasBookmarks(node) {
  if (!node.children) return !!node.url;
  return node.children.some(child => hasBookmarks(child));
}

/**
 * Setup bookmark event listeners
 */
function setupBookmarkEventListeners() {
  // Folder toggle via event delegation
  bookmarkTree.addEventListener('click', (e) => {
    const header = e.target.closest('.bookmark-folder-header');
    if (header) {
      e.preventDefault();
      header.parentElement.classList.toggle('open');
    }
  });

  // Search with debounce
  let searchTimeout;
  bookmarkSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterBookmarks(bookmarkSearch.value.trim());
    }, 200);
  });
}

/**
 * Filter bookmarks by search query
 */
function filterBookmarks(query) {
  if (!query) {
    renderBookmarkTree(bookmarkData);
    return;
  }

  const lowerQuery = query.toLowerCase();
  const matches = [];
  collectMatchingBookmarks(bookmarkData, lowerQuery, matches);

  bookmarkTree.innerHTML = '';

  if (matches.length === 0) {
    bookmarkEmpty.hidden = false;
    return;
  }

  bookmarkEmpty.hidden = true;

  for (const bookmark of matches) {
    const item = document.createElement('a');
    item.className = 'bookmark-search-result';
    item.href = bookmark.url;
    item.title = bookmark.url;

    const titleHtml = highlightMatch(bookmark.title || bookmark.url, lowerQuery);
    let urlHost = '';
    try {
      urlHost = new URL(bookmark.url).hostname;
    } catch (e) {
      urlHost = bookmark.url;
    }

    item.innerHTML = `
      <svg class="bookmark-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <div class="bookmark-result-info">
        <div class="bookmark-result-title">${titleHtml}</div>
        <div class="bookmark-result-url">${escapeHtml(urlHost)}</div>
      </div>
    `;
    bookmarkTree.appendChild(item);
  }
}

/**
 * Recursively collect bookmarks matching query
 */
function collectMatchingBookmarks(nodes, query, results) {
  for (const node of nodes) {
    if (node.children) {
      collectMatchingBookmarks(node.children, query, results);
    } else if (node.url) {
      const title = (node.title || '').toLowerCase();
      const url = (node.url || '').toLowerCase();
      if (title.includes(query) || url.includes(query)) {
        results.push(node);
      }
    }
  }
}

/**
 * Highlight matching text in a string
 */
function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const lowerEscaped = escaped.toLowerCase();
  const idx = lowerEscaped.indexOf(query);
  if (idx === -1) return escaped;
  return escaped.slice(0, idx) +
    '<mark class="bookmark-highlight">' + escaped.slice(idx, idx + query.length) + '</mark>' +
    escaped.slice(idx + query.length);
}

/**
 * Escape HTML entities
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

/* ------------------------------------------------------------------
   Panel switches and the most-visited tiles
   ------------------------------------------------------------------ */

/**
 * Read the stored panel switches, reflect them, and wire the chips.
 */
async function initPanels() {
  panels = await getNewTabPanels();

  // A panel can be stored as on from a previous session while the optional
  // permission behind it has since been revoked from Chrome's own settings,
  // which this page does not get told about. Reconcile before rendering so
  // the chip never claims to show something it cannot.
  if (panels.recents && !await hasTopSitesPermission()) {
    panels.recents = false;
    await setNewTabPanels({ recents: false });
  }

  applyPanels();

  // Toggling recents loads the tiles, but a tab that opens with the panel
  // already on never toggled anything: without this the dock renders as an
  // empty band under the word.
  if (panels.recents) await loadTopSites();

  document.querySelectorAll('.chip[data-panel]').forEach(chip => {
    chip.addEventListener('click', () => togglePanel(chip.dataset.panel));
  });
  recentsGrantBtn?.addEventListener('click', enableRecents);
}

/**
 * @param {string} name
 */
async function togglePanel(name) {
  if (!NEWTAB_PANELS.includes(name)) return;

  if (name === 'recents' && !panels.recents) {
    await enableRecents();
    return;
  }

  panels = await setNewTabPanels({ [name]: !panels[name] });
  applyPanels();
  if (panels.recents) await loadTopSites();
}

/**
 * Turn on Most visited, asking for the optional permission if it is not
 * granted yet. This runs from a click because chrome.permissions.request
 * requires a user gesture; requesting it on page load would be rejected.
 */
async function enableRecents() {
  const granted = await hasTopSitesPermission() || await requestTopSitesPermission();

  if (!granted) {
    // Show the panel with its explanation rather than silently doing nothing,
    // so a declined prompt does not look like a broken button.
    panels = await setNewTabPanels({ recents: true });
    applyPanels();
    setRecentsState('permission');
    return;
  }

  panels = await setNewTabPanels({ recents: true });
  applyPanels();
  await loadTopSites();
}

/**
 * Reflect the current switches in the chips and the layout.
 */
function applyPanels() {
  // Only the two real switches. The bookmarks chip is a disclosure and owns
  // its own aria-expanded.
  document.querySelectorAll('.chip[data-panel]').forEach(chip => {
    chip.setAttribute('aria-pressed', String(Boolean(panels[chip.dataset.panel])));
  });

  if (recentsPanel) recentsPanel.hidden = !panels.recents;

  if (!panels.flashcard) {
    setStage('none');
  }
}

/**
 * @param {'tiles'|'permission'|'empty'} state
 */
function setRecentsState(state) {
  if (tileGrid) tileGrid.hidden = state !== 'tiles';
  if (recentsPermission) recentsPermission.hidden = state !== 'permission';
  if (recentsEmpty) recentsEmpty.hidden = state !== 'empty';
}

/**
 * Fetch and render the most visited tiles.
 */
async function loadTopSites() {
  if (!tileGrid) return;

  if (!await hasTopSitesPermission()) {
    setRecentsState('permission');
    return;
  }

  const tiles = await getTopSites();
  if (!tiles.length) {
    setRecentsState('empty');
    return;
  }

  tileGrid.replaceChildren(...tiles.map(renderTile));
  setRecentsState('tiles');
}

/**
 * One tile. Built with DOM calls rather than an HTML string because the title
 * and host come from pages the user has visited, and this page has no business
 * parsing markup from them.
 *
 * @param {{url: string, title: string, host: string, initial: string}} tile
 * @returns {HTMLAnchorElement}
 */
function renderTile(tile) {
  const link = document.createElement('a');
  link.className = 'tile';
  link.href = tile.url;
  link.title = `${tile.title}\n${tile.host}`;

  const icon = document.createElement('div');
  icon.className = 'tile-icon';

  const initial = document.createElement('span');
  initial.className = 'tile-initial';
  initial.textContent = tile.initial;
  initial.hidden = true;

  const img = document.createElement('img');
  img.src = faviconUrl(tile.url);
  img.alt = '';
  img.loading = 'lazy';
  // The favicon service answers from the browser's own cache, so a host it has
  // never seen yields nothing. Fall back to the initial instead of the broken
  // image glyph.
  img.addEventListener('error', () => {
    img.remove();
    initial.hidden = false;
  });

  icon.append(img, initial);

  const label = document.createElement('span');
  label.className = 'tile-label';
  label.textContent = tile.title;

  link.append(icon, label);
  return link;
}

/* ------------------------------------------------------------------
   The glance line: clock and greeting
   ------------------------------------------------------------------ */

/**
 * Draw the clock and greeting, then keep them current.
 *
 * The tick is aligned to the top of the minute rather than set to a plain
 * 60s interval, so a tab opened at :59 does not show the wrong minute for
 * almost a full one.
 */
function startGlance() {
  renderGlance();
  clearTimeout(clockTimer);
  clockTimer = setTimeout(function tick() {
    renderGlance();
    clockTimer = setTimeout(tick, 60000);
  }, msUntilNextMinute(new Date()));
}

function renderGlance() {
  const now = new Date();
  if (clockEl) clockEl.textContent = formatClock(now, currentLang);

  // Both languages, the reader's own first. This line is the only place the
  // page says out loud what the product is for.
  const key = greetingKeyForHour(now.getHours());
  const other = currentLang === 'fa' ? 'en' : 'fa';
  if (greetingPrimary) {
    greetingPrimary.textContent = t(key, currentLang);
    greetingPrimary.lang = currentLang;
  }
  if (greetingSecondary) {
    greetingSecondary.textContent = t(key, other);
    greetingSecondary.lang = other;
    greetingSecondary.dir = other === 'fa' ? 'rtl' : 'ltr';
  }
}

/**
 * Announce which card is showing. The dots are the visual counter; without a
 * label they are decoration to a screen reader.
 */
function updateProgressLabel() {
  if (!progressDots || favorites.length === 0) return;
  progressDots.setAttribute('aria-label', t('cardProgress', currentLang)
    .replace('{n}', String(currentIndex + 1))
    .replace('{total}', String(favorites.length)));
}

/* ------------------------------------------------------------------
   Bookmarks drawer
   ------------------------------------------------------------------ */

function setupDrawer() {
  chipBookmarks?.addEventListener('click', () => {
    drawerOpen ? closeDrawer() : openDrawer(chipBookmarks);
  });
  drawerClose?.addEventListener('click', () => closeDrawer());

  drawerScrim?.addEventListener('click', (e) => {
    // The chip sits above the scrim; without this guard its own click would
    // close the drawer here and immediately reopen it in the chip handler.
    if (e.target.closest('#chip-bookmarks')) return;
    closeDrawer();
  });
}

/**
 * @param {HTMLElement|null} invoker - What to hand focus back to on close.
 */
async function openDrawer(invoker) {
  if (drawerOpen || !drawer) return;
  drawerOpen = true;
  drawerInvoker = invoker || chipBookmarks;

  // The tree is only built the first time it is asked for, which keeps
  // reading every bookmark off the critical path of every new tab.
  if (!bookmarksLoaded) {
    bookmarksLoaded = true;
    await loadBookmarks();
  }

  drawer.removeAttribute('inert');
  drawer.classList.add('open');
  drawerScrim?.classList.add('open');
  chipBookmarks?.setAttribute('aria-expanded', 'true');
  bookmarkSearch?.focus();
}

function closeDrawer() {
  if (!drawerOpen || !drawer) return;
  drawerOpen = false;

  // Blur before making the subtree inert, or focus is left on an element the
  // browser is about to remove from the accessibility tree.
  if (drawer.contains(document.activeElement)) document.activeElement.blur();

  drawer.classList.remove('open');
  drawerScrim?.classList.remove('open');
  drawer.setAttribute('inert', '');
  chipBookmarks?.setAttribute('aria-expanded', 'false');

  drawerInvoker?.focus?.();
  drawerInvoker = null;
}
