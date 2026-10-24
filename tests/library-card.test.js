// tests/library-card.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs'; import path from 'path';
let renderLibraryCard;
beforeAll(async () => {
  const { Window } = await import('happy-dom');
  globalThis.document = new Window().document;
  ({ renderLibraryCard } = await import('../library/card.js'));
});
const now = Date.parse('2026-10-24T18:00:00Z');
const tr = { key: 'translation:1', source: 'history', kind: 'translation', id: 1, original: 'Hello', result: 'سلام', direction: 'en-fa', timestamp: now - 60e3 };
const polish = {
  key: 'polish:7', source: 'history', kind: 'polish', id: 7, original: 'hey there', result: 'Good afternoon.',
  variants: { professional: 'Good afternoon.', conversational: 'Hey!', concise: 'Hi.' }, direction: '', timestamp: now - 60e3
};
describe('library card', () => {
  it('is an article whose actions are labelled buttons', () => {
    const card = renderLibraryCard(tr, { lang: 'en', favorite: false, now });
    expect(card.tagName).toBe('ARTICLE');
    const buttons = [...card.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const b of buttons) { expect(b.type).toBe('button'); expect(b.getAttribute('aria-label')).toBeTruthy(); }
    expect(card.querySelector('[data-action="favorite"]').getAttribute('aria-pressed')).toBe('false');
    expect(card.querySelectorAll('[onclick]')).toHaveLength(0);
  });
  it('marks each side with its own direction and language', () => {
    const card = renderLibraryCard(tr, { lang: 'fa', favorite: true, now });
    expect(card.querySelector('.lib-original').getAttribute('dir')).toBe('ltr');
    expect(card.querySelector('.lib-result').getAttribute('dir')).toBe('rtl');
    expect(card.querySelector('.lib-result').getAttribute('lang')).toBe('fa');
    expect(card.querySelector('bdi').getAttribute('dir')).toBe('ltr');
    expect(card.querySelector('time').getAttribute('datetime')).toBe(new Date(tr.timestamp).toISOString());
  });
  it('gives a saved lesson an Open lesson link and no panel action', () => {
    const card = renderLibraryCard({ ...tr, key: 'favorite:grammar_x', source: 'favorites', kind: 'grammar', id: 'grammar_x', lesson: { title: 'T' } }, { lang: 'en', favorite: true, now });
    expect(card.querySelector('a[data-action="open-lesson"]').getAttribute('href')).toBe('../grammar/grammar.html?saved=grammar_x');
    expect(card.querySelector('[data-action="open-in-panel"]')).toBeNull();
  });
  it('wraps long unbroken text', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../library/library.css'), 'utf8');
    expect(css).toMatch(/\.lib-text\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).not.toMatch(/transition:\s*all/);
  });

  it('shows no relative time for an unknown timestamp instead of a 1970 age', () => {
    const card = renderLibraryCard({ ...tr, timestamp: 0 }, { lang: 'en', favorite: false, now });
    expect(card.querySelector('time')).toBeNull();
    expect(card.textContent).not.toMatch(/1970/);
  });
  it('writes entry text as text, never as markup', () => {
    const hostile = '<img src=x onerror="alert(1)"><script>1</script>';
    const card = renderLibraryCard({ ...tr, original: hostile, result: hostile }, { lang: 'en', favorite: false, now });
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('script')).toBeNull();
    expect(card.querySelector('.lib-original .lib-text').textContent).toBe(hostile);
  });
  it('labels buttons in the interface language and hides decorative icons', () => {
    const en = renderLibraryCard(tr, { lang: 'en', favorite: false, now });
    const fa = renderLibraryCard(tr, { lang: 'fa', favorite: false, now });
    const labels = card => [...card.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
    expect(labels(en)).not.toEqual(labels(fa));
    for (const svg of en.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(en.querySelectorAll('svg').length).toBeGreaterThan(0);
  });
  it('reflects a favorited entry in the favorite button', () => {
    const card = renderLibraryCard(tr, { lang: 'en', favorite: true, now });
    expect(card.querySelector('[data-action="favorite"]').getAttribute('aria-pressed')).toBe('true');
  });
  it('offers favorite only for translations and dictionary entries', () => {
    const dict = renderLibraryCard({ ...tr, kind: 'dictionary' }, { lang: 'en', favorite: false, now });
    expect(dict.querySelector('[data-action="favorite"]')).not.toBeNull();
    const pol = renderLibraryCard(polish, { lang: 'en', favorite: false, now });
    expect(pol.querySelector('[data-action="favorite"]')).toBeNull();
  });
  it('renders a polish entry as three variants, each with its own copy target', () => {
    const card = renderLibraryCard(polish, { lang: 'en', favorite: false, now });
    const variants = [...card.querySelectorAll('.lib-variant')];
    expect(variants).toHaveLength(3);
    expect(variants.map(v => v.querySelector('[data-action="copy"]').getAttribute('data-variant')))
      .toEqual(['professional', 'conversational', 'concise']);
    expect(variants.map(v => v.querySelector('.lib-text').textContent)).toEqual(['Good afternoon.', 'Hey!', 'Hi.']);
    for (const v of variants) expect(v.querySelector('button').getAttribute('aria-label')).toBeTruthy();
    expect(card.querySelector('.lib-original .lib-text').textContent).toBe('hey there');
  });
  it('renders a polish favorite without variant blocks or labels', () => {
    const { variants: _variants, ...rest } = polish;
    const card = renderLibraryCard({ ...rest, key: 'favorite:9', source: 'favorites', id: 9 }, { lang: 'en', favorite: true, now });
    expect(card.querySelectorAll('.lib-variant')).toHaveLength(0);
    expect(card.querySelector('.lib-result .lib-text').textContent).toBe('Good afternoon.');
    expect(card.querySelector('[data-action="copy"]').hasAttribute('data-variant')).toBe(false);
  });
  it('gives a non-polish entry one copy button without a variant', () => {
    const card = renderLibraryCard(tr, { lang: 'en', favorite: false, now });
    const copies = card.querySelectorAll('[data-action="copy"]');
    expect(copies).toHaveLength(1);
    expect(copies[0].hasAttribute('data-variant')).toBe(false);
  });
  it('carries the entry key for the page to delegate on', () => {
    expect(renderLibraryCard(tr, { lang: 'en', favorite: false, now }).getAttribute('data-key')).toBe('translation:1');
  });
  it('uses only design tokens that exist', () => {
    const read = f => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    const css = read('../library/library.css');
    const known = read('../lib/design-tokens.css') + css;
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
    for (const token of used) expect(known, token).toMatch(new RegExp(`${token}\\s*:`));
  });
  it('keeps letter-spacing off Persian labels', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../library/library.css'), 'utf8');
    for (const block of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (/letter-spacing|text-transform/.test(block[2])) expect(block[1], block[1]).toMatch(/:lang\(en\)/);
    }
    const fa = renderLibraryCard(tr, { lang: 'fa', favorite: false, now });
    expect(fa.querySelector('.lib-badge').getAttribute('lang')).toBe('fa');
    const en = renderLibraryCard(polish, { lang: 'en', favorite: false, now });
    expect(en.querySelector('.lib-variant-label').getAttribute('lang')).toBe('en');
  });
  it('names each variant copy button from a translated template', () => {
    const en = renderLibraryCard(polish, { lang: 'en', favorite: false, now });
    expect(en.querySelector('button[data-variant="concise"]').getAttribute('aria-label')).toBe('Copy Concise');
    const fa = renderLibraryCard(polish, { lang: 'fa', favorite: false, now });
    expect(fa.querySelector('button[data-variant="concise"]').getAttribute('aria-label')).not.toMatch(/\{variant\}|Copy/);
  });
  it('skips a polish variant that is missing or empty', () => {
    const partial = { ...polish, variants: { professional: 'Good afternoon.', conversational: '', concise: undefined } };
    const card = renderLibraryCard(partial, { lang: 'en', favorite: false, now });
    expect(card.querySelectorAll('.lib-variant')).toHaveLength(1);
    expect(card.querySelectorAll('[data-action="copy"]')).toHaveLength(1);
  });
});
