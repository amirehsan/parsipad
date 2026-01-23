import { translate, polish } from '../lib/api.js';
import { translationCache } from '../lib/cache.js';
import { hasApiKey } from '../lib/storage.js';
import { addToHistory, addToPolishHistory } from '../lib/history.js';
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
      return handleTranslate(message.text, message.sourceLang);

    case ACTIONS.POLISH:
      return handlePolish(message.text);

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
 * @returns {Promise<Object>}
 */
async function handleTranslate(text, sourceLang = 'auto') {
  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for translation');
  }

  // Check cache first
  const cached = await translationCache.get(text);
  if (cached) {
    return {
      translation: cached.translation,
      direction: cached.direction,
      fromCache: true
    };
  }

  // Call API
  const result = await translate(text, sourceLang);

  // Store in cache
  await translationCache.set(text, result.translation, result.direction);

  // Add to history
  await addToHistory(text, result.translation, result.direction);

  return {
    translation: result.translation,
    direction: result.direction,
    displayDirection: result.displayDirection,
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
    }
  } catch (error) {
    // Silently handle context menu action errors
  }
});

/**
 * Handle keyboard shortcut
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'translate-selection') {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab?.id) {
      try {
        // Ensure content script is loaded
        await ensureContentScript(tab.id);

        await chrome.tabs.sendMessage(tab.id, {
          action: 'TRANSLATE_SELECTION'
        });
      } catch (error) {
        // Silently handle translate selection errors
      }
    }
  }
});
