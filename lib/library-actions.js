/**
 * Delete and restore for LibraryEntry. These are the commit and restore the
 * Library's undo queue is built from. Each entry is routed to its own storage
 * list by source and kind, never by id alone, because the lists number their
 * ids independently and 'translation:1' and 'polish:1' are different records.
 *
 * The raw stored record and its index are read before it is removed and handed
 * back as the receipt, so Undo restores every stored field (a LibraryEntry
 * carries only the ones the Library shows) at the position it had. The index
 * matters because the lists are not reliably sorted by timestamp.
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
const FAVORITES_LIST = { read: getFavorites, remove: removeFavorite };

/**
 * Delete an entry from its own list.
 * @param {import('./library-model.js').LibraryEntry} entry
 * @returns {Promise<{ record: object, index: number }|null>} The stored record that was
 *   removed and where it was, or null if it was already gone
 */
export async function removeLibraryEntry(entry) {
  const list = entry.source === 'favorites' ? FAVORITES_LIST : HISTORY_LISTS[entry.kind];
  if (!list) throw new Error(`Unknown library entry kind: ${entry.kind}`);

  const records = await list.read();
  const index = records.findIndex(item => item.id === entry.id);
  if (index === -1) return null;
  const record = records[index];
  await list.remove(entry.id);
  return { record, index };
}

/**
 * Put a deleted entry back in its own list, at its old position.
 * @param {import('./library-model.js').LibraryEntry} entry
 * @param {{ record: object, index: number }|null} receipt - What removeLibraryEntry resolved with
 */
export async function restoreLibraryEntry(entry, receipt) {
  if (!receipt) return;
  const { record, index } = receipt;
  if (entry.source === 'favorites') {
    await restoreFavorite(record, index);
    return;
  }
  await restoreHistoryEntry(entry.kind, record, index);
}
