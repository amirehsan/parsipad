import { getTextDirection } from '../lib/language-detect.js';
import { getHistory, clearHistory, getPolishHistory, clearPolishHistory, getDictionaryHistory, clearDictionaryHistory } from '../lib/history.js';
import { getTheme, setTheme, getUsageStats, updateUsageStats, resetUsageStats, getLanguage } from '../lib/storage.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements
const settingsBtn = document.getElementById('settings-btn');
const apiKeyWarning = document.getElementById('api-key-warning');
const configureApiBtn = document.getElementById('configure-api-btn');
const tabTranslate = document.getElementById('tab-translate');
const tabPolish = document.getElementById('tab-polish');
const tabDictionary = document.getElementById('tab-dictionary');
const tabDocument = document.getElementById('tab-document');
const tabImage = document.getElementById('tab-image');
const inputText = document.getElementById('input-text');
const charCount = document.getElementById('char-count');
const clearInputBtn = document.getElementById('clear-input-btn');
const actionBtn = document.getElementById('action-btn');
const btnText = actionBtn.querySelector('.btn-text');
const btnLoading = actionBtn.querySelector('.btn-loading');
const outputSection = document.getElementById('output-section');
const directionBadge = document.getElementById('direction-badge');
const copyBtn = document.getElementById('copy-btn');
const outputText = document.getElementById('output-text');
const cacheBadge = document.getElementById('cache-badge');
const polishSection = document.getElementById('polish-section');
const polishProfessional = document.getElementById('polish-professional');
const polishConversational = document.getElementById('polish-conversational');
const polishConcise = document.getElementById('polish-concise');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
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
// Grammar elements
const grammarToggleSection = document.getElementById('grammar-toggle-section');
const grammarCheckbox = document.getElementById('grammar-checkbox');
const grammarSection = document.getElementById('grammar-section');
const grammarPoints = document.getElementById('grammar-points');
// Image elements
const imageUploadSection = document.getElementById('image-upload-section');
const imageUploadArea = document.getElementById('image-upload-area');
const imageInput = document.getElementById('image-input');
const selectImageBtn = document.getElementById('select-image-btn');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const removeImageBtn = document.getElementById('remove-image-btn');
const translateImageBtn = document.getElementById('translate-image-btn');
const imageResult = document.getElementById('image-result');
const extractedText = document.getElementById('extracted-text');
const imageDirectionBadge = document.getElementById('image-direction-badge');
const imageTranslation = document.getElementById('image-translation');
const imageCopyBtn = document.getElementById('image-copy-btn');
const themeBtn = document.getElementById('theme-btn');
const statsToggle = document.getElementById('stats-toggle');
const statsContent = document.getElementById('stats-content');
const statTranslations = document.getElementById('stat-translations');
const statPolishes = document.getElementById('stat-polishes');
const statInputTokens = document.getElementById('stat-input-tokens');
const statOutputTokens = document.getElementById('stat-output-tokens');
const resetStatsBtn = document.getElementById('reset-stats-btn');

// State
let isProcessing = false;
let currentMode = 'translate'; // 'translate', 'polish', 'dictionary', 'document', or 'image'
let currentLang = 'en';
let uploadedFile = null;
let translatedContent = null;
let selectedImage = null;

/**
 * Initialize the popup
 */
async function init() {
  await initLanguage();
  await initTheme();
  await checkApiKey();
  await loadHistory();
  await loadStats();
  setupEventListeners();
  updateCharCount();
  updateMode('translate');
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
  let effectiveTheme = theme;

  if (theme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme', effectiveTheme);
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
 * Check if API key is configured
 */
async function checkApiKey() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'CHECK_API_KEY' });
    if (!response.hasApiKey) {
      apiKeyWarning.hidden = false;
    }
  } catch (error) {
    // Silently handle API key check errors
  }
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
 * Format direction for display (e.g., 'ru-fa' -> 'RU→FA')
 * @param {string} direction - Direction string like 'en-fa' or 'fa-en'
 * @returns {string} - Formatted display string
 */
