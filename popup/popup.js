import { getTextDirection, detectLanguage } from '../lib/language-detect.js';
import { requestTranslation } from '../lib/translation/client.js';
import { getHistory, clearHistory, getPolishHistory, clearPolishHistory, getDictionaryHistory, clearDictionaryHistory } from '../lib/history.js';
import { getTheme, setTheme, getUsageStats, updateUsageStats, resetUsageStats, getLanguage, getSelectedProvider, setSelectedProvider, getProviderApiKey, setProviderApiKey, getFavorites, isFavorite, claimReviewPrompt, respondToReviewPrompt } from '../lib/storage.js';
import { PROVIDER_CONFIGS, ACTIONS, STORE_REVIEWS_URL, STORAGE_KEYS } from '../lib/constants.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { setSafeInnerHTML } from '../lib/sanitize.js';
import { renderCard, injectCardStyles } from '../shared/card/index.js';
import { canSpeak, speak, cancelSpeech } from '../shared/speech.js';
import { applySourceOverride } from '../shared/source-override.js';
import { getBoundShortcuts } from '../shared/shortcuts.js';
import { applyThemeToRoot } from '../lib/theme.js';
import { directionLabel } from '../lib/direction-label.js';
import { getProviderHealth, healthTone } from '../lib/provider-health.js';
import { renderKeyHelp, keyTestOkText, keyTestFailedText } from '../lib/key-help.js';

// The popup script also runs inside the side panel, which must stay open.
const isPanel = document.body.dataset.surface === 'panel';

// DOM Elements
const openSidePanelBtn = document.getElementById('open-sidepanel-btn');
const settingsBtn = document.getElementById('settings-btn');
const providerBadge = document.getElementById('provider-badge');
const providerBadgeName = document.getElementById('provider-badge-name');
// First-run key setup
const firstRun = document.getElementById('first-run');
const firstRunKey = document.getElementById('first-run-key');
const firstRunReveal = document.getElementById('first-run-reveal');
const firstRunTest = document.getElementById('first-run-test');
const firstRunStatus = document.getElementById('first-run-status');
const firstRunHelp = document.getElementById('first-run-help');
const firstRunProviders = document.querySelectorAll('input[name="first-run-provider"]');
// Tab elements (4 main tabs)
const tabText = document.getElementById('tab-text');
const tabDictionary = document.getElementById('tab-dictionary');
const tabDocument = document.getElementById('tab-document');
const tabImage = document.getElementById('tab-image');
// Segmented control for Text tab (Translate/Polish)
const modeTranslate = document.getElementById('mode-translate');
const modePolish = document.getElementById('mode-polish');
const textModeSection = document.getElementById('text-mode-section');
const inputText = document.getElementById('input-text');
const charCount = document.getElementById('char-count');
const clearInputBtn = document.getElementById('clear-input-btn');
const actionBtn = document.getElementById('action-btn');
const btnText = actionBtn.querySelector('.btn-text');
const btnLoading = actionBtn.querySelector('.btn-loading');
const outputSection = document.getElementById('output-section');
const cardSlot = document.getElementById('card-slot');
const polishSection = document.getElementById('polish-section');
const polishProfessional = document.getElementById('polish-professional');
const polishConversational = document.getElementById('polish-conversational');
const polishConcise = document.getElementById('polish-concise');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const statusLine = document.getElementById('status-line');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const viewAllHistoryBtn = document.getElementById('view-all-history-btn');
const polishHistorySection = document.getElementById('polish-history-section');
const polishHistoryList = document.getElementById('polish-history-list');
const clearPolishHistoryBtn = document.getElementById('clear-polish-history-btn');
const viewAllPolishHistoryBtn = document.getElementById('view-all-polish-history-btn');
// Dictionary elements
const dictionarySection = document.getElementById('dictionary-section');
const dictWord = document.getElementById('dict-word');
const dictPhonetic = document.getElementById('dict-phonetic');
const dictPos = document.getElementById('dict-pos');
const dictDefinitions = document.getElementById('dict-definitions');
const dictSynonymsSection = document.getElementById('dict-synonyms-section');
const dictSynonyms = document.getElementById('dict-synonyms');
const dictAntonymsSection = document.getElementById('dict-antonyms-section');
const dictAntonyms = document.getElementById('dict-antonyms');
const dictTranslationSection = document.getElementById('dict-translation-section');
const dictTranslation = document.getElementById('dict-translation');
const dictCopyBtn = document.getElementById('dict-copy-btn');
const dictionaryHistorySection = document.getElementById('dictionary-history-section');
const dictionaryHistoryList = document.getElementById('dictionary-history-list');
const clearDictHistoryBtn = document.getElementById('clear-dict-history-btn');
// Document elements
const documentUploadSection = document.getElementById('document-upload-section');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const selectFileBtn = document.getElementById('select-file-btn');
const documentInfo = document.getElementById('document-info');
const docName = document.getElementById('doc-name');
const docSize = document.getElementById('doc-size');
const removeFileBtn = document.getElementById('remove-file-btn');
const translationProgress = document.getElementById('translation-progress');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');
const progressChunks = document.getElementById('progress-chunks');
const downloadSection = document.getElementById('download-section');
const downloadBtn = document.getElementById('download-btn');
const cancelTranslationBtn = document.getElementById('cancel-translation-btn');
const translateDocBtn = document.getElementById('translate-doc-btn');
// Grammar elements
const grammarToggleSection = document.getElementById('grammar-toggle-section');
const grammarCheckbox = document.getElementById('grammar-checkbox');
// The card currently rendered in the slot. Grammar points are appended to
// it after the fact, so the host needs to be able to find it again.
let currentCardEl = null;
// A user who opens the other meanings keeps them open until the popup closes.
let sensesExpandedForSession = false;
// The correction the user last made with the swap control, as the pair it
// was made against. See shared/source-override.js for why it is a pair and
// not just a language.
let manualSourceOverride = null;
// Whether what is on screen is already in favourites, so the save control is
// drawn in a known state rather than left stateless until the check returns.
let translationIsSaved = false;
// Image elements
const imageUploadSection = document.getElementById('image-upload-section');
const imageUploadArea = document.getElementById('image-upload-area');
const imageInput = document.getElementById('image-input');
const selectImageBtn = document.getElementById('select-image-btn');
const screenshotTranslateBtn = document.getElementById('screenshot-translate-btn');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const removeImageBtn = document.getElementById('remove-image-btn');
const translateImageBtn = document.getElementById('translate-image-btn');
const imageResult = document.getElementById('image-result');
const extractedText = document.getElementById('extracted-text');
const imageDirectionBadge = document.getElementById('image-direction-badge');
const imageTranslation = document.getElementById('image-translation');
const imageCopyBtn = document.getElementById('image-copy-btn');
const imageProviderBadge = document.getElementById('image-provider-badge');
// Provider badges
const polishProviderBadge = document.getElementById('polish-provider-badge');
const dictProviderBadge = document.getElementById('dict-provider-badge');
const themeBtn = document.getElementById('theme-btn');
const statsToggle = document.getElementById('stats-toggle');
const statsContent = document.getElementById('stats-content');
const statTranslations = document.getElementById('stat-translations');
const statPolishes = document.getElementById('stat-polishes');
const statInputTokens = document.getElementById('stat-input-tokens');
const statOutputTokens = document.getElementById('stat-output-tokens');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const analyticsBtn = document.getElementById('analytics-btn');
// Favorites elements
const viewFavoritesBtn = document.getElementById('view-favorites-btn');
const favoritesCount = document.getElementById('favorites-count');
// Review prompt elements
const reviewPromptBanner = document.getElementById('review-prompt-banner');
const reviewRateBtn = document.getElementById('review-rate-btn');
const reviewLaterBtn = document.getElementById('review-later-btn');
const reviewDismissBtn = document.getElementById('review-dismiss-btn');
const reviewNeverBtn = document.getElementById('review-never-btn');

// State
let isProcessing = false;
// True while the selected provider has no key. Translate stays off until then.
let needsKey = false;
// True from saving a first-run key until its test result has been shown, so
// the key landing in storage does not hide the section before the user sees it.
let firstRunHold = false;
let currentTab = 'text'; // 'text', 'dictionary', 'document', or 'image'
let currentTextMode = 'translate'; // 'translate' or 'polish' (for text tab)
let currentLang = 'en';
let uploadedFile = null;
let translatedContent = null;
let docTranslationPort = null;
let selectedImage = null;
let currentPolishHistoryId = null; // Track the current polish history entry
let currentPolishOriginalText = null; // Track the original text for polish
let currentTranslationData = null; // Track current translation for grammar page

// Computed mode for backwards compatibility
function getCurrentMode() {
  if (currentTab === 'text') {
    return currentTextMode;
  }
  return currentTab;
}

