// tests/block-gate.test.js
import { describe, it, expect } from 'vitest';
import { GATE, containsLetters, linkDensity, isUnlikelyClassId, passesTextGate } from '../content/blocks/gate.js';

// A paragraph that should always pass, used as the base for single-factor tests.
const ok = {
  textLength: 120,
  linkTextLength: 6,
  wordCount: 22,
  hasLetters: true,
  classId: 'article-body'
};

describe('containsLetters', () => {
  it.each([
    ['hello', true],
    ['سلام', true],
    ['186', false],
    ['7h', true],
    ['', false],
    ['   ', false],
    ['2', false],
    ['·', false]
  ])('containsLetters(%j) === %s', (input, expected) => {
    expect(containsLetters(input)).toBe(expected);
  });
});

describe('linkDensity', () => {
  it('is 1 for empty text so empty candidates never pass', () => {
    expect(linkDensity(0, 0)).toBe(1);
  });

  it('is the ratio of link text to all text', () => {
    expect(linkDensity(100, 25)).toBe(0.25);
  });
});

describe('isUnlikelyClassId', () => {
  it.each([
    ['nav-menu', true],
    ['site-footer', true],
    ['promo banner', true],
    ['sidebar', true],
    ['navigation', true],
    ['site-navigation', true],
    ['navbar', true],
    ['article-content', false],
    ['post-body', false],
    ['', false]
  ])('isUnlikelyClassId(%j) === %s', (input, expected) => {
    expect(isUnlikelyClassId(input)).toBe(expected);
  });

  it('lets a content word rescue an otherwise unlikely class', () => {
    // "main-nav" would be rejected on "nav", but "main" is an okMaybeItsACandidate word.
    expect(isUnlikelyClassId('main-nav')).toBe(false);
  });

  it('lets a content word rescue a chrome word, matching Readability', () => {
    // MAYBE_OK deliberately wins over UNLIKELY, mirroring upstream Readability's
    // `unlikely && !okMaybeItsACandidate`. So a nav wrapper classed "main-*"
    // survives this check. Two later layers catch it: <nav> and role="navigation"
    // are hard rejects in the resolver, and link density rejects anything that is
    // mostly link text. Pinned here so the gap is a visible choice, not a surprise.
    expect(isUnlikelyClassId('main-navigation')).toBe(false);
    expect(isUnlikelyClassId('main-menu')).toBe(false);
  });
});

describe('passesTextGate', () => {
  it('accepts an ordinary paragraph', () => {
    expect(passesTextGate(ok)).toBe(true);
  });

  it('rejects text with no letters at all', () => {
    expect(passesTextGate({ ...ok, hasLetters: false })).toBe(false);
  });

  it('rejects text below the character floor', () => {
    expect(passesTextGate({ ...ok, textLength: GATE.MIN_CHARS - 1 })).toBe(false);
  });

  it('rejects text below the word floor', () => {
    expect(passesTextGate({ ...ok, wordCount: GATE.MIN_WORDS - 1 })).toBe(false);
  });

  it('rejects a navigation list, which is nearly all link text', () => {
    expect(passesTextGate({ ...ok, linkTextLength: 118 })).toBe(false);
  });

  it('accepts a paragraph carrying a couple of citations', () => {
    expect(passesTextGate({ ...ok, linkTextLength: 12 })).toBe(true);
  });

  it('rejects an element whose class marks it as chrome', () => {
    expect(passesTextGate({ ...ok, classId: 'share-toolbar' })).toBe(false);
  });

  it('tolerates a fully absent facts object', () => {
    expect(passesTextGate({})).toBe(false);
  });
});
