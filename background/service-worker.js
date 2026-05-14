import { translate, polish, translateImage, regeneratePolishVariant, getGrammarLesson } from '../lib/api.js';
import { lookupWord } from '../lib/dictionary.js';
import { translateDocument } from '../lib/document-translator.js';
import { translationCache } from '../lib/cache.js';
import { hasApiKey, getDictionaryTranslationSettings, isTranslationCancelled, setTranslationCancelled, getSelectedProvider, getFavorites, addFavorite, removeFavorite, isFavorite, hasCompletedOnboarding, logUsageEvent, runCacheMigrations } from '../lib/storage.js';
import { detectLanguageCode, isSupportedLanguage } from '../lib/language-detect.js';
import { addToHistory, addToPolishHistory, addToDictionaryHistory, updatePolishVariant } from '../lib/history.js';
import { ACTIONS, PROVIDER_CONFIGS, ACTION_TYPES, ERROR_MESSAGES } from '../lib/constants.js';

/**
 * Handle incoming messages from popup or content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async responses
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));

  // Return true to indicate async response
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
      return handleTranslate(message.text, message.sourceLang, message.withGrammar);

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

    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

/**
 * Handle translation request with caching
 * @param {string} text - Text to translate
 * @param {'auto' | 'fa' | 'en'} sourceLang - Source language
 * @param {boolean} withGrammar - Whether to include grammar explanations
 * @returns {Promise<Object>}
 */
async function handleTranslate(text, sourceLang = 'auto', withGrammar = false) {
  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for translation');
  }

  // Persian/English only - reject other scripts before burning tokens.
  // Page-translation sends numbered batches we can't reliably gate, so skip
  // the check for those (detected by the [1] prefix used by api.js).
  const isNumberedBatch = /^\[1\]\s/.test(text);
  if (!isNumberedBatch) {
    const gate = isSupportedLanguage(text);
    if (!gate.supported) {
      throw new Error(ERROR_MESSAGES.UNSUPPORTED_LANGUAGE);
    }
  }

  // Get current provider info
  const providerId = await getSelectedProvider();
  const providerConfig = PROVIDER_CONFIGS[providerId];

  // Don't use cache when grammar mode is enabled (explanations should be fresh)
  if (!withGrammar) {
    // Cache key is scoped to provider + sourceLang so switching providers does
    // not return another provider's cached output.
    const cached = await translationCache.get(text, providerId, sourceLang);
    if (cached) {
      // Surface the rich-context fields from the cached entry so the UI
      // shows "Did you mean", alternatives, etc. on cache hits too.
      return {
        translation: cached.translation,
        direction: cached.direction,
        corrections: cached.corrections,
        alternatives: cached.alternatives,
        examples: cached.examples,
        nuance: cached.nuance,
        fromCache: true,
        provider: providerConfig?.name || 'AI'
      };
    }
  }

  // Call API
  const result = await translate(text, sourceLang, withGrammar);

  // Store in cache (only for non-grammar translations). Persist the rich
  // context so the same input on second access renders the same UI.
  if (!withGrammar) {
    await translationCache.set(text, result.translation, result.direction, providerId, sourceLang, {
      corrections: result.corrections,
      alternatives: result.alternatives,
      examples: result.examples,
      nuance: result.nuance
    });
  }

  // Add to history
  await addToHistory(text, result.translation, result.direction);

  // Log analytics event
  await logUsageEvent({
    action: ACTION_TYPES.TRANSLATE, provider: providerId,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0
  });

  return {
    translation: result.translation,
    direction: result.direction,
    displayDirection: result.displayDirection,
    grammar: result.grammar || null,
    // Rich linguistic context (short queries only - LLM omits these for long inputs)
    corrections: result.corrections,
    alternatives: result.alternatives,
    examples: result.examples,
    nuance: result.nuance,
    fromCache: false,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    provider: providerConfig?.name || 'AI'
  };
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