/**
 * Initialize the popup
 */
async function init() {
  await initLanguage();
  await initTheme();
  await annotateShortcuts();
  await renderProviderBadge();
  // The card's rules live in a JS string so the floating box can put them
  // inside a closed shadow root; the popup takes the same string into its
  // own document. popup.css maps the four tokens they consume.
  injectCardStyles(document.head, document);
  await checkApiKey();
  await loadHistory();
  await loadStats();
  await loadFavoritesCount();
  setupEventListeners();
  updateCharCount();
  updateTab('text');
  updateTextMode('translate');
}

/**
 * "2 minutes ago" in the interface language.
 * @param {number} at - Epoch milliseconds
 * @returns {string}
 */
function formatAgo(at) {
  const seconds = Math.round((at - Date.now()) / 1000);
  const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
  const formatter = new Intl.RelativeTimeFormat(currentLang, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(0, 'second');
}

/**
 * Show the active provider and how its last request went. The dot colour
 * comes from data-tone; the same sentence is the tooltip and the accessible
 * name, since colour alone cannot carry the state.
 */
async function renderProviderBadge() {
  try {
    const providerId = await getSelectedProvider();
    const record = await getProviderHealth(providerId);
    const tone = healthTone(record);
    const name = (PROVIDER_CONFIGS[providerId] || {}).name || providerId;
    const key = { ok: 'providerHealthOk', warn: 'providerHealthWarn', error: 'providerHealthError', unknown: 'providerHealthUnknown' }[tone];
    const detail = t(key, currentLang).replace('{ago}', record ? formatAgo(record.at) : '');
    const label = `${name}: ${detail}`;

    providerBadgeName.textContent = name;
    providerBadge.dataset.tone = tone;
    providerBadge.title = label;
    providerBadge.setAttribute('aria-label', label);
  } catch (error) {
    console.error('Could not render the provider badge:', error);
  }
}

/**
 * Name each button's shortcut on the button itself.
 *
 * A shortcut is learned while doing the slow version of the same action,
 * not from a reference list the user would have to go looking for. Only
 * buttons that do exactly what the command does carry one, and only when
 * Chrome actually bound it: naming a key that does nothing is worse than
 * naming none at all.
 */
async function annotateShortcuts() {
  const targets = document.querySelectorAll('[data-shortcut-for]');
  if (targets.length === 0) return;

  const bound = await getBoundShortcuts();

  targets.forEach(el => {
    const shortcut = bound.get(el.dataset.shortcutFor);
    if (!shortcut) return;

    const base = el.getAttribute('title') || el.textContent.trim();
    el.setAttribute('title', `${base} (${shortcut})`);
    el.setAttribute('aria-keyshortcuts', shortcut);
  });
}

/**
 * Initialize language based on stored preference
 */
async function initLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
}

/**
 * Initialize theme based on stored preference or system
 */
async function initTheme() {
  const storedTheme = await getTheme();
  applyTheme(storedTheme);
}

/**
 * Apply theme to the document
 * @param {'light'|'dark'|'system'} theme
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
 * Load and display usage stats
 */
async function loadStats() {
  const stats = await getUsageStats();
  statTranslations.textContent = formatNumber(stats.totalTranslations);
  statPolishes.textContent = formatNumber(stats.totalPolishes);
  statInputTokens.textContent = formatNumber(stats.totalInputTokens);
  statOutputTokens.textContent = formatNumber(stats.totalOutputTokens);
}

/**
 * Format number with K/M suffix for large numbers
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Show the first-run key section when the selected provider has no key, and
 * keep Translate off while it is showing.
 */
async function checkApiKey() {
  try {
    const provider = await getSelectedProvider();
    const key = await getProviderApiKey(provider);
    setNeedsKey(!key, provider);
  } catch (error) {
    // Silently handle API key check errors
  }
}

function setNeedsKey(needs, provider) {
  needsKey = needs;
  firstRun.hidden = !needs;
  actionBtn.disabled = isProcessing || needsKey;
  if (needs) renderFirstRun(provider);
}

/**
 * Draw the section for a provider: its radio, an empty field and status, and
 * that provider's how-to block.
 */
function renderFirstRun(provider) {
  firstRunProviders.forEach((radio) => { radio.checked = radio.value === provider; });
  setFirstRunStatus('', '');
  firstRunHelp.replaceChildren(renderKeyHelp(provider, currentLang));
}

function setFirstRunStatus(text, state) {
  firstRunStatus.textContent = text;
  firstRunStatus.dataset.state = state;
}

function selectedFirstRunProvider() {
  return [...firstRunProviders].find((radio) => radio.checked)?.value;
}

/**
 * Picking a provider here makes it the selected one, so the key typed next is
 * the key Translate will use. If that provider already has a key the section
 * simply goes away.
 */
async function handleFirstRunProviderChange() {
  const provider = selectedFirstRunProvider();
  if (!provider) return;
  firstRunKey.value = '';
  try {
    await setSelectedProvider(provider);
  } catch (error) {
    console.error('Could not switch provider:', error);
  }
  await checkApiKey();
}

/**
 * Save the typed key, test it with one real request, and report the result
 * beside the field. A rejected key stays in the field and Translate stays off.
 */
async function handleFirstRunTest() {
  const provider = selectedFirstRunProvider();
  const typed = firstRunKey.value.trim();
  if (!provider || firstRunTest.disabled) return;
  if (!typed) {
    setFirstRunStatus(t('pleaseEnterApiKey', currentLang), 'error');
    firstRunKey.focus();
    return;
  }

  firstRunTest.disabled = true;
  firstRunHold = true;
  setFirstRunStatus(t('keyTesting', currentLang), 'pending');
  let succeeded = false;
  try {
    await setProviderApiKey(provider, typed);
    // Test the key as it was stored, after the paste cleanup.
    const result = await chrome.runtime.sendMessage({ action: ACTIONS.TEST_API_KEY, provider, key: await getProviderApiKey(provider) });
    if (result?.ok) {
      succeeded = true;
      setFirstRunStatus(keyTestOkText(result, currentLang), 'ok');
    } else {
      setFirstRunStatus(keyTestFailedText(result?.message || result?.error, currentLang), 'error');
    }
  } catch (error) {
    setFirstRunStatus(keyTestFailedText(error.message, currentLang), 'error');
  }
  firstRunTest.disabled = false;

  if (succeeded) {
    setTimeout(() => {
      firstRunHold = false;
      checkApiKey();
    }, 1500);
  } else {
    firstRunHold = false;
  }
}

function toggleFirstRunReveal() {
  const reveal = firstRunKey.type === 'password';
  firstRunKey.type = reveal ? 'text' : 'password';
  firstRunReveal.setAttribute('aria-pressed', String(reveal));
}

/**
 * Load and display translation history
 */
async function loadHistory() {
  try {
    const history = await getHistory();

    if (history.length === 0) {
      historySection.hidden = true;
      return;
    }

    historySection.hidden = false;
    renderHistory(history);
  } catch (error) {
    // Silently handle history load errors
  }
}

/**
 * Render history items
 * @param {Array} history - History entries
 */
