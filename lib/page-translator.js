/**
 * Page Translation Module
 * Translates entire web pages in-place with toggle functionality
 */

import { splitIntoChunks, translateChunk } from './document-translator.js';

// Constants
const MAX_CHARS_PER_CHUNK = 4000;
const CHUNK_DELAY_MS = 200;

// Elements to skip during text extraction
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'MAP', 'TEMPLATE'
]);

// Inline elements that should not break text aggregation
const INLINE_TAGS = new Set([
  'A', 'ABBR', 'ACRONYM', 'B', 'BDO', 'BIG', 'BR', 'BUTTON', 'CITE',
  'CODE', 'DFN', 'EM', 'I', 'IMG', 'INPUT', 'KBD', 'LABEL', 'Q',
  'SAMP', 'SELECT', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP',
  'TEXTAREA', 'TIME', 'TT', 'U', 'VAR'
]);

/**
 * Page translation state (maintained in content script)
 */
export function createPageState() {
  return {
    isTranslated: false,
    isTranslating: false,
    isShowingTranslated: false,
    originalTexts: new Map(), // TextNode -> original text
    translatedTexts: new Map(), // TextNode -> translated text
    originalDirections: new Map(), // Element -> original dir attribute
    sourceLanguage: null,
    targetLanguage: null,
    textNodes: [], // Array of extracted text nodes
    totalChunks: 0,
    translatedChunks: 0
  };
}

/**
 * Check if an element should be skipped
 * @param {Element} element
 * @returns {boolean}
 */
function shouldSkipElement(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  // Skip by tag name
  if (SKIP_TAGS.has(element.tagName)) {
    return true;
  }

  // Skip hidden elements
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return true;
  }

  // Skip elements with specific attributes
  if (element.hasAttribute('data-parsipad-skip') ||
      element.hasAttribute('contenteditable') ||
      element.isContentEditable) {
    return true;
  }

  // Skip input elements
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return true;
  }

  return false;
}

/**
 * Extract all visible text nodes from the page
 * @param {Element} root - Root element to start extraction
 * @returns {Array<{node: Text, text: string, parent: Element}>}
 */
