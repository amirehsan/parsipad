// tests/practice.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { buildDeck, clampSessionSize } from '../lib/practice.js';
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
    expect(c).toMatchObject({ front: 'کتاب', back: 'book', frontLang: 'fa', backLang: 'en' });
  });
  it('deals a legacy favorite with no type and an old direction label as a translation', () => {
    const legacy = [
      { id: 'l1', original: 'water', saved: 'آب', direction: 'EN -> FA' },
      { id: 'l2', original: 'fire', saved: 'آتش', direction: 'EN → FA' }
    ];
    const deck = buildDeck(legacy, { size: 10, rng: () => 0 });
    expect(deck.map(c => c.id).sort()).toEqual(['l1', 'l2']);
    for (const card of deck) {
      expect(card).toMatchObject({ kind: 'translation', frontLang: 'en', backLang: 'fa' });
    }
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