function renderHistory(history) {
  historyList.innerHTML = history.map(entry => {
    const targetLang = entry.direction.split('-')[1] || 'fa';
    const translationDir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';
    const badgeText = directionLabel(entry.direction);

    return `
      <div class="history-item" data-original="${escapeAttr(entry.original)}" data-translation="${escapeAttr(entry.translation)}" data-direction="${entry.direction}">
        <div class="history-item-content">
          <div class="history-item-original">${escapeHtml(entry.original)}</div>
          <div class="history-item-translation" dir="${translationDir}">${escapeHtml(entry.translation)}</div>
        </div>
        <span class="history-item-badge" dir="ltr">${badgeText}</span>
      </div>
    `;
  }).join('');

  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const original = item.dataset.original;
      const translation = item.dataset.translation;
      const direction = item.dataset.direction;

      inputText.value = original;
      updateCharCount();
      updateInputDirection();

      // Switch to text tab + translate mode and show result
      updateTab('text');
      updateTextMode('translate');
      displayTranslation({ translation, direction, fromCache: true });
    });
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Open in sidebar (not offered inside the panel itself). sidePanel.open()
  // must run within the click's user gesture, so nothing else is awaited first.
  openSidePanelBtn.hidden = isPanel;
  openSidePanelBtn.addEventListener('click', async () => {
    try {
      const { id: windowId } = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId });
      window.close();
    } catch (error) {
      console.error('Could not open the side panel:', error);
    }
  });

  // Provider badge opens the providers tab of settings
  providerBadge.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html#providers') });
    if (!isPanel) window.close();
  });

  // Keep the badge current when the provider changes or a request finishes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (STORAGE_KEYS.selectedProvider in changes || STORAGE_KEYS.providerHealth in changes)) {
      renderProviderBadge();
    }
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // First-run key setup
  firstRunProviders.forEach((radio) => radio.addEventListener('change', handleFirstRunProviderChange));
  firstRunReveal.addEventListener('click', toggleFirstRunReveal);
  firstRunTest.addEventListener('click', handleFirstRunTest);
  firstRunKey.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleFirstRunTest();
  });
  // A key added or a provider switched in Settings while this stays open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || firstRunHold) return;
    const keyStorageKeys = [STORAGE_KEYS.selectedProvider, STORAGE_KEYS.apiKey, STORAGE_KEYS.geminiApiKey, STORAGE_KEYS.openaiApiKey];
    if (keyStorageKeys.some((key) => key in changes)) checkApiKey();
  });

  // Tab switching (4 main tabs)
  tabText.addEventListener('click', () => updateTab('text'));
  tabDictionary.addEventListener('click', () => updateTab('dictionary'));
  tabDocument.addEventListener('click', () => updateTab('document'));
  tabImage.addEventListener('click', () => updateTab('image'));

  // Arrow-key navigation for the ARIA tablist (Left/Right wraps).
  const tabOrder = [
    { el: tabText, name: 'text' },
    { el: tabDictionary, name: 'dictionary' },
    { el: tabDocument, name: 'document' },
    { el: tabImage, name: 'image' }
  ];
  for (const { el } of tabOrder) {
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const i = tabOrder.findIndex(t => t.el === e.currentTarget);
      let next;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabOrder.length - 1;
      else if (e.key === 'ArrowLeft') next = (i - 1 + tabOrder.length) % tabOrder.length;
      else next = (i + 1) % tabOrder.length;
      updateTab(tabOrder[next].name);
      tabOrder[next].el.focus();
    });
  }

  // Mode switcher within the Text tab (replaces the old segmented control)
  modeTranslate.addEventListener('click', () => updateTextMode('translate'));
  modePolish.addEventListener('click', () => updateTextMode('polish'));

  // Input text changes
  inputText.addEventListener('input', () => {
    updateCharCount();
    updateInputDirection();
  });

  // Clear input
  clearInputBtn.addEventListener('click', () => {
    inputText.value = '';
    updateCharCount();
    hideAllOutputs();
    hideError();
  });

  // Action button (Translate or Polish)
  actionBtn.addEventListener('click', handleAction);

  // Keyboard shortcut (Ctrl/Cmd + Enter)
  inputText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleAction();
    }
  });

  // Copy buttons for polish outputs
  document.querySelectorAll('.polish-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePolishCopy(btn));
  });

  // Regenerate buttons for polish outputs
  document.querySelectorAll('.polish-regenerate-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePolishRegenerate(btn));
  });

  // Favorite buttons for polish outputs
  document.querySelectorAll('.polish-favorite-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePolishFavorite(btn));
  });

  // View favorites button
  if (viewFavoritesBtn) {
    viewFavoritesBtn.addEventListener('click', openFavoritesPage);
  }

  // Review prompt buttons
  if (reviewRateBtn) {
    reviewRateBtn.addEventListener('click', handleReviewRateClick);
  }
  if (reviewNeverBtn) {
    reviewNeverBtn.addEventListener('click', () => answerReviewPrompt('never'));
  }
  if (reviewLaterBtn) {
    reviewLaterBtn.addEventListener('click', handleReviewDismiss);
  }
  if (reviewDismissBtn) {
    reviewDismissBtn.addEventListener('click', handleReviewDismiss);
  }

  // Clear-all buttons use a two-stage confirm (replaces unguarded data loss):
  // first click arms the button with "Tap to confirm" copy + danger styling;
  // second click within 3s actually clears. Mouse-leave or timeout disarms.
  attachTwoStageConfirm(clearHistoryBtn, handleClearHistory);
  attachTwoStageConfirm(clearPolishHistoryBtn, handleClearPolishHistory);
  attachTwoStageConfirm(clearDictHistoryBtn, handleClearDictionaryHistory);

  // View all history button
  viewAllHistoryBtn.addEventListener('click', openHistoryPage);
  viewAllPolishHistoryBtn.addEventListener('click', openHistoryPage);

  // Dictionary buttons
  dictCopyBtn.addEventListener('click', handleDictCopy);

  // History toggle handlers (collapsible sections)
  const historyToggle = document.getElementById('history-toggle');
  const polishHistoryToggle = document.getElementById('polish-history-toggle');
  const dictHistoryToggle = document.getElementById('dict-history-toggle');

  if (historyToggle) {
    historyToggle.addEventListener('click', (e) => {
      // Don't toggle if clicking action buttons
      if (e.target.closest('.history-actions')) return;
      toggleHistorySection(historyToggle, historyList);
    });
  }

  if (polishHistoryToggle) {
    polishHistoryToggle.addEventListener('click', (e) => {
      if (e.target.closest('.history-actions')) return;
      toggleHistorySection(polishHistoryToggle, polishHistoryList);
    });
  }

  if (dictHistoryToggle) {
    dictHistoryToggle.addEventListener('click', (e) => {
      if (e.target.closest('.history-actions')) return;
      toggleHistorySection(dictHistoryToggle, dictionaryHistoryList);
    });
  }

  // Document buttons
  selectFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  removeFileBtn.addEventListener('click', clearFile);
  downloadBtn.addEventListener('click', downloadTranslation);
  cancelTranslationBtn.addEventListener('click', handleCancelTranslation);
  translateDocBtn.addEventListener('click', handleDocumentTranslate);

  // Image buttons
  selectImageBtn.addEventListener('click', () => imageInput.click());
  screenshotTranslateBtn.addEventListener('click', handleScreenshotTranslate);
  imageInput.addEventListener('change', handleImageFileSelect);
  removeImageBtn.addEventListener('click', clearImage);
  translateImageBtn.addEventListener('click', handleImageTranslate);
  imageCopyBtn.addEventListener('click', handleImageCopy);

  // Note: a dedicated "Paste" button was tried but removed - Chrome
  // extension popups need the `clipboardRead` permission to call
  // navigator.clipboard.read(), and requesting it on update would
  // trigger a permission-change warning for every existing user.
  // The document-level Ctrl+V handler below (handlePaste) covers paste
  // and the inline tip in popup.html tells users about it.

  // Translate Page button
  const translatePageBtn = document.getElementById('translate-page-btn');
  if (translatePageBtn) {
    translatePageBtn.addEventListener('click', handleTranslatePage);
  }

  // Clipboard paste for images
  document.addEventListener('paste', handlePaste);

  // Theme toggle
  themeBtn.addEventListener('click', toggleTheme);

  // Stats toggle
  statsToggle.addEventListener('click', () => {
    const isExpanded = statsContent.hidden;
    statsContent.hidden = !isExpanded;
    statsToggle.classList.toggle('expanded', isExpanded);
  });

  // Reset stats button
  attachTwoStageConfirm(resetStatsBtn, async () => {
    await resetUsageStats();
    await loadStats();
  });

  // Analytics button
  analyticsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('analytics/analytics.html') });
  });
}

/**
 * Update main tab (text, dictionary, document, or image)
 * @param {string} tab - 'text', 'dictionary', 'document', or 'image'
 */
function updateTab(tab) {
  currentTab = tab;

  // Update tab buttons; aria-selected drives the new ARIA tablist styling.
  const tabs = { text: tabText, dictionary: tabDictionary, document: tabDocument, image: tabImage };
  for (const [name, el] of Object.entries(tabs)) {
    const active = name === tab;
    el.classList.toggle('active', active);
    el.setAttribute('aria-selected', active ? 'true' : 'false');
    el.tabIndex = active ? 0 : -1;
  }

  // Hide outputs when switching tabs
  hideAllOutputs();
  hideError();

  // Hide all history sections first
  historySection.hidden = true;
  polishHistorySection.hidden = true;
  dictionaryHistorySection.hidden = true;

  // Show/hide sections based on tab
  textModeSection.hidden = tab !== 'text';
  documentUploadSection.hidden = tab !== 'document';
  imageUploadSection.hidden = tab !== 'image';

  // Show/hide action button (document and image have their own buttons)
  actionBtn.hidden = tab === 'document' || tab === 'image';

  // Reset document translate button when switching to document tab
  if (tab === 'document') {
    // Only show if a file is already selected
    translateDocBtn.hidden = !uploadedFile;
  }

  // For dictionary mode, we show the text input but change the button/placeholder
  const modeSwitcher = document.querySelector('.mode-switcher');
  if (tab === 'dictionary') {
    textModeSection.hidden = false;
    if (modeSwitcher) modeSwitcher.hidden = true;
    btnText.textContent = t('lookupWord', currentLang);
    inputText.placeholder = t('enterWordToLookup', currentLang);
    grammarToggleSection.hidden = true;
    actionBtn.hidden = false;
    loadDictionaryHistory();
  } else if (tab === 'text') {
    if (modeSwitcher) modeSwitcher.hidden = false;
    updateTextMode(currentTextMode);
  }
}

