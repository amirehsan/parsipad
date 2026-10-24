// tests/spacing-rhythm.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CARD_STYLES } from '../shared/card/styles.js';

/**
 * Cards, rows and action groups were packed 4 to 6px apart with a 16px card
 * inset, which read as cramped. One set of semantic spacing tokens now names
 * the rhythm, and the pages use them. The shared card also renders inside the
 * content script's shadow root, where page tokens do not exist, so it keeps
 * literal values and is held to the same floor.
 */
const rootDir = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8');
const tokens = read('lib/design-tokens.css');

function rule(css, selector) {
  const escaped = selector.replace(/[.]/g, '\\.');
  const match = css.match(new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}'));
  return match ? match[1] : '';
}

describe('spacing rhythm', () => {
  it('defines the semantic spacing tokens on the 4px scale', () => {
    for (const token of ['--space-inset-card', '--space-stack-section', '--space-stack-group', '--space-stack-item', '--space-inline-actions']) {
      expect(tokens, token).toMatch(new RegExp(token + ':\\s*var\\(--space-\\d\\)'));
    }
  });

  it('the shared card never packs things closer than 8px', () => {
    const gaps = [...CARD_STYLES.matchAll(/gap:\s*(\d+)px/g)].map(m => Number(m[1]));
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(8);
  });

  it('cards on every page use the card inset', () => {
    expect(rule(read('popup/popup.css'), '.popup')).toMatch(/padding:\s*var\(--space-inset-card\)/);
    expect(rule(read('popup/popup.css'), '.polish-card')).toMatch(/padding:\s*var\(--space-inset-card\)/);
    expect(rule(read('library/library.css'), '.lib-card')).toMatch(/padding:\s*var\(--space-inset-card\)/);
  });

  it('settings rows have room to breathe', () => {
    expect(rule(read('settings/settings.css'), '.setting-row')).toMatch(/padding:\s*var\(--space-stack-group\) 0/);
  });
});
