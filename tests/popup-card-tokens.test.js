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

// popup.css @imports the token file, so the browser resolves --pp-* against
// both. It used to redefine the whole semantic layer itself, which is why an
// earlier version of this test only had to read popup.css; that block has been
// retired, so the definitions now legitimately live one file up. Reading both
// is what the cascade actually does.
const popupCss = [
  fs.readFileSync(path.join(rootDir, 'lib/design-tokens.css'), 'utf8'),
  fs.readFileSync(path.join(rootDir, 'popup/popup.css'), 'utf8')
].join('\n');

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

/** Every block body whose selector line contains `selector`. */
function blocksFor(selector) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = popupCss.indexOf(selector, from);
    if (at === -1) break;
    const open = popupCss.indexOf('{', at);
    const close = popupCss.indexOf('\n}', open);
    if (open === -1 || close === -1) break;
    out.push(popupCss.slice(open, close));
    from = close + 1;
  }
  return out;
}

/** Whether any block matching `selector` declares `name`. */
function declaredIn(selector, name) {
  const decl = new RegExp(`^\\s*${name}\\s*:`, 'm');
  return blocksFor(selector).some(body => decl.test(body));
}

/**
 * Whether the name resolves in the dark theme.
 *
 * Either a dark block redefines it, or it is unchanged between themes and
 * inherits its light value. Both are correct: most of the ladder does not
 * move, and requiring a redundant dark redeclaration would be noise.
 */
function resolvesInDark(name) {
  return declaredIn('.dark,', name)
    || declaredIn("[data-theme='dark']", name)
    || declaredIn(':root', name);
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
        if (!declaredIn(':root', name)) broken.push(`${token} -> ${name} missing from :root`);
        if (!resolvesInDark(name)) broken.push(`${token} -> ${name} unresolvable in the dark theme`);
      });
    });

    expect(broken).toEqual([]);
  });

  it('finds the tokens it is checking, so a rename cannot make this test vacuous', () => {
    expect(tokensTheCardConsumes()).toContain('--pp-text');
    expect(tokensTheCardConsumes().length).toBeGreaterThanOrEqual(4);
  });
});
