import {
  getSelectedProvider,
  setSelectedProvider,
  getProviderApiKey,
  setProviderApiKey,
  removeProviderApiKey,
  normalizeApiKey,
  checkKeyFormat,
  getLanguage,
  setLanguage,
  getDictionaryTranslationSettings,
  setDictionaryTranslationSettings,
  getSelectionPopupEnabled,
  setSelectionPopupEnabled,
  getTranslateOtherLanguages,
  setTranslateOtherLanguages,
  getConfirmPageTranslate,
  setConfirmPageTranslate,
  getPracticeSessionSize,
  setPracticeSessionSize,
  getFavorites,
  getTheme,
  setTheme
} from '../lib/storage.js';
import { PROVIDERS, PROVIDER_CONFIGS, STORAGE_KEYS, ACTIONS } from '../lib/constants.js';
import { translationCache } from '../lib/cache.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { renderKeyHelp, describeKeyTest, keyTestErrorResult, isKeyRejected, renderKeyTest, setKeyRevealed } from '../lib/key-help.js';
import { COMMAND_DESCRIPTIONS, getBoundShortcuts, shortcutKeys } from '../shared/shortcuts.js';
import {
  getHistory,
  getPolishHistory,
  getDictionaryHistory
} from '../lib/history.js';
import { applyThemeToRoot } from '../lib/theme.js';
import { formatNumber } from '../lib/format.js';
import { setupSectionNav } from './sections.js';
import { getMutedSites, addMutedSite, removeMutedSite } from '../lib/muted-sites.js';

// DOM Elements - Language
const aboutVersionEl = document.getElementById('about-version');
const langEnRadio = document.getElementById('lang-en');
const langFaRadio = document.getElementById('lang-fa');

// DOM Elements - Dictionary
const dictEnToFaCheckbox = document.getElementById('dict-en-to-fa');
const dictFaToEnCheckbox = document.getElementById('dict-fa-to-en');

// DOM Elements - Selection Popup
const selectionPopupToggle = document.getElementById('selection-popup-toggle');
const translateOtherLanguagesToggle = document.getElementById('translate-other-languages-toggle');

// DOM Elements - Block Translate
const blockTranslateToggle = document.getElementById('block-translate-toggle');

// DOM Elements - Whole-page confirmation (row hidden until Plan E) and muted sites
const confirmPageTranslateToggle = document.getElementById('confirm-page-translate-toggle');
const mutedSitesList = document.getElementById('muted-sites-list');
const mutedSitesEmpty = document.getElementById('muted-sites-empty');
const mutedSiteForm = document.getElementById('muted-site-form');
const mutedSiteInput = document.getElementById('muted-site-input');
const mutedSiteStatus = document.getElementById('muted-site-status');
const SVG_NS = 'http://www.w3.org/2000/svg';

// DOM Elements - Practice
const practiceSizeSlider = document.getElementById('practice-size-slider');
const practiceSizeValue = document.getElementById('practice-size-value');

// DOM Elements - Theme
const themeRadios = document.querySelectorAll('input[name="theme"]');
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

// DOM Elements - Provider cards
const providerRadios = document.querySelectorAll('input[name="provider"]');
const PROVIDER_IDS = [PROVIDERS.CLAUDE, PROVIDERS.GEMINI, PROVIDERS.OPENAI];

// DOM Elements - Cache
const cacheCountEl = document.getElementById('cache-count');
const clearCacheBtn = document.getElementById('clear-cache-btn');

// DOM Elements - Data Backup
const exportFavoritesCheckbox = document.getElementById('export-favorites');
const exportTranslationHistoryCheckbox = document.getElementById('export-translation-history');
const exportPolishHistoryCheckbox = document.getElementById('export-polish-history');
const exportDictionaryHistoryCheckbox = document.getElementById('export-dictionary-history');
const exportCacheCheckbox = document.getElementById('export-cache');
const exportBtn = document.getElementById('export-btn');
const importFileInput = document.getElementById('import-file');
const importBtn = document.getElementById('import-btn');
const backupStatusEl = document.getElementById('backup-status');

// Count display elements for backup
const favoritesCountEl = document.getElementById('favorites-count');
const translationHistoryCountEl = document.getElementById('translation-history-count');
const polishHistoryCountEl = document.getElementById('polish-history-count');
const dictionaryHistoryCountEl = document.getElementById('dictionary-history-count');
const cacheCountExportEl = document.getElementById('cache-count-export');

// Backup constants
const BACKUP_VERSION = '1.0';
// Read, not restated. This was a hardcoded literal that had to be edited in
// lockstep with the manifest, next to another copy of the same number in
// settings.html, which is exactly how a version goes stale in the UI while
// the manifest is correct.
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