/**
 * Update text mode (translate or polish) within the Text tab
 * @param {string} mode - 'translate' or 'polish'
 */
function updateTextMode(mode) {
  currentTextMode = mode;

  // Update mode switcher; ARIA state drives the active-look CSS (.mode-switcher-btn[aria-selected="true"])
  modeTranslate.setAttribute('aria-selected', mode === 'translate' ? 'true' : 'false');
  modePolish.setAttribute('aria-selected', mode === 'polish' ? 'true' : 'false');
  modeTranslate.classList.toggle('active', mode === 'translate');
  modePolish.classList.toggle('active', mode === 'polish');

  // Update button text
  btnText.textContent = mode === 'translate' ? t('translate', currentLang) : t('polish', currentLang);

  // Update placeholder
  inputText.placeholder = mode === 'translate' ? t('enterTextTranslate', currentLang) : t('enterTextPolish', currentLang);

  // Show/hide grammar toggle (only in translate mode)
  grammarToggleSection.hidden = mode !== 'translate';

  // Hide outputs when switching modes
  hideAllOutputs();
  hideError();

  // Hide all history sections first
  historySection.hidden = true;
  polishHistorySection.hidden = true;

  // Load appropriate history
  if (mode === 'translate') {
    loadHistory();
  } else if (mode === 'polish') {
    loadPolishHistory();
  }
}

/**
 * Handle action button click
 */
async function handleAction() {
  if (needsKey) return;
  const mode = getCurrentMode();
  if (mode === 'translate') {
    await handleTranslate();
  } else if (mode === 'polish') {
    await handlePolish();
  } else if (mode === 'dictionary') {
    await handleDictionary();
  } else if (mode === 'document') {
    await handleDocumentTranslate();
  }
}

/**
 * Update character and word count display
 */
function updateCharCount() {
  const text = inputText.value;
  const charCountNum = text.length;
  const wordCountNum = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charsText = t('chars', currentLang);
  const wordText = wordCountNum === 1 ? t('word', currentLang) : t('words', currentLang);
  charCount.textContent = `${charCountNum} ${charsText} | ${wordCountNum} ${wordText}`;
}

/**
 * Update input text direction based on content
 */
function updateInputDirection() {
  const dir = getTextDirection(inputText.value);
  inputText.dir = dir;
}

/**
 * Handle translate button click
 */
async function handleTranslate({ sourceLang } = {}) {
  const text = inputText.value.trim();
  const withGrammar = grammarCheckbox.checked;


  if (!text) {
    showError('Please enter text to translate');
    return;
  }

  if (isProcessing) {
    return;
  }

  setLoadingState(true);
  hideError();
  hideAllOutputs();

  try {
    let streamed = '';
    const resolved = applySourceOverride({
      detected: detectLanguage(text),
      chosen: sourceLang,
      override: manualSourceOverride
    });
    manualSourceOverride = resolved.override;

    const response = await requestTranslation({ text, sourceLang: resolved.sourceLang }, {
      onDelta: (delta) => {
        streamed += delta;
        streamInto(streamed);
      }
    });

    if (response.errorCode === 'ABORTED') {
      // User-initiated cancel or a dropped port; not an error the user
      // needs to be told about. Stop quietly, same as page translation.
      return;
    }

    if (response.error) {
      showError(response.error);
      return;
    }

    await displayTranslation(response);

    if (withGrammar && response.translation) {
      // Isolated from the outer try/catch on purpose: a rejected sendMessage
      // (closed port, invalidated extension context) must not fall through to
      // the outer catch, which would call showError -> hideAllOutputs and wipe
      // the translation just rendered above. Degrade silently instead.
      try {
        const grammarResponse = await chrome.runtime.sendMessage({
          action: 'EXPLAIN_GRAMMAR',
          source: text,
          translation: response.translation,
          direction: response.direction
        });
        if (!grammarResponse?.error && Array.isArray(grammarResponse?.grammar) && grammarResponse.grammar.length) {
          displayGrammarExplanation(grammarResponse.grammar);
        }
      } catch {
        // No-op: keep the translation on screen, just skip the grammar block.
      }
    }

    await loadHistory();

    // Update usage stats (analytics event logged in service worker)
    await updateUsageStats({
      inputTokens: response.fromCache ? 0 : (response.inputTokens || 0),
      outputTokens: response.fromCache ? 0 : (response.outputTokens || 0),
      translations: 1
    });
    await loadStats();
  } catch (error) {
    showError(error.message || 'Translation failed');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Handle polish button click
 */
async function handlePolish() {
  const text = inputText.value.trim();

  if (!text) {
    showError('Please enter text to polish');
    return;
  }

  if (isProcessing) {
    return;
  }

  setLoadingState(true);
  hideError();
  hideAllOutputs();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'POLISH',
      text: text
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    displayPolishResults(response, text);
    await loadPolishHistory();

    // Update usage stats (analytics event logged in service worker)
    await updateUsageStats({
      inputTokens: response.inputTokens || 0,
      outputTokens: response.outputTokens || 0,
      polishes: 1
    });
    await loadStats();
  } catch (error) {
    showError(error.message || 'Polish failed');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Update provider badge with current provider info
 * @param {HTMLElement} badgeElement - The badge element to update
 */
async function updateProviderBadge(badgeElement) {
  if (!badgeElement) return;

  try {
    const providerId = await getSelectedProvider();
    const config = PROVIDER_CONFIGS[providerId];

    if (config) {
      badgeElement.textContent = config.name;
      badgeElement.className = `badge provider-badge ${providerId}`;
      badgeElement.hidden = false;
    }
  } catch (error) {
    badgeElement.hidden = true;
  }
}

/**
 * Write streamed text into the card's translation line.
 *
 * A text card is rendered once, on the first delta, and every delta after
 * that writes into the same element the finished result will use. That is
 * what keeps the panel from visibly rebuilding when the stream ends.
 *
 * @param {string} text - the text streamed so far
 */
function streamInto(text) {
  let line = currentCardEl && currentCardEl.querySelector('.pp-card-translation');

  if (!line) {
    currentCardEl = renderCard({ mode: 'text', translation: '' }, { lang: currentLang, doc: document });
    cardSlot.replaceChildren(currentCardEl);
    line = currentCardEl.querySelector('.pp-card-translation');
  }

  line.setAttribute('dir', getTextDirection(text));
  line.textContent = text;
  outputSection.hidden = false;
}

/**
 * The provider's display name, for the card's footer.
 * @returns {Promise<string>}
 */
async function currentProviderName() {
  try {
    const providerId = await getSelectedProvider();
    return (PROVIDER_CONFIGS[providerId] || {}).name || '';
  } catch (error) {
    return '';
  }
}

/**
 * The card's Listen handler, or null when there is nothing speakable.
 * @param {Object} result
 * @returns {Function|null}
 */
function buildListenHandler(result) {
  const spoken = result.direction && result.direction.startsWith('en')
    ? result.sourceText
    : result.translation;
  if (!canSpeak(spoken)) return null;
  return (text) => speak(text || spoken);
}

/**
 * The slot the grammar block renders into, created on first use and
 * placed above the card's footer so the actions stay at the bottom.
 *
 * Built here rather than sitting in popup.html because it belongs inside
 * the card, which only exists once a result has been rendered. The class
 * names are the popup's own, so the existing grammar styling applies.
 *
 * @returns {HTMLElement|null}
 */
function grammarSlot() {
  if (!currentCardEl) return null;

  const existing = currentCardEl.querySelector('.grammar-section');
  if (existing) return existing;

  const slot = document.createElement('div');
  slot.className = 'grammar-section';
  const footerEl = currentCardEl.querySelector('.pp-card-footer');
  if (footerEl) currentCardEl.insertBefore(slot, footerEl);
  else currentCardEl.appendChild(slot);
  return slot;
}

/**
 * Render grammar points into the card, with the header and the control
 * that opens the full lesson.
 * @param {Array<{point: string, explanation: string}>} points
 */
function displayGrammarExplanation(points) {
  const slot = grammarSlot();
  if (!slot) return;

  slot.replaceChildren();

  const header = document.createElement('div');
  header.className = 'grammar-header';
  const headerText = document.createElement('span');
  headerText.textContent = t('grammarExplanation', currentLang) || 'Grammar Notes';
  header.appendChild(headerText);
  slot.appendChild(header);

  const list = document.createElement('div');
  list.className = 'grammar-points';
  // Grammar content is always English (the audience is Persian speakers
  // studying English), so it renders LTR whatever the direction.
  points.forEach(item => {
    if (!item) return;
    const point = document.createElement('div');
    point.className = 'grammar-point';
    point.setAttribute('dir', 'ltr');

    const title = document.createElement('div');
    title.className = 'grammar-point-title';
    title.textContent = item.point || '';

    const explanation = document.createElement('div');
    explanation.className = 'grammar-point-explanation';
    explanation.textContent = item.explanation || '';

    point.append(title, explanation);
    list.appendChild(point);
  });
  slot.appendChild(list);

  const learnMore = document.createElement('button');
  learnMore.type = 'button';
  learnMore.className = 'grammar-learn-more-btn';
  learnMore.textContent = t('learnMore', currentLang) || 'Learn More with Examples';
  learnMore.addEventListener('click', openGrammarPage);
  slot.appendChild(learnMore);
}

/**
 * Put a grammar failure in the grammar slot and nowhere else, so the
 * translation already on screen is never disturbed.
 * @param {string} message
 */
function showGrammarError(message) {
  const slot = grammarSlot();
  if (!slot) return;
  const err = document.createElement('div');
  err.className = 'grammar-point-explanation';
  err.textContent = message;
  slot.replaceChildren(err);
}

/**
 * Fetch and render the grammar lesson for a result. Shared by the card's
 * Explain action and the "Explain grammar" checkbox, so both paths behave
 * the same and both fail the same way: quietly, into the slot.
 * @param {Object} result
 * @returns {Promise<void>}
 */
async function loadGrammarFor(result) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'EXPLAIN_GRAMMAR',
      source: inputText.value.trim(),
      translation: result.translation,
      direction: result.direction
    });

    if (response && response.error) {
      showGrammarError(response.error);
      return;
    }
    if (Array.isArray(response && response.grammar) && response.grammar.length) {
      displayGrammarExplanation(response.grammar);
    }
  } catch (error) {
    // Keep the translation on screen; skip the grammar block.
  }
}

