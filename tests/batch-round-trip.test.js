import { describe, it, expect } from 'vitest';
import { normalizeForMode } from '../lib/translation/normalize.js';

/**
 * Local copy of content/main.js's parseNumberedTranslations, same shape.
 * content/main.js touches the DOM at module scope (chrome APIs, window
 * globals) and cannot be imported into a node test environment, so this
 * mirrors its marker-parsing logic to prove the contract page translation
 * actually relies on: [n] markers and one-item-per-line structure must
 * survive normalizeForMode(text, 'batch') so the parser can recover every
 * item in order.
 */
function parseNumberedTranslations(translatedText, expectedCount) {
  const results = new Array(expectedCount).fill('');
  const lines = translatedText.split(/\n/);
  let currentIndex = -1;
  let currentText = '';

  for (const line of lines) {
    const markerMatch = line.match(/^\[(\d+)\]\s*(.*)/);
    if (markerMatch) {
      if (currentIndex >= 0 && currentIndex < expectedCount) {
        results[currentIndex] = currentText.trim();
      }
      currentIndex = parseInt(markerMatch[1], 10) - 1;
      currentText = markerMatch[2];
    } else if (currentIndex >= 0) {
      currentText += '\n' + line;
    }
  }
  if (currentIndex >= 0 && currentIndex < expectedCount) {
    results[currentIndex] = currentText.trim();
  }
  return results;
}

describe('batch round trip', () => {
  it('preserves the exact three-item example from the page translation regression', () => {
    const batchText = '[1] Library policies\n[2] They will charge you a fee.\n[3] Contact us';

    const normalized = normalizeForMode(batchText, 'batch');
    const parsed = parseNumberedTranslations(normalized, 3);

    expect(parsed).toEqual(['Library policies', 'They will charge you a fee.', 'Contact us']);
  });

  it('recovers every item in order for a realistic multi-item batch', () => {
    const items = [
      'Library policies',
      'They will charge you a fee.',
      'Contact us',
      'Hours: 9am to 5pm',
      'No refunds after 30 days'
    ];
    const batchText = items.map((text, idx) => `[${idx + 1}] ${text}`).join('\n');

    const normalized = normalizeForMode(batchText, 'batch');
    const parsed = parseNumberedTranslations(normalized, items.length);

    expect(parsed).toEqual(items);
  });
});