function formatDirectionBadge(direction) {
  const parts = direction.split('-');
  if (parts.length === 2) {
    return `${parts[0].toUpperCase()}→${parts[1].toUpperCase()}`;
  }
  return direction.toUpperCase();
}

/**
 * Render history items
 * @param {Array} history - History entries
 */
function renderHistory(history) {
  historyList.innerHTML = history.map(entry => {
    const targetLang = entry.direction.split('-')[1] || 'fa';
    const translationDir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';
    const badgeText = formatDirectionBadge(entry.direction);

    return `
      <div class="history-item" data-original="${escapeAttr(entry.original)}" data-translation="${escapeAttr(entry.translation)}" data-direction="${entry.direction}">
        <div class="history-item-content">
          <div class="history-item-original">${escapeHtml(entry.original)}</div>
          <div class="history-item-translation" dir="${translationDir}">${escapeHtml(entry.translation)}</div>
        </div>
        <span class="history-item-badge">${badgeText}</span>
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

      // Switch to translate mode and show result
      updateMode('translate');
      displayTranslation({ translation, direction, fromCache: true });
    });
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Settings button
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Configure API button
  configureApiBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Tab switching
  tabTranslate.addEventListener('click', () => updateMode('translate'));
  tabPolish.addEventListener('click', () => updateMode('polish'));
  tabDictionary.addEventListener('click', () => updateMode('dictionary'));
  tabDocument.addEventListener('click', () => updateMode('document'));
  tabImage.addEventListener('click', () => updateMode('image'));

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

  // Copy button for translation output
  copyBtn.addEventListener('click', handleCopy);

  // Copy buttons for polish outputs
  document.querySelectorAll('.polish-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePolishCopy(btn));
  });

  // Clear history button
  clearHistoryBtn.addEventListener('click', handleClearHistory);

  // View all history button
  viewAllHistoryBtn.addEventListener('click', openHistoryPage);

  // Polish history buttons
  clearPolishHistoryBtn.addEventListener('click', handleClearPolishHistory);
  viewAllPolishHistoryBtn.addEventListener('click', openHistoryPage);

  // Dictionary buttons
  clearDictHistoryBtn.addEventListener('click', handleClearDictionaryHistory);
  dictCopyBtn.addEventListener('click', handleDictCopy);

  // Document buttons
  selectFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  removeFileBtn.addEventListener('click', clearFile);
  downloadBtn.addEventListener('click', downloadTranslation);
  cancelTranslationBtn.addEventListener('click', handleCancelTranslation);

  // Image buttons
  selectImageBtn.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', handleImageFileSelect);
  removeImageBtn.addEventListener('click', clearImage);
  translateImageBtn.addEventListener('click', handleImageTranslate);
  imageCopyBtn.addEventListener('click', handleImageCopy);

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
  resetStatsBtn.addEventListener('click', async () => {
    await resetUsageStats();
    await loadStats();
  });
}

/**
 * Update mode (translate, polish, dictionary, document, or image)
 * @param {string} mode - 'translate', 'polish', 'dictionary', 'document', or 'image'
 */
function updateMode(mode) {
  currentMode = mode;

  // Update tabs
  tabTranslate.classList.toggle('active', mode === 'translate');
  tabPolish.classList.toggle('active', mode === 'polish');
  tabDictionary.classList.toggle('active', mode === 'dictionary');
  tabDocument.classList.toggle('active', mode === 'document');
  tabImage.classList.toggle('active', mode === 'image');

  // Update button text based on mode
  const buttonTexts = {
    translate: t('translate', currentLang),
    polish: t('polish', currentLang),
    dictionary: t('lookupWord', currentLang),
    document: t('translate', currentLang),
    image: t('translateImage', currentLang)
  };
  btnText.textContent = buttonTexts[mode] || t('translate', currentLang);

  // Update placeholder based on mode
  const placeholders = {
    translate: t('enterTextTranslate', currentLang),
    polish: t('enterTextPolish', currentLang),
    dictionary: t('enterWordToLookup', currentLang),
    document: t('enterTextTranslate', currentLang),
    image: t('enterTextTranslate', currentLang)
  };
  inputText.placeholder = placeholders[mode] || t('enterTextTranslate', currentLang);

  // Hide outputs when switching modes
  hideAllOutputs();
  hideError();

  // Hide all history sections first
  historySection.hidden = true;
  polishHistorySection.hidden = true;
  dictionaryHistorySection.hidden = true;

  // Show/hide input section based on mode
  const inputSection = inputText.closest('.section');
  const actionBtnEl = actionBtn;
  inputSection.hidden = mode === 'document' || mode === 'image';
  actionBtnEl.hidden = mode === 'document' || mode === 'image';

  // Show/hide grammar toggle (only in translate mode)
  grammarToggleSection.hidden = mode !== 'translate';

  // Show/hide document section
  documentUploadSection.hidden = mode !== 'document';

  // Show/hide image section
  imageUploadSection.hidden = mode !== 'image';

  // Load appropriate history
  if (mode === 'translate') {
    loadHistory();
  } else if (mode === 'polish') {
    loadPolishHistory();
  } else if (mode === 'dictionary') {
    loadDictionaryHistory();
  }
}

/**
 * Handle action button click
 */
async function handleAction() {
  if (currentMode === 'translate') {
    await handleTranslate();
  } else if (currentMode === 'polish') {
    await handlePolish();
  } else if (currentMode === 'dictionary') {
    await handleDictionary();
  } else if (currentMode === 'document') {
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
async function handleTranslate() {
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
    const response = await chrome.runtime.sendMessage({
      action: 'TRANSLATE',
      text: text,
      sourceLang: 'auto',
      withGrammar: withGrammar
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    displayTranslation(response);
    await loadHistory();

    // Update usage stats (always count translations, only track tokens for non-cached)
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

    displayPolishResults(response);

    // Update usage stats
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
 * Display translation result
 * @param {Object} result - Translation result
 */
function displayTranslation(result) {
  const { translation, direction, displayDirection, fromCache, grammar } = result;

  directionBadge.textContent = displayDirection || formatDirectionBadge(direction);

  const targetLang = direction.split('-')[1] || 'fa';
  const outputDir = ['fa', 'ar', 'he'].includes(targetLang) ? 'rtl' : 'ltr';
  outputText.dir = outputDir;
  outputText.textContent = translation;

  cacheBadge.hidden = !fromCache;
  outputSection.hidden = false;

  // Display grammar explanations if available
  if (grammar && grammar.length > 0) {
    displayGrammarExplanation(grammar);
  } else {
    grammarSection.hidden = true;
  }
}

/**
 * Display grammar explanation
 * @param {Array} grammarPointsList - Array of grammar points with point and explanation
 */
function displayGrammarExplanation(grammarPointsList) {
  grammarPoints.innerHTML = grammarPointsList.map(item => `
    <div class="grammar-point">
      <div class="grammar-point-title">${escapeHtml(item.point)}</div>
      <div class="grammar-point-explanation">${escapeHtml(item.explanation)}</div>
    </div>
  `).join('');

  grammarSection.hidden = false;
}

/**
 * Display polish results
 * @param {Object} result - Polish result with professional, conversational, concise
 */
function displayPolishResults(result) {
  polishProfessional.textContent = result.professional;
  polishConversational.textContent = result.conversational;
  polishConcise.textContent = result.concise;
  polishSection.hidden = false;
}

/**
 * Handle copy button click for translation
 */
async function handleCopy() {
  const text = outputText.textContent;

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showError('Failed to copy to clipboard');
  }
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
    setTimeout(() => {
      btn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showError('Failed to copy to clipboard');
  }
}

/**
 * Handle clear history button click
 */
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
      const original = item.dataset.original;
      const professional = item.dataset.professional;
      const conversational = item.dataset.conversational;
      const concise = item.dataset.concise;

      inputText.value = original;
      updateCharCount();
      updateInputDirection();

      // Show polish results directly
      displayPolishResults({ professional, conversational, concise });
    });
  });
}

/**
 * Set loading state
 * @param {boolean} loading
 */
function setLoadingState(loading) {
  isProcessing = loading;
  actionBtn.disabled = loading;
  btnText.hidden = loading;
  btnLoading.hidden = !loading;
}

/**
 * Show error message
 * @param {string} message
 */
function showError(message) {
  errorMessage.textContent = message;
  errorSection.hidden = false;
  hideAllOutputs();
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
function displayDictionaryResult(result) {
  const { word, phonetic, partOfSpeech, definitions, synonyms, antonyms, translation, targetLang } = result;

  // Word and phonetic
  dictWord.textContent = word;
  dictPhonetic.textContent = phonetic || '';
  dictPhonetic.hidden = !phonetic;

  // Part of speech
  dictPos.textContent = partOfSpeech || '';
  dictPos.hidden = !partOfSpeech;

  // Definitions
  if (definitions && definitions.length > 0) {
    dictDefinitions.innerHTML = definitions.map((def, i) => `
      <div class="dict-definition-item">
        <div class="dict-meaning">${i + 1}. ${escapeHtml(def.meaning)}</div>
        ${def.example ? `<div class="dict-example">"${escapeHtml(def.example)}"</div>` : ''}
      </div>
    `).join('');
  } else {
    dictDefinitions.innerHTML = '';
  }

  // Synonyms
  if (synonyms && synonyms.length > 0) {
    dictSynonyms.innerHTML = synonyms.slice(0, 5).map(s =>
      `<span class="dict-tag">${escapeHtml(s)}</span>`
    ).join('');
    dictSynonymsSection.hidden = false;
  } else {
    dictSynonymsSection.hidden = true;
  }

  // Antonyms
  if (antonyms && antonyms.length > 0) {
    dictAntonyms.innerHTML = antonyms.slice(0, 3).map(a =>
      `<span class="dict-tag dict-tag-antonym">${escapeHtml(a)}</span>`
    ).join('');
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
    setTimeout(() => {
      dictCopyBtn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showError('Failed to copy to clipboard');
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

  // Validate file size (100KB max)
  if (file.size > 100 * 1024) {
    showError(t('fileTooLarge', currentLang));
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
  actionBtn.hidden = false;
  btnText.textContent = t('translate', currentLang);
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
  actionBtn.hidden = true;
}

/**
 * Handle document translation
 */
async function handleDocumentTranslate() {
  if (!uploadedFile) {
    showError('Please select a file');
    return;
  }

  const content = await uploadedFile.text();

  setLoadingState(true);
  translationProgress.hidden = false;
  downloadSection.hidden = true;
  updateProgress(0, 0, 1);

  // Reset cancel button state
  cancelTranslationBtn.disabled = false;
  cancelTranslationBtn.textContent = t('cancel', currentLang);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'TRANSLATE_DOCUMENT',
      content: content,
      filename: uploadedFile.name,
      sourceLang: 'auto'
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    // Check if translation was cancelled
    if (response.cancelled) {
      showError(t('translationCancelled', currentLang));
      translationProgress.hidden = true;
      return;
    }

    translatedContent = response.translation;
    downloadSection.hidden = false;
    updateProgress(100, response.chunks || 1, response.totalChunks || response.chunks || 1);

    // Update usage stats
    await updateUsageStats({
      inputTokens: response.totalInputTokens || 0,
      outputTokens: response.totalOutputTokens || 0,
      translations: 1
    });
    await loadStats();
  } catch (error) {
    showError(error.message || 'Document translation failed');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Handle cancel translation button click
 */
async function handleCancelTranslation() {
  cancelTranslationBtn.disabled = true;
  cancelTranslationBtn.textContent = t('translationCancelled', currentLang);

  try {
    await chrome.runtime.sendMessage({
      action: 'CANCEL_DOCUMENT_TRANSLATION'
    });
  } catch (error) {
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
  // Only handle paste when in image mode
  if (currentMode !== 'image') return;

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

    // Update usage stats
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
function displayImageResult(result) {
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
  imageDirectionBadge.textContent = formatDirectionBadge(direction);

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
    setTimeout(() => {
      imageCopyBtn.classList.remove('copied');
    }, 1500);
  } catch (error) {
    showError('Failed to copy to clipboard');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
