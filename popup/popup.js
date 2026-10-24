import { getTextDirection, detectLanguage } from '../lib/language-detect.js';
import { requestTranslation } from '../lib/translation/client.js';
import { getHistory, getPolishHistory } from '../lib/history.js';
import { getTheme, setTheme, updateUsageStats, getLanguage, getSelectedProvider, setSelectedProvider, getProviderApiKey, setProviderApiKey, normalizeApiKey, checkKeyFormat, getFavorites, isFavorite, claimReviewPrompt, respondToReviewPrompt } from '../lib/storage.js';
import { PROVIDER_CONFIGS, ACTIONS, STORE_REVIEWS_URL, STORAGE_KEYS } from '../lib/constants.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { renderCard, injectCardStyles } from '../shared/card/index.js';
import { canSpeak, speak, cancelSpeech } from '../shared/speech.js';
import { applySourceOverride } from '../shared/source-override.js';
import { getBoundShortcuts, submitShortcut } from '../shared/shortcuts.js';
import { applyThemeToRoot } from '../lib/theme.js';
import { directionLabel } from '../lib/direction-label.js';
import { formatRelativeTime } from '../lib/format.js';
import { getProviderHealth, healthTone } from '../lib/provider-health.js';
import { createFirstRun } from './first-run.js';
import { screenshotCaptureFailed, screenshotGuidance } from './screenshot-guidance.js';
import { classifyFile } from './file-kind.js';

// The popup script also runs inside the side panel, which must stay open.
const isPanel = document.body.dataset.surface === 'panel';

// DOM Elements
const openSidePanelBtn = document.getElementById('open-sidepanel-btn');
const settingsBtn = document.getElementById('settings-btn');
const providerBadge = document.getElementById('provider-badge');
const providerBadgeName = document.getElementById('provider-badge-name');
// Mode pill (Translate, Polish, Doc & Image) and the two panels it switches
const modeTranslate = document.getElementById('mode-translate');
const modePolish = document.getElementById('mode-polish');
const modeDocImage = document.getElementById('mode-doc-image');
const textModeSection = document.getElementById('text-mode-section');
const docImageSection = document.getElementById('doc-image-section');
const inputText = document.getElementById('input-text');
const charCount = document.getElementById('char-count');
const clearInputBtn = document.getElementById('clear-input-btn');
const actionBtn = document.getElementById('action-btn');
const btnText = actionBtn.querySelector('.btn-text');
const btnLoading = actionBtn.querySelector('.btn-loading');
const submitKbd = document.getElementById('submit-kbd');
const outputSection = document.getElementById('output-section');
const cardSlot = document.getElementById('card-slot');
const polishSection = document.getElementById('polish-section');
const polishProfessional = document.getElementById('polish-professional');
const polishConversational = document.getElementById('polish-conversational');
const polishConcise = document.getElementById('polish-concise');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const statusLine = document.getElementById('status-line');
// Recent row: the latest history item and the Library link
const recentLabel = document.getElementById('recent-label');
const recentItem = document.getElementById('recent-item');
// Doc & Image: one drop zone and file picker for both translators
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const documentPart = docImageSection.querySelector('.document-section');
const imagePart = docImageSection.querySelector('.image-section');
// Document elements
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
const themeBtn = document.getElementById('theme-btn');
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
let currentMode = 'translate'; // 'translate', 'polish' or 'docImage'
let currentLang = 'en';
let currentWindowId = null;
let uploadedFile = null;
let translatedContent = null;
let docTranslationPort = null;
let selectedImage = null;
let currentPolishHistoryId = null; // Track the current polish history entry
let currentPolishOriginalText = null; // Track the original text for polish
let currentTranslationData = null; // Track current translation for grammar page
// The history entry the Recent row is showing, and whether it is a polish
let recentEntry = null;
// Bumped on every Recent load, so a slow read cannot overwrite a newer one
let recentLoadSeq = 0;
// How much of each side of the Recent item is put in the DOM; CSS cuts the rest
const RECENT_PREVIEW_LENGTH = 120;

/**
 * Initialize the popup
 */
