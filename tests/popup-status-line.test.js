// tests/popup-status-line.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * showError() hides every output section, so a failed copy, favorite or
 * regenerate used to wipe the translation the user was looking at. Those
 * secondary actions now report through a polite status line that leaves the
 * result alone; the error box is kept for failures of the primary action.
 */
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'popup/popup.html'), 'utf8');
const js = fs.readFileSync(path.join(rootDir, 'popup/popup.js'), 'utf8');

/** Source of a top-level function, up to the next top-level function. */
function functionBody(name) {
  const start = js.search(new RegExp(`\\n(async )?function ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = js.slice(start + 1);
  const next = rest.search(/\n(async )?function [A-Za-z]+\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

const SECONDARY_ACTIONS = [
  'handleCardCopy',
  'handlePolishCopy',
  'handleDictCopy',
  'handleImageCopy',
  'handleTranslationFavorite',
  'handlePolishFavorite',
  'handlePolishRegenerate'
];

describe('popup feedback channels', () => {
  it('has a polite status line and an assertive error box', () => {
    expect(html).toMatch(/<div id="status-line" class="status-line" role="status" aria-live="polite"><\/div>/);
    expect(html).toMatch(/<div id="error-section" class="error-section" role="alert"/);
  });

  it('defines showNotice, which never hides outputs', () => {
    const body = functionBody('showNotice');
    expect(body).toMatch(/function showNotice\(message, tone = 'success'\)/);
    expect(body).not.toMatch(/hideAllOutputs\(/);
  });

  it.each(SECONDARY_ACTIONS)('%s reports through showNotice, not showError', (name) => {
    const body = functionBody(name);
    expect(body).not.toMatch(/showError\(/);
    expect(body).toMatch(/showNotice\(/);
  });

  it('secondary failure messages are localized', () => {
    for (const name of SECONDARY_ACTIONS) {
      expect(functionBody(name), name).not.toMatch(/showNotice\('[A-Z]/);
    }
  });
});
