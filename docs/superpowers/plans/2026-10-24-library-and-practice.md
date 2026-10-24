# Library and Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace History and Favorites with one Library page, add a Practice view for flashcards, and remove the New Tab override with everything that only served it. Ships as 3.4.0.

**Architecture:** Pure helpers in `lib/` (a shared `Intl` formatter, a library model that normalizes the four stored lists into one entry shape, an undo queue, a deck builder) carry the logic and the tests. `library/` and `practice/` are thin pages over them; `library/card.js` builds one card as DOM so it can be tested under happy-dom. The old History and Favorites pages become meta-refresh redirects so existing links and bookmarks keep working. A saved grammar lesson reopens on `grammar/grammar.html?saved=<id>` from storage.

**Tech Stack:** Manifest V3, vanilla ES modules, esbuild (`scripts/build.mjs`), vitest in the node environment, happy-dom for DOM tests.

**Spec:** `docs/superpowers/specs/2026-10-24-redesign-phases-c-to-f.md` (Phase C, decisions 1, 2, 4 to 6), on top of `docs/superpowers/specs/2026-10-23-ui-review-and-side-panel-design.md`. Audit findings: `.superpowers/sdd/2026-10-23-side-panel-and-popup/ui-audit-report.md` section D (history, favorites, newtab).

## Global Constraints

- Branch `feat/library-practice` off `main` after Plan B (`feat/side-panel`, 3.3.0) is merged. This plan consumes Plan B's `sidepanel/panel.js`, the Recent row's Library link, and `chrome.sidePanel`.
- Commit per task, conventional prefix with scope (`feat(library): ...`), no `Co-Authored-By` or other attribution trailer.
- No em dashes or emoji in code or copy. Every user-visible string through `t()` with both `en` and `fa` entries in `lib/i18n.js`.
- New Tab is removed: `chrome_url_overrides.newtab`, the `bookmarks` permission, the optional `topSites` permission, the `favicon` permission (used only by `lib/top-sites.js`), `newtab/`, `lib/top-sites.js`, the New Tab settings and storage functions. Existing favorites are untouched and appear in Practice.
- The Persian-interface RTL rework is held. Do not add logical-property sweeps, mirrored layouts, Persian digits or the Persian calendar. Content text gets `dir` and `lang` per run; mixed labels go in `<bdi>`.
- `lib/format.js` is the only place dates, relative times, numbers and currency are formatted for the UI, through `INTL_LOCALE`.
- Spacing in new CSS uses only `--space-inset-card` (20px), `--space-stack-section` (24px), `--space-stack-group` (16px), `--space-stack-item` (12px), `--space-inline-actions` (8px). Durations use `--motion-*` tokens. No `transition: all`, no `outline: none` without a `:focus-visible` replacement.
- The extension is also loaded unpacked from the repo root, so every new page must work unbuilt (relative module imports, no build-only paths).
- `npm test`, `npm run lint`, `npm run build` pass after every task. `landing/` is never staged.

## Review Focus

1. A history entry whose original is long unbroken text (a URL, a 400-character Persian run): the card wraps inside its column and the page never scrolls sideways. Pinned in Task 4 (`overflow-wrap: anywhere` on `.lib-text`).
2. Delete, then close the tab within the 5-second Undo window: the delete is committed, not lost. Pinned in Task 3 (`flush`) and Task 5 (`pagehide` flushes).
3. A favorite saved by 2.x with legacy `original`/`saved` fields and an `EN → FA` direction string: it appears under Favorites, matches the EN → FA filter, and enters the Practice deck. Pinned in Task 2 and Task 7.
4. An old bookmark to `history/history.html` or `favorites/favorites.html`: it lands on the matching Library tab. Pinned in Task 5.
5. Open lesson for a saved lesson while offline or with no API key: the lesson renders from storage with no request. Pinned in Task 6.

---

### Task 1: Shared formatter

**Files:**
- Create: `lib/format.js`
- Modify: `lib/i18n.js` (`libraryToday`, `libraryYesterday`, `libraryThisWeek`, `libraryEarlier` in `en` and `fa`)
- Test: `tests/format.test.js` (create)