/**
 * The card's Explain handler, or null for a single word.
 * @param {Object} result
 * @returns {Function|null}
 */
function buildGrammarHandler(result) {
  const source = inputText.value.trim();
  if (!source || source.split(/\s+/).length < 2) return null;
  return () => loadGrammarFor(result);
}

/**
 * Display translation result through the shared card.
 * @param {Object} result - Translation result
 */
async function displayTranslation(result) {
  const provider = await currentProviderName();

  // Not known to be saved until updateTranslationFavoriteState says so, and
  // it must not inherit the previous result's state.
  translationIsSaved = false;

  // Store translation data for grammar page
  currentTranslationData = {
    original: inputText.value.trim(),
    translation: result.translation,
    direction: result.direction
  };

  currentCardEl = renderCard(result, {
    lang: currentLang,
    doc: document,
    provider,
    sensesExpanded: sensesExpandedForSession,
    onToggleSenses: (open) => { sensesExpandedForSession = open; },
    onListen: buildListenHandler(result),
    onCopy: (text) => handleCardCopy(text),
    onSave: () => handleTranslationFavorite(),
    isSaved: translationIsSaved,
    onExplainGrammar: buildGrammarHandler(result),
    onSwapDirection: (nextSourceLang) => handleTranslate({ sourceLang: nextSourceLang }),
    onOpenSettings: () => chrome.runtime.openOptionsPage()
  });
  // The popup has no page selection, so it never offers Sentence: omitting
  // onTranslateSentence omits the control.

  cardSlot.replaceChildren(currentCardEl);
  checkReviewPrompt();
  outputSection.hidden = false;

  // Update favorite button state
  await updateTranslationFavoriteState();
}

/**
 * Display polish results
 * @param {Object} result - Polish result with professional, conversational, concise
 * @param {string} originalText - Original text that was polished
 * @param {number} historyId - History entry ID (if available)
 */
async function displayPolishResults(result, originalText = null, historyId = null) {
  // Show provider badge
  await updateProviderBadge(polishProviderBadge);

  // Store original text and history ID for regenerate/favorite
  currentPolishOriginalText = originalText || inputText.value.trim();
  currentPolishHistoryId = historyId;

  polishProfessional.textContent = result.professional;
  polishConversational.textContent = result.conversational;
  polishConcise.textContent = result.concise;
  polishSection.hidden = false;
  checkReviewPrompt();

  // Update favorite button states
  await updatePolishFavoriteStates();
}

/**
 * Copy from the card's own Copy control, which hands over the text it
 * rendered rather than making the host read it back out of the DOM.
 * @param {string} text
 */
async function handleCardCopy(text) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    showNotice(t('copyFailed', currentLang), 'warning');
    return;
  }

  const btn = currentCardEl && currentCardEl.querySelector('[data-action="cardCopy"]');
  if (!btn) return;

  const label = btn.textContent;
  btn.textContent = t('copied', currentLang);
  showNotice(t('copied', currentLang));
  setTimeout(() => { btn.textContent = label; }, 1500);
}

/**
 * Handle copy button click for polish versions
 * @param {HTMLElement} btn - The clicked copy button
 */
async function handlePolishCopy(btn) {
  const version = btn.dataset.version;
  let text = '';

  if (version === 'professional') {
    text = polishProfessional.textContent;
  } else if (version === 'conversational') {
    text = polishConversational.textContent;
  } else if (version === 'concise') {
    text = polishConcise.textContent;
  }

  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    showNotice(t('copied', currentLang));
    setTimeout(() => {
      btn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showNotice(t('copyFailed', currentLang), 'warning');
  }
}

/**
 * Toggle a collapsible history section
 * @param {HTMLElement} toggleEl - The toggle header element
 * @param {HTMLElement} listEl - The history list element to show/hide
 */
function toggleHistorySection(toggleEl, listEl) {
  const isExpanded = toggleEl.classList.contains('expanded');
  if (isExpanded) {
    toggleEl.classList.remove('expanded');
    listEl.hidden = true;
  } else {
    toggleEl.classList.add('expanded');
    listEl.hidden = false;
  }
}

/**
 * Handle clear history button click
 */
/**
 * Wire a destructive button as a two-stage confirm: first click arms it
 * (label changes, danger styling), second click runs the action. Auto-disarms
 * after 3 seconds of inactivity, on mouseleave, or when focus moves away.
 * Replaces previous unguarded "Clear All" behavior - no native confirm() dialog.
 *
 * @param {HTMLButtonElement} btn
 * @param {() => unknown} action
 */
function attachTwoStageConfirm(btn, action) {
  if (!btn) return;
  const originalLabel = btn.textContent;
  let armed = false;
  let timer = null;

  const disarm = () => {
    armed = false;
    btn.textContent = originalLabel;
    btn.classList.remove('is-confirming');
    btn.removeAttribute('aria-live');
    if (timer) { clearTimeout(timer); timer = null; }
  };

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!armed) {
      armed = true;
      btn.textContent = t('tapToConfirm', currentLang) || 'Tap to confirm';
      btn.classList.add('is-confirming');
      btn.setAttribute('aria-live', 'polite');
      timer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    try { await action(); } catch { /* action manages its own errors */ }
  });

  btn.addEventListener('mouseleave', () => { if (armed) disarm(); });
  btn.addEventListener('blur', () => { if (armed) disarm(); });
}

async function handleClearHistory() {
  await clearHistory();
  historySection.hidden = true;
  historyList.innerHTML = '';
}

/**
 * Handle clear polish history button click
 */
async function handleClearPolishHistory() {
  await clearPolishHistory();
  polishHistorySection.hidden = true;
  polishHistoryList.innerHTML = '';
}

/**
 * Open the dedicated history page
 */
function openHistoryPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
}

/**
 * Load and display polish history
 */
async function loadPolishHistory() {
  try {
    const history = await getPolishHistory();

    if (history.length === 0) {
      polishHistorySection.hidden = true;
      return;
    }

    polishHistorySection.hidden = false;
    renderPolishHistory(history);
  } catch (error) {
    // Silently handle polish history load errors
  }
}

/**
 * Render polish history items
 * @param {Array} history - Polish history entries
 */
function renderPolishHistory(history) {
  polishHistoryList.innerHTML = history.map(entry => {
    return `
      <div class="history-item polish-history-item"
           data-id="${entry.id}"
           data-original="${escapeAttr(entry.original)}"
           data-professional="${escapeAttr(entry.professional)}"
           data-conversational="${escapeAttr(entry.conversational)}"
           data-concise="${escapeAttr(entry.concise)}">
        <div class="history-item-content">
          <div class="history-item-original">${escapeHtml(entry.original)}</div>
          <div class="history-item-translation">${escapeHtml(entry.professional.slice(0, 50))}${entry.professional.length > 50 ? '...' : ''}</div>
        </div>
        <span class="history-item-badge polish-badge">Polish</span>
      </div>
    `;
  }).join('');

  polishHistoryList.querySelectorAll('.polish-history-item').forEach(item => {
    item.addEventListener('click', () => {
      const historyId = parseInt(item.dataset.id, 10);
      const original = item.dataset.original;
      const professional = item.dataset.professional;
      const conversational = item.dataset.conversational;
      const concise = item.dataset.concise;

      inputText.value = original;
      updateCharCount();
      updateInputDirection();

      // Show polish results directly with history ID
      displayPolishResults({ professional, conversational, concise }, original, historyId);
    });
  });
}

