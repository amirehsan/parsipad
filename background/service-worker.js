import { translate, explainGrammar, polish, translateImage, regeneratePolishVariant, getGrammarLesson } from '../lib/api.js';
import { lookupWord } from '../lib/dictionary.js';
import { translateDocument } from '../lib/document-translator.js';
import { translationCache } from '../lib/cache.js';
import { hasApiKey, getDictionaryTranslationSettings, isTranslationCancelled, setTranslationCancelled, getSelectedProvider, getFavorites, addFavorite, removeFavorite, isFavorite, hasCompletedOnboarding, logUsageEvent, runCacheMigrations, getTranslateOtherLanguages, getLanguage } from '../lib/storage.js';
import { detectLanguageCode, isSupportedLanguage, getTranslationInfo } from '../lib/language-detect.js';
import { addToHistory, addToPolishHistory, addToDictionaryHistory, updatePolishVariant } from '../lib/history.js';
import { ACTIONS, PROVIDER_CONFIGS, ACTION_TYPES, ERROR_MESSAGES } from '../lib/constants.js';
import { classifyMode, MODES } from '../lib/translation/mode.js';
import { normalizeInput, normalizePersian } from '../lib/translation/normalize.js';
import { buildCacheKeyParts, hashContext } from '../lib/translation/cache-key.js';
import { TranslationError, ERROR_CODES, toTranslationError, errorI18nKey } from '../lib/translation/errors.js';
import { t } from '../lib/i18n.js';

/**
 * Localized error payload for UI consumers.
 * @param {unknown} error
 * @returns {Promise<{error: string, errorCode: string}>}
 */
async function localizeError(error) {
  const err = toTranslationError(error);
  let lang = 'en';
  try { lang = await getLanguage(); } catch { /* default */ }
  const message = err.code === ERROR_CODES.UNKNOWN ? err.message : t(errorI18nKey(err.code), lang);
  return { error: message, errorCode: err.code };
}

/**
 * Handle incoming messages from popup or content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(async (error) => sendResponse(await localizeError(error)));
  return true;
});

/**
 * Process incoming messages
 * @param {Object} message - Message object
 * @param {Object} sender - Sender information
 * @returns {Promise<Object>}
 */
async function handleMessage(message, _sender) {
  switch (message.action) {
    case ACTIONS.TRANSLATE:
      return handleTranslate(message);

    case ACTIONS.POLISH:
      return handlePolish(message.text);

    case ACTIONS.DICTIONARY_LOOKUP:
      return handleDictionaryLookup(message.word, message.sourceLang);

    case ACTIONS.TRANSLATE_DOCUMENT:
      return handleDocumentTranslation(message.content);

    case ACTIONS.CANCEL_DOCUMENT_TRANSLATION:
      await setTranslationCancelled(true);
      return { cancelled: true };

    case ACTIONS.TRANSLATE_IMAGE:
      return handleImageTranslation(message.imageData, message.mimeType);

    case ACTIONS.CAPTURE_SCREENSHOT:
      return handleScreenshotCapture();

    case ACTIONS.REGENERATE_POLISH_VARIANT:
      return handleRegeneratePolishVariant(message.text, message.variant, message.historyId);

    case ACTIONS.ADD_FAVORITE:
      return handleAddFavorite(message.item);

    case ACTIONS.REMOVE_FAVORITE:
      return handleRemoveFavorite(message.id, message.originalText, message.savedText);

    case ACTIONS.GET_FAVORITES:
      return { favorites: await getFavorites() };

    case ACTIONS.CHECK_FAVORITE:
      return handleCheckFavorite(message.originalText, message.savedText);

    case ACTIONS.CHECK_API_KEY:
      return { hasApiKey: await hasApiKey() };

    case ACTIONS.GET_GRAMMAR_LESSON:
      return handleGrammarLesson(message.originalText, message.translation, message.direction);

    case ACTIONS.EXPLAIN_GRAMMAR:
      return handleExplainGrammar(message);

    case ACTIONS.TRANSLATE_PAGE:
      // Forward to content script - handled there
      return { action: 'forward_to_content' };

    case ACTIONS.CANCEL_PAGE_TRANSLATION:
      // Forward to content script - handled there
      return { action: 'forward_to_content' };

    case ACTIONS.TOGGLE_PAGE_TRANSLATION:
      // Forward to content script - handled there
      return { action: 'forward_to_content' };

    case ACTIONS.GET_PAGE_TRANSLATION_STATE:
      // Forward to content script - handled there
      return { action: 'forward_to_content' };

    case ACTIONS.OPEN_OPTIONS:
      await chrome.runtime.openOptionsPage();
      return { success: true };

    case ACTIONS.OPEN_GRAMMAR_PAGE: {
      // Content scripts can't open tabs directly. Forward the request so the
      // floating box's "Learn More" button can launch the full lesson page
      // pre-populated with the user's just-translated sentence.
      const params = new URLSearchParams({
        original: message.original || '',
        translation: message.translation || '',
        direction: message.direction || ''
      });
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`grammar/grammar.html?${params.toString()}`)
      });
      return { success: true };
    }

    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

