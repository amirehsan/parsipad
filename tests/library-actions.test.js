import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toHistoryEntries, toFavoriteEntries } from '../lib/library-model.js';
import { STORAGE_KEYS } from '../lib/constants.js';
import { createUndoQueue } from '../lib/undo-queue.js';

function installChromeStub() {
  const data = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return data.has(key) ? { [key]: structuredClone(data.get(key)) } : {}; },
        async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, structuredClone(v)); },
        async remove(key) { data.delete(key); }
      }
    }
  };
}

// Four lists, one entry in each with the same id. The entry key is the only
// thing that tells them apart, so a delete or an Undo must touch one list.
const translation = (id, timestamp, original = `t${id}`) => ({ id, original, translation: `T${id}`, direction: 'en-fa', timestamp });
const polish = (id, timestamp, original = `p${id}`) => ({ id, original, professional: 'pro', conversational: 'conv', concise: 'con', timestamp });
const dictionary = (id, timestamp, word = `d${id}`) => ({ id, word, phonetic: '/x/', partOfSpeech: 'noun', definition: 'def', translation: `D${id}`, sourceLang: 'en', targetLang: 'fa', timestamp });
const favorite = (id, timestamp, originalText = `f${id}`) => ({ id, type: 'translation', originalText, savedText: `F${id}`, direction: 'en-fa', provider: 'claude', timestamp });

