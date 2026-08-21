/**
 * Pure helpers for full-page batch translation: grouping text nodes into
 * numbered batches before sending them to the model, and parsing the
 * numbered response back into per-node translations.
 *
 * Both functions are pure (no DOM, no chrome.* APIs) so they can be
 * imported directly into tests instead of being copied there by hand.
 */

/**
 * Batch text nodes for translation with numbered markers.
 * Each batch contains nodes that will be translated together with [1], [2], etc. markers.
 * @param {Array<{node: Text, text: string, parent: Element}>} textNodes
 * @returns {Array<Array<{node: Text, text: string, parent: Element}>>}
 */
export function batchTextNodesForTranslation(textNodes) {
  const MAX_CHARS_PER_BATCH = 3000;
  const MAX_NODES_PER_BATCH = 20;

  if (textNodes.length === 0) {
    return [];
  }

  const batches = [];
  let currentBatch = [];
  let currentLength = 0;

  for (const nodeInfo of textNodes) {
    const text = nodeInfo.text;
    // Account for marker like "[1] " which adds ~4-5 chars per item
    const itemLength = text.length + 6;

    // Start new batch if this would exceed limits
    if (currentBatch.length >= MAX_NODES_PER_BATCH ||
        (currentLength + itemLength > MAX_CHARS_PER_BATCH && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = 0;
    }

    currentBatch.push(nodeInfo);
    currentLength += itemLength;
  }

  // Add remaining batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Parse numbered translations back to array.
 * Expects format like "[1] translated text\n[2] another translation".
 * @param {string} translatedText
 * @param {number} expectedCount
 * @returns {string[]}
 */
export function parseNumberedTranslations(translatedText, expectedCount) {
  const results = new Array(expectedCount).fill('');

  // Split by numbered markers [1], [2], etc.
  const lines = translatedText.split(/\n/);
  let currentIndex = -1;
  let currentText = '';

  for (const line of lines) {
    // Check if line starts with a numbered marker
    const markerMatch = line.match(/^\[(\d+)\]\s*(.*)/);

    if (markerMatch) {
      // Save previous item if any
      if (currentIndex >= 0 && currentIndex < expectedCount) {
        results[currentIndex] = currentText.trim();
      }

      // Start new item
      currentIndex = parseInt(markerMatch[1], 10) - 1; // Convert to 0-based index
      currentText = markerMatch[2];
    } else if (currentIndex >= 0) {
      // Continuation of current item
      currentText += '\n' + line;
    }
  }

  // Save last item
  if (currentIndex >= 0 && currentIndex < expectedCount) {
    results[currentIndex] = currentText.trim();
  }

  return results;
}
