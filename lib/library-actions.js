/**
 * Delete and restore for LibraryEntry. These are the commit and restore the
 * Library's undo queue is built from. Each entry is routed to its own storage
 * list by source and kind, never by id alone, because the lists number their
 * ids independently and 'translation:1' and 'polish:1' are different records.
 *
 * The raw stored record is read before it is removed and handed back as the
 * receipt, so Undo restores every stored field (a LibraryEntry carries only
 * the ones the Library shows).
 */
import {
  getHistory, removeFromHistory,
  getPolishHistory, removeFromPolishHistory,
  getDictionaryHistory, removeFromDictionaryHistory,
  restoreHistoryEntry
} from './history.js';
import { getFavorites, removeFavorite, restoreFavorite } from './storage.js';

const HISTORY_LISTS = {
  translation: { read: getHistory, remove: removeFromHistory },
  polish: { read: getPolishHistory, remove: removeFromPolishHistory },
  dictionary: { read: getDictionaryHistory, remove: removeFromDictionaryHistory }
};

/**
 * Delete an entry from its own list.
 * @param {import('./library-model.js').LibraryEntry} entry
 * @returns {Promise<object|null>} The stored record that was removed, or null if it was already gone
 */
export async function removeLibraryEntry(entry) {
  if (entry.source === 'favorites') {
    const record = (await getFavorites()).find(item => item.id === entry.id) || null;
    if (record) await removeFavorite(entry.id);
    return record;
  }

  const list = HISTORY_LISTS[entry.kind];
  if (!list) throw new Error(`Unknown library entry kind: ${entry.kind}`);
  const record = (await list.read()).find(item => item.id === entry.id) || null;
  if (record) await list.remove(entry.id);
  return record;
}

/**
 * Put a deleted entry back in its own list.
 * @param {import('./library-model.js').LibraryEntry} entry
 * @param {object|null} record - What removeLibraryEntry resolved with
 */
export async function restoreLibraryEntry(entry, record) {
  if (!record) return;
  if (entry.source === 'favorites') {
    await restoreFavorite(record);
    return;
  }
  await restoreHistoryEntry(entry.kind, record);
}