describe('library delete and undo', () => {
  let history;
  let storage;
  let actions;
  let queue;

  async function seed({ translations, polishes, dictionaries, favorites }) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.translationHistory]: translations,
      [STORAGE_KEYS.polishHistory]: polishes,
      [STORAGE_KEYS.dictionaryHistory]: dictionaries,
      [STORAGE_KEYS.favorites]: favorites
    });
  }

  async function entries() {
    const all = [
      ...toHistoryEntries({
        translations: await history.getHistory(),
        polishes: await history.getPolishHistory(),
        dictionary: await history.getDictionaryHistory()
      }),
      ...toFavoriteEntries(await storage.getFavorites())
    ];
    return Object.fromEntries(all.map(entry => [entry.key, entry]));
  }

  async function storedOrder() {
    return {
      translations: (await history.getHistory()).map(item => item.id),
      polishes: (await history.getPolishHistory()).map(item => item.id),
      dictionaries: (await history.getDictionaryHistory()).map(item => item.id),
      favorites: (await storage.getFavorites()).map(item => item.id)
    };
  }

  async function collidingFixture() {
    await seed({
      translations: [translation(1, 400), translation(2, 300)],
      polishes: [polish(1, 400)],
      dictionaries: [dictionary(1, 400)],
      favorites: [favorite(1, 400), favorite(2, 300)]
    });
  }

  beforeEach(async () => {
    installChromeStub();
    vi.resetModules();
    history = await import('../lib/history.js');
    storage = await import('../lib/storage.js');
    actions = await import('../lib/library-actions.js');
    queue = createUndoQueue({ commit: actions.removeLibraryEntry, restore: actions.restoreLibraryEntry });
  });

  for (const key of ['translation:1', 'polish:1', 'dictionary:1', 'favorite:1']) {
    it(`deleting ${key} leaves the other three lists whole`, async () => {
      await collidingFixture();
      const before = await entries();
      queue.remove(before[key]);
      await queue.flushWrites();

      const after = await entries();
      expect(after[key]).toBeUndefined();
      for (const other of Object.keys(before).filter(k => k !== key)) {
        expect(after[other], other).toEqual(before[other]);
      }
    });

    it(`undoing ${key} puts back only that entry, in its place`, async () => {
      await collidingFixture();
      const before = await entries();
      const order = await storedOrder();
      queue.remove(before[key]);
      await queue.flushWrites();
      expect(queue.undo(key)).toBe(true);
      await queue.flushWrites();

      expect(await entries()).toEqual(before);
      expect(await storedOrder()).toEqual(order);
    });
  }

  it('restores the raw stored record, not only the fields the Library shows', async () => {
    await collidingFixture();
    const before = await entries();
    const raw = {
      translations: await history.getHistory(),
      polishes: await history.getPolishHistory(),
      dictionaries: await history.getDictionaryHistory(),
      favorites: await storage.getFavorites()
    };
    for (const key of ['translation:1', 'polish:1', 'dictionary:1', 'favorite:1']) {
      queue.remove(before[key]);
      queue.undo(key);
    }
    await queue.flushWrites();

    expect(await history.getHistory()).toEqual(raw.translations);
    expect(await history.getPolishHistory()).toEqual(raw.polishes);
    expect(await history.getDictionaryHistory()).toEqual(raw.dictionaries);
    expect(await storage.getFavorites()).toEqual(raw.favorites);
  });

  it('puts a polish entry back at its original index even though the list is not timestamp sorted', async () => {
    // updatePolishVariant stamps an edited entry with Date.now() in place, so the list is not sorted.
    await seed({
      translations: [],
      polishes: [polish(1, 300), polish(2, 200), polish(3, 500)],
      dictionaries: [], favorites: []
    });
    const before = await entries();
    queue.remove(before['polish:2']);
    await queue.flushWrites();
    expect((await history.getPolishHistory()).map(item => item.id)).toEqual([1, 3]);
    queue.undo('polish:2');
    await queue.flushWrites();
    expect((await history.getPolishHistory()).map(item => item.id)).toEqual([1, 2, 3]);
  });

  it('puts a favorite back at its original index in an out-of-order list', async () => {
    await seed({
      translations: [], polishes: [], dictionaries: [],
      favorites: [favorite('a', 100), favorite('b', 400), favorite('c', 400), favorite('d', 50)]
    });
    const before = await entries();
    for (const id of ['a', 'c', 'd', 'b']) {
      queue.remove(before[`favorite:${id}`]);
      await queue.flushWrites();
      queue.undo(`favorite:${id}`);
      await queue.flushWrites();
      expect((await storage.getFavorites()).map(item => item.id), id).toEqual(['a', 'b', 'c', 'd']);
    }
  });

  it('clamps the original index to the end of a list that got shorter', async () => {
    await seed({ translations: [translation(3, 300), translation(2, 200), translation(1, 100)], polishes: [], dictionaries: [], favorites: [] });
    const before = await entries();
    queue.remove(before['translation:1']);
    await queue.flushWrites();
    await chrome.storage.local.set({ [STORAGE_KEYS.translationHistory]: [translation(3, 300)] });
    queue.undo('translation:1');
    await queue.flushWrites();
    expect((await history.getHistory()).map(item => item.id)).toEqual([3, 1]);
  });

  it('falls back to the timestamp when no index is known', async () => {
    await seed({ translations: [translation(9, 900), translation(3, 300), translation(1, 100)], polishes: [], dictionaries: [], favorites: [] });
    await history.restoreHistoryEntry('translation', translation(2, 200));
    expect((await history.getHistory()).map(item => item.id)).toEqual([9, 3, 2, 1]);
  });

  it('does not duplicate an entry that is already back in the list', async () => {
    await seed({ translations: [translation(1, 100)], polishes: [], dictionaries: [], favorites: [] });
    await history.restoreHistoryEntry('translation', translation(1, 100));
    expect(await history.getHistory()).toHaveLength(1);
  });

  it('restoreFavorite keeps newest first and ignores a favorite that is already saved', async () => {
    await seed({ translations: [], polishes: [], dictionaries: [], favorites: [favorite(3, 300), favorite(1, 100)] });
    await storage.restoreFavorite(favorite(2, 200));
    await storage.restoreFavorite(favorite(2, 200));
    expect((await storage.getFavorites()).map(item => item.id)).toEqual([3, 2, 1]);
  });

  it('refuses an unknown history kind', async () => {
    await expect(history.restoreHistoryEntry('grammar', translation(1, 1))).rejects.toThrow(/kind/);
  });

  it('removing an entry that is already gone is harmless and restores nothing', async () => {
    await seed({ translations: [], polishes: [], dictionaries: [], favorites: [] });
    const ghost = toHistoryEntries({ translations: [translation(7, 1)] })[0];
    queue.remove(ghost);
    queue.undo(ghost.key);
    await queue.flushWrites();
    expect(await history.getHistory()).toEqual([]);
  });
});