// State
let currentLang = 'en';
let currentTheme = 'light';
// Per provider: whether a key is stored, and what its status line says as a
// function of the language, so a language change rewords both in place.
const keySaved = {};
const keyTestMessages = {};
// Providers whose Save & test is running; their card's buttons stay locked.
const testingProviders = new Set();
// The hosts the muted-sites chips show, and that card's status line as an
// i18n key with its values, so a language change rewords both in place.
let mutedSites = [];
let mutedSiteMessage = null;

/**
 * Initialize the settings page
 */
async function init() {
  await initTheme();
  await loadLanguage();
  await loadDictionarySettings();
  await loadSelectionPopupSetting();
  await loadTranslateOtherLanguagesSetting();
  await loadBlockTranslateSetting();
  await loadConfirmPageTranslateSetting();
  await loadMutedSites();
  await loadPracticeSetting();
  await loadProviderSettings();
  await loadAllApiKeyStatuses();
  mountKeyHelp();
  refreshKeyRevealButtons();
  await loadCacheStats();
  await loadDataCounts();
  await loadKeyboardShortcuts();
  if (aboutVersionEl) aboutVersionEl.textContent = EXTENSION_VERSION;
  setupEventListeners();
}

/**
 * Apply the stored theme (shared across all extension surfaces) and check
 * its radio.
 */
async function initTheme() {
  // Both conventions, always. This page styles dark with the class, but
  // lib/design-tokens.css also answers to [data-theme], and theme-boot sets
  // both. Clearing only the class leaves data-theme="dark" behind and the
  // tokens stay dark while the page's own rules go light.
  currentTheme = await getTheme();
  applyThemeToRoot(currentTheme);
  themeRadios.forEach((radio) => { radio.checked = radio.value === currentTheme; });
}

/**
 * Store the chosen theme, then show it. Stored in chrome.storage so the
 * popup, side panel and other pages follow.
 */
async function handleThemeChange(event) {
  currentTheme = event.target.value;
  await setTheme(currentTheme);
  applyThemeToRoot(currentTheme);
}

/**
 * System follows the operating system while the page is open, not only when
 * it loads.
 */
function handleSystemThemeChange() {
  if (currentTheme === 'system') applyThemeToRoot('system');
}

/**
 * Load and apply language preference
 */
async function loadLanguage() {
  currentLang = await getLanguage();

  if (currentLang === 'fa') {
    langFaRadio.checked = true;
  } else {
    langEnRadio.checked = true;
  }

  applyTranslations(currentLang);
}

/**
 * Render the global shortcuts from what Chrome actually bound.
 *
 * These used to be written out in the markup, which meant the page could
 * confidently name a key that does nothing: Chrome drops a suggested_key
 * another extension already claimed, and the user can clear or rebind any
 * of them. An unbound command now says so, and says why, next to the button
 * that fixes it.
 */
async function loadKeyboardShortcuts() {
  const list = document.getElementById('global-shortcuts-list');
  if (!list) return;

  const bound = await getBoundShortcuts();
  list.replaceChildren();

  Object.entries(COMMAND_DESCRIPTIONS).forEach(([command, descriptionKey]) => {
    const item = document.createElement('div');
    item.className = 'shortcut-item';

    const keys = document.createElement('span');
    keys.className = 'shortcut-keys';

    const parts = shortcutKeys(bound.get(command));
    if (parts.length === 0) {
      keys.classList.add('is-unset');
      keys.textContent = t('shortcutNotSet', currentLang);
      keys.title = t('shortcutNotSetHint', currentLang);
    } else {
      parts.forEach((key, index) => {
        if (index > 0) keys.appendChild(document.createTextNode(' + '));
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        keys.appendChild(kbd);
      });
    }

    const description = document.createElement('span');
    description.className = 'shortcut-desc';
    description.textContent = t(descriptionKey, currentLang);

    item.append(keys, description);
    list.appendChild(item);
  });
}

/**
 * Load dictionary translation settings
 */
async function loadDictionarySettings() {
  const settings = await getDictionaryTranslationSettings();
  dictEnToFaCheckbox.checked = settings.enToFa;
  dictFaToEnCheckbox.checked = settings.faToEn;
}

/**
 * Load selection popup setting
 */
async function loadSelectionPopupSetting() {
  const enabled = await getSelectionPopupEnabled();
  selectionPopupToggle.checked = enabled;
}

/**
 * Load the "translate other languages" setting
 */
async function loadTranslateOtherLanguagesSetting() {
  translateOtherLanguagesToggle.checked = await getTranslateOtherLanguages();
}

/**
 * Load the block translate setting. Block translate manages its own storage
 * wiring in content/blocks/index.js rather than through lib/storage.js, so
 * this reads the same raw key directly instead of going through a getter.
 */