async function init() {
  // Not awaited: it only has to be ready before the reader clicks Open in sidebar
  cacheWindowId();
  await initLanguage();
  await initTheme();
  await annotateShortcuts();
  await renderProviderBadge();
  // The card's rules live in a JS string so the floating box can put them
  // inside a closed shadow root; the popup takes the same string into its
  // own document. popup.css maps the four tokens they consume.
  injectCardStyles(document.head, document);
  await checkApiKey();
  await loadFavoritesCount();
  setupEventListeners();
  showSubmitShortcut();
  updateCharCount();
  updateMode('translate');
  // Opening the popup is almost always to type, so the caret starts there.
  // Until a key is stored the key field is the only thing that works.
  if (needsKey) document.getElementById('first-run-key').focus();
  else inputText.focus();
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
    const detail = t(key, currentLang).replace('{ago}', record ? formatRelativeTime(record.at, currentLang) : '');
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
 * Name each button's shortcut on the button itself, in its <kbd>.
 *
 * A shortcut is learned while doing the slow version of the same action,
 * not from a reference list the user would have to go looking for. Only
 * buttons that do exactly what the command does carry one, and only when
 * Chrome actually bound it: naming a key that does nothing is worse than
 * naming none at all, so an unbound command keeps its kbd hidden.
 */
async function annotateShortcuts() {
  const targets = document.querySelectorAll('[data-shortcut-for]');
  if (targets.length === 0) return;

  const bound = await getBoundShortcuts();

  targets.forEach(el => {
    const shortcut = bound.get(el.dataset.shortcutFor);
    if (!shortcut) return;

    el.setAttribute('aria-keyshortcuts', shortcut);
    const kbd = el.querySelector('kbd');
    if (!kbd) return;
    kbd.textContent = shortcut;
    kbd.hidden = false;
  });
}

/**
 * Show the platform's submit key on the primary button. The markup carries
 * the non-Mac form so the button is never blank before this runs.
 */
function showSubmitShortcut() {
  const { label, aria } = submitShortcut();
  submitKbd.textContent = label;
  actionBtn.setAttribute('aria-keyshortcuts', aria);
}

/**
 * Remember which window this page is in. sidePanel.open() must run inside the
 * click's user gesture, so the click handler reads this instead of awaiting
 * chrome.windows.getCurrent() first.
 */
async function cacheWindowId() {
  try {
    currentWindowId = (await chrome.windows.getCurrent()).id;
  } catch (error) {
    // The click handler falls back to asking at click time
  }
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

// The first-run key section: shown while the selected provider has no key,
// and Translate stays off for as long as it is showing.
const firstRun = createFirstRun({
  doc: document,
  getLang: () => currentLang,
  onNeedsKeyChange: (needs) => {
    needsKey = needs;
    actionBtn.disabled = isProcessing || needsKey;
  },
  storage: { getSelectedProvider, setSelectedProvider, getProviderApiKey, setProviderApiKey, normalizeApiKey, checkKeyFormat },
  testKey: (provider, key) => chrome.runtime.sendMessage({ action: ACTIONS.TEST_API_KEY, provider, key })
});

/**
 * Show or hide the first-run section for the selected provider.
 */
function checkApiKey() {
  return firstRun.check();
}

/**
 * Fill the Recent row with the newest entry for the current mode: the latest
 * polish in Polish, the latest translation otherwise. With nothing saved yet
 * the row is just the Library link.
 */
async function loadRecent() {
  const seq = ++recentLoadSeq;
  const polish = currentMode === 'polish';
  let latest = null;
  try {
    const [entry] = polish ? await getPolishHistory() : await getHistory();
    if (entry) latest = { entry, polish };
  } catch (error) {
    // An unreadable history only means there is nothing to offer here.
  }
  if (seq === recentLoadSeq) renderRecent(latest);
}

/**
 * One side of the Recent item, marked with its own direction so a Persian run
 * lays out right to left inside an English row and the reverse.
 * @param {string} value
 * @returns {HTMLSpanElement}
 */
function recentRun(value) {
  const run = document.createElement('span');
  run.textContent = Array.from(String(value || '')).slice(0, RECENT_PREVIEW_LENGTH).join('');
  run.dir = getTextDirection(run.textContent);
  if (run.dir === 'rtl') run.lang = 'fa';
  return run;
}

/**
 * Write one Polish result into its card, marked with its own direction. The
 * Persian UI sets the whole popup right to left, and an English result that
 * inherited that put its final period at the start of the line.
 * @param {HTMLElement} el
 * @param {string} text
 */
function setPolishText(el, text) {
  el.textContent = text;
  el.dir = getTextDirection(el.textContent);
  el.lang = el.dir === 'rtl' ? 'fa' : 'en';
}

/**
 * Draw the Recent item as "original · translation" on one line.
 * @param {{entry: Object, polish: boolean}|null} latest
 */
function renderRecent(latest) {
  recentEntry = latest;
  recentItem.replaceChildren();
  recentLabel.hidden = !latest;
  recentItem.hidden = !latest;
  if (!latest) return;

  const { entry, polish } = latest;
  const result = polish ? entry.professional : entry.translation;
  const line = document.createElement('span');
  line.className = 'recent-text';
  // The line takes the direction of its first strong character, so an English
  // original in the Persian UI is still cut at its end, not its start.
  line.dir = 'auto';
  line.append(recentRun(entry.original), ' \u00b7 ', recentRun(result));
  recentItem.append(line);
}

/**
 * Put the Recent entry back on screen: the input it came from and its result.
 */
function reopenRecent() {
  if (!recentEntry) return;
  const { entry, polish } = recentEntry;

  inputText.value = entry.original;
  updateCharCount();
  updateInputDirection();

  if (polish) {
    // Same clean slate the translate path gets from updateMode
    hideAllOutputs();
    hideError();
    const { professional, conversational, concise } = entry;
    displayPolishResults({ professional, conversational, concise }, entry.original, entry.id);
    return;
  }

  // Newer entries keep the whole result, so a word comes back as its full card.
  const stored = entry.result && typeof entry.result === 'object'
    ? entry.result
    : { translation: entry.translation, direction: entry.direction };
  updateMode('translate');
  displayTranslation({ ...stored, fromCache: true });
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
      const windowId = currentWindowId ?? (await chrome.windows.getCurrent()).id;
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

  // The side panel stays open for hours, so a theme or language chosen in the
  // popup or Settings has to reach it without a reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (STORAGE_KEYS.theme in changes || STORAGE_KEYS.language in changes)) {
      if (STORAGE_KEYS.theme in changes) initTheme();
      // The badge's label is built from a translated string, so rebuild it too
      if (STORAGE_KEYS.language in changes) initLanguage().then(renderProviderBadge);
    }
  });

  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // First-run key setup
  firstRun.bind();
  // A key added or a provider switched in Settings while this stays open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || firstRun.isHolding()) return;
    const keyStorageKeys = [STORAGE_KEYS.selectedProvider, STORAGE_KEYS.apiKey, STORAGE_KEYS.geminiApiKey, STORAGE_KEYS.openaiApiKey];
    if (keyStorageKeys.some((key) => key in changes)) checkApiKey();
  });

  // Mode pill: an ARIA tablist with one tab stop. Arrow keys move and
  // select (wrapping), Home and End jump to the ends.
  const modeTabs = [
    { el: modeTranslate, name: 'translate' },
    { el: modePolish, name: 'polish' },
    { el: modeDocImage, name: 'docImage' }
  ];
  for (const { el, name } of modeTabs) {
    el.addEventListener('click', () => updateMode(name));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const i = modeTabs.findIndex(tab => tab.el === e.currentTarget);
      // The pill lays out right to left in the Persian UI, so the arrow that
      // points at the next tab flips with it.
      const forward = getComputedStyle(e.currentTarget).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      let next;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = modeTabs.length - 1;
      else if (e.key === forward) next = (i + 1) % modeTabs.length;
      else next = (i - 1 + modeTabs.length) % modeTabs.length;
      updateMode(modeTabs[next].name);
      modeTabs[next].el.focus();
    });
  }

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

  // Recent row: the latest item reopens in place. Library is a plain link,
  // so middle-click and "open in new tab" work without a handler.
  recentItem.addEventListener('click', reopenRecent);

  // Doc & Image: choose, drop or paste one file
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileInputChange);
  docImageSection.addEventListener('dragover', handleDragOver);
  docImageSection.addEventListener('dragleave', handleDragLeave);
  docImageSection.addEventListener('drop', handleDrop);
  // A file let go anywhere else must not replace the popup with the file.
  document.addEventListener('dragover', blockStrayDrop);
  document.addEventListener('drop', blockStrayDrop);

  // Document buttons
  removeFileBtn.addEventListener('click', () => { clearFile(); dropZone.focus(); });
  downloadBtn.addEventListener('click', downloadTranslation);
  cancelTranslationBtn.addEventListener('click', handleCancelTranslation);
  translateDocBtn.addEventListener('click', handleDocumentTranslate);

  // Image buttons
  screenshotTranslateBtn.addEventListener('click', handleScreenshotTranslate);
  removeImageBtn.addEventListener('click', () => { clearImage(); dropZone.focus(); });
  translateImageBtn.addEventListener('click', handleImageTranslate);
  imageCopyBtn.addEventListener('click', handleImageCopy);

  // Note: a dedicated "Paste" button was tried but removed - Chrome
  // extension popups need the `clipboardRead` permission to call
  // navigator.clipboard.read(), and requesting it on update would
  // trigger a permission-change warning for every existing user.
  // The document-level Ctrl+V handler below (handlePaste) covers paste
  // and the drop zone's hint tells users about it.

  // Translate Page button
  const translatePageBtn = document.getElementById('translate-page-btn');
  if (translatePageBtn) {
    translatePageBtn.addEventListener('click', handleTranslatePage);
  }

  // Clipboard paste for images
  document.addEventListener('paste', handlePaste);

  // Theme toggle
  themeBtn.addEventListener('click', toggleTheme);
}

