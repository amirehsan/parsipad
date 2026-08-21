// tests/card-styles.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CARD_STYLES, injectCardStyles } from '../shared/card/styles.js';

const partsSource = fs.readFileSync(path.resolve(__dirname, '../shared/card/parts.js'), 'utf8');

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

  it('has a rule for every pp-card class shared/card/parts.js puts on an element', () => {
    const emitted = new Set(
      [...partsSource.matchAll(/\.className\s*=\s*'(pp-card-[\w-]+)'/g)].map(m => m[1])
    );
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