async function loadBlockTranslateSetting() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.blockTranslate);
  blockTranslateToggle.checked = stored[STORAGE_KEYS.blockTranslate] ?? true;
}

/**
 * Load the "ask before translating a whole page" setting. Its row ships
 * hidden until Plan E's confirmation reads the preference.
 */
async function loadConfirmPageTranslateSetting() {
  confirmPageTranslateToggle.checked = await getConfirmPageTranslate();
}

/**
 * Read the muted hosts into their chips
 */
async function loadMutedSites() {
  renderMutedSites(await getMutedSites());
}

/**
 * Show the muted hosts as chips, or the empty line when there are none.
 * A chip that had keyboard focus keeps it when its host is still listed;
 * when its host went away (unmuted here or elsewhere), focus moves on by
 * the same rule as unmuting.
 * @param {string[]} list
 */
function renderMutedSites(list) {
  const active = document.activeElement;
  const focusedHost = mutedSitesList.contains(active) ? active.dataset.host : undefined;
  const focusedIndex = mutedSites.indexOf(focusedHost);

  mutedSites = [...list];
  mutedSitesList.replaceChildren(...mutedSites.map(createMutedChip));
  mutedSitesList.hidden = mutedSites.length === 0;
  mutedSitesEmpty.hidden = mutedSites.length > 0;

  if (focusedHost === undefined) return;
  const sameChip = [...mutedSitesList.querySelectorAll('.muted-chip-remove')]
    .find((button) => button.dataset.host === focusedHost);
  if (sameChip) {
    sameChip.focus();
  } else {
    focusAfterUnmute(focusedIndex);
  }
}

/**
 * One chip: the host as an ltr run, then its unmute button. Built from
 * nodes, never markup, since the host is user input.
 * @param {string} host
 * @returns {HTMLLIElement}
 */
function createMutedChip(host) {
  const item = document.createElement('li');
  item.className = 'muted-chip';

  const name = document.createElement('bdi');
  name.className = 'muted-chip-host';
  name.setAttribute('dir', 'ltr');
  name.textContent = host;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'muted-chip-remove';
  button.dataset.host = host;
  button.setAttribute('aria-label', t('unmuteSite', currentLang).replace('{host}', host));
  button.append(createCloseIcon());

  item.append(name, button);
  return item;
}

/**
 * The unmute button's cross
 * @returns {SVGSVGElement}
 */
function createCloseIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  svg.append(path);
  return svg;
}

/**
 * After a chip goes, focus the chip that took its place, else the one
 * before it, else the add field.
 * @param {number} index The removed chip's position
 */
function focusAfterUnmute(index) {
  const buttons = mutedSitesList.querySelectorAll('.muted-chip-remove');
  const target = buttons.length > 0 ? buttons[Math.min(Math.max(index, 0), buttons.length - 1)] : mutedSiteInput;
  target.focus();
}

/**
 * Show a message in the muted-sites status line, or clear it with null
 * @param {string | null} key
 * @param {Record<string, string>} [values] Placeholder values, shown as ltr runs
 * @param {'ok'|'error'|'info'} [tone]
 */
function setMutedSiteMessage(key, values = {}, tone = 'info') {
  mutedSiteMessage = key ? { key, values, tone } : null;
  renderMutedSiteMessage();
}

/**
 * Write the status line in the UI language. Each {placeholder} becomes a
 * <bdi dir="ltr">, so a host keeps its own order inside Persian text.
 */
function renderMutedSiteMessage() {
  if (!mutedSiteMessage) {
    mutedSiteStatus.replaceChildren();
    mutedSiteStatus.dataset.state = '';
    return;
  }
  const { key, values, tone } = mutedSiteMessage;
  const parts = t(key, currentLang).split(/(\{\w+\})/).filter(Boolean);
  mutedSiteStatus.replaceChildren(...parts.map((part) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    if (!name || !(name in values)) return document.createTextNode(part);
    const run = document.createElement('bdi');
    run.setAttribute('dir', 'ltr');
    run.textContent = values[name];
    return run;
  }));
  mutedSiteStatus.dataset.state = tone;
}

/**
 * Load the practice session size
 */
async function loadPracticeSetting() {
  const size = await getPracticeSessionSize();
  practiceSizeSlider.value = size;
  showPracticeSize(size);
}

/**
 * Show the slider's value in the page language's numerals
 */
function showPracticeSize(size) {
  practiceSizeValue.textContent = formatNumber(size, currentLang);
}

/**
 * Check the radio of the provider Translate uses
 */
async function loadProviderSettings() {
  const provider = await getSelectedProvider();
  const providerRadio = document.getElementById(`provider-${provider}`);
  if (providerRadio) {
    providerRadio.checked = true;
  }
}