const VALID_MODES = new Set(Object.values(MODES));
const CONTEXT_MODES = new Set([MODES.WORD, MODES.PHRASE, MODES.SENTENCE]);
const CONTEXT_HASH_MODES = new Set([MODES.WORD, MODES.PHRASE]);

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return undefined;
  const before = String(context.before || '').slice(-300);
  const after = String(context.after || '').slice(0, 300);
  const pageLang = String(context.pageLang || '').slice(0, 12);
  const title = String(context.title || '').slice(0, 120);
  if (!before && !after && !pageLang && !title) return undefined;
  return { before, after, pageLang, title };
}

/**
 * Normalize, gate, classify and build the cache key for a request.
 */
async function prepareTranslation(payload) {
  const sourceText = normalizeInput(payload.text);
  if (!sourceText) throw new TranslationError(ERROR_CODES.EMPTY_INPUT);

  const sourceLang = payload.sourceLang === 'en' || payload.sourceLang === 'fa' ? payload.sourceLang : 'auto';
  const mode = VALID_MODES.has(payload.mode) ? payload.mode : classifyMode(sourceText);

  if (sourceLang === 'auto' && mode !== MODES.BATCH && !(await getTranslateOtherLanguages())) {
    const gate = isSupportedLanguage(sourceText);
    if (!gate.supported) throw new TranslationError(ERROR_CODES.UNSUPPORTED);
  }

  const info = getTranslationInfo(sourceText, sourceLang);
  const context = CONTEXT_MODES.has(mode) ? sanitizeContext(payload.context) : undefined;
  const providerId = await getSelectedProvider();
  const contextHash = CONTEXT_HASH_MODES.has(mode) ? await hashContext(context) : '';
  const keyParts = buildCacheKeyParts({ provider: providerId, mode, direction: info.direction, text: sourceText, contextHash });

  return { sourceText, sourceLang, mode, info, context, providerId, keyParts };
}

/**
 * Apply detected-source corrections and Persian normalization to a raw
 * translate() result, producing the result contract.
 */
function finalizeResult(raw, { mode, info, sourceText }) {
  let finalInfo = info;
  if (raw.detectedSource === 'fa-latn' || (raw.detectedSource === 'fa' && info.from !== 'fa')) {
    finalInfo = getTranslationInfo(sourceText, 'fa');
  } else if (raw.detectedSource === 'en' && info.from === 'fa') {
    finalInfo = getTranslationInfo(sourceText, 'en');
  }
  const toPersian = finalInfo.to === 'fa';
  const fixTarget = (s) => (toPersian && s ? normalizePersian(s) : (s || ''));
  const fixSource = (s) => (!toPersian && s ? normalizePersian(s) : (s || ''));

  const result = {
    translation: fixTarget(raw.translation),
    mode,
    direction: finalInfo.direction,
    displayDirection: finalInfo.displayDirection,
    detectedSource: raw.detectedSource || info.from,
    sourceText,
    normalized: raw.normalized ? normalizePersian(raw.normalized) : '',
    correction: fixSource(raw.correction),
    truncated: Boolean(raw.truncated)
  };

  if (mode === MODES.WORD || mode === MODES.PHRASE) {
    Object.assign(result, {
      pronunciation: raw.pronunciation || '',
      pos: raw.pos || '',
      register: raw.register || 'neutral',
      inContext: raw.inContext || '',
      senses: (raw.senses || []).map(s => ({
        pos: s.pos,
        meaning: fixTarget(s.meaning),
        example: { src: fixSource(s.example?.src), tgt: fixTarget(s.example?.tgt) }
      })),
      synonyms: (raw.synonyms || []).map(fixSource),
      antonyms: (raw.antonyms || []).map(fixSource)
    });
  } else if (mode === MODES.SENTENCE) {
    Object.assign(result, {
      register: raw.register || 'neutral',
      alternatives: (raw.alternatives || []).map(a => ({ text: fixTarget(a.text), label: a.label })),
      note: raw.note || ''
    });
  }
  return result;
}

