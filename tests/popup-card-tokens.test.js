// tests/popup-card-tokens.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CARD_STYLES } from '../shared/card/styles.js';

/**
 * Regression guard for the "card renders with no colours" defect.
 *
 * The card's stylesheet consumes custom properties and defines none of
 * them, deliberately: that is what lets it follow whichever host injects
 * it. The floating box defines them all. The popup does not, because its
 * own tokens live in a different namespace, so popup.css carries a
 * mapping block. There are no fallbacks in the card's var() calls, so
 * dropping that block, or renaming a --color-* token underneath it,
 * renders every colour in the card unset.
 *
 * The tokens the card consumes are read out of CARD_STYLES rather than
 * listed here, so adding a fifth one fails this test until the popup maps
 * it too. What the mapping resolves to is not asserted: that is a
 * rendering question, and no DOM implementation available to the suite
 * resolves custom properties faithfully enough to answer it. This checks
 * the chain exists and is unbroken at both ends.
 */

const rootDir = path.resolve(__dirname, '..');
const popupCss = fs.readFileSync(path.join(rootDir, 'popup/popup.css'), 'utf8');

/** Every --pp-* property CARD_STYLES reads and never defines. */
function tokensTheCardConsumes() {
  const read = new Set((CARD_STYLES.match(/var\(\s*(--pp-[\w-]+)/g) || [])
    .map(m => m.replace(/var\(\s*/, '')));
  const defined = new Set((CARD_STYLES.match(/^\s*(--pp-[\w-]+)\s*:/gm) || [])
    .map(m => m.trim().replace(/\s*:$/, '')));
  return [...read].filter(token => !defined.has(token)).sort();
}

/** The value popup.css maps a token to, or undefined. */
function mappedValue(token) {
  const match = popupCss.match(new RegExp(`^\\s*${token}\\s*:\\s*([^;]+);`, 'm'));
  return match ? match[1].trim() : undefined;
}

/** Whether popup.css defines a --color-* name inside the given block. */
function definesIn(blockSelector, name) {
  const start = popupCss.indexOf(blockSelector + ' {');
  if (start === -1) return false;
  const end = popupCss.indexOf('}', start);
  return new RegExp(`^\\s*${name}\\s*:`, 'm').test(popupCss.slice(start, end));
}

describe('the popup satisfies the card token contract', () => {
  it('maps every token the card consumes', () => {
    const unmapped = tokensTheCardConsumes().filter(token => !mappedValue(token));
    expect(unmapped).toEqual([]);
  });

  it('maps each one onto a popup token that exists in both themes', () => {
    const broken = [];

    tokensTheCardConsumes().forEach(token => {
      const value = mappedValue(token);
      if (!value) return;

      const referenced = (value.match(/var\(\s*(--[\w-]+)/g) || [])
        .map(m => m.replace(/var\(\s*/, ''));

      // A literal value needs no backing token; only a var() reference does.
      referenced.forEach(name => {
        if (!definesIn(':root', name)) broken.push(`${token} -> ${name} missing from :root`);
        if (!definesIn("[data-theme='dark']", name)) broken.push(`${token} -> ${name} missing from the dark theme`);
      });
    });

    expect(broken).toEqual([]);
  });

  it('finds the tokens it is checking, so a rename cannot make this test vacuous', () => {
    expect(tokensTheCardConsumes()).toContain('--pp-text');
    expect(tokensTheCardConsumes().length).toBeGreaterThanOrEqual(4);
  });
});
