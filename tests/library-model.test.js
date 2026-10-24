import { describe, it, expect } from 'vitest';
import {
  toHistoryEntries,
  toFavoriteEntries,
  filterEntries,
  groupEntries,
  parseLibraryQuery,
  buildLibraryQuery,
  LIBRARY_DEFAULTS
} from '../lib/library-model.js';

const now = Date.parse('2026-10-24T18:00:00Z');
const translations = [{ id: 1, original: 'Hello world', translation: 'سلام دنیا', direction: 'en-fa', timestamp: now - 1000 }];
const polishes = [{ id: 2, original: 'hi', professional: 'Hello', conversational: 'Hey', concise: 'Hi', timestamp: now - 2000 }];
const dictionary = [{ id: 3, word: 'apple', translation: 'سیب', sourceLang: 'en', targetLang: 'fa', timestamp: now - 9 * 864e5 }];

describe('library model', () => {
  it('merges the three histories newest first', () => {
    const e = toHistoryEntries({ translations, polishes, dictionary });
    expect(e.map(x => x.key)).toEqual(['translation:1', 'polish:2', 'dictionary:3']);
    expect(e[2]).toMatchObject({ kind: 'dictionary', original: 'apple', result: 'سیب', direction: 'en-fa' });
    expect(e.every(x => x.source === 'history')).toBe(true);
  });

  it('orders by timestamp across the three lists, not by list', () => {
    const e = toHistoryEntries({
      translations: [{ id: 1, original: 'a', translation: 'b', timestamp: 10 }],
      polishes: [{ id: 2, original: 'c', professional: 'd', conversational: 'e', concise: 'f', timestamp: 30 }],
      dictionary: [{ id: 3, word: 'g', translation: 'h', sourceLang: 'en', targetLang: 'fa', timestamp: 20 }]
    });
    expect(e.map(x => x.key)).toEqual(['polish:2', 'dictionary:3', 'translation:1']);
  });

  it('tolerates missing lists', () => {
    expect(toHistoryEntries({})).toEqual([]);
    expect(toHistoryEntries()).toEqual([]);
  });

  it('gives a polish entry the professional text as its result and all three variants', () => {
    const [, polish] = toHistoryEntries({ translations, polishes, dictionary });
    expect(polish).toMatchObject({
      kind: 'polish',
      original: 'hi',
      result: 'Hello',
      variants: { professional: 'Hello', conversational: 'Hey', concise: 'Hi' },
      direction: ''
    });
  });

  it('reads legacy favorites', () => {
    const [legacy, grammar] = toFavoriteEntries([
      { id: 'f1', original: 'old', saved: 'قدیمی', direction: 'EN → FA', timestamp: 1 },
      { id: 'grammar_x', type: 'grammar', originalText: 'a', savedText: 'b', lesson: { title: 'T' }, timestamp: 2 }
    ]);
    expect(legacy).toMatchObject({ key: 'favorite:f1', source: 'favorites', kind: 'translation', original: 'old', result: 'قدیمی', direction: 'en-fa' });
    expect(grammar.kind).toBe('grammar');
    expect(grammar.lesson).toEqual({ title: 'T' });
  });

  it('reads current favorites and falls back to translation for unknown types', () => {
    const e = toFavoriteEntries([
      { id: 'a', type: 'polish', originalText: 'x', savedText: 'y', variant: 'concise', timestamp: 5 },
      { id: 'b', type: 'mystery', originalText: 'p', savedText: 'q', direction: 'fa-to-en', timestamp: 4 },
      { id: 'c', type: 'dictionary', originalText: 'r', savedText: 's', timestamp: 3 }
    ]);
    expect(e.map(x => [x.key, x.kind, x.original, x.result, x.direction])).toEqual([
      ['favorite:a', 'polish', 'x', 'y', ''],
      ['favorite:b', 'translation', 'p', 'q', 'fa-en'],
      ['favorite:c', 'dictionary', 'r', 's', '']
    ]);
  });

  it('keeps the stored order of favorites and tolerates bad input', () => {
    const e = toFavoriteEntries([
      { id: 'new', originalText: 'c', savedText: 'd', timestamp: 9 },
      { id: 'old', originalText: 'a', savedText: 'b', timestamp: 1 }
    ]);
    expect(e.map(x => x.id)).toEqual(['new', 'old']);
    expect(toFavoriteEntries(undefined)).toEqual([]);
  });

  it('filters by type, direction and search', () => {
    const e = toHistoryEntries({ translations, polishes, dictionary });
    expect(filterEntries(e, { type: 'dictionary' }).map(x => x.key)).toEqual(['dictionary:3']);
    expect(filterEntries(e, { dir: 'fa-en' })).toEqual([]);
    expect(filterEntries(e, { dir: 'en-fa' }).map(x => x.key)).toEqual(['translation:1', 'dictionary:3']);
    expect(filterEntries(e, { q: '  HEY ' }).map(x => x.key)).toEqual(['polish:2']);
    expect(filterEntries(e, { q: 'سیب' }).map(x => x.key)).toEqual(['dictionary:3']);
    expect(filterEntries(e, {}).length).toBe(3);
  });

  it('partitions favorites between the Favorites and Lessons tabs', () => {
    const e = toFavoriteEntries([
      { id: 'f1', type: 'translation', originalText: 'a', savedText: 'b', timestamp: 3 },
      { id: 'grammar_1', type: 'grammar', originalText: 'c', savedText: 'd', lesson: { title: 'T' }, timestamp: 2 },
      { id: 'f2', type: 'polish', originalText: 'e', savedText: 'f', timestamp: 1 }
    ]);
    expect(filterEntries(e, { tab: 'favorites' }).map(x => x.id)).toEqual(['f1', 'f2']);
    expect(filterEntries(e, { tab: 'lessons' }).map(x => x.id)).toEqual(['grammar_1']);
    expect(filterEntries(e, { tab: 'history' }).length).toBe(3);
    expect(filterEntries(e, {}).length).toBe(3);
  });

  it('excludes lessons when a specific type is chosen', () => {
    const e = toFavoriteEntries([
      { id: 'grammar_1', type: 'grammar', originalText: 'c', savedText: 'd', timestamp: 2 },
      { id: 'f1', type: 'translation', originalText: 'a', savedText: 'b', timestamp: 3 }
    ]);
    expect(filterEntries(e, { type: 'translation' }).map(x => x.id)).toEqual(['f1']);
  });

  it('groups by day', () => {
    const groups = groupEntries(toHistoryEntries({ translations, polishes, dictionary }), now);
    expect(groups.map(g => g.group)).toEqual(['today', 'earlier']);
    expect(groups[0].entries.map(x => x.key)).toEqual(['translation:1', 'polish:2']);
  });

  it('orders groups today, yesterday, week, earlier and omits empty ones', () => {
    const entries = [
      { key: 'a', timestamp: now - 20 * 864e5 },
      { key: 'b', timestamp: now - 3 * 864e5 },
      { key: 'c', timestamp: now - 864e5 },
      { key: 'd', timestamp: now - 1000 }
    ];
    expect(groupEntries(entries, now).map(g => g.group)).toEqual(['today', 'yesterday', 'week', 'earlier']);
    expect(groupEntries([entries[1]], now).map(g => g.group)).toEqual(['week']);
    expect(groupEntries([], now)).toEqual([]);
  });

  it('round-trips the URL query', () => {
    expect(parseLibraryQuery('?tab=favorites&type=dictionary&dir=en-fa&q=apple')).toEqual({ tab: 'favorites', type: 'dictionary', dir: 'en-fa', q: 'apple' });
    expect(parseLibraryQuery('?tab=bogus&type=x')).toEqual({ tab: 'history', type: 'all', dir: 'all', q: '' });
    expect(buildLibraryQuery({ tab: 'history', type: 'all', dir: 'all', q: '' })).toBe('');
    expect(buildLibraryQuery({ tab: 'favorites', type: 'dictionary', dir: 'all', q: '' })).toBe('?tab=favorites&type=dictionary');
  });

  it('falls back to defaults for bad direction and empty search', () => {
    expect(parseLibraryQuery('?dir=nonsense')).toEqual({ ...LIBRARY_DEFAULTS });
    expect(parseLibraryQuery('')).toEqual({ ...LIBRARY_DEFAULTS });
    expect(parseLibraryQuery('?tab=lessons')).toMatchObject({ tab: 'lessons' });
  });

  it('encodes and decodes a search with special characters', () => {
    const state = { tab: 'history', type: 'all', dir: 'all', q: 'a&b = سیب' };
    expect(parseLibraryQuery(buildLibraryQuery(state))).toEqual(state);
  });

  it('keeps the defaults frozen', () => {
    expect(Object.isFrozen(LIBRARY_DEFAULTS)).toBe(true);
  });
});