/**
 * Set loading state
 * @param {boolean} loading
 */
function setLoadingState(loading) {
  isProcessing = loading;
  actionBtn.disabled = loading || needsKey;
  btnText.hidden = loading;
  btnLoading.hidden = !loading;
}

/**
 * Patterns that classify an error as a recoverable INFO notice (amber tone)
 * vs. a real DESTRUCTIVE failure (red tone, alarming).
 *
 * Unsupported language, unintelligible input, "please enter text" - amber.
 * Network failures, invalid API key, server errors - red.
 */
const DESTRUCTIVE_ERROR_PATTERN = /(network|invalid api key|api key|server|rate limit|failed to fetch|timeout)/i;

/**
 * Show a notice or error in the popup. Notices use a friendly amber tone;
 * real failures opt into the red destructive variant.
 *
 * @param {string} message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorSection.hidden = false;
  errorSection.classList.toggle('is-destructive', DESTRUCTIVE_ERROR_PATTERN.test(message || ''));
  hideAllOutputs();
}

let statusLineTimer = null;

/**
 * Report the outcome of a secondary action (copy, favorite, regenerate) in
 * the status line. Unlike showError it leaves the result on screen: a failed
 * copy is no reason to lose the translation the user was reading.
 *
 * @param {string} message
 * @param {'success' | 'warning'} [tone]
 */
function showNotice(message, tone = 'success') {
  if (!statusLine) return;
  clearTimeout(statusLineTimer);
  statusLine.textContent = message;
  statusLine.classList.toggle('is-warning', tone === 'warning');
  statusLineTimer = setTimeout(() => { statusLine.textContent = ''; }, 3000);
}

/**
 * Hide error section
 */
function hideError() {
  errorSection.hidden = true;
}

/**
 * Hide all output sections
 */
function hideAllOutputs() {
  outputSection.hidden = true;
  polishSection.hidden = true;
  dictionarySection.hidden = true;
  cardSlot.replaceChildren();
  currentCardEl = null;
  currentTranslationData = null;
  cancelSpeech();
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape attribute value
 */
function escapeAttr(text) {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================
// Dictionary Functions
// ============================================

/**
 * Handle dictionary lookup
 */
async function handleDictionary() {
  const word = inputText.value.trim();

  if (!word) {
    showError(t('enterWordToLookup', currentLang));
    return;
  }

  // Validate single word
  if (word.split(/\s+/).length > 1) {
    showError(t('singleWordOnly', currentLang));
    return;
  }

  if (isProcessing) {
    return;
  }

  setLoadingState(true);
  hideError();
  hideAllOutputs();

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'DICTIONARY_LOOKUP',
      word: word,
      sourceLang: 'auto'
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    displayDictionaryResult(response);
    await loadDictionaryHistory();
  } catch (error) {
    showError(error.message || t('noDefinitionFound', currentLang));
  } finally {
    setLoadingState(false);
  }
}

/**
 * Display dictionary result
 */
async function displayDictionaryResult(result) {
  const { word, phonetic, partOfSpeech, definitions, synonyms, antonyms, translation, targetLang } = result;

  // Word and phonetic
  dictWord.textContent = word;

  // Show provider badge
  await updateProviderBadge(dictProviderBadge);
  dictPhonetic.textContent = phonetic || '';
  dictPhonetic.hidden = !phonetic;

  // Part of speech
  dictPos.textContent = partOfSpeech || '';
  dictPos.hidden = !partOfSpeech;

  // Definitions
  if (definitions && definitions.length > 0) {
    setSafeInnerHTML(dictDefinitions, definitions.map((def, i) => `
      <div class="dict-definition-item">
        <div class="dict-meaning">${i + 1}. ${escapeHtml(def.meaning)}</div>
        ${def.example ? `<div class="dict-example">"${escapeHtml(def.example)}"</div>` : ''}
      </div>
    `).join(''));
  } else {
    dictDefinitions.innerHTML = '';
  }

  // Synonyms
  if (synonyms && synonyms.length > 0) {
    setSafeInnerHTML(dictSynonyms, synonyms.slice(0, 5).map(s =>
      `<span class="dict-tag">${escapeHtml(s)}</span>`
    ).join(''));
    dictSynonymsSection.hidden = false;
  } else {
    dictSynonymsSection.hidden = true;
  }

  // Antonyms
  if (antonyms && antonyms.length > 0) {
    setSafeInnerHTML(dictAntonyms, antonyms.slice(0, 3).map(a =>
      `<span class="dict-tag dict-tag-antonym">${escapeHtml(a)}</span>`
    ).join(''));
    dictAntonymsSection.hidden = false;
  } else {
    dictAntonymsSection.hidden = true;
  }

  // Translation
  if (translation) {
    const isRTL = ['fa', 'ar', 'he'].includes(targetLang);
    dictTranslation.textContent = translation;
    dictTranslation.dir = isRTL ? 'rtl' : 'ltr';
    dictTranslationSection.hidden = false;
  } else {
    dictTranslationSection.hidden = true;
  }

  dictionarySection.hidden = false;
}

/**
 * Handle dictionary translation copy
 */
async function handleDictCopy() {
  const text = dictTranslation.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    dictCopyBtn.classList.add('copied');
    showNotice(t('copied', currentLang));
    setTimeout(() => {
      dictCopyBtn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showNotice(t('copyFailed', currentLang), 'warning');
  }
}

/**
 * Load dictionary history
 */
async function loadDictionaryHistory() {
  try {
    const history = await getDictionaryHistory();

    if (history.length === 0) {
      dictionaryHistorySection.hidden = true;
      return;
    }

    dictionaryHistorySection.hidden = false;
    renderDictionaryHistory(history);
  } catch (error) {
    // Silently handle dictionary history load errors
  }
}

/**
 * Render dictionary history items
 */
function renderDictionaryHistory(history) {
  dictionaryHistoryList.innerHTML = history.map(entry => {
    return `
      <div class="history-item dict-history-item" data-word="${escapeAttr(entry.word)}">
        <div class="history-item-content">
          <div class="history-item-original">${escapeHtml(entry.word)}</div>
          <div class="history-item-translation">${escapeHtml(entry.translation || entry.definition || '')}</div>
        </div>
        <span class="history-item-badge dict-badge">Dict</span>
      </div>
    `;
  }).join('');

  dictionaryHistoryList.querySelectorAll('.dict-history-item').forEach(item => {
    item.addEventListener('click', () => {
      const word = item.dataset.word;
      inputText.value = word;
      updateCharCount();
      handleDictionary();
    });
  });
}

/**
 * Clear dictionary history
 */
async function handleClearDictionaryHistory() {
  await clearDictionaryHistory();
  dictionaryHistorySection.hidden = true;
  dictionaryHistoryList.innerHTML = '';
}

// ============================================
// Document Translation Functions
// ============================================

/**
 * Handle file selection
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  hideError();

  // Validate file type
  if (!file.name.endsWith('.txt')) {
    showError(t('unsupportedFormat', currentLang) || 'Only .txt files are supported');
    return;
  }

  // Validate file size (100KB max)
  if (file.size > 100 * 1024) {
    showError(t('fileTooLarge', currentLang));
    return;
  }

  // Validate file is not empty
  if (file.size === 0) {
    showError('File is empty');
    return;
  }

  uploadedFile = file;
  docName.textContent = file.name;
  docSize.textContent = formatFileSize(file.size);

  uploadArea.hidden = true;
  documentInfo.hidden = false;
  downloadSection.hidden = true;
  translationProgress.hidden = true;
  translatedContent = null;

  // Show translate button for document
  translateDocBtn.hidden = false;
}

/**
 * Clear uploaded file
 */
function clearFile() {
  uploadedFile = null;
  translatedContent = null;
  fileInput.value = '';

  uploadArea.hidden = false;
  documentInfo.hidden = true;
  downloadSection.hidden = true;
  translationProgress.hidden = true;
  translateDocBtn.hidden = true;
}

/**
 * Set loading state for document translate button
 * @param {boolean} loading
 */
function setDocLoadingState(loading) {
  isProcessing = loading;
  translateDocBtn.disabled = loading;
  const btnTextEl = translateDocBtn.querySelector('.btn-text');
  const btnLoadingEl = translateDocBtn.querySelector('.btn-loading');
  if (btnTextEl) btnTextEl.hidden = loading;
  if (btnLoadingEl) btnLoadingEl.hidden = !loading;
}

/**
 * Handle document translation
 */
async function handleDocumentTranslate() {
  if (!uploadedFile) {
    showError('Please select a file');
    return;
  }

  // Validate file type
  if (!uploadedFile.name.endsWith('.txt')) {
    showError(t('unsupportedFormat', currentLang) || 'Only .txt files are supported');
    return;
  }

  if (isProcessing) {
    return;
  }

  let content;
  try {
    content = await uploadedFile.text();
  } catch (readError) {
    showError('Failed to read file: ' + (readError.message || 'Unknown error'));
    return;
  }

  if (!content || content.trim().length === 0) {
    showError('File is empty');
    return;
  }

  setDocLoadingState(true);
  hideError();
  translationProgress.hidden = false;
  downloadSection.hidden = true;
  updateProgress(0, 0, 1);

  // Reset cancel button state
  cancelTranslationBtn.disabled = false;
  cancelTranslationBtn.textContent = t('cancel', currentLang);

  // Streaming Port: per-chunk progress + final result, instead of waiting on a
  // single sendMessage round-trip.
  await new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: 'translate-document' });
    docTranslationPort = port;

    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'progress') {
        updateProgress(msg.percent, msg.current, msg.total);
        return;
      }
      if (msg.type === 'error') {
        showError(msg.error);
        translationProgress.hidden = true;
        try { port.disconnect(); } catch { /* already closed */ }
        docTranslationPort = null;
        setDocLoadingState(false);
        resolve();
        return;
      }
      if (msg.type === 'done') {
        if (msg.cancelled) {
          showError(t('translationCancelled', currentLang));
          translationProgress.hidden = true;
        } else {
          translatedContent = msg.translation;
          downloadSection.hidden = false;
          updateProgress(100, msg.chunks || 1, msg.totalChunks || msg.chunks || 1);
          await updateUsageStats({
            inputTokens: msg.totalInputTokens || 0,
            outputTokens: msg.totalOutputTokens || 0,
            translations: 1
          });
          await loadStats();
        }
        try { port.disconnect(); } catch { /* already closed */ }
        docTranslationPort = null;
        setDocLoadingState(false);
        resolve();
      }
    });

    port.onDisconnect.addListener(() => {
      if (docTranslationPort === port) {
        // Background went away mid-translation.
        showError('Translation interrupted');
        translationProgress.hidden = true;
        docTranslationPort = null;
        setDocLoadingState(false);
        resolve();
      }
    });

    port.postMessage({ action: 'start', content, sourceLang: 'auto' });
  });
}