export function extractVisibleTextNodes(root = document.body) {
  const textNodes = [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip empty or whitespace-only text
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip if parent should be skipped
        let parent = node.parentElement;
        while (parent && parent !== root) {
          if (shouldSkipElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          parent = parent.parentElement;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push({
      node,
      text: node.textContent,
      parent: node.parentElement
    });
  }

  return textNodes;
}

/**
 * Aggregate text nodes into chunks for translation
 * Maintains mapping to original nodes for replacement
 * @param {Array<{node: Text, text: string, parent: Element}>} textNodes
 * @returns {{chunks: string[], nodeMapping: Map<number, Array<{node: Text, startIndex: number, length: number}>>}}
 */
export function aggregateTextForTranslation(textNodes) {
  if (textNodes.length === 0) {
    return { chunks: [], nodeMapping: new Map() };
  }

  // Combine all text with delimiters
  const DELIMITER = '\n\u2063\n'; // Invisible separator
  let combinedText = '';
  const nodePositions = []; // Track where each node's text starts

  for (let i = 0; i < textNodes.length; i++) {
    const startIndex = combinedText.length;
    const text = textNodes[i].text;
    combinedText += text;
    nodePositions.push({ index: i, startIndex, length: text.length });

    if (i < textNodes.length - 1) {
      combinedText += DELIMITER;
    }
  }

  // Split combined text into chunks
  const rawChunks = splitIntoChunks(combinedText, MAX_CHARS_PER_CHUNK);

  // Build mapping from chunk index to text nodes
  const nodeMapping = new Map();
  let currentPosition = 0;

  for (let chunkIndex = 0; chunkIndex < rawChunks.length; chunkIndex++) {
    const chunk = rawChunks[chunkIndex];
    const chunkStart = combinedText.indexOf(chunk, currentPosition);
    const chunkEnd = chunkStart + chunk.length;
    currentPosition = chunkEnd;

    const nodesInChunk = [];
    for (const pos of nodePositions) {
      const nodeEnd = pos.startIndex + pos.length;
      // Check if this node overlaps with the chunk
      if (pos.startIndex < chunkEnd && nodeEnd > chunkStart) {
        nodesInChunk.push({
          node: textNodes[pos.index].node,
          nodeIndex: pos.index,
          startIndex: pos.startIndex,
          length: pos.length
        });
      }
    }

    nodeMapping.set(chunkIndex, nodesInChunk);
  }

  return { chunks: rawChunks, nodeMapping };
}

/**
 * Detect the primary language of the page
 * @param {Array<{node: Text, text: string}>} textNodes
 * @returns {'en' | 'fa'}
 */
export function detectPageLanguage(textNodes) {
  // Sample first 10 text nodes or all if fewer
  const sampleSize = Math.min(textNodes.length, 10);
  let persianChars = 0;
  let englishChars = 0;

  for (let i = 0; i < sampleSize; i++) {
    const text = textNodes[i].text;
    persianChars += (text.match(/[\u0600-\u06FF]/g) || []).length;
    englishChars += (text.match(/[a-zA-Z]/g) || []).length;
  }

  return persianChars > englishChars ? 'fa' : 'en';
}

/**
 * Parse translated chunk back to individual node texts
 * @param {string} translatedChunk
 * @param {string} originalChunk
 * @param {Array<{node: Text, nodeIndex: number, startIndex: number, length: number}>} nodesInChunk
 * @returns {Map<number, string>} Map of nodeIndex -> translated text
 */
function parseTranslatedChunk(translatedChunk, originalChunk, nodesInChunk) {
  const result = new Map();

  // If only one node in chunk, return entire translation
  if (nodesInChunk.length === 1) {
    result.set(nodesInChunk[0].nodeIndex, translatedChunk.trim());
    return result;
  }

  // For multiple nodes, we need to estimate proportional lengths
  // This is approximate - translation lengths vary
  const totalOriginalLength = nodesInChunk.reduce((sum, n) => sum + n.length, 0);
  const translatedLength = translatedChunk.length;

  let currentPos = 0;
  for (let i = 0; i < nodesInChunk.length; i++) {
    const nodeInfo = nodesInChunk[i];
    const proportion = nodeInfo.length / totalOriginalLength;

    let endPos;
    if (i === nodesInChunk.length - 1) {
      // Last node gets the rest
      endPos = translatedLength;
    } else {
      endPos = currentPos + Math.round(translatedLength * proportion);
      // Try to find a natural break point (space, punctuation)
      const searchStart = Math.max(currentPos, endPos - 20);
      const searchEnd = Math.min(translatedLength, endPos + 20);
      const segment = translatedChunk.substring(searchStart, searchEnd);
      const breakMatch = segment.match(/[\s.,!?؟،]+/);
      if (breakMatch) {
        endPos = searchStart + breakMatch.index + breakMatch[0].length;
      }
    }

    const translatedText = translatedChunk.substring(currentPos, endPos).trim();
    if (translatedText) {
      result.set(nodeInfo.nodeIndex, translatedText);
    }
    currentPos = endPos;
  }

  return result;
}

/**
 * Translate the page content
 * @param {Object} state - Page state object
 * @param {Function} onProgress - Progress callback (current, total, percent)
 * @param {Function} checkCancelled - Async function to check cancellation
 * @returns {Promise<{success: boolean, cancelled: boolean, error?: string}>}
 */
export async function translatePageContent(state, onProgress = () => {}, checkCancelled = async () => false) {
  try {
    state.isTranslating = true;

    // Extract text nodes
    state.textNodes = extractVisibleTextNodes();

    if (state.textNodes.length === 0) {
      return { success: false, error: 'No translatable text found on page' };
    }

    // Store original texts
    for (const { node, text } of state.textNodes) {
      state.originalTexts.set(node, text);
    }

    // Detect language
    state.sourceLanguage = detectPageLanguage(state.textNodes);
    state.targetLanguage = state.sourceLanguage === 'fa' ? 'en' : 'fa';

    // Aggregate into chunks
    const { chunks, nodeMapping } = aggregateTextForTranslation(state.textNodes);
    state.totalChunks = chunks.length;
    state.translatedChunks = 0;

    // Translate each chunk
    for (let i = 0; i < chunks.length; i++) {
      // Check cancellation
      if (await checkCancelled()) {
        state.isTranslating = false;
        return { success: false, cancelled: true };
      }

      const chunk = chunks[i];
      const nodesInChunk = nodeMapping.get(i);

      try {
        const result = await translateChunk(chunk, state.sourceLanguage, state.targetLanguage);

        // Parse and store translations for each node in this chunk
        const nodeTranslations = parseTranslatedChunk(result.translation, chunk, nodesInChunk);

        for (const [nodeIndex, translatedText] of nodeTranslations) {
          const node = state.textNodes[nodeIndex].node;
          state.translatedTexts.set(node, translatedText);
        }
      } catch (error) {
        console.error('Chunk translation failed:', error);
        // Continue with other chunks on error
      }

      state.translatedChunks = i + 1;
      const percent = Math.round(((i + 1) / chunks.length) * 100);
      onProgress(i + 1, chunks.length, percent);

      // Delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
      }
    }

    state.isTranslating = false;
    state.isTranslated = true;

    return { success: true, cancelled: false };
  } catch (error) {
    state.isTranslating = false;
    return { success: false, error: error.message };
  }
}

/**
 * Apply translations to the DOM
 * @param {Object} state - Page state object
 */
export function applyTranslations(state) {
  const rtlLangs = ['fa', 'ar', 'he'];
  const targetDir = rtlLangs.includes(state.targetLanguage) ? 'rtl' : 'ltr';

  for (const { node, parent } of state.textNodes) {
    const translatedText = state.translatedTexts.get(node);
    if (translatedText) {
      node.textContent = translatedText;

      // Apply text direction to parent element
      if (parent && !state.originalDirections.has(parent)) {
        state.originalDirections.set(parent, parent.getAttribute('dir'));
      }
      if (parent) {
        parent.setAttribute('dir', targetDir);
      }
    }
  }

  state.isShowingTranslated = true;
}

/**
 * Restore original text to the DOM
 * @param {Object} state - Page state object
 */
export function restoreOriginals(state) {
  for (const { node, parent } of state.textNodes) {
    const originalText = state.originalTexts.get(node);
    if (originalText) {
      node.textContent = originalText;

      // Restore original direction
      if (parent && state.originalDirections.has(parent)) {
        const originalDir = state.originalDirections.get(parent);
        if (originalDir) {
          parent.setAttribute('dir', originalDir);
        } else {
          parent.removeAttribute('dir');
        }
      }
    }
  }

  state.isShowingTranslated = false;
}

/**
 * Toggle between original and translated text
 * @param {Object} state - Page state object
 */
export function togglePageTranslation(state) {
  if (!state.isTranslated) return;

  if (state.isShowingTranslated) {
    restoreOriginals(state);
  } else {
    applyTranslations(state);
  }
}

/**
 * Reset page translation state
 * @param {Object} state - Page state object
 */
export function resetPageState(state) {
  if (state.isShowingTranslated) {
    restoreOriginals(state);
  }

  state.isTranslated = false;
  state.isTranslating = false;
  state.isShowingTranslated = false;
  state.originalTexts.clear();
  state.translatedTexts.clear();
  state.originalDirections.clear();
  state.sourceLanguage = null;
  state.targetLanguage = null;
  state.textNodes = [];
  state.totalChunks = 0;
  state.translatedChunks = 0;
}