/**
 * Switch the form to a mode from the pill. Translate and Polish share the
 * textarea; Doc & Image swaps it for the document and image areas.
 * @param {'translate'|'polish'|'docImage'} mode
 */
function updateMode(mode) {
  currentMode = mode;

  // aria-selected drives the active look (.mode-switcher-btn[aria-selected="true"]);
  // the roving tabindex keeps the pill a single tab stop.
  const tabs = { translate: modeTranslate, polish: modePolish, docImage: modeDocImage };
  for (const [name, el] of Object.entries(tabs)) {
    const active = name === mode;
    el.setAttribute('aria-selected', active ? 'true' : 'false');
    el.tabIndex = active ? 0 : -1;
  }

  const isText = mode !== 'docImage';
  textModeSection.hidden = !isText;
  docImageSection.hidden = isText;

  if (isText) {
    textModeSection.setAttribute('aria-labelledby', tabs[mode].id);
    btnText.textContent = mode === 'translate' ? t('translate', currentLang) : t('polish', currentLang);
    inputText.placeholder = mode === 'translate' ? t('enterTextTranslate', currentLang) : t('enterTextPolish', currentLang);
    // Grammar notes only apply to a translation
    grammarToggleSection.hidden = mode !== 'translate';
  } else {
    // Only offer Translate for a document once one is selected
    translateDocBtn.hidden = !uploadedFile;
  }

  // Results belong to the mode that produced them
  hideAllOutputs();
  hideError();
  loadRecent();
}