/**
 * Handle cancel translation button click
 */
async function handleCancelTranslation() {
  cancelTranslationBtn.disabled = true;
  cancelTranslationBtn.textContent = t('translationCancelled', currentLang);

  // Prefer the active port so the background can short-circuit immediately
  // without waiting for the cancel flag to be observed on the next chunk.
  if (docTranslationPort) {
    try { docTranslationPort.postMessage({ action: 'cancel' }); } catch { /* port closed */ }
  }
  try {
    await chrome.runtime.sendMessage({ action: 'CANCEL_DOCUMENT_TRANSLATION' });
  } catch {
    // Silently handle cancel errors
  }
}

/**
 * Update progress bar
 */
function updateProgress(percent, current, total) {
  progressText.textContent = `${Math.round(percent)}%`;
  progressFill.style.width = `${percent}%`;
  if (total > 1) {
    progressChunks.textContent = `${t('processingChunk', currentLang)} ${current} ${t('of', currentLang)} ${total}`;
    progressChunks.hidden = false;
  } else {
    progressChunks.hidden = true;
  }
}

/**
 * Download translated document
 */
function downloadTranslation() {
  if (!translatedContent || !uploadedFile) return;

  const blob = new Blob([translatedContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = uploadedFile.name.replace('.txt', '_translated.txt');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================
// Image Translation Functions
// ============================================

/**
 * Handle image file selection
 */
function handleImageFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  handleImageSelect(file);
}

/**
 * Handle paste event for clipboard images
 */
function handlePaste(event) {
  // Only handle paste when in image tab
  if (currentTab !== 'image') return;

  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        handleImageSelect(file);
        event.preventDefault();
        break;
      }
    }
  }
}


/**
 * Handle image selection (from file input or paste)
 * @param {File} file - Image file
 */
function handleImageSelect(file) {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showError(t('unsupportedFormat', currentLang));
    return;
  }

  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    showError(t('imageTooLarge', currentLang));
    return;
  }

  selectedImage = file;

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    imageUploadArea.hidden = true;
    imagePreview.hidden = false;
    translateImageBtn.hidden = false;
    imageResult.hidden = true;
  };
  reader.readAsDataURL(file);
}

/**
 * Clear selected image
 */
function clearImage() {
  selectedImage = null;
  imageInput.value = '';
  previewImg.src = '';

  imageUploadArea.hidden = false;
  imagePreview.hidden = true;
  translateImageBtn.hidden = true;
  imageResult.hidden = true;
}

/**
 * Read image file as base64
 * @param {File} file - Image file
 * @returns {Promise<string>} Base64 encoded image data
 */
async function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove the data:image/...;base64, prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Handle image translation
 */
/**
 * Handle screenshot translate button click
 * Triggers screenshot capture on the active tab and closes popup
 */
async function handleScreenshotTranslate() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Capture viewport from background (must happen before popup closes)
    const response = await chrome.runtime.sendMessage({
      action: 'CAPTURE_SCREENSHOT'
    });

    if (response?.screenshotDataUrl) {
      // Send to content script to start selection
      await chrome.tabs.sendMessage(tab.id, {
        action: 'START_SCREENSHOT_SELECT',
        screenshotDataUrl: response.screenshotDataUrl
      });
    }

    // Close the popup so user can interact with the page
    if (!isPanel) window.close();
  } catch (error) {
    showError('Could not start screenshot mode');
  }
}

async function handleImageTranslate() {
  if (!selectedImage) {
    showError('Please select an image');
    return;
  }

  if (isProcessing) {
    return;
  }

  setImageLoadingState(true);
  hideError();
  imageResult.hidden = true;

  try {
    const base64Data = await readImageAsBase64(selectedImage);

    const response = await chrome.runtime.sendMessage({
      action: 'TRANSLATE_IMAGE',
      imageData: base64Data,
      mimeType: selectedImage.type
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    displayImageResult(response);

    // Update usage stats (analytics event logged in service worker)
    await updateUsageStats({
      inputTokens: response.inputTokens || 0,
      outputTokens: response.outputTokens || 0,
      translations: 1
    });
    await loadStats();
  } catch (error) {
    showError(error.message || 'Image translation failed');
  } finally {
    setImageLoadingState(false);
  }
}

/**
 * Display image translation result
 * @param {Object} result - Image translation result
 */
async function displayImageResult(result) {
  const { extractedText: extracted, translation, direction } = result;

  // Check if no text was found
  if (!extracted && !translation) {
    showError(t('noTextFound', currentLang));
    return;
  }

  // Display extracted text
  extractedText.textContent = extracted || '';
  const sourceLang = direction.split('-')[0] || 'en';
  extractedText.dir = ['fa', 'ar', 'he'].includes(sourceLang) ? 'rtl' : 'ltr';

  // Display translation
  imageTranslation.textContent = translation || '';
  const targetLang = direction.split('-')[1] || 'fa';
  imageTranslation.dir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';

  // Display direction badge
  imageDirectionBadge.textContent = directionLabel(direction);
  imageDirectionBadge.hidden = !imageDirectionBadge.textContent;

  // Show provider badge
  await updateProviderBadge(imageProviderBadge);

  imageResult.hidden = false;
}

/**
 * Set loading state for image translation
 * @param {boolean} loading
 */
function setImageLoadingState(loading) {
  isProcessing = loading;
  translateImageBtn.disabled = loading;
  const btnTextEl = translateImageBtn.querySelector('.btn-text');
  const btnLoadingEl = translateImageBtn.querySelector('.btn-loading');
  if (btnTextEl) btnTextEl.hidden = loading;
  if (btnLoadingEl) btnLoadingEl.hidden = !loading;
}

/**
 * Handle copy button click for image translation
 */
async function handleImageCopy() {
  const text = imageTranslation.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    imageCopyBtn.classList.add('copied');
    showNotice(t('copied', currentLang));
    setTimeout(() => {
      imageCopyBtn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showNotice(t('copyFailed', currentLang), 'warning');
  }
}

// ============================================
// Favorites Functions
// ============================================

/**
 * Load and display favorites count
 */
async function loadFavoritesCount() {
  try {
    const favorites = await getFavorites();
    if (favorites.length > 0) {
      favoritesCount.textContent = favorites.length;
      favoritesCount.hidden = false;
      viewFavoritesBtn.hidden = false;
    } else {
      favoritesCount.hidden = true;
      viewFavoritesBtn.hidden = true;
    }
  } catch (error) {
    if (viewFavoritesBtn) viewFavoritesBtn.hidden = true;
  }
}

/**
 * Open the favorites page
 */
function openFavoritesPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('favorites/favorites.html') });
}