/**
 * Handle a translation request (one-shot or streamed).
 * @param {object} payload - { text, sourceLang, context, mode }
 * @param {{signal?: AbortSignal, onDelta?: (text: string) => void}} [options]
 * @returns {Promise<object>} Result contract plus cached/fromCache/provider/token fields
 */
async function handleTranslate(payload, { signal, onDelta } = {}) {
  const prep = await prepareTranslation(payload);
  const providerName = PROVIDER_CONFIGS[prep.providerId]?.name || 'AI';

  const cached = await translationCache.get(prep.keyParts);
  if (cached) {
    return { ...cached, cached: true, fromCache: true, provider: providerName, inputTokens: 0, outputTokens: 0 };
  }

  const raw = await translate({
    text: prep.sourceText,
    mode: prep.mode,
    fromName: prep.info.detectedName,
    toName: prep.info.targetName,
    direction: prep.info.direction,
    detectedByScript: prep.sourceLang === 'auto',
    context: prep.context,
    glossary: [],
    signal,
    onDelta
  });

  const result = finalizeResult(raw, prep);

  if (!result.truncated) {
    await translationCache.set(prep.keyParts, result);
  }
  await addToHistory({ original: prep.sourceText, translation: result.translation, direction: result.direction, mode: prep.mode, result });
  await logUsageEvent({
    action: ACTION_TYPES.TRANSLATE, provider: prep.providerId,
    inputTokens: raw.inputTokens || 0,
    outputTokens: raw.outputTokens || 0
  });

  return { ...result, cached: false, fromCache: false, provider: providerName, inputTokens: raw.inputTokens || 0, outputTokens: raw.outputTokens || 0 };
}

/**
 * Explain the grammar of an existing translation pair (cached per pair).
 * @param {{source: string, translation: string, direction: string}} payload
 */
async function handleExplainGrammar({ source, translation, direction }) {
  if (!source || !translation) throw new TranslationError(ERROR_CODES.EMPTY_INPUT);
  const providerId = await getSelectedProvider();
  const keyParts = [providerId, 'grammar', direction || '', '', `${source}\n${translation}`];

  const cached = await translationCache.get(keyParts);
  if (cached) return { ...cached, cached: true };

  const result = await explainGrammar(source, translation, direction);
  const payload = { grammar: result.grammar };
  await translationCache.set(keyParts, payload);
  await logUsageEvent({
    action: ACTION_TYPES.GRAMMAR, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });
  return { ...payload, cached: false };
}

/**
 * Handle polish request (no caching)
 * @param {string} text - Text to polish
 * @returns {Promise<Object>}
 */
async function handlePolish(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for polishing');
  }

  // Polish currently only handles English copy, so non-en input is rejected.
  const gate = isSupportedLanguage(text);
  if (!gate.supported) {
    throw new Error(ERROR_MESSAGES.UNSUPPORTED_LANGUAGE);
  }

  // Get current provider info
  const providerId = await getSelectedProvider();
  const providerConfig = PROVIDER_CONFIGS[providerId];

  // Call API (no caching for polish - user expects fresh results)
  const result = await polish(text);

  // Add to polish history
  await addToPolishHistory(text, result.professional, result.conversational, result.concise);

  // Log analytics event
  await logUsageEvent({
    action: ACTION_TYPES.POLISH, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });

  return {
    professional: result.professional,
    conversational: result.conversational,
    concise: result.concise,
    corrections: result.corrections,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    provider: providerConfig?.name || 'AI'
  };
}

/**
 * Handle dictionary lookup request
 * @param {string} word - Word to look up
 * @param {'auto' | string} sourceLang - Source language
 * @returns {Promise<Object>}
 */