/**
 * Put the "How do I get a key?" block under each provider's key field, in the
 * interface language. Called again when that language changes.
 */
function mountKeyHelp() {
  for (const provider of PROVIDER_IDS) {
    document.getElementById(`${provider}-key-help`)?.replaceChildren(renderKeyHelp(provider, currentLang));
  }
}

/**
 * A status line message from one i18n key.
 * @param {string} key
 * @param {'ok'|'error'|'pending'|'info'} tone
 * @returns {(lang: string) => {tone: string, text: string}}
 */
function keyMessage(key, tone) {
  return (lang) => ({ tone, text: t(key, lang) });
}

/**
 * Show a message in one provider's status line, under its key field. Nothing
 * else on the page reports key results.
 * @param {string} provider
 * @param {((lang: string) => {tone: string, text: string, ltr?: string[]}) | null} describe - null clears it
 */
function setKeyTestStatus(provider, describe) {
  keyTestMessages[provider] = describe;
  const el = document.getElementById(`${provider}-key-test`);
  if (!el) return;
  if (describe) {
    renderKeyTest(el, describe(currentLang));
  } else {
    el.textContent = '';
    el.dataset.state = '';
  }
}

/**
 * Load the key state of every provider card
 */
async function loadAllApiKeyStatuses() {
  for (const provider of PROVIDER_IDS) {
    await updateKeyStatus(provider);
  }
}

/**
 * Show "Key saved" or "No key yet" on a provider card
 */
function renderKeyState(provider) {
  const el = document.getElementById(`${provider}-key-state`);
  if (el) {
    el.dataset.state = keySaved[provider] ? 'saved' : 'missing';
    el.textContent = t(keySaved[provider] ? 'keyConfigured' : 'keyNotConfigured', currentLang);
  }
  syncCardButtons(provider);
}

/**
 * Lock a card's Save & test and Clear while its test runs, and offer Clear
 * only when there is a stored key to remove.
 */
function syncCardButtons(provider) {
  const testing = testingProviders.has(provider);
  const save = document.querySelector(`.save-key-btn[data-provider="${provider}"]`);
  const clear = document.querySelector(`.clear-key-btn[data-provider="${provider}"]`);
  if (save) save.disabled = testing;
  if (clear) clear.disabled = testing || !keySaved[provider];
}

/**
 * Read a provider's stored key into its card: the key state, and the key
 * itself into the field
 */
async function updateKeyStatus(provider) {
  const key = await getProviderApiKey(provider);
  keySaved[provider] = Boolean(key);
  renderKeyState(provider);

  const input = getApiKeyInput(provider);
  if (input && key) {
    input.value = key;
  }
}

/**
 * Get the API key input element for a provider
 */
function getApiKeyInput(provider) {
  return document.getElementById(`${provider}-api-key`);
}

/**
 * Get the reveal button of a provider's key field
 */
function getRevealButton(provider) {
  return document.querySelector(`.key-reveal[aria-controls="${provider}-api-key"]`);
}

/**
 * Label every reveal button for its field's current state in the UI language
 */
function refreshKeyRevealButtons() {
  for (const provider of PROVIDER_IDS) {
    const input = getApiKeyInput(provider);
    const button = getRevealButton(provider);
    if (input && button) setKeyRevealed(input, button, input.type === 'text', currentLang);
  }
}

/**
 * Reword everything the provider cards set from script in the UI language
 */
function refreshProviderCards() {
  for (const provider of PROVIDER_IDS) {
    renderKeyState(provider);
    setKeyTestStatus(provider, keyTestMessages[provider] || null);
  }
  refreshKeyRevealButtons();
}

/**
 * Load and display cache statistics
 */
