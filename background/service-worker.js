import { translate, polish, translateImage } from '../lib/api.js';
import { lookupWord } from '../lib/dictionary.js';
import { translateDocument, validateFile, readFileContent } from '../lib/document-translator.js';
import { translationCache } from '../lib/cache.js';
import { hasApiKey, getDictionaryTranslationSettings, isTranslationCancelled, setTranslationCancelled } from '../lib/storage.js';
import { detectLanguageCode } from '../lib/language-detect.js';
import { addToHistory, addToPolishHistory, addToDictionaryHistory } from '../lib/history.js';
import { ACTIONS } from '../lib/constants.js';

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

    case ACTIONS.CHECK_API_KEY:
      return { hasApiKey: await hasApiKey() };

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

  // Don't use cache when grammar mode is enabled (explanations should be fresh)
  if (!withGrammar) {
    // Check cache first
    const cached = await translationCache.get(text);
    if (cached) {
      return {
        translation: cached.translation,
        direction: cached.direction,
        fromCache: true
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

  return {
    translation: result.translation,
    direction: result.direction,
    displayDirection: result.displayDirection,
    grammar: result.grammar || null,
    fromCache: false,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
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

  // Call API (no caching for polish - user expects fresh results)
  const result = await polish(text);

  // Add to polish history
  await addToPolishHistory(text, result.professional, result.conversational, result.concise);

  return {
    professional: result.professional,
    conversational: result.conversational,
    concise: result.concise,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
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

  return result;
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

  // Translate document with cancellation check
  const result = await translateDocument(
    content,
    () => {}, // onProgress - not used in service worker
    isTranslationCancelled // checkCancelled callback
  );

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

  // Call API
  const result = await translateImage(base64Data, mimeType);

  return {
    extractedText: result.extractedText,
    translation: result.translation,
    direction: result.direction,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens
  };
}

/**
 * Create context menus on install
 */
chrome.runtime.onInstalled.addListener(() => {
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
  const selectedText = info.selectionText;

  if (!selectedText || !tab?.id) return;

  try {
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
    }
  } catch (error) {
    // Silently handle shortcut errors
  }
});