async function handleDictionaryLookup(word, sourceLang = 'auto') {
  if (!word || word.trim().length === 0) {
    throw new Error('No word provided');
  }

  // Validate single word
  const cleanWord = word.trim();
  if (cleanWord.split(/\s+/).length > 1) {
    throw new Error('Dictionary lookup is for single words only');
  }

  // Persian/English only
  const gate = isSupportedLanguage(cleanWord);
  if (!gate.supported) {
    throw new Error(ERROR_MESSAGES.UNSUPPORTED_LANGUAGE);
  }

  // Get current provider info
  const providerId = await getSelectedProvider();
  const providerConfig = PROVIDER_CONFIGS[providerId];

  // Get dictionary translation settings
  const dictSettings = await getDictionaryTranslationSettings();

  // Detect the word's language to determine if translation should be shown
  const detectedLang = detectLanguageCode(cleanWord);
  let showTranslation = true;

  if (detectedLang === 'en' && !dictSettings.enToFa) {
    // English word, but EN→FA translation is disabled
    showTranslation = false;
  } else if (detectedLang === 'fa' && !dictSettings.faToEn) {
    // Persian word, but FA→EN translation is disabled
    showTranslation = false;
  }

  // Call API with translation preference
  const result = await lookupWord(cleanWord, sourceLang, showTranslation);

  // Add to dictionary history
  await addToDictionaryHistory(cleanWord, result);

  // Log analytics event
  await logUsageEvent({
    action: ACTION_TYPES.DICTIONARY, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });

  return {
    ...result,
    provider: providerConfig?.name || 'AI'
  };
}

/**
 * Handle document translation request
 * @param {string} content - Document content to translate
 * @returns {Promise<Object>}
 */
async function handleDocumentTranslation(content, onProgress = () => {}) {
  if (!content || content.trim().length === 0) {
    throw new Error('No content provided for translation');
  }

  // Reset cancellation flag before starting
  await setTranslationCancelled(false);

  // Get current provider info
  const providerId = await getSelectedProvider();

  // Translate document with cancellation check and progress streaming
  const result = await translateDocument(
    content,
    onProgress,
    isTranslationCancelled
  );

  // Log analytics event
  if (!result.cancelled) {
    await logUsageEvent({
      action: ACTION_TYPES.DOCUMENT, provider: providerId,
      inputTokens: result.totalInputTokens || 0,
      outputTokens: result.totalOutputTokens || 0
    });
  }

  return {
    translation: result.translation,
    direction: result.direction,
    chunks: result.chunks,
    totalChunks: result.totalChunks,
    totalInputTokens: result.totalInputTokens,
    totalOutputTokens: result.totalOutputTokens,
    cancelled: result.cancelled || false
  };
}

/**
 * Port-based document translation. Popup opens a connection named
 * "translate-document"; we stream { type: 'progress', current, total, percent }
 * messages back during the translation and send { type: 'done', ... } or
 * { type: 'error', error } when finished.
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'translate-document') return;

  let cancelled = false;
  port.onDisconnect.addListener(() => {
    // If the popup closes mid-translation, cancel so the background worker
    // doesn't keep burning tokens for a UI nobody will see.
    cancelled = true;
    setTranslationCancelled(true).catch(() => {});
  });

  port.onMessage.addListener(async (msg) => {
    if (msg?.action === 'cancel') {
      cancelled = true;
      await setTranslationCancelled(true);
      return;
    }

    if (msg?.action !== 'start' || typeof msg.content !== 'string') {
      port.postMessage({ type: 'error', error: 'Invalid request' });
      return;
    }

    try {
      const result = await handleDocumentTranslation(msg.content, (current, total, percent) => {
        if (cancelled) return;
        try {
          port.postMessage({ type: 'progress', current, total, percent });
        } catch {
          // Port closed; nothing to do.
        }
      });
      try { port.postMessage({ type: 'done', ...result }); } catch { /* port closed */ }
    } catch (err) {
      try { port.postMessage({ type: 'error', error: err.message || 'Translation failed' }); } catch { /* port closed */ }
    }
  });
});

/**
 * Streaming translation port. Client sends { type: 'start', ...payload }; the
 * worker replies with delta messages, then done (or error). Disconnecting the
 * port aborts the provider request.
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'translate-stream') return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  const post = (msg) => {
    try { port.postMessage(msg); } catch { /* port closed */ }
  };

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'start') return;
    try {
      const result = await handleTranslate(msg, {
        signal: controller.signal,
        onDelta: (text) => post({ type: 'delta', text })
      });
      post({ type: 'done', result });
    } catch (error) {
      const { error: message, errorCode } = await localizeError(error);
      post({ type: 'error', code: errorCode, message });
    }
  });
});