async function loadCacheStats() {
  const stats = await translationCache.getStats();

  if (stats.size === 0) {
    cacheCountEl.textContent = t('itemsCount', currentLang).replace('{n}', '0');
  } else {
    cacheCountEl.textContent = t('itemsCount', currentLang).replace('{n}', String(stats.size));
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Section nav and deep links. Wired after init's loads, so the page has its
  // final height before it scrolls to the section the URL names.
  setupSectionNav();

  // Theme
  themeRadios.forEach((radio) => radio.addEventListener('change', handleThemeChange));
  systemDarkQuery.addEventListener('change', handleSystemThemeChange);

  // Language selection
  langEnRadio.addEventListener('change', () => handleLanguageChange('en'));
  langFaRadio.addEventListener('change', () => handleLanguageChange('fa'));

  // Dictionary translation settings
  dictEnToFaCheckbox.addEventListener('change', handleDictionarySettingChange);
  dictFaToEnCheckbox.addEventListener('change', handleDictionarySettingChange);

  // Selection popup setting
  selectionPopupToggle.addEventListener('change', handleSelectionPopupChange);
  translateOtherLanguagesToggle.addEventListener('change', handleTranslateOtherLanguagesChange);

  // Block translate setting
  blockTranslateToggle.addEventListener('change', handleBlockTranslateChange);

  // Whole-page confirmation and muted sites
  confirmPageTranslateToggle.addEventListener('change', handleConfirmPageTranslateChange);
  mutedSiteForm.addEventListener('submit', handleMutedSiteSubmit);
  mutedSiteInput.addEventListener('input', handleMutedSiteInput);
  mutedSitesList.addEventListener('click', handleUnmuteClick);
  // A mute made elsewhere, such as from the page itself, shows up live
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.mutedSites]) loadMutedSites();
  });

  // Practice session size: the label follows the thumb, storage waits for release
  practiceSizeSlider.addEventListener('input', () => showPracticeSize(Number(practiceSizeSlider.value)));
  practiceSizeSlider.addEventListener('change', handlePracticeSizeChange);

  // Provider selection
  providerRadios.forEach(radio => {
    radio.addEventListener('change', handleProviderChange);
  });

  // Provider cards: reveal, Enter, Save & test and Clear each act on their own
  // card's provider only
  for (const provider of PROVIDER_IDS) {
    const input = getApiKeyInput(provider);
    const revealButton = getRevealButton(provider);
    revealButton?.addEventListener('click', () => {
      setKeyRevealed(input, revealButton, input.type === 'password', currentLang);
    });

    // Enter in a key field is that card's Save & test.
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSaveApiKey(provider);
    });
  }
  document.querySelectorAll('.save-key-btn').forEach(btn => {
    btn.addEventListener('click', () => handleSaveApiKey(btn.dataset.provider));
  });
  document.querySelectorAll('.clear-key-btn').forEach(btn => {
    btn.addEventListener('click', () => handleClearApiKey(btn.dataset.provider));
  });

  // Clear cache
  clearCacheBtn.addEventListener('click', handleClearCache);

  // Data Backup
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
  }
  if (importBtn) {
    importBtn.addEventListener('click', handleImport);
  }
  if (importFileInput) {
    importFileInput.addEventListener('change', processImportFile);
  }

  // Customize Shortcuts button
  const customizeShortcutsBtn = document.getElementById('customizeShortcutsBtn');
  if (customizeShortcutsBtn) {
    customizeShortcutsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  // Welcome Guide button
  const welcomeGuideBtn = document.getElementById('welcome-guide-btn');
  if (welcomeGuideBtn) {
    welcomeGuideBtn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('welcome/welcome.html')
      });
    });
  }
}

/**
 * Handle language change
 */
async function handleLanguageChange(lang) {
  currentLang = lang;
  await setLanguage(lang);
  applyTranslations(lang);
  mountKeyHelp();
  refreshProviderCards();
  renderMutedSites(mutedSites);
  renderMutedSiteMessage();
  showPracticeSize(Number(practiceSizeSlider.value));
  await loadCacheStats();
}

/**
 * Handle dictionary translation setting change
 */
async function handleDictionarySettingChange() {
  const enToFa = dictEnToFaCheckbox.checked;
  const faToEn = dictFaToEnCheckbox.checked;
  await setDictionaryTranslationSettings(enToFa, faToEn);
}

/**
 * Handle selection popup setting change
 */
async function handleSelectionPopupChange() {
  const enabled = selectionPopupToggle.checked;
  await setSelectionPopupEnabled(enabled);
}

/**
 * Handle "translate other languages" setting change
 */
async function handleTranslateOtherLanguagesChange() {
  await setTranslateOtherLanguages(translateOtherLanguagesToggle.checked);
}

/**
 * Handle block translate setting change
 */
async function handleBlockTranslateChange() {
  await chrome.storage.local.set({ [STORAGE_KEYS.blockTranslate]: blockTranslateToggle.checked });
}

/**
 * Handle the "ask before translating a whole page" change
 */
async function handleConfirmPageTranslateChange() {
  await setConfirmPageTranslate(confirmPageTranslateToggle.checked);
}

/**
 * Mute the site in the add field. Invalid input and a site already muted
 * are reported in the status line; focus stays in the field either way.
 * @param {SubmitEvent} event
 */
async function handleMutedSiteSubmit(event) {
  event.preventDefault();
  const before = await getMutedSites();
  const host = await addMutedSite(mutedSiteInput.value);

  if (!host) {
    mutedSiteInput.setAttribute('aria-invalid', 'true');
    setMutedSiteMessage('mutedSiteInvalid', { example: 'example.com' }, 'error');
  } else if (before.includes(host)) {
    mutedSiteInput.removeAttribute('aria-invalid');
    setMutedSiteMessage('mutedSiteDuplicate', { host });
  } else {
    mutedSiteInput.removeAttribute('aria-invalid');
    mutedSiteInput.value = '';
    renderMutedSites(await getMutedSites());
    setMutedSiteMessage('mutedSiteAdded', { host }, 'ok');
  }
  mutedSiteInput.focus();
}