/**
 * Handle action button click
 */
async function handleAction() {
  if (needsKey) return;
  if (currentMode === 'translate') {
    await handleTranslate();
  } else if (currentMode === 'polish') {
    await handlePolish();
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

    await loadRecent();

    // Update usage stats (analytics event logged in service worker)
    await updateUsageStats({
      inputTokens: response.fromCache ? 0 : (response.inputTokens || 0),
      outputTokens: response.fromCache ? 0 : (response.outputTokens || 0),
      translations: 1
    });
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
    await loadRecent();

    // Update usage stats (analytics event logged in service worker)
    await updateUsageStats({
      inputTokens: response.inputTokens || 0,
      outputTokens: response.outputTokens || 0,
      polishes: 1
    });
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

  setPolishText(polishProfessional, result.professional);
  setPolishText(polishConversational, result.conversational);
  setPolishText(polishConcise, result.concise);
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
 * Set loading state
 * @param {boolean} loading
 */
function setLoadingState(loading) {
  isProcessing = loading;
  actionBtn.disabled = loading || needsKey;
  btnText.hidden = loading;
  submitKbd.hidden = loading;
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
// Long enough to read a sentence that says what to do instead
const SCREENSHOT_GUIDANCE_MS = 10000;

/**
 * Report the outcome of a secondary action (copy, favorite, regenerate) in
 * the status line. Unlike showError it leaves the result on screen: a failed
 * copy is no reason to lose the translation the user was reading.
 *
 * @param {string} message
 * @param {'success' | 'warning'} [tone]
 * @param {number} [duration] Milliseconds before the line clears; longer
 *   messages that tell the reader what to do next need longer than a confirmation
 */
function showNotice(message, tone = 'success', duration = 3000) {
  if (!statusLine) return;
  clearTimeout(statusLineTimer);
  statusLine.textContent = message;
  statusLine.classList.toggle('is-warning', tone === 'warning');
  statusLineTimer = setTimeout(() => { statusLine.textContent = ''; }, duration);
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
  cardSlot.replaceChildren();
  currentCardEl = null;
  currentTranslationData = null;
  cancelSpeech();
}

// ============================================
// Document Translation Functions
// ============================================

/**
 * Send a chosen, dropped or pasted file to the translator its type belongs
 * to. One file at a time: the drop zone, and with it drop and paste, is gone
 * while a file is loaded, until Remove brings it back.
 * @param {File} file
 */
function routeFile(file) {
  hideError();
  const kind = classifyFile(file);
  if (!kind) {
    showError(t('unsupportedFileType', currentLang));
    return;
  }

  if (kind.kind === 'document') {
    if (!loadDocument(file)) return;
    showNotice(t('documentReady', currentLang));
  } else {
    // A file the browser could not type is passed on with the type its
    // extension implies, which is what the image request sends.
    const image = file.type === kind.mimeType ? file : new File([file], file.name, { type: kind.mimeType });
    if (!handleImageSelect(image)) return;
    showNotice(t('imageReady', currentLang));
  }
  updateDropZone();
  // The drop zone is gone now; a text file is ready at once, so focus moves
  // on to its Translate button (an image's moves once its preview is drawn).
  if (kind.kind === 'document') translateDocBtn.focus();
}

/** The drop zone shows until a file is loaded, and each part only with its file. */
function updateDropZone() {
  dropZone.hidden = Boolean(uploadedFile || selectedImage);
  documentPart.hidden = !uploadedFile;
  imagePart.hidden = !selectedImage;
  if (dropZone.hidden) dropZone.classList.remove('is-dragover');
}

function handleFileInputChange(event) {
  const file = event.target.files[0];
  // The same file chosen again after Remove still fires change.
  fileInput.value = '';
  if (file) routeFile(file);
}

function draggingFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

function handleDragOver(event) {
  if (!draggingFiles(event) || dropZone.hidden) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('is-dragover');
}

function handleDragLeave(event) {
  if (!docImageSection.contains(event.relatedTarget)) dropZone.classList.remove('is-dragover');
}

function handleDrop(event) {
  if (!draggingFiles(event)) return;
  event.preventDefault();
  dropZone.classList.remove('is-dragover');
  if (dropZone.hidden) return;
  const file = event.dataTransfer.files[0];
  if (file) routeFile(file);
}

function blockStrayDrop(event) {
  if (!draggingFiles(event) || event.defaultPrevented) return;
  event.preventDefault();
  if (event.type === 'dragover') event.dataTransfer.dropEffect = 'none';
}

/**
 * Load a text file into the document translator.
 * @param {File} file
 * @returns {boolean} Whether the file was taken
 */
function loadDocument(file) {
  // Validate file size (100KB max)
  if (file.size > 100 * 1024) {
    showError(t('fileTooLarge', currentLang));
    return false;
  }

  // Validate file is not empty
  if (file.size === 0) {
    showError(t('fileEmpty', currentLang));
    return false;
  }

  uploadedFile = file;
  docName.textContent = file.name;
  docSize.textContent = formatFileSize(file.size);

  documentInfo.hidden = false;
  downloadSection.hidden = true;
  translationProgress.hidden = true;
  translatedContent = null;

  // Show translate button for document
  translateDocBtn.hidden = false;
  return true;
}

/**
 * Clear uploaded file
 */
function clearFile() {
  uploadedFile = null;
  translatedContent = null;
  fileInput.value = '';

  documentInfo.hidden = true;
  downloadSection.hidden = true;
  translationProgress.hidden = true;
  translateDocBtn.hidden = true;
  updateDropZone();
}

/**
 * Set loading state for document translate button
 * @param {boolean} loading
 */
function setDocLoadingState(loading) {
  isProcessing = loading;
  translateDocBtn.disabled = loading;
  // Removing the file mid-run would leave the run going behind the drop
  // zone; Cancel stops it first.
  removeFileBtn.disabled = loading;
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
    showError(t('selectFileFirst', currentLang));
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
    showError(t('fileEmpty', currentLang));
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
  a.download = uploadedFile.name.replace(/(\.txt)?$/i, '_translated.txt');
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
 * Handle paste event for clipboard images
 */
function handlePaste(event) {
  // Only while Doc & Image is showing and nothing is loaded yet
  if (currentMode !== 'docImage' || dropZone.hidden) return;

  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        routeFile(file);
        event.preventDefault();
        break;
      }
    }
  }
}


/**
 * Load an image into image translation (from the drop zone, picker or paste)
 * @param {File} file - Image file
 * @returns {boolean} Whether the image was taken
 */
function handleImageSelect(file) {
  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showError(t('unsupportedFormat', currentLang));
    return false;
  }

  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    showError(t('imageTooLarge', currentLang));
    return false;
  }

  selectedImage = file;

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    imagePreview.hidden = false;
    translateImageBtn.hidden = false;
    imageResult.hidden = true;
    // The drop zone that had focus is gone; carry it to the next step.
    if (document.activeElement === document.body) translateImageBtn.focus();
  };
  reader.readAsDataURL(file);
  return true;
}

