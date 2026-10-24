/**
 * The Library's data model. History (translations, polishes, dictionary
 * lookups) and favorites are stored in different shapes by different pages;
 * this module turns them into one LibraryEntry so the Library page, its
 * filters and Practice read a single shape.
 *
 * @typedef {object} LibraryEntry
 * @property {string} key - Unique across lists: 'translation:<id>', 'polish:<id>',
 *   'dictionary:<id>' or 'favorite:<id>'
 * @property {'history'|'favorites'} source
 * @property {'translation'|'dictionary'|'polish'|'grammar'} kind
 * @property {string|number} id - The id the entry has in its own storage list
 * @property {string} original
 * @property {string} result - The translation, the dictionary translation, the
 *   saved text, or for a polish history entry the professional variant
 * @property {{professional: string, conversational: string, concise: string}} [variants] -
 *   Polish history entries only
 * @property {string} direction - directionKey, or '' when unknown
 * @property {number} timestamp
 * @property {object} [lesson] - Grammar favorites only
 */
import { dayGroup } from './format.js';
import { directionKey } from './direction-label.js';

const KINDS = ['translation', 'dictionary', 'polish', 'grammar'];
const TYPE_FILTERS = ['all', 'translation', 'dictionary', 'polish'];
const TABS = ['history', 'favorites', 'lessons'];
const GROUP_ORDER = ['today', 'yesterday', 'week', 'earlier'];

export const LIBRARY_DEFAULTS = Object.freeze({ tab: 'history', type: 'all', dir: 'all', q: '' });

function newestFirst(a, b) {
  return b.timestamp - a.timestamp;
}

/**
 * Merge the three history lists into one list, newest first.
 * @param {{ translations?: Array, polishes?: Array, dictionary?: Array }} lists
 * @returns {LibraryEntry[]}
 */
export function toHistoryEntries({ translations, polishes, dictionary } = {}) {
  const entries = [];

  for (const item of translations || []) {
    entries.push({
      key: `translation:${item.id}`,
      source: 'history',
      kind: 'translation',
      id: item.id,
      original: item.original || '',
      result: item.translation || '',
      direction: directionKey(item.direction),
      timestamp: item.timestamp || 0
    });
  }

  for (const item of polishes || []) {
    const variants = {
      professional: item.professional || '',
      conversational: item.conversational || '',
      concise: item.concise || ''
    };
    entries.push({
      key: `polish:${item.id}`,
      source: 'history',
      kind: 'polish',
      id: item.id,
      original: item.original || '',
      result: variants.professional,
      variants,
      direction: '',
      timestamp: item.timestamp || 0
    });
  }

  for (const item of dictionary || []) {
    entries.push({
      key: `dictionary:${item.id}`,
      source: 'history',
      kind: 'dictionary',
      id: item.id,
      original: item.word || '',
      result: item.translation || '',
      direction: directionKey(`${item.sourceLang}-${item.targetLang}`),
      timestamp: item.timestamp || 0
    });
  }

  return entries.sort(newestFirst);
}

/**
 * Normalize stored favorites, including those saved by older versions with
 * 'original' and 'saved' fields, into library entries in stored order (the
 * store adds newest first). The one reader of the favorites list for every later consumer.
 * @param {Array} favorites
 * @returns {LibraryEntry[]}
 */
export function toFavoriteEntries(favorites) {
  return (favorites || []).map(item => {
    const entry = {
      key: `favorite:${item.id}`,
      source: 'favorites',
      kind: KINDS.includes(item.type) ? item.type : 'translation',
      id: item.id,
      original: item.originalText || item.original || '',
      result: item.savedText || item.saved || '',
      direction: directionKey(item.direction),
      timestamp: item.timestamp || 0
    };
    if (item.lesson) entry.lesson = item.lesson;
    return entry;
  });
}

function matchesQuery(entry, needle) {
  const fields = [entry.original, entry.result];
  if (entry.variants) fields.push(...Object.values(entry.variants));
  return fields.some(text => String(text || '').toLowerCase().includes(needle));
}

/**
 * @param {LibraryEntry[]} entries
 * @param {object} [filters]
 * @param {'history'|'favorites'|'lessons'} [filters.tab] - Favorites hold the
 *   grammar lessons too; 'favorites' keeps the rest and 'lessons' keeps only
 *   the lessons. Omitted or 'history' leaves entries as they are.
 * @param {string} [filters.type] - 'all', 'translation', 'dictionary' or 'polish'
 * @param {string} [filters.dir] - 'all' or a directionKey
 * @param {string} [filters.q] - Matched against original, result and variants
 * @returns {LibraryEntry[]}
 */
export function filterEntries(entries, { tab, type = 'all', dir = 'all', q = '' } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return entries.filter(entry => {
    if (tab === 'favorites' && entry.kind === 'grammar') return false;
    if (tab === 'lessons' && entry.kind !== 'grammar') return false;
    if (type !== 'all' && entry.kind !== type) return false;
    if (dir !== 'all' && entry.direction !== dir) return false;
    return !needle || matchesQuery(entry, needle);
  });
}

/**
 * Split entries (already newest first) into day groups.
 * @param {LibraryEntry[]} entries
 * @param {number} [now]
 * @returns {Array<{ group: 'today'|'yesterday'|'week'|'earlier', entries: LibraryEntry[] }>}
 */
export function groupEntries(entries, now = Date.now()) {
  const buckets = new Map(GROUP_ORDER.map(group => [group, []]));
  for (const entry of entries) {
    buckets.get(dayGroup(entry.timestamp, now)).push(entry);
  }
  return GROUP_ORDER
    .map(group => ({ group, entries: buckets.get(group) }))
    .filter(g => g.entries.length > 0);
}

function validTab(value) {
  return TABS.includes(value) ? value : LIBRARY_DEFAULTS.tab;
}

function validType(value) {
  return TYPE_FILTERS.includes(value) ? value : LIBRARY_DEFAULTS.type;
}

function validDir(value) {
  return value && directionKey(value) === value ? value : LIBRARY_DEFAULTS.dir;
}

/**
 * Read Library state from a location.search string; unknown values fall back
 * to the defaults.
 * @param {string} search
 * @returns {{ tab: string, type: string, dir: string, q: string }}
 */
export function parseLibraryQuery(search) {
  const params = new URLSearchParams(search || '');
  return {
    tab: validTab(params.get('tab')),
    type: validType(params.get('type')),
    dir: validDir(params.get('dir')),
    q: params.get('q') || LIBRARY_DEFAULTS.q
  };
}

/**
 * Write Library state as a query string, leaving defaults out.
 * @param {{ tab?: string, type?: string, dir?: string, q?: string }} state
 * @returns {string} '?tab=...' or '' when everything is a default
 */
export function buildLibraryQuery(state = {}) {
  const next = {
    tab: validTab(state.tab),
    type: validType(state.type),
    dir: validDir(state.dir),
    q: state.q || LIBRARY_DEFAULTS.q
  };
  const params = new URLSearchParams();
  for (const name of Object.keys(LIBRARY_DEFAULTS)) {
    if (next[name] !== LIBRARY_DEFAULTS[name]) params.set(name, next[name]);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