**Interfaces:**
- Produces in `lib/format.js` (consumed by Tasks 2, 4, 5, 7 and by Plan F's analytics):
  - `export const INTL_LOCALE = Object.freeze({ en: 'en', fa: 'fa-u-ca-gregory-nu-latn' })`. Persian words, Latin digits, Gregorian calendar; the held RTL phase changes only this constant.
  - `export function localDayKey(ts: number): string` returning `YYYY-MM-DD` in local time.
  - `export function formatRelativeTime(ts: number, lang: 'en'|'fa', now = Date.now()): string` via `Intl.RelativeTimeFormat(INTL_LOCALE[lang], { numeric: 'auto' })`; under 60 s formats `0, 'second'`; then minutes, hours, days, and `formatDate` beyond 7 days.
  - `export function dayGroup(ts: number, now = Date.now()): 'today'|'yesterday'|'week'|'earlier'` by local calendar day (`week` is 2 to 6 days back).
  - `export function dayGroupLabel(group: string, lang: string): string` through `t()`.
  - `export function formatDate(ts: number, lang: string): string` with `{ dateStyle: 'medium' }`.
  - `export function formatNumber(n: number, lang: string, options?: Intl.NumberFormatOptions): string`.
  - `export function formatCurrency(usd: number, lang: string): string` in USD: under 0.01 four fraction digits, under 1 three, else two.

- [ ] **Step 1: Write the failing test**

```js
// tests/format.test.js
process.env.TZ = 'America/Los_Angeles';
import { describe, it, expect } from 'vitest';
import { INTL_LOCALE, localDayKey, formatRelativeTime, dayGroup, dayGroupLabel, formatNumber, formatCurrency } from '../lib/format.js';
const now = Date.parse('2026-10-24T18:00:00Z'); // 11:00 in Los Angeles
const min = 60e3, day = 864e5;
describe('format', () => {
  it('keys days in local time, not UTC', () => {
    expect(localDayKey(Date.parse('2026-10-21T05:30:00Z'))).toBe('2026-10-20');
  });
  it('formats relative time per language', () => {
    expect(formatRelativeTime(now - 10 * min, 'en', now)).toBe('10 minutes ago');
    expect(formatRelativeTime(now - 20e3, 'en', now)).toBe('now');
    const fa = formatRelativeTime(now - 10 * min, 'fa', now);
    expect(fa).toMatch(/10/);
    expect(fa).toMatch(/[؀-ۿ]/);
    expect(fa).not.toMatch(/[۰-۹]/);
  });
  it('groups by local calendar day', () => {
    expect(dayGroup(now - 2 * 3600e3, now)).toBe('today');
    expect(dayGroup(now - day, now)).toBe('yesterday');
    expect(dayGroup(now - 3 * day, now)).toBe('week');
    expect(dayGroup(now - 10 * day, now)).toBe('earlier');
    expect(dayGroupLabel('today', 'en')).toBe('Today');
  });
  it('formats numbers and currency', () => {
    expect(formatNumber(12345, 'en')).toBe('12,345');
    expect(formatNumber(12345, 'fa').replace(/\D/g, '')).toBe('12345');
    expect(formatCurrency(0.00042, 'en')).toBe('$0.0004');
    expect(formatCurrency(1.5, 'en')).toBe('$1.50');
    expect(INTL_LOCALE.fa).toBe('fa-u-ca-gregory-nu-latn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/format.test.js`
Expected: FAIL, cannot find `lib/format.js`.

- [ ] **Step 3: Implement `lib/format.js` per Interfaces and add the four i18n keys** (`fa`: `امروز`, `دیروز`, `این هفته`, `قبل‌تر`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/format.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/format.js lib/i18n.js tests/format.test.js
git commit -m "feat(format): add one Intl formatter for times, days, numbers and cost"
```

---

### Task 2: Library model

**Files:**
- Create: `lib/library-model.js`, `lib/debounce.js`
- Modify: `lib/direction-label.js` (add `directionKey`)
- Test: `tests/library-model.test.js` (create), `tests/direction-label.test.js` (extend)

**Interfaces:**
- Consumes: `dayGroup` (Task 1); `directionLabel` (existing).
- Produces:
  - `lib/direction-label.js`: `export function directionKey(direction): string` returning `'en-fa'` style or `''`, accepting every shape `directionLabel` accepts.
  - `lib/debounce.js`: `export function debounce(fn, ms): Function` (trailing call, `.cancel()`).
  - `lib/library-model.js`, entry shape `LibraryEntry = { key: string, source: 'history'|'favorites', kind: 'translation'|'dictionary'|'polish'|'grammar', id: string|number, original: string, result: string, variants?: { professional, conversational, concise }, direction: string /* directionKey */, timestamp: number, lesson?: object }`:
    - `export function toHistoryEntries({ translations, polishes, dictionary }): LibraryEntry[]` newest first; keys `translation:<id>`, `polish:<id>`, `dictionary:<id>`; dictionary `original` is `word`, `result` is `translation`, `direction` from `sourceLang`/`targetLang`.
    - `export function toFavoriteEntries(favorites): LibraryEntry[]`; key `favorite:<id>`; `kind` is the stored `type` when it is one of the four, else `'translation'`; legacy `original`/`saved` map to `original`/`result`.
    - `export function filterEntries(entries, { type = 'all', dir = 'all', q = '' }): LibraryEntry[]` where `type` is `'all'|'translation'|'dictionary'|'polish'`, `q` matches original, result and variants case-insensitively after trimming.
    - `export function groupEntries(entries, now = Date.now()): Array<{ group, entries }>` in the order today, yesterday, week, earlier, empty groups omitted.
    - `export const LIBRARY_DEFAULTS = Object.freeze({ tab: 'history', type: 'all', dir: 'all', q: '' })`, tabs `'history'|'favorites'|'lessons'`.
    - `export function parseLibraryQuery(search: string): typeof LIBRARY_DEFAULTS` (unknown values fall back to defaults) and `export function buildLibraryQuery(state): string` (omits defaults; `''` when all are defaults).

- [ ] **Step 1: Write the failing tests**

```js
// tests/library-model.test.js
import { describe, it, expect } from 'vitest';
import { toHistoryEntries, toFavoriteEntries, filterEntries, groupEntries, parseLibraryQuery, buildLibraryQuery } from '../lib/library-model.js';
const now = Date.parse('2026-10-24T18:00:00Z');
const translations = [{ id: 1, original: 'Hello world', translation: 'سلام دنیا', direction: 'en-fa', timestamp: now - 1000 }];
const polishes = [{ id: 2, original: 'hi', professional: 'Hello', conversational: 'Hey', concise: 'Hi', timestamp: now - 2000 }];
const dictionary = [{ id: 3, word: 'apple', translation: 'سیب', sourceLang: 'en', targetLang: 'fa', timestamp: now - 9 * 864e5 }];
describe('library model', () => {
  it('merges the three histories newest first', () => {
    const e = toHistoryEntries({ translations, polishes, dictionary });
    expect(e.map(x => x.key)).toEqual(['translation:1', 'polish:2', 'dictionary:3']);
    expect(e[2]).toMatchObject({ kind: 'dictionary', original: 'apple', result: 'سیب', direction: 'en-fa' });
  });
  it('reads legacy favorites', () => {
    const [legacy, grammar] = toFavoriteEntries([
      { id: 'f1', original: 'old', saved: 'قدیمی', direction: 'EN → FA', timestamp: 1 },
      { id: 'grammar_x', type: 'grammar', originalText: 'a', savedText: 'b', lesson: { title: 'T' }, timestamp: 2 }
    ]);
    expect(legacy).toMatchObject({ key: 'favorite:f1', kind: 'translation', original: 'old', result: 'قدیمی', direction: 'en-fa' });
    expect(grammar.kind).toBe('grammar');
  });
  it('filters by type, direction and search', () => {
    const e = toHistoryEntries({ translations, polishes, dictionary });
    expect(filterEntries(e, { type: 'dictionary' }).map(x => x.key)).toEqual(['dictionary:3']);
    expect(filterEntries(e, { dir: 'fa-en' })).toEqual([]);
    expect(filterEntries(e, { q: '  HEY ' }).map(x => x.key)).toEqual(['polish:2']);
    expect(filterEntries(e, { q: 'سیب' }).map(x => x.key)).toEqual(['dictionary:3']);
  });
  it('groups by day', () => {
    const groups = groupEntries(toHistoryEntries({ translations, polishes, dictionary }), now);
    expect(groups.map(g => g.group)).toEqual(['today', 'earlier']);
  });
  it('round-trips the URL query', () => {
    expect(parseLibraryQuery('?tab=favorites&type=dictionary&dir=en-fa&q=apple')).toEqual({ tab: 'favorites', type: 'dictionary', dir: 'en-fa', q: 'apple' });
    expect(parseLibraryQuery('?tab=bogus&type=x')).toEqual({ tab: 'history', type: 'all', dir: 'all', q: '' });
    expect(buildLibraryQuery({ tab: 'history', type: 'all', dir: 'all', q: '' })).toBe('');
    expect(buildLibraryQuery({ tab: 'favorites', type: 'dictionary', dir: 'all', q: '' })).toBe('?tab=favorites&type=dictionary');
  });
});
```

Add to `tests/direction-label.test.js`: `expect(directionKey('EN → FA')).toBe('en-fa'); expect(directionKey('en-to-fa')).toBe('en-fa'); expect(directionKey('nonsense')).toBe('');`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/library-model.test.js tests/direction-label.test.js`
Expected: FAIL, module not found and `directionKey` not exported.

- [ ] **Step 3: Implement `directionKey`, `debounce`, and `lib/library-model.js` per Interfaces.**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/library-model.test.js tests/direction-label.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/library-model.js lib/debounce.js lib/direction-label.js tests/library-model.test.js tests/direction-label.test.js
git commit -m "feat(library): normalize history and favorites into one entry model"
```

---

### Task 3: Undo queue

**Files:**
- Create: `lib/undo-queue.js`
- Test: `tests/undo-queue.test.js` (create)

**Interfaces:**
- Produces: `export function createUndoQueue({ commit: (entry) => Promise<void>, delay = 5000 }): { remove(entry: { key: string }): void, undo(key: string): boolean, isPending(key: string): boolean, flush(): Promise<void> }`. `remove` schedules `commit(entry)` after `delay`; `undo` cancels and returns `true` if it was pending; `flush` commits every pending entry now. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```js
// tests/undo-queue.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUndoQueue } from '../lib/undo-queue.js';
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
describe('undo queue', () => {
  it('commits after the delay', () => {
    const commit = vi.fn().mockResolvedValue();
    const q = createUndoQueue({ commit, delay: 5000 });
    q.remove({ key: 'translation:1' });
    expect(q.isPending('translation:1')).toBe(true);
    vi.advanceTimersByTime(4999); expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(commit).toHaveBeenCalledWith({ key: 'translation:1' });
  });
  it('undo cancels the commit', () => {
    const commit = vi.fn().mockResolvedValue();
    const q = createUndoQueue({ commit });
    q.remove({ key: 'a' });
    expect(q.undo('a')).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(commit).not.toHaveBeenCalled();
    expect(q.undo('a')).toBe(false);
  });
  it('flush commits everything pending at once', async () => {
    const commit = vi.fn().mockResolvedValue();
    const q = createUndoQueue({ commit });
    q.remove({ key: 'a' }); q.remove({ key: 'b' });
    await q.flush();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(q.isPending('a')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/undo-queue.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `createUndoQueue` per Interfaces** (a `Map` of key to `{ entry, timer }`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/undo-queue.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/undo-queue.js tests/undo-queue.test.js
git commit -m "feat(library): add an undo queue for deferred deletes"
```

---

### Task 4: Library card

**Files:**
- Create: `library/card.js`, `library/library.css` (card rules only in this task)
- Modify: `lib/i18n.js` (`libraryFavorite`, `libraryUnfavorite`, `libraryCopy`, `libraryOpenInPanel`, `libraryOpenLesson`, `libraryDelete`, `libraryKindTranslation`, `libraryKindDictionary`, `libraryKindPolish`, `libraryKindLesson`; reuse existing `original`, `professional`, `conversational`, `concise`)
- Test: `tests/library-card.test.js` (create)

**Interfaces:**
- Consumes: `LibraryEntry` (Task 2), `formatRelativeTime` (Task 1), `directionLabel`, `getTextDirection` from `lib/language-detect.js`.
- Produces: `export function renderLibraryCard(entry: LibraryEntry, { lang: string, favorite: boolean, now?: number }): HTMLElement` returning `<article class="lib-card" data-key>` with: a meta row (kind badge, `<bdi dir="ltr">` direction label, `<time datetime=ISO>` relative time); `.lib-pair` holding `.lib-original` and `.lib-result` (`.lib-text` each, `dir` from `getTextDirection`, `lang` `fa` or `en`); for polish, three `.lib-variant` blocks each with its own copy button; an actions row of `<button type="button" data-action>` with `aria-label` set from `t()` at render: `favorite` (translation and dictionary only, `aria-pressed`), `copy`, `open-in-panel` (not for lessons), `delete`; for lessons an `<a data-action="open-lesson" href="../grammar/grammar.html?saved=<id>">`. SVGs are `aria-hidden="true"`. The page (Task 5) delegates clicks by `data-action`.

- [ ] **Step 1: Write the failing test**

```js
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library-card.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `renderLibraryCard` and the card CSS**

DOM built with `createElement` and `textContent`, never `innerHTML` with entry text. `.lib-pair` is a two-column grid that becomes one column under 560px; card padding `--space-inset-card`, gap between cards `--space-stack-item`, actions gap `--space-inline-actions`; action buttons at least 32px square.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/library-card.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add library/card.js library/library.css lib/i18n.js tests/library-card.test.js
git commit -m "feat(library): render a library card with labelled actions"
```

---

### Task 5: Library page, redirects and links

**Files:**
- Create: `library/library.html`, `library/library.js`; extend `library/library.css`
- Replace: `history/history.html`, `favorites/favorites.html` with redirect stubs; delete `history/history.js`, `history/history.css`, `favorites/favorites.js`, `favorites/favorites.css`
- Modify: `scripts/build.mjs` (add `library/library.js` to `MODULE_ENTRIES` and `library/library.html`, `library/library.css` to `STATIC`; drop the history and favorites JS/CSS entries, keep the two HTML stubs in `STATIC`)
- Modify: `popup/popup.js` (the two `chrome.tabs.create` calls near lines 1193 and 2028 and Plan B's Recent-row Library link open `library/library.html` and `library/library.html?tab=favorites`), `sidepanel/sidepanel.html` (same link)
- Modify: `lib/i18n.js` (`libraryTitle`, `libraryTabHistory`, `libraryTabFavorites`, `libraryTabLessons`, `librarySearchLabel`, `librarySearchPlaceholder` = `Search…`, `libraryTypeAll`, `libraryDirectionLabel`, `libraryDirectionAll`, `libraryDeleted`, `libraryUndo`, `libraryEmpty`, `libraryNoMatches`, `libraryPractice`, `libraryCopied`)
- Modify: `tests/theme.test.js` (replace `favorites/favorites.js` in its file list with `library/library.js`)
- Test: `tests/library-page.test.js` (create)

**Interfaces:**
- Consumes: Tasks 1 to 4; `getHistory`, `getPolishHistory`, `getDictionaryHistory`, `removeFromHistory`, `removeFromPolishHistory`, `removeFromDictionaryHistory` (`lib/history.js`); `getFavorites`, `addFavorite`, `removeFavorite`, `isFavorite` (`lib/storage.js`).
- Produces: `library/library.html?tab=&type=&dir=&q=` as the single Library URL (Plan D's Data section and Plan F link here). Side panel prefill contract: `chrome.storage.session` key `panel_prefill = { text: string, at: number }`; Task 7 makes `sidepanel/panel.js` read it on load and on `chrome.storage.session.onChanged`, set `#input-text`, then remove the key.
- Page structure: header (back link to nothing; the page is a tab, so no back control), `<h1>`, a Practice link `../practice/practice.html`; `role="tablist"` with three `role="tab"` buttons (`aria-controls` to one `role="tabpanel"`, arrow keys move between tabs); `<label for="library-search">` plus `<input type="search" id="library-search">`; type chips as `<button aria-pressed>` in a `role="group"` (hidden on the Lessons tab); `<label for="library-direction">` plus `<select id="library-direction">` whose options are All plus the `directionKey`s present; a list of `<section>` per day group with an `<h2>`; a `role="status"` toast with an Undo button.
- Behaviour: search input debounced 200 ms; every state change calls `history.replaceState(null, '', buildLibraryQuery(state) || location.pathname)`; delete hides the card, calls `undoQueue.remove(entry)`, shows "Deleted. Undo" for 5 s; `pagehide` calls `undoQueue.flush()`; Clear all on the active tab keeps its existing localized `confirm()`; favorite toggle calls `addFavorite({ type: entry.kind, originalText, savedText: entry.result, direction })` or `removeFavorite(match.id)` and flips `aria-pressed`; copy writes `navigator.clipboard` and announces `libraryCopied` in the status region; open-in-panel runs `chrome.storage.session.set({ panel_prefill })` and `chrome.sidePanel.open({ windowId })` with no `await` before the open (window id read once at init), keeping the user gesture.

- [ ] **Step 1: Write the failing test**

```js
// tests/library-page.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
describe('library page', () => {
  const html = read('library/library.html');
  const js = read('library/library.js');
  it('labels search and direction and uses real tabs', () => {
    expect(html).toMatch(/<label[^>]+for="library-search"/);
    expect(html).toMatch(/<input[^>]+type="search"[^>]+id="library-search"/);
    expect(html).toMatch(/<label[^>]+for="library-direction"/);
    expect((html.match(/role="tab"/g) || []).length).toBe(3);
    expect(html).toMatch(/role="status"/);
  });
  it('debounces search, keeps state in the URL and flushes deletes on leave', () => {
    expect(js).toMatch(/debounce\([^)]*,\s*200\)/);
    expect(js).toMatch(/history\.replaceState\(/);
    expect(js).toMatch(/addEventListener\('pagehide'/);
    expect(js).not.toMatch(/confirm\(t\('confirmDeleteItem'/);
  });
  it('opens the panel before any await in the handler', () => {
    const body = js.slice(js.indexOf('function openInPanel'));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    expect(fn).toMatch(/chrome\.sidePanel\.open\(/);
    expect(fn.indexOf('chrome.sidePanel.open(')).toBeLessThan(fn.indexOf('await') === -1 ? Infinity : fn.indexOf('await'));
  });
  it('redirects the old pages to the matching tab', () => {
    expect(read('history/history.html')).toMatch(/http-equiv="refresh"[^>]+url=\.\.\/library\/library\.html\?tab=history/);
    expect(read('favorites/favorites.html')).toMatch(/http-equiv="refresh"[^>]+url=\.\.\/library\/library\.html\?tab=favorites/);
    expect(exists('history/history.js')).toBe(false);
    expect(exists('favorites/favorites.js')).toBe(false);
  });
  it('no surface links to the old pages', () => {
    for (const f of ['popup/popup.js', 'popup/popup.html', 'sidepanel/sidepanel.html', 'sidepanel/panel.js', 'settings/settings.js']) {
      expect(read(f), f).not.toMatch(/history\/history\.html|favorites\/favorites\.html/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library-page.test.js`
Expected: FAIL, `library/library.html` missing.

- [ ] **Step 3: Build the page, the stubs, and update the links**

Each stub is a complete HTML document with `<meta http-equiv="refresh" content="0; url=../library/library.html?tab=history">` (or `favorites`) and a visible fallback link, no script (MV3 CSP forbids inline script, and a meta refresh needs none). Layout: content max width 960px, sections separated by `--space-stack-section`, filters row gap `--space-inline-actions`. The page loads `../lib/theme-boot.js` in `<head>` like the other pages.

- [ ] **Step 4: Run tests, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS; `dist/library/` has three files; `dist/history/` and `dist/favorites/` hold only the stub HTML.

- [ ] **Step 5: Walk it in the browser**

Load `dist/` unpacked. Open `history/history.html` by URL: lands on Library, History tab. Type in search: the URL gains `?q=`; reload keeps it. Delete a card, press Undo: it returns; delete another and close the tab at once: reopening shows it gone. Select a Persian card: text is right-aligned per column only.

- [ ] **Step 6: Commit**

```bash
git add library history favorites scripts/build.mjs popup sidepanel lib/i18n.js tests/library-page.test.js tests/theme.test.js
git commit -m "feat(library): merge history and favorites into one library page"
```

---

### Task 6: Reopen a saved lesson without a request

**Files:**
- Create: `grammar/saved-lesson.js`
- Modify: `grammar/grammar.js` (`parseUrlParams` near line 85 reads `saved`; `loadLesson` near line 189 renders from storage when `saved` is set and returns before `chrome.runtime.sendMessage`)
- Modify: `lib/i18n.js` (`savedLessonMissing`: "This saved lesson is no longer in your Library.")
- Test: `tests/saved-lesson.test.js` (create)

**Interfaces:**
- Consumes: `isFavorite(id)` from `lib/storage.js`.
- Produces: `export function lessonFromFavorite(favorite): { lessonTitle, originalText, translation, direction, grammarPoints, relatedPatterns, lang } | null`; `lang` is `favorite.lesson.lang ?? 'en'` (lessons saved before Plan F are English). Plan F stores `lesson.lang` and consumes this function.

- [ ] **Step 1: Write the failing test**

```js
// tests/saved-lesson.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { lessonFromFavorite } from '../grammar/saved-lesson.js';
const fav = { id: 'grammar_abc', type: 'grammar', originalText: 'I have been waiting', savedText: 'من منتظر بوده‌ام', direction: 'en-to-fa',
  lesson: { title: 'Present perfect continuous', points: [{ title: 'x' }], relatedPatterns: ['y'] }, timestamp: 1 };
describe('saved lesson', () => {
  it('rebuilds the lesson the page renders', () => {
    expect(lessonFromFavorite(fav)).toEqual({ lessonTitle: 'Present perfect continuous', originalText: 'I have been waiting',
      translation: 'من منتظر بوده‌ام', direction: 'en-to-fa', grammarPoints: [{ title: 'x' }], relatedPatterns: ['y'], lang: 'en' });
    expect(lessonFromFavorite({ ...fav, type: 'translation' })).toBeNull();
    expect(lessonFromFavorite({ ...fav, lesson: undefined })).toBeNull();
  });
  it('renders a saved lesson before any lesson request', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../grammar/grammar.js'), 'utf8');
    const body = js.slice(js.indexOf('async function loadLesson'));
    expect(body.indexOf('lessonFromFavorite(')).toBeGreaterThan(-1);
    expect(body.indexOf('lessonFromFavorite(')).toBeLessThan(body.indexOf('ACTIONS.GET_GRAMMAR_LESSON'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/saved-lesson.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lessonFromFavorite`, and in `loadLesson` a `savedId` branch that sets `originalText`, `translation`, `direction` and `lessonData` from it, sets `isSaved = true`, renders and returns; a missing favorite shows `t('savedLessonMissing')` with a link back to the Library Lessons tab instead of the retry button.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/saved-lesson.test.js tests/grammar-direction.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add grammar/saved-lesson.js grammar/grammar.js lib/i18n.js tests/saved-lesson.test.js
git commit -m "feat(grammar): reopen a saved lesson from storage without a new request"
```

---

### Task 7: Practice

**Files:**
- Create: `lib/practice.js`, `practice/practice.html`, `practice/practice.css`, `practice/practice.js`
- Modify: `lib/constants.js` (`STORAGE_KEYS.practiceSessionSize = 'practice_session_size'`), `lib/storage.js` (`getPracticeSessionSize`, `setPracticeSessionSize`)
- Modify: `scripts/build.mjs` (practice entries), `sidepanel/sidepanel.html` (a Practice link `<a id="panel-practice-link" href="../practice/practice.html?surface=panel">` beside the Library link in the Recent row), `sidepanel/panel.js` (read `panel_prefill` per Task 5's contract)
- Modify: `lib/i18n.js` (`practiceTitle`, `practiceShowAnswer`, `practiceHideAnswer`, `practicePrev`, `practiceNext`, `practiceProgress` = `Card {n} of {total}`, `practiceEmpty`, `practiceEmptyLink`, `practiceBack`, `practiceCopy`)
- Test: `tests/practice.test.js` (create)

**Interfaces:**
- Consumes: `getFavorites`; `containsPersian` from `lib/language-detect.js`.
- Produces in `lib/practice.js`:
  - `export const PRACTICE_SIZE = Object.freeze({ min: 5, max: 30, default: 10 })` and `export function clampSessionSize(n): number` (integer in range; non-numbers give the default).
  - `export function buildDeck(favorites, { size = PRACTICE_SIZE.default, rng = Math.random } = {}): Array<{ id, kind, front, back, frontLang: 'en'|'fa', backLang: 'en'|'fa' }>`: excludes grammar lessons and entries with an empty side, reads legacy `original`/`saved`, shuffles with Fisher-Yates driven by `rng`, returns at most `size`.
  - Storage: `getPracticeSessionSize(): Promise<number>` (default 10), `setPracticeSessionSize(n): Promise<number>` stores `clampSessionSize(n)`. Task 8's Settings card and Plan D's Flashcards section use these.
- Page: the card is one `<button type="button" class="practice-card" aria-pressed="false">` holding both faces; Prev, Next and Copy are always-visible buttons; `role="status"` announces `practiceProgress` and the revealed answer; ArrowLeft and ArrowRight move cards unless focus is in a form control; Space and Enter flip through the native button. `?surface=panel` sets `body[data-surface="panel"]` and shows a `practiceBack` link to `../sidepanel/sidepanel.html`. Empty deck shows `practiceEmpty` with a link to the Library.

- [ ] **Step 1: Write the failing test**

```js
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
  it('is reachable from the side panel and the Library', () => {
    expect(read('sidepanel/sidepanel.html')).toMatch(/href="\.\.\/practice\/practice\.html\?surface=panel"/);
    expect(read('library/library.html')).toMatch(/href="\.\.\/practice\/practice\.html"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/practice.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the module, storage functions, page and panel link**

The 3D flip lives inside `@media (prefers-reduced-motion: no-preference)`; under `reduce` the back face replaces the front with `transform: none`. Card text size steps by length (port `heroSizeStep` from `newtab/hero-scale.js` into `practice/practice.js` before Task 8 deletes it). Front and back faces carry `dir` and `lang` from the card.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run tests/practice.test.js && npm run build`
Expected: PASS

- [ ] **Step 5: Check in the panel**

Load `dist/`, open the side panel, click Practice: the deck shows inside the panel at 320px wide; Space flips; Back returns to the panel. From Library, Open in side panel fills the panel textarea.

- [ ] **Step 6: Commit**

```bash
git add lib/practice.js lib/constants.js lib/storage.js practice scripts/build.mjs sidepanel lib/i18n.js tests/practice.test.js
git commit -m "feat(practice): add flashcard practice from favorites, in the panel and the Library"
```

---

### Task 8: Remove New Tab

**Files:**
- Modify: `manifest.json` (delete `chrome_url_overrides`, `optional_permissions`, and `"bookmarks"`, `"favicon"` from `permissions`)
- Delete: `newtab/` (all five files), `lib/top-sites.js`, `tests/top-sites.test.js`, `tests/newtab-css.test.js`, `tests/newtab-glance.test.js`, `tests/newtab-hero-scale.test.js`
- Modify: `lib/storage.js` (delete `getRandomFavorites`, `getNewTabEnabled`, `setNewTabEnabled`, `getNewTabPhraseCount`, `setNewTabPhraseCount`, `NEWTAB_PANELS`, `getNewTabPanels`, `setNewTabPanels`), `lib/constants.js` (delete `newTabEnabled`, `newTabPhraseCount`, `newTabPanels` keys), `tests/storage-settings.test.js` (delete the New Tab panel cases), `tests/theme.test.js` (drop `newtab/newtab.js`)
- Modify: `scripts/build.mjs` (drop newtab entries)
- Modify: `background/service-worker.js` `onInstalled` (on `details.reason === 'update'`, `chrome.storage.local.remove(['newtab_enabled', 'newtab_phrase_count', 'newtab_panels'])`)
- Modify: `settings/settings.html` and `settings/settings.js` (replace the New Tab card with a Flashcards card: one `<input type="range" id="practice-size-slider" min="5" max="30">` with a `<label for>` and an `<output>` value, wired to `get/setPracticeSessionSize`, plus an "Open Practice" link; retitle the "Flashcards (New Tab)" shortcut group to `practiceShortcuts` = "Practice"; remove `newtab-toggle`, `phrase-count-*` and their handlers)
- Modify: `welcome/welcome.html` (the New Tab Flashcards feature card becomes "Library and practice" with `featureLibrary` and `featureLibraryDesc`)
- Modify: `lib/i18n.js` (remove keys used only by New Tab; add `practiceShortcuts`, `practiceSessionSize`, `openPractice`, `featureLibrary`, `featureLibraryDesc`)
- Test: `tests/newtab-removed.test.js` (create), `tests/service-worker.test.js` (extend)

**Interfaces:**
- Consumes: `getPracticeSessionSize`, `setPracticeSessionSize` (Task 7).
- Produces: `settings/settings.html` card `data-settings-tab="general"` titled `practiceTitle` containing `#practice-size-slider`. Plan D moves it into the Flashcards section unchanged.

- [ ] **Step 1: Write the failing tests**

```js
// tests/newtab-removed.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import * as storage from '../lib/storage.js';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
describe('New Tab is gone', () => {
  it('no override and no permission that only served it', () => {
    expect(manifest.chrome_url_overrides).toBeUndefined();
    expect(manifest.permissions).not.toContain('bookmarks');
    expect(manifest.permissions).not.toContain('favicon');
    expect(manifest.optional_permissions ?? []).not.toContain('topSites');
  });
  it('no code left behind', () => {
    expect(fs.existsSync(path.join(root, 'newtab'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'lib/top-sites.js'))).toBe(false);
    expect(read('scripts/build.mjs')).not.toMatch(/newtab\//);
    expect(storage.getNewTabEnabled).toBeUndefined();
    expect(storage.getNewTabPanels).toBeUndefined();
  });
  it('Settings offers the practice size instead', () => {
    const html = read('settings/settings.html');
    expect(html).not.toMatch(/id="newtab-toggle"/);
    expect(html).toMatch(/<label[^>]+for="practice-size-slider"/);
    expect(read('welcome/welcome.html')).not.toMatch(/featureNewTab/);
  });
});
```

In `tests/service-worker.test.js` (add a `remove` to the storage stub if it lacks one: `remove: async (keys) => { for (const k of [].concat(keys)) store.delete(k); }`):

```js
it('drops the New Tab keys on update', async () => {
  store.set('newtab_enabled', true); store.set('newtab_panels', {}); store.set('favorites', [{ id: 'keep' }]);
  await listeners.onInstalled({ reason: 'update' });
  expect(store.has('newtab_enabled')).toBe(false);
  expect(store.has('newtab_panels')).toBe(false);
  expect(store.get('favorites')).toEqual([{ id: 'keep' }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/newtab-removed.test.js tests/service-worker.test.js`
Expected: FAIL on every case.

- [ ] **Step 3: Remove and replace per Files**

Before deleting i18n keys, `grep -rn "<key>"` across the repo (excluding `dist/`) to confirm each is unused.

- [ ] **Step 4: Run the whole suite, lint and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS; `dist/newtab/` absent.

- [ ] **Step 5: Check Chrome's own New Tab comes back**

Load `dist/` unpacked over a profile that had the old build: a new tab shows Chrome's page; Settings shows the Flashcards card; favorites are intact in Library and Practice.

- [ ] **Step 6: Commit**

```bash
git add -A manifest.json newtab lib tests scripts/build.mjs background/service-worker.js settings welcome
git commit -m "feat(newtab): remove the New Tab override and the permissions that served it"
```

(`git add -A` on the listed paths stages the deletions; check `git status` shows nothing under `landing/`.)

---

### Task 9: Release 3.4.0

**Files:**
- Modify: `store-assets/DESCRIPTION.txt` (remove the Bookmarks and Most visited lines near 69-70 and New Tab copy; add Library and Practice), `store-assets/STORE_LISTING.md` (same; drop "New tab flashcards" lines near 94, 125, 177), `store-assets/PERMISSION-JUSTIFICATIONS.txt` (remove the `favicon`, `topSites` and `bookmarks` sections), `_locales/en/messages.json` `extensionDescription` (132 characters max; keep "flashcards" since Practice still has them, or rephrase to "practice"), `PRIVACY.md` (remove the Bookmarks bullet), `README.md` (New Tab sections become Library and Practice; tree entry `newtab/` becomes `library/` and `practice/`), `description.txt` (the "New Tab, Redesigned" block becomes Library and Practice)
- Modify: `CHANGELOG.md`, `manifest.json`, `package.json`, `package-lock.json`

- [ ] **Step 1: Store and docs copy**

Update the files above in their existing plain-prose style. `CHANGELOG.md` under `## [Unreleased]`: `### Added` (Library with tabs, search, filters, Undo; Dictionary history visible; Open lesson; Practice in the side panel), `### Changed` (History and Favorites merged; old links redirect), `### Removed` (New Tab page and the bookmarks, favicon and topSites permissions: what the user saw, that Chrome's own New Tab returns, that favorites are kept).

- [ ] **Step 2: Landing page**

`landing/index.html` and `landing/privacy.html` mention the New Tab and bookmarks. Update them on disk, then `cd landing && npm run build:css && npx vercel deploy --yes`, check the preview, `npx vercel promote <preview-url> --scope personal-46ddfab5 --yes`. Never stage `landing/`.

- [ ] **Step 3: Commit the docs**

```bash
git add CHANGELOG.md README.md PRIVACY.md description.txt _locales/en/messages.json
git add -f store-assets/DESCRIPTION.txt store-assets/STORE_LISTING.md store-assets/PERMISSION-JUSTIFICATIONS.txt
git commit -m "docs(release): describe the Library, Practice and the removed New Tab"
```

- [ ] **Step 4: Version bump**

Set `3.4.0` in `manifest.json`, `package.json`, both top-level `version` fields in `package-lock.json`; rename `## [Unreleased]` to `## [3.4.0] - <today>` and open an empty `## [Unreleased]` above it.

```bash
git add manifest.json package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): bump version to 3.4.0"
```

- [ ] **Step 5: Verify and package**

Run: `npm test && npm run lint && npm run build && (cd dist && zip -r ../store-assets/parsipad-v3.4.0.zip .)`
Expected: all pass; `unzip -l store-assets/parsipad-v3.4.0.zip | head` shows `manifest.json` at the root, no `dist/` prefix, no `newtab/`.

- [ ] **Step 6: Merge and push**

```bash
git checkout main
git merge --no-ff feat/library-practice -m "Merge feat/library-practice: ParsiPad 3.4.0"
git push origin main
```

Report which release chores were done, and say explicitly if any was skipped.