/**
 * Clear selected image
 */
function clearImage() {
  selectedImage = null;
  fileInput.value = '';
  previewImg.src = '';

  imagePreview.hidden = true;
  translateImageBtn.hidden = true;
  imageResult.hidden = true;
  updateDropZone();
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

    if (screenshotCaptureFailed(response)) {
      // A click inside the side panel does not grant activeTab, so the capture
      // is refused on most tabs. The shortcut and the context menu item do grant it.
      const shortcut = (await getBoundShortcuts()).get('screenshot-translate');
      showNotice(screenshotGuidance(currentLang, shortcut), 'warning', SCREENSHOT_GUIDANCE_MS);
      return;
    }

    // Send to content script to start selection
    await chrome.tabs.sendMessage(tab.id, {
      action: 'START_SCREENSHOT_SELECT',
      screenshotDataUrl: response.screenshotDataUrl
    });

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
  // The request is short and cannot be cancelled, so the image stays until it answers.
  removeImageBtn.disabled = loading;
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
 * Open the Library on its Favorites tab
 */
function openFavoritesPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('library/library.html?tab=favorites') });
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
      setPolishText(polishProfessional, response.text);
    } else if (version === 'conversational') {
      setPolishText(polishConversational, response.text);
    } else if (version === 'concise') {
      setPolishText(polishConcise, response.text);
    }

    // Update usage stats (analytics event logged in service worker)
    await updateUsageStats({
      inputTokens: response.inputTokens || 0,
      outputTokens: response.outputTokens || 0,
      polishes: 0 // Don't count regenerate as new polish
    });

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