/**
 * Open the grammar learning page with current translation data
 */
function openGrammarPage() {
  if (!currentTranslationData) return;

  const params = new URLSearchParams({
    original: currentTranslationData.original,
    translation: currentTranslationData.translation,
    direction: currentTranslationData.direction
  });

  chrome.tabs.create({
    url: chrome.runtime.getURL(`grammar/grammar.html?${params.toString()}`)
  });
}

/**
 * Handle adding/removing translation from favorites
 */
async function handleTranslationFavorite() {
  const original = currentTranslationData && currentTranslationData.original;
  const saved = currentTranslationData && currentTranslationData.translation;
  const direction = currentTranslationData && currentTranslationData.direction;

  if (!original || !saved) return;

  try {
    // Check if already favorited
    const existingFav = await isFavorite(original, saved);

    if (existingFav) {
      // Remove from favorites
      const response = await chrome.runtime.sendMessage({
        action: ACTIONS.REMOVE_FAVORITE,
        id: existingFav.id
      });

      if (response.success) {
        setTranslationFavoriteState(false);
      }
    } else {
      // Add to favorites
      const providerId = await getSelectedProvider();
      const response = await chrome.runtime.sendMessage({
        action: ACTIONS.ADD_FAVORITE,
        item: {
          type: 'translation',
          originalText: original,
          savedText: saved,
          direction,
          provider: providerId
        }
      });

      if (response.success) {
        setTranslationFavoriteState(true);
        // Check if we should show review prompt after adding favorite
      }
    }

    await loadFavoritesCount();
  } catch (error) {
    showNotice(t('favoriteFailed', currentLang), 'warning');
  }
}

/**
 * Handle adding/removing polish variant from favorites
 * @param {HTMLElement} btn - The clicked favorite button
 */
async function handlePolishFavorite(btn) {
  const version = btn.dataset.version;
  let saved = '';

  if (version === 'professional') {
    saved = polishProfessional.textContent;
  } else if (version === 'conversational') {
    saved = polishConversational.textContent;
  } else if (version === 'concise') {
    saved = polishConcise.textContent;
  }

  const original = currentPolishOriginalText || inputText.value.trim();

  if (!original || !saved) return;

  try {
    // Check if already favorited
    const existingFav = await isFavorite(original, saved);

    if (existingFav) {
      // Remove from favorites
      const response = await chrome.runtime.sendMessage({
        action: ACTIONS.REMOVE_FAVORITE,
        id: existingFav.id
      });

      if (response.success) {
        btn.classList.remove('favorited');
      }
    } else {
      // Add to favorites
      const providerId = await getSelectedProvider();
      const response = await chrome.runtime.sendMessage({
        action: ACTIONS.ADD_FAVORITE,
        item: {
          type: 'polish',
          originalText: original,
          savedText: saved,
          variant: version,
          provider: providerId
        }
      });

      if (response.success) {
        btn.classList.add('favorited');
        // Check if we should show review prompt after adding favorite
      }
    }

    await loadFavoritesCount();
  } catch (error) {
    showNotice(t('favoriteFailed', currentLang), 'warning');
  }
}

/**
 * Update favorite button states for polish cards
 */
async function updatePolishFavoriteStates() {
  const original = currentPolishOriginalText || inputText.value.trim();

  const versions = ['professional', 'conversational', 'concise'];
  for (const version of versions) {
    let saved = '';
    if (version === 'professional') saved = polishProfessional.textContent;
    else if (version === 'conversational') saved = polishConversational.textContent;
    else if (version === 'concise') saved = polishConcise.textContent;

    const btn = document.querySelector(`.polish-favorite-btn[data-version="${version}"]`);
    if (btn && saved) {
      const existingFav = await isFavorite(original, saved);
      btn.classList.toggle('favorited', !!existingFav);
    }
  }
}

/**
 * Reflect the favourite state on the card's Save action. The card renders
 * a plain text button, so aria-pressed is the whole of its state.
 * @param {boolean} favorited
 */
function setTranslationFavoriteState(favorited) {
  translationIsSaved = favorited;
  const btn = currentCardEl && currentCardEl.querySelector('[data-action="cardSave"]');
  if (btn) btn.setAttribute('aria-pressed', favorited ? 'true' : 'false');
}

/**
 * Update favorite button state for translation
 */
async function updateTranslationFavoriteState() {
  const original = currentTranslationData && currentTranslationData.original;
  const saved = currentTranslationData && currentTranslationData.translation;

  if (!original || !saved) return;

  const existingFav = await isFavorite(original, saved);
  setTranslationFavoriteState(!!existingFav);
}

// ============================================
// Polish Regenerate Functions
// ============================================

/**
 * Handle regenerate button click for polish variants
 * @param {HTMLElement} btn - The clicked regenerate button
 */
async function handlePolishRegenerate(btn) {
  const version = btn.dataset.version;
  const original = currentPolishOriginalText || inputText.value.trim();

  if (!original) {
    showNotice(t('regenerateFailed', currentLang), 'warning');
    return;
  }

  if (isProcessing) return;

  // Set loading state on the button
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: ACTIONS.REGENERATE_POLISH_VARIANT,
      text: original,
      variant: version,
      historyId: currentPolishHistoryId
    });

    if (response.error) {
      showNotice(response.error, 'warning');
      return;
    }

    // Update the specific card
    if (version === 'professional') {
      polishProfessional.textContent = response.text;
    } else if (version === 'conversational') {
      polishConversational.textContent = response.text;
    } else if (version === 'concise') {
      polishConcise.textContent = response.text;
    }

    // Update usage stats (analytics event logged in service worker)
    await updateUsageStats({
      inputTokens: response.inputTokens || 0,
      outputTokens: response.outputTokens || 0,
      polishes: 0 // Don't count regenerate as new polish
    });
    await loadStats();

    // Update favorite state for this variant
    await updatePolishFavoriteStates();
  } catch (error) {
    showNotice(error.message || t('regenerateFailed', currentLang), 'warning');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ============================================
// Review Prompt Functions
// ============================================

/**
 * Show the rating banner when the rules say it is time. Called only after a
 * result has rendered, so the ask follows something that just worked. Once
 * shown it stays for the rest of this popup session; a later result does not
 * hide it again.
 */
let reviewPromptShown = false;

async function checkReviewPrompt() {
  if (!reviewPromptBanner || reviewPromptShown) return;
  try {
    if (await claimReviewPrompt()) {
      reviewPromptShown = true;
      reviewPromptBanner.hidden = false;
    }
  } catch (error) {
    // A storage failure only means the banner is not shown this time.
  }
}

/**
 * Record the answer and take the banner away.
 * @param {'rated' | 'later' | 'never'} response
 */
async function answerReviewPrompt(response) {
  if (reviewPromptBanner) reviewPromptBanner.hidden = true;
  try {
    await respondToReviewPrompt(response);
  } catch (error) {
    // The banner is already gone; the next eligible result will ask again.
  }
}

/**
 * Record the rating first, then open the store. Following the link directly
 * closes the popup at once, often before the answer reaches storage, and the
 * user who just rated would be asked again in two weeks. The href stays so
 * middle-click and "open in new tab" still work.
 * @param {MouseEvent} event
 */
async function handleReviewRateClick(event) {
  event.preventDefault();
  await answerReviewPrompt('rated');
  chrome.tabs.create({ url: STORE_REVIEWS_URL });
}

/** "Later" and the close button both snooze; neither means never. */
function handleReviewDismiss() {
  answerReviewPrompt('later');
}

// ============================================
// Page Translation Functions
// ============================================

/**
 * Handle translate page button click
 * Sends message to content script to start page translation
 */
async function handleTranslatePage() {
  const translatePageBtn = document.getElementById('translate-page-btn');
  if (!translatePageBtn) return;

  // Set loading state
  translatePageBtn.disabled = true;
  translatePageBtn.classList.add('loading');

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError('No active tab found');
      return;
    }

    // Send message to content script
    await chrome.tabs.sendMessage(tab.id, {
      action: 'TRANSLATE_PAGE'
    });

    // Close popup after triggering (user will see progress on page)
    if (!isPanel) window.close();
  } catch (error) {
    showError(error.message || 'Failed to start page translation');
  } finally {
    translatePageBtn.disabled = false;
    translatePageBtn.classList.remove('loading');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
