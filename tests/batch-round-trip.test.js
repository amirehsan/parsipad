import { describe, it, expect } from 'vitest';
import { normalizeForMode } from '../lib/translation/normalize.js';
import { parseNumberedTranslations } from '../content/utils/batch.js';

/**
 * Proves the contract page translation actually relies on: [n] markers and
 * one-item-per-line structure must survive normalizeForMode(text, 'batch')
 * so parseNumberedTranslations can recover every item in order.
 *
 * parseNumberedTranslations is imported from content/utils/batch.js, the
 * same module content/main.js imports, so this test exercises the real
 * parser instead of a hand-copied duplicate that could drift from it.
 */
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