/**
 * Editing the field withdraws an invalid-input report
 */
function handleMutedSiteInput() {
  if (!mutedSiteInput.hasAttribute('aria-invalid')) return;
  mutedSiteInput.removeAttribute('aria-invalid');
  setMutedSiteMessage(null);
}

/**
 * Unmute the chip whose button was pressed, then move focus on
 * @param {MouseEvent} event
 */
async function handleUnmuteClick(event) {
  const button = event.target.closest('.muted-chip-remove');
  if (!button) return;
  const host = button.dataset.host;
  const index = mutedSites.indexOf(host);
  await removeMutedSite(host);
  renderMutedSites(await getMutedSites());
  focusAfterUnmute(index);
  setMutedSiteMessage('mutedSiteRemoved', { host }, 'ok');
}

/**
 * Handle practice session size change
 */
async function handlePracticeSizeChange() {
  const size = await setPracticeSessionSize(practiceSizeSlider.value);
  practiceSizeSlider.value = size;
  showPracticeSize(size);
}

/**
 * Store the provider whose radio was picked. The selected card is the
 * feedback, so success says nothing; a failure shows on that card.
 */
async function handleProviderChange(e) {
  const provider = e.target.value;
  try {
    await setSelectedProvider(provider);
  } catch (error) {
    console.error('Could not store the provider choice:', error);
    setKeyTestStatus(provider, keyMessage('errorUnknown', 'error'));
    // Check the radio of the provider that is still stored, so the page does
    // not claim a choice that did not take.
    await loadProviderSettings();
  }
}

/**
 * Test the key typed into one provider's card with one real request, then
 * store it. Only that provider is tested, and only on this click (or Enter in
 * its field). A key with the wrong prefix is turned away before any request.
 * The typed key is stored only when the provider accepts it, or when the test
 * reaches no verdict (offline, timeout, rate limit, outage, unknown), and then
 * the status says it is untested. A key the provider rejects is never stored,
 * so the key already stored and its badge stay as they were. The result shows
 * under the field, and focus goes back into the field when the key was not
 * stored.
 */
async function handleSaveApiKey(provider) {
  const input = getApiKeyInput(provider);
  if (!input || testingProviders.has(provider)) return;

  const key = normalizeApiKey(input.value);
  if (!key) {
    setKeyTestStatus(provider, keyMessage('pleaseEnterApiKey', 'error'));
    input.focus();
    return;
  }

  const formatProblem = checkKeyFormat(provider, key);
  if (formatProblem) {
    setKeyTestStatus(provider, (lang) => describeKeyTest(formatProblem, lang, provider));
    input.focus();
    return;
  }

  testingProviders.add(provider);
  syncCardButtons(provider);
  setKeyTestStatus(provider, keyMessage('keyTesting', 'pending'));
  let result;
  let stored = false;
  try {
    result = await chrome.runtime.sendMessage({ action: ACTIONS.TEST_API_KEY, provider, key });
  } catch (error) {
    result = keyTestErrorResult(error);
  }
  try {
    if (!isKeyRejected(result)) {
      await setProviderApiKey(provider, key);
      stored = true;
      await updateKeyStatus(provider);
    }
  } catch (error) {
    result = keyTestErrorResult(error);
  } finally {
    testingProviders.delete(provider);
    syncCardButtons(provider);
  }

  const untested = stored && !result?.ok;
  setKeyTestStatus(provider, (lang) => describeKeyTest(result, lang, provider, { stored: untested }));
  if (!stored) input.focus();
}

/**
 * Remove one provider's stored key after a confirmation. Clear is disabled
 * while there is no stored key or a test is running.
 */
async function handleClearApiKey(provider) {
  if (!keySaved[provider] || testingProviders.has(provider)) return;
  const input = getApiKeyInput(provider);
  const config = PROVIDER_CONFIGS[provider];

  if (!confirm(t('confirmClearApiKey', currentLang).replace('{provider}', config.name))) return;

  await removeProviderApiKey(provider);
  if (input) input.value = '';
  await updateKeyStatus(provider);
  setKeyTestStatus(provider, keyMessage('keyCleared', 'info'));
}

/**
 * Handle clear cache button click
 */
async function handleClearCache() {
  // Confirm before clearing
  if (!confirm(t('confirmClearCache', currentLang))) {
    return;
  }

  await translationCache.clear();
  await loadCacheStats();
  showBackupStatus(t('cacheCleared', currentLang), 'success');
}