/**
 * Handle image translation request
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<Object>}
 */
async function handleImageTranslation(base64Data, mimeType) {
  if (!base64Data) {
    throw new Error('No image data provided');
  }

  // Get current provider info
  const providerId = await getSelectedProvider();
  const providerConfig = PROVIDER_CONFIGS[providerId];

  // Call API
  const result = await translateImage(base64Data, mimeType);

  // Log analytics event
  await logUsageEvent({
    action: ACTION_TYPES.IMAGE, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });

  return {
    extractedText: result.extractedText,
    translation: result.translation,
    direction: result.direction,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    provider: providerConfig?.name || 'AI'
  };
}

/**
 * Handle screenshot capture request
 * @returns {Promise<Object>} Screenshot data URL
 */
async function handleScreenshotCapture() {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
  return { screenshotDataUrl: dataUrl };
}

/**
 * Handle regenerate polish variant request
 * @param {string} text - Original text to polish
 * @param {'professional' | 'conversational' | 'concise'} variant - Variant to regenerate
 * @param {number} historyId - History entry ID to update
 * @returns {Promise<Object>}
 */
async function handleRegeneratePolishVariant(text, variant, historyId) {
  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for polishing');
  }

  if (!['professional', 'conversational', 'concise'].includes(variant)) {
    throw new Error('Invalid variant type');
  }

  // Get current provider info
  const providerId = await getSelectedProvider();
  const providerConfig = PROVIDER_CONFIGS[providerId];

  // Call API
  const result = await regeneratePolishVariant(text, variant);

  // Update history if historyId provided
  if (historyId) {
    await updatePolishVariant(historyId, variant, result.text);
  }

  // Log analytics event
  await logUsageEvent({
    action: ACTION_TYPES.REGENERATE, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });

  return {
    text: result.text,
    variant,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    provider: providerConfig?.name || 'AI'
  };
}

/**
 * Handle add favorite request
 * @param {Object} item - Favorite item to add
 * @returns {Promise<Object>}
 */
async function handleAddFavorite(item) {
  const favorite = await addFavorite(item);
  return { success: !!favorite, favorite };
}

/**
 * Handle remove favorite request
 * @param {string} id - Favorite ID to remove (optional)
 * @param {string} original - Original text (optional, used with saved)
 * @param {string} savedText - Saved text (optional, used with originalText)
 * @returns {Promise<Object>}
 */
async function handleRemoveFavorite(id, originalText, savedText) {
  if (id) {
    const removed = await removeFavorite(id);
    return { success: removed };
  }

  // Remove by original and saved text
  if (originalText && savedText) {
    const favorite = await isFavorite(originalText, savedText);
    if (favorite) {
      const removed = await removeFavorite(favorite.id);
      return { success: removed };
    }
  }

  return { success: false };
}

/**
 * Handle check favorite request
 * @param {string} originalText - Original text
 * @param {string} savedText - Saved text
 * @returns {Promise<Object>}
 */
async function handleCheckFavorite(originalText, savedText) {
  const favorite = await isFavorite(originalText, savedText);
  return { isFavorite: !!favorite, favorite };
}

/**
 * Handle grammar lesson request
 * @param {string} originalText - Original text
 * @param {string} translation - Translated text
 * @param {string} direction - Translation direction ('en-to-fa' or 'fa-to-en')
 * @returns {Promise<Object>}
 */
async function handleGrammarLesson(originalText, translation, direction) {
  if (!originalText || !translation) {
    throw new Error('Original text and translation are required');
  }

  // Get current provider info
  const providerId = await getSelectedProvider();
  const providerConfig = PROVIDER_CONFIGS[providerId];

  // Call API
  const result = await getGrammarLesson(originalText, translation, direction);

  // Log analytics event
  await logUsageEvent({
    action: ACTION_TYPES.GRAMMAR, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });

  return {
    lesson: result.lesson,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    provider: providerConfig?.name || 'AI'
  };
}

/**
 * Create context menus on install and open welcome page for new installs
 */
