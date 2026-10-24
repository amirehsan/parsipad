// tests/grammar-direction.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The lesson prompt writes every explanation in English, but the page set
 * the whole lesson right-to-left for EN to FA lessons, so English ran with
 * its punctuation at the wrong end. Persian is now marked where it occurs.
 */
const rootDir = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(rootDir, 'grammar/grammar.js'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'grammar/grammar.css'), 'utf8');

describe('grammar lesson direction', () => {
  it('never sets the whole lesson right-to-left', () => {
    expect(js).not.toMatch(/lessonContent\.setAttribute\('dir', 'rtl'\)/);
    expect(js).not.toMatch(/loadingSection\?\.setAttribute\('dir', 'rtl'\)/);
    expect(js).not.toMatch(/errorSection\?\.setAttribute\('dir', 'rtl'\)/);
  });

  it('marks Persian runs individually', () => {
    expect(js).toMatch(/class="example-target" dir="rtl" lang="fa"/);
    expect(js).toMatch(/translationTextEl\.setAttribute\('lang', 'fa'\)/);
    expect(js).toMatch(/originalTextEl\.setAttribute\('lang', 'fa'\)/);
  });

  it('scopes the Persian font to Persian text, not to every descendant', () => {
    expect(css).not.toMatch(/\[dir="rtl"\]\s*\*\s*\{/);
    expect(css).toMatch(/\[lang="fa"\]\s*\{[^}]*font-family:\s*var\(--font-persian\)/);
    expect(css).not.toMatch(/#lesson-content\[dir="rtl"\]/);
  });
});

describe('grammar lesson under the Persian interface', () => {
  const html = fs.readFileSync(path.join(rootDir, 'grammar/grammar.html'), 'utf8');
  // Page chrome follows the interface language; everything else is lesson content.
  const CHROME = ['.loading-text', '.error-section', '.error-text'];

  it('marks the lesson itself as English, left-to-right', () => {
    expect(html).toMatch(/<main id="lesson-content" class="lesson-content" dir="ltr" lang="en"/);
  });

  it('lesson RTL rules cannot match through <html dir="rtl">', () => {
    const selectors = [...css.matchAll(/(^|\n)(\[dir="rtl"\][^{,\n]*)\s*[{,]/g)].map(m => m[2].trim());
    const lessonRules = selectors.filter(sel => sel !== '[dir="rtl"]' && !CHROME.some(c => sel.endsWith(c)));
    expect(lessonRules.length).toBeGreaterThan(0);
    for (const sel of lessonRules) expect(sel, sel).toMatch(/^\[dir="rtl"\]:not\(html\) /);
  });

  it('English lesson text gets the Latin font even when the page is Persian', () => {
    expect(css).toMatch(/\[lang="en"\]\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
  });
});