// ============================================
// Data Backup Functions
// ============================================

/**
 * Load and display data counts for export checkboxes
 */
async function loadDataCounts() {
  try {
    // Favorites count
    const favorites = await getFavorites();
    if (favoritesCountEl) {
      favoritesCountEl.textContent = `(${favorites.length})`;
    }

    // Translation history count
    const translationHistory = await getHistory();
    if (translationHistoryCountEl) {
      translationHistoryCountEl.textContent = `(${translationHistory.length})`;
    }

    // Polish history count
    const polishHistory = await getPolishHistory();
    if (polishHistoryCountEl) {
      polishHistoryCountEl.textContent = `(${polishHistory.length})`;
    }

    // Dictionary history count
    const dictionaryHistory = await getDictionaryHistory();
    if (dictionaryHistoryCountEl) {
      dictionaryHistoryCountEl.textContent = `(${dictionaryHistory.length})`;
    }

    // Translation cache count
    const cacheStats = await translationCache.getStats();
    if (cacheCountExportEl) {
      cacheCountExportEl.textContent = `(${cacheStats.size})`;
    }
  } catch (error) {
    console.error('Error loading data counts:', error);
  }
}

/**
 * Export selected data to JSON file
 */
async function handleExport() {
  // Check if at least one option is selected
  const exportOptions = {
    favorites: exportFavoritesCheckbox?.checked,
    translationHistory: exportTranslationHistoryCheckbox?.checked,
    polishHistory: exportPolishHistoryCheckbox?.checked,
    dictionaryHistory: exportDictionaryHistoryCheckbox?.checked,
    cache: exportCacheCheckbox?.checked
  };

  if (!Object.values(exportOptions).some(v => v)) {
    showBackupStatus(t('noDataSelected', currentLang), 'error');
    return;
  }

  try {
    const exportData = {
      meta: {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        extensionVersion: EXTENSION_VERSION,
        source: 'ParsiPad'
      },
      data: {}
    };

    // Gather selected data
    if (exportOptions.favorites) {
      exportData.data.favorites = await getFavorites();
    }

    if (exportOptions.translationHistory) {
      exportData.data.translationHistory = await getHistory();
    }

    if (exportOptions.polishHistory) {
      exportData.data.polishHistory = await getPolishHistory();
    }

    if (exportOptions.dictionaryHistory) {
      exportData.data.dictionaryHistory = await getDictionaryHistory();
    }

    if (exportOptions.cache) {
      const cacheData = await chrome.storage.local.get([
        STORAGE_KEYS.translationCache,
        STORAGE_KEYS.dictionaryCache
      ]);
      exportData.data.translationCache = cacheData[STORAGE_KEYS.translationCache] || {};
      exportData.data.dictionaryCache = cacheData[STORAGE_KEYS.dictionaryCache] || {};
    }

    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `parsipad-backup-${date}.json`;

    // Create and download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showBackupStatus(t('exportSuccess', currentLang), 'success');
  } catch (error) {
    console.error('Export error:', error);
    showBackupStatus(t('importFailed', currentLang), 'error');
  }
}

/**
 * Validate backup file structure
 * @param {Object} data - Parsed JSON data
 * @returns {boolean}
 */
function validateBackupFile(data) {
  // Check meta object exists
  if (!data || typeof data !== 'object') return false;
  if (!data.meta || typeof data.meta !== 'object') return false;
  if (!data.meta.source || data.meta.source !== 'ParsiPad') return false;
  if (!data.meta.version) return false;
  if (!data.data || typeof data.data !== 'object') return false;

  // Validate data arrays if present
  if (data.data.favorites && !Array.isArray(data.data.favorites)) return false;
  if (data.data.translationHistory && !Array.isArray(data.data.translationHistory)) return false;
  if (data.data.polishHistory && !Array.isArray(data.data.polishHistory)) return false;
  if (data.data.dictionaryHistory && !Array.isArray(data.data.dictionaryHistory)) return false;

  // Cache should be objects
  if (data.data.translationCache && typeof data.data.translationCache !== 'object') return false;
  if (data.data.dictionaryCache && typeof data.data.dictionaryCache !== 'object') return false;

  return true;
}

/**
 * Merge arrays by unique identifier
 * @param {Array} existing - Existing array
 * @param {Array} imported - Imported array
 * @param {string} idField - Field to use as unique identifier
 * @returns {Array}
 */
function mergeArraysById(existing, imported, idField = 'id') {
  const existingIds = new Set(existing.map(item => item[idField]));
  const newItems = imported.filter(item => !existingIds.has(item[idField]));
  return [...newItems, ...existing]; // New items first, then existing
}

/**
 * Merge cache objects
 * @param {Object} existing - Existing cache
 * @param {Object} imported - Imported cache
 * @returns {Object}
 */