// Run migrations on browser startup too so existing users who haven't
// reinstalled the extension still get the legacy cache cleared. The migration
// is idempotent (gated by STORAGE_KEYS.cacheMigrationVersion) so double-firing
// is harmless.
chrome.runtime.onStartup.addListener(() => { runCacheMigrations(); });

chrome.runtime.onInstalled.addListener(async (details) => {
  // Drop any legacy v1 cache entries that pre-date the SHA-256 keying fix.
  // Idempotent: only runs on first start after the bump.
  runCacheMigrations();

  // Localized context menus via chrome.i18n; falls back to English when no _locales match.
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: chrome.i18n.getMessage('ctxTranslateSelection') || 'Translate with ParsiPad',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'polish-selection',
    title: chrome.i18n.getMessage('ctxPolishSelection') || 'Polish with ParsiPad',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'dictionary-lookup',
    title: chrome.i18n.getMessage('ctxDictionaryLookup') || 'Look up in Dictionary',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'translate-page',
    title: chrome.i18n.getMessage('ctxTranslatePage') || 'Translate this page',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'screenshot-translate',
    title: chrome.i18n.getMessage('ctxScreenshotTranslate') || 'Screenshot & Translate',
    contexts: ['page']
  });

  // Open welcome page on fresh install
  if (details.reason === 'install') {
    const hasOnboarded = await hasCompletedOnboarding();
    if (!hasOnboarded) {
      chrome.tabs.create({
        url: chrome.runtime.getURL('welcome/welcome.html')
      });
    }
  }
});

/**
 * Ping the content script. Resolves true on PING ack, false otherwise.
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
async function pingContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    return response?.success === true;
  } catch {
    return false;
  }
}

/**
 * Ensure content script is injected into the tab and ready to receive messages.
 * Uses a PING handshake instead of a fixed delay; the content script's listener
 * is registered inside init(), which may be deferred to DOMContentLoaded.
 * @param {number} tabId - Tab ID to inject into
 */
async function ensureContentScript(tabId) {
  if (await pingContentScript(tabId)) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content.js']
  });

  // Poll until the content script's onMessage listener is live.
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await pingContentScript(tabId)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Content script did not respond to PING within 2s');
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    // Handle screenshot-translate separately (no selection needed)
    if (info.menuItemId === 'screenshot-translate') {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        action: 'START_SCREENSHOT_SELECT',
        screenshotDataUrl: dataUrl
      });
      return;
    }

    const selectedText = info.selectionText;
    if (!selectedText) return;

    // Ensure content script is loaded
    await ensureContentScript(tab.id);

    if (info.menuItemId === 'translate-selection') {
      // Send message to content script to show translation
      await chrome.tabs.sendMessage(tab.id, {
        action: 'SHOW_TRANSLATION',
        text: selectedText
      });
    } else if (info.menuItemId === 'polish-selection') {
      // Send message to content script to show polish results
      await chrome.tabs.sendMessage(tab.id, {
        action: 'SHOW_POLISH',
        text: selectedText
      });
    } else if (info.menuItemId === 'dictionary-lookup') {
      // Only for single words
      const word = selectedText.trim();
      if (word.split(/\s+/).length === 1) {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'SHOW_DICTIONARY',
          word: word
        });
      }
    } else if (info.menuItemId === 'translate-page') {
      // Translate entire page
      await chrome.tabs.sendMessage(tab.id, {
        action: 'TRANSLATE_PAGE'
      });
    }
  } catch (error) {
    // Silently handle context menu action errors
  }
});

/**
 * Handle keyboard shortcut
 */
chrome.commands.onCommand.addListener(async (command) => {
  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) return;

  try {
    // Ensure content script is loaded
    await ensureContentScript(tab.id);

    if (command === 'translate-selection') {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'TRANSLATE_SELECTION'
      });
    } else if (command === 'dictionary-lookup') {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'DICTIONARY_SELECTION'
      });
    } else if (command === 'translate-page') {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'TRANSLATE_PAGE'
      });
    } else if (command === 'screenshot-translate') {
      // Capture viewport first (before any overlay renders)
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      await chrome.tabs.sendMessage(tab.id, {
        action: 'START_SCREENSHOT_SELECT',
        screenshotDataUrl: dataUrl
      });
    }
  } catch (error) {
    // Silently handle shortcut errors
  }
});
