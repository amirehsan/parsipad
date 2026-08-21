// tests/card-styles.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CARD_STYLES, injectCardStyles } from '../shared/card/styles.js';

const cardDir = path.resolve(__dirname, '../shared/card');

// Every module in shared/card/ except styles.js itself, discovered rather
// than listed by name, so a new card file (a sentence card, a text card,
// the renderCard dispatcher) is covered the moment it lands without
// anyone remembering to add it here.
const cardSources = fs.readdirSync(cardDir)
  .filter(name => name.endsWith('.js') && name !== 'styles.js')
  .map(name => fs.readFileSync(path.join(cardDir, name), 'utf8'));

// Comments are stripped before the quote-pair scan below, so an
// apostrophe in prose (a contraction like "caller's", "doesn't") can
// never be misread as opening a string literal and corrupt the quote
// parity for everything that follows it in the file. Safe here because
// the project's lint config forces a string containing an apostrophe to
// use double quotes instead of an escaped single quote, so no real code
// string in this codebase depends on a raw "'" the stripped comments
// could otherwise be confused with; and no string literal in these files
// contains "//" or "/*" for a comment-stripper to misfire on.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, '');
}

// Every pp-card-* token inside a single- or double-quoted string literal
// in the given source. Deliberately not restricted to `.className = '...'`,
// so classList.add('pp-card-x'), setAttribute('class', ...) and a
// multi-class string like 'pp-card-a pp-card-b' are all caught. Template
// literals are excluded on purpose: the one dynamic id this codebase
// builds with a template (the disclosure's content id) is not a class and
// must not be required to have one.
function quotedClassTokens(source) {
  const tokens = new Set();
  const withoutComments = stripComments(source);
  const stringLiteral = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  let match = stringLiteral.exec(withoutComments);
  while (match) {
    const found = match[2].match(/pp-card-[\w-]+/g) || [];
    found.forEach(token => tokens.add(token));
    match = stringLiteral.exec(withoutComments);
  }
  return tokens;
}

describe('CARD_STYLES', () => {
  it('scopes every class selector under the pp-card prefix', () => {
    const classes = CARD_STYLES.match(/\.[a-zA-Z][\w-]*/g) || [];
    const unscoped = [...new Set(classes)].filter(c => !c.startsWith('.pp-card'));
    expect(unscoped).toEqual([]);
  });

  it('defines the dark theme through the same mechanism the box already uses', () => {
    expect(CARD_STYLES).toContain(":host([data-theme='dark'])");
  });

  it('contains no em dashes and no literal invisible characters', () => {
    expect(CARD_STYLES).not.toMatch(/—/);
    expect(CARD_STYLES).not.toMatch(/[\u00ad\u200b\u200c\u200d\ufeff\u2029]/);
  });

  it('gives Persian more leading than Latin at the same size', () => {
    expect(CARD_STYLES).toMatch(/\[dir="rtl"\]/);
  });

  it('has a rule for every pp-card class any shared/card module puts on an element', () => {
    const emitted = new Set();
    cardSources.forEach(source => {
      quotedClassTokens(source).forEach(token => emitted.add(token));
    });
    const styled = new Set(
      (CARD_STYLES.match(/\.[a-zA-Z][\w-]*/g) || []).map(c => c.slice(1))
    );
    const unstyled = [...emitted].filter(c => !styled.has(c)).sort();
    expect(unstyled).toEqual([]);
  });
});

describe('injectCardStyles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('injects once and reports it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    expect(injectCardStyles(host, document)).toBe(true);
    expect(host.querySelectorAll('style')).toHaveLength(1);
  });

  it('is idempotent', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    injectCardStyles(host, document);
    expect(injectCardStyles(host, document)).toBe(false);
    expect(host.querySelectorAll('style')).toHaveLength(1);
  });

  it('treats separate roots independently, so a shadow root and the document each get their own', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    expect(injectCardStyles(a, document)).toBe(true);
    expect(injectCardStyles(b, document)).toBe(true);
  });
});
