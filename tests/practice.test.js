// tests/practice.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { buildDeck, clampSessionSize } from '../lib/practice.js';
import { toFavoriteEntries } from '../lib/library-model.js';
const favs = [
  { id: 'a', type: 'translation', originalText: 'apple', savedText: 'سیب' },
  { id: 'b', type: 'grammar', originalText: 'x', savedText: 'y', lesson: {} },
  { id: 'c', original: 'کتاب', saved: 'book' },
  { id: 'd', type: 'translation', originalText: '', savedText: 'خالی' }
];
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
describe('practice', () => {
  it('builds a deck from favorites, legacy ones included, lessons and blanks excluded', () => {
    const deck = buildDeck(favs, { size: 10, rng: () => 0 });
    expect(deck.map(c => c.id).sort()).toEqual(['a', 'c']);
    const c = deck.find(x => x.id === 'c');
    expect(c).toMatchObject({ front: 'book', back: 'کتاب', frontLang: 'en', backLang: 'fa' });
  });
  it('shows the saved result first and keeps the original for the back', () => {
    const [card] = buildDeck([favs[0]], { size: 10, rng: () => 0 });
    expect(card).toMatchObject({ front: 'سیب', back: 'apple', frontLang: 'fa', backLang: 'en' });
  });
  it('gives a card the language most of its text is in, as the Library cards do', () => {
    const mixed = [{ id: 'm', type: 'polish', originalText: 'I really like the word دوست in Persian', savedText: 'The word دوست means friend in English' }];
    const [card] = buildDeck(mixed, { size: 10, rng: () => 0 });
    expect(card.frontLang).toBe('en');
    expect(card.backLang).toBe('en');
  });
  it('deals a legacy favorite with no type and an old direction label as a translation', () => {
    // Older versions stored the formatted label, with a real arrow.
    const legacy = [{ id: 'l1', original: 'fire', saved: 'آتش', direction: 'EN → FA' }];
    expect(toFavoriteEntries(legacy)[0].direction).toBe('en-fa');
    const deck = buildDeck(legacy, { size: 10, rng: () => 0 });
    expect(deck).toHaveLength(1);
    expect(deck[0]).toMatchObject({ id: 'l1', kind: 'translation', front: 'آتش', back: 'fire', frontLang: 'fa', backLang: 'en' });
  });
  it('respects the session size', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: String(i), type: 'translation', originalText: `w${i}`, savedText: `t${i}` }));
    expect(buildDeck(many, { size: 12 })).toHaveLength(12);
    expect(clampSessionSize(2)).toBe(5); expect(clampSessionSize(99)).toBe(30); expect(clampSessionSize('x')).toBe(10);
  });
  it('flips with a real button and stays still under reduced motion', () => {
    const html = read('practice/practice.html'); const css = read('practice/practice.css');
    expect(html).toMatch(/<button[^>]+class="practice-card"[^>]+aria-pressed="false"/);
    expect(html).toMatch(/role="status"/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transform:\s*none/);
    expect(css).toMatch(/transition:[^;]*var\(--motion-/);
    expect(css).not.toMatch(/transition:\s*all/);
  });
  it('styles Copy as a secondary button, like Previous', () => {
    const html = read('practice/practice.html');
    expect(html).toMatch(/<button id="practice-prev"[^>]+class="pp-btn pp-btn-secondary /);
    expect(html).toMatch(/<button id="practice-copy"[^>]+class="pp-btn pp-btn-secondary /);
    expect(html).toMatch(/<button id="practice-next"[^>]+class="pp-btn pp-btn-primary /);
  });
  it('keeps storage free of the deck code: the size rules live in a module with no imports', () => {
    const size = read('lib/practice-size.js');
    expect(size).not.toMatch(/^import /m);
    const storage = read('lib/storage.js');
    expect(storage).toMatch(/from '\.\/practice-size\.js'/);
    expect(storage).not.toMatch(/from '\.\/practice\.js'/);
  });
  it('is reachable from the side panel and the Library', () => {
    expect(read('sidepanel/sidepanel.html')).toMatch(/href="\.\.\/practice\/practice\.html\?surface=panel"/);
    expect(read('library/library.html')).toMatch(/href="\.\.\/practice\/practice\.html"/);
  });
});
