import { translate, polish, translateImage, regeneratePolishVariant, getGrammarLesson } from '../lib/api.js';
import { lookupWord } from '../lib/dictionary.js';
import { translateDocument, validateFile, readFileContent } from '../lib/document-translator.js';
import { translationCache } from '../lib/cache.js';
import { hasApiKey, getDictionaryTranslationSettings, isTranslationCancelled, setTranslationCancelled, getSelectedProvider, getFavorites, addFavorite, removeFavorite, isFavorite, hasCompletedOnboarding, logUsageEvent } from '../lib/storage.js';
import { detectLanguageCode } from '../lib/language-detect.js';
import { addToHistory, addToPolishHistory, addToDictionaryHistory, updatePolishVariant, getPolishHistory } from '../lib/history.js';
import { ACTIONS, PROVIDER_CONFIGS, ACTION_TYPES } from '../lib/constants.js';

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
async function handleMessage(message, sender) {
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

  // Get current provider info
  const providerId = await getSelectedProvider();
  const providerConfig = PROVIDER_CONFIGS[providerId];

  // Don't use cache when grammar mode is enabled (explanations should be fresh)
  if (!withGrammar) {
    // Check cache first
    const cached = await translationCache.get(text);
    if (cached) {
      return {
        translation: cached.translation,
        direction: cached.direction,
        fromCache: true,
        provider: providerConfig?.name || 'AI'
      };
    }
  }

  // Call API
  const result = await translate(text, sourceLang, withGrammar);

  // Store in cache (only for non-grammar translations)
  if (!withGrammar) {
    await translationCache.set(text, result.translation, result.direction);
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
async function handleDocumentTranslation(content) {
  if (!content || content.trim().length === 0) {
    throw new Error('No content provided for translation');
  }

  // Reset cancellation flag before starting
  await setTranslationCancelled(false);

  // Get current provider info
  const providerId = await getSelectedProvider();

  // Translate document with cancellation check
  const result = await translateDocument(
    content,
    () => {}, // onProgress - not used in service worker
    isTranslationCancelled // checkCancelled callback
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
chrome.runtime.onInstalled.addListener(async (details) => {
  // Create context menu for translation
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: 'Translate with ParsiPad',
    contexts: ['selection']
  });

  // Create context menu for polishing
  chrome.contextMenus.create({
    id: 'polish-selection',
    title: 'Polish with ParsiPad',
    contexts: ['selection']
  });

  // Create context menu for dictionary lookup
  chrome.contextMenus.create({
    id: 'dictionary-lookup',
    title: 'Look up in Dictionary',
    contexts: ['selection']
  });

  // Create context menu for page translation
  chrome.contextMenus.create({
    id: 'translate-page',
    title: 'Translate this page',
    contexts: ['page']
  });

  // Create context menu for screenshot translation
  chrome.contextMenus.create({
    id: 'screenshot-translate',
    title: 'Screenshot & Translate',
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
 * Ensure content script is injected into the tab
 * @param {number} tabId - Tab ID to inject into
 */
async function ensureContentScript(tabId) {
  try {
    // Try to send a ping to check if content script is loaded
    await chrome.tabs.sendMessage(tabId, { action: 'PING' });
  } catch {
    // Content script not loaded, inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    });
    // Small delay to let script initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  }
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