function mergeCacheObjects(existing, imported) {
  return { ...imported, ...existing }; // Existing takes precedence
}

/**
 * Handle file import button click
 */
function handleImport() {
  importFileInput?.click();
}

/**
 * Process imported file
 */
async function processImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedData = JSON.parse(text);

    // Validate file structure
    if (!validateBackupFile(importedData)) {
      showBackupStatus(t('invalidBackupFile', currentLang), 'error');
      importFileInput.value = ''; // Reset file input
      return;
    }

    // Get import strategy
    const strategyRadio = document.querySelector('input[name="import-strategy"]:checked');
    const strategy = strategyRadio?.value || 'merge';
    const isReplace = strategy === 'replace';
    if (isReplace && !confirm(t('confirmReplaceImport', currentLang))) {
      // Cleared so choosing the same file again fires change.
      if (importFileInput) importFileInput.value = '';
      return;
    }

    let totalImported = 0;
    const { data } = importedData;

    // Import favorites
    if (data.favorites && data.favorites.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.favorites]: data.favorites });
        totalImported += data.favorites.length;
      } else {
        const existing = await getFavorites();
        const merged = mergeArraysById(existing, data.favorites, 'id');
        await chrome.storage.local.set({ [STORAGE_KEYS.favorites]: merged });
        totalImported += data.favorites.length;
      }
    }

    // Import translation history
    if (data.translationHistory && data.translationHistory.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.translationHistory]: data.translationHistory });
        totalImported += data.translationHistory.length;
      } else {
        const existing = await getHistory();
        const merged = mergeArraysById(existing, data.translationHistory, 'id');
        // Limit to 50 items (MAX_HISTORY_SIZE)
        await chrome.storage.local.set({
          [STORAGE_KEYS.translationHistory]: merged.slice(0, 50)
        });
        totalImported += data.translationHistory.length;
      }
    }

    // Import polish history
    if (data.polishHistory && data.polishHistory.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.polishHistory]: data.polishHistory });
        totalImported += data.polishHistory.length;
      } else {
        const existing = await getPolishHistory();
        const merged = mergeArraysById(existing, data.polishHistory, 'id');
        await chrome.storage.local.set({
          [STORAGE_KEYS.polishHistory]: merged.slice(0, 50)
        });
        totalImported += data.polishHistory.length;
      }
    }

    // Import dictionary history
    if (data.dictionaryHistory && data.dictionaryHistory.length > 0) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.dictionaryHistory]: data.dictionaryHistory });
        totalImported += data.dictionaryHistory.length;
      } else {
        const existing = await getDictionaryHistory();
        const merged = mergeArraysById(existing, data.dictionaryHistory, 'id');
        await chrome.storage.local.set({
          [STORAGE_KEYS.dictionaryHistory]: merged.slice(0, 50)
        });
        totalImported += data.dictionaryHistory.length;
      }
    }

    // Import caches
    if (data.translationCache) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.translationCache]: data.translationCache });
      } else {
        const existing = await chrome.storage.local.get(STORAGE_KEYS.translationCache);
        const merged = mergeCacheObjects(
          existing[STORAGE_KEYS.translationCache] || {},
          data.translationCache
        );
        await chrome.storage.local.set({ [STORAGE_KEYS.translationCache]: merged });
      }
      totalImported += Object.keys(data.translationCache).length;
    }

    if (data.dictionaryCache) {
      if (isReplace) {
        await chrome.storage.local.set({ [STORAGE_KEYS.dictionaryCache]: data.dictionaryCache });
      } else {
        const existing = await chrome.storage.local.get(STORAGE_KEYS.dictionaryCache);
        const merged = mergeCacheObjects(
          existing[STORAGE_KEYS.dictionaryCache] || {},
          data.dictionaryCache
        );
        await chrome.storage.local.set({ [STORAGE_KEYS.dictionaryCache]: merged });
      }
      totalImported += Object.keys(data.dictionaryCache).length;
    }

    // Refresh UI
    await loadDataCounts();
    await loadCacheStats();

    // Show success message
    const message = t('itemsImported', currentLang).replace('{n}', totalImported);
    showBackupStatus(message, 'success');

  } catch (error) {
    console.error('Import error:', error);
    showBackupStatus(t('importFailed', currentLang), 'error');
  }

  // Reset file input
  if (importFileInput) {
    importFileInput.value = '';
  }
}

/**
 * Show backup status message
 */
function showBackupStatus(message, type) {
  if (!backupStatusEl) return;

  backupStatusEl.textContent = message;
  backupStatusEl.className = `status-message ${type}`;
  backupStatusEl.hidden = false;

  setTimeout(() => {
    backupStatusEl.hidden = true;
  }, 4000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
