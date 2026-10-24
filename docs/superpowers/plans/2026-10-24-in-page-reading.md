# In-page Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the in-page flows (selection toolbar, page translate, floating, polish and dictionary boxes) safe, keyboard and screen-reader complete, and honest about cost and failure. Ships as 3.6.0.

**Architecture:** `content/main.js` stays the controller; every new rule lands in a small pure module next to it (toolbar trigger, page run bookkeeping, page confirmation, reload state) or in `lib/` when a page also needs it (roving tabindex, cost estimate). Each module the content script imports is listed in `web_accessible_resources`, which `tests/web-accessible-resources.test.js` enforces. Tests are unit tests of those modules plus source-text checks of `content/main.js`, which has no DOM harness.

**Tech Stack:** Manifest V3 content script (classic loader `content/content.js` importing `content/main.js` as a module), closed shadow roots, vitest (node), happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-24-redesign-phases-c-to-f.md` (Phase E, decisions 2, 4 to 6). Audit: `.superpowers/sdd/2026-10-23-side-panel-and-popup/ui-audit-report.md` sections A 10-11, E.

## Global Constraints

- Branch `feat/in-page-reading` off `main` after Plan D (3.5.0) is merged. Consumes Plan D's `lib/muted-sites.js` (`normalizeHost`, `isHostMuted`, `addMutedSite`, `removeMutedSite`), the `siteMuted` flag in `content/main.js`, the `confirm_page_translate` key (default `true`), and the Settings `#shortcuts` section; Plan B's `content/selection-report.js`.
- Commit per task, conventional prefix with scope (`feat(content): ...`), no attribution trailer.
- No em dashes or emoji in code or copy. Every user-visible string the tasks touch goes through `t(key, userLang)` with `en` and `fa`; "..." loading strings become `…`.
- The Persian-interface RTL rework is held. In-page UI is not mirrored; Persian content runs get `dir="rtl" lang="fa"`, English error text inside a Persian box gets its own `dir`.
- No request to a provider except on an explicit action. A whole-page translation never starts without the confirmation while `confirm_page_translate` is not `false`.
- The selection toolbar never appears for a selection inside `input`, `textarea`, `select` or an editable region, and never steals focus.
- Spacing in new shadow-DOM CSS: the shared card cannot read page tokens, so it uses the literal equivalents (20, 24, 16, 12, 8 px) of `--space-inset-card`, `--space-stack-section`, `--space-stack-group`, `--space-stack-item`, `--space-inline-actions`, as `shared/card/styles.js` already does. Every keyframe and hover transform runs only under `prefers-reduced-motion: no-preference`.
- `npm test`, `npm run lint`, `npm run build` pass after every task. `landing/` is never staged.

## Review Focus

1. Text selected inside a rich editor (Gmail compose, Google Docs, a GitHub comment box): no toolbar, no focus change. Pinned in Task 1 (`isEditableSelection` with a contenteditable ancestor of the anchor node).
2. Long-press selection on a touch screen, then dragging the handles: the toolbar appears once the selection settles and follows the final range. Pinned in Task 1 (selectionchange path with no pointer events).
3. Page translate where some batches fail (rate limit mid-run): the successful sections stay translated, the summary counts both, Retry failed sends only the failed batches. Pinned in Task 5.
4. Escape during a page translation on a page whose own script also listens for Escape: translation stops and keeps what was done; the page's handler still runs. Pinned in Task 5 (no `stopPropagation`).
5. An SPA route change while a page is shown translated: the nodes that are still in the document show their originals; nothing throws for detached nodes. Pinned in Task 5.

---

### Task 1: Toolbar trigger: never in editable fields, works on touch

**Files:**
- Modify: `content/selection-report.js` (add `isEditableSelection`; `selectionToReport` uses it)
- Create: `content/toolbar-trigger.js`
- Modify: `content/main.js` (`init` near line 92: replace the `mouseup` listener with `pointerdown`, `pointerup` and `selectionchange` listeners wired to one trigger; `handleTextSelection` near line 2943 becomes `evaluateSelection()` called by the trigger; keep the `siteMuted` and `selectionPopupEnabled` checks first)
- Modify: `manifest.json` `web_accessible_resources` (add `content/toolbar-trigger.js`)
- Test: `tests/toolbar-trigger.test.js` (create), `tests/selection-report.test.js` (extend)

**Interfaces:**
- Produces in `content/selection-report.js`: `export function isEditableSelection(selection: Selection | null, activeElement: Element | null): boolean`, true when `activeElement` is an `INPUT`, `TEXTAREA` or `SELECT` or `isContentEditable`, or when the selection's `anchorNode` (or its parent element for a text node) has `closest('[contenteditable]:not([contenteditable="false"])')`.
- Produces in `content/toolbar-trigger.js`: `export function createToolbarTrigger({ evaluate: () => void, hide: () => void, delay = 250 }): { onPointerDown(): void, onPointerUp(): void, onSelectionChange(): void }`. `onPointerDown` hides and suppresses selectionchange until `onPointerUp`; `onPointerUp` schedules `evaluate` after `delay`; `onSelectionChange` outside a pointer gesture reschedules `evaluate` after `delay` (keyboard selection, touch handles). Only one pending timer at a time.

- [ ] **Step 1: Write the failing tests**

```js
// tests/toolbar-trigger.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createToolbarTrigger } from '../content/toolbar-trigger.js';
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
describe('toolbar trigger', () => {
  it('waits for the pointer to lift, then evaluates once', () => {
    const evaluate = vi.fn(), hide = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide, delay: 250 });
    t.onPointerDown(); expect(hide).toHaveBeenCalled();
    t.onSelectionChange(); t.onSelectionChange(); vi.advanceTimersByTime(1000);
    expect(evaluate).not.toHaveBeenCalled();
    t.onPointerUp(); vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('evaluates after selectionchange settles with no pointer (touch handles, keyboard)', () => {
    const evaluate = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide: () => {}, delay: 250 });
    t.onSelectionChange(); vi.advanceTimersByTime(200);
    t.onSelectionChange(); vi.advanceTimersByTime(249);
    expect(evaluate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
```

Add to `tests/selection-report.test.js`:

```js
import { isEditableSelection } from '../content/selection-report.js';
it('treats a selection inside a contenteditable ancestor as editable', () => {
  const editor = { closest: (s) => (s.startsWith('[contenteditable]') ? editor : null) };
  const text = { nodeType: 3, parentElement: editor };
  expect(isEditableSelection({ anchorNode: text }, { tagName: 'BODY' })).toBe(true);
  expect(isEditableSelection({ anchorNode: { nodeType: 3, parentElement: { closest: () => null } } }, { tagName: 'BODY' })).toBe(false);
  expect(isEditableSelection(null, { tagName: 'SELECT' })).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/toolbar-trigger.test.js tests/selection-report.test.js`
Expected: FAIL, module not found and `isEditableSelection` not exported.

- [ ] **Step 3: Implement** per Interfaces. `evaluateSelection()` reads `window.getSelection()`, returns (hiding the toolbar) when `isEditableSelection(selection, document.activeElement)`, when the text is under 2 characters, or when the selection lies inside ParsiPad's own hosts; otherwise shows the toolbar for the current range.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/toolbar-trigger.test.js tests/selection-report.test.js tests/web-accessible-resources.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add content/selection-report.js content/toolbar-trigger.js content/main.js manifest.json tests/toolbar-trigger.test.js tests/selection-report.test.js
git commit -m "feat(content): keep the selection toolbar out of text fields and show it on touch"
```

---

### Task 2: Toolbar placement from its measured size, roving tabindex, keyboard path

**Files:**
- Modify: `content/placement.js` (`computeBoxPosition` gains `prefer = 'below'` and `align = 'start'`; `align: 'center'` centers the box on the selection's horizontal middle before clamping)
- Create: `lib/roving.js`
- Modify: `content/main.js` (`getSelectionPopupPosition` near line 2977 is deleted; `createSelectionPopup` appends the host with `visibility: hidden`, measures the toolbar, then positions it with `computeBoxPosition({ ..., prefer: 'above', align: 'center', gap: 8, padding: 12 })`; buttons get `tabindex` from `applyRovingTabindex` and a `keydown` handler using `rovingIndex`; `handleKeyDown`: Tab with no modifiers, while the toolbar is visible and the target is not editable, focuses the toolbar's active button and prevents default; Escape inside the toolbar removes it; button labels and tooltips through `t()` with keys `toolbarTranslate`, `toolbarPolish`, `toolbarDictionary`, `toolbarDictionarySingleWord`, `toolbarLabel`)
- Modify: `manifest.json` `web_accessible_resources` (add `lib/roving.js`)
- Modify: `lib/i18n.js` (the toolbar keys)
- Test: `tests/roving.test.js` (create), `tests/placement.test.js` (extend), `tests/toolbar-placement.test.js` (create)

**Interfaces:**
- Produces in `lib/roving.js` (Plan F's quiz radiogroup consumes it): `export function rovingIndex(current: number, key: string, count: number): number | null` (`ArrowRight`/`ArrowDown` next with wrap, `ArrowLeft`/`ArrowUp` previous with wrap, `Home` 0, `End` count - 1, anything else `null`) and `export function applyRovingTabindex(items: HTMLElement[], activeIndex: number): void` (active `tabindex="0"`, others `-1`).

- [ ] **Step 1: Write the failing tests**

```js
// tests/roving.test.js
import { describe, it, expect } from 'vitest';
import { rovingIndex, applyRovingTabindex } from '../lib/roving.js';
describe('roving', () => {
  it('moves with wrap and jumps to the ends', () => {
    expect(rovingIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(rovingIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(rovingIndex(0, 'ArrowLeft', 3)).toBe(2);
    expect(rovingIndex(1, 'Home', 3)).toBe(0);
    expect(rovingIndex(1, 'End', 3)).toBe(2);
    expect(rovingIndex(1, 'a', 3)).toBeNull();
  });
  it('leaves one tab stop', () => {
    const items = [0, 1, 2].map(() => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
    applyRovingTabindex(items, 1);
    expect(items.map(i => i.attrs.tabindex)).toEqual(['-1', '0', '-1']);
  });
});
```

Add to `tests/placement.test.js`:

```js
it('prefers above and centers when asked, using the real size', () => {
  const r = computeBoxPosition({ selection: { top: 300, bottom: 320, left: 400, right: 500 }, box: { width: 150, height: 40 },
    viewport: { width: 1000, height: 800 }, scroll: { x: 0, y: 0 }, gap: 8, padding: 12, prefer: 'above', align: 'center' });
  expect(r).toEqual({ top: 252, left: 375, placement: 'above' });
});
```

```js
// tests/toolbar-placement.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
describe('selection toolbar', () => {
  it('is placed from its measured size, not constants', () => {
    expect(js).not.toMatch(/POPUP_WIDTH = 120/);
    const body = js.slice(js.indexOf('function createSelectionPopup'));
    expect(body).toMatch(/getBoundingClientRect\(\)/);
    expect(body).toMatch(/computeBoxPosition\(\{[\s\S]*prefer: 'above'/);
  });
  it('has one tab stop and arrow keys, with localized labels', () => {
    const body = js.slice(js.indexOf('function createSelectionPopup'));
    expect(body).toMatch(/applyRovingTabindex\(/);
    expect(body).toMatch(/rovingIndex\(/);
    expect(body).not.toMatch(/ariaLabel: '[A-Z]/);
  });
});
```

The placement case needs `selection.right` for centering: center x = (400 + 500) / 2 = 450, left = 450 - 75 = 375; above: 300 - 40 - 8 = 252. Existing callers pass no `right`; `align: 'center'` falls back to `left` when `right` is absent.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/roving.test.js tests/placement.test.js tests/toolbar-placement.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** per Files and Interfaces. Prefer above means: place above when it fits above, else below; the existing "below" rules stay the default.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/roving.test.js tests/placement.test.js tests/toolbar-placement.test.js tests/web-accessible-resources.test.js`
Expected: PASS

- [ ] **Step 5: Keyboard walk**

Load `dist/`, enable the toolbar, select a word with Shift+Arrow keys. Expected: toolbar appears without taking focus; Tab moves into it; arrows move between buttons; Enter runs the action; Escape closes it.

- [ ] **Step 6: Commit**

```bash
git add content/placement.js lib/roving.js content/main.js manifest.json lib/i18n.js tests/roving.test.js tests/placement.test.js tests/toolbar-placement.test.js
git commit -m "feat(content): measure the selection toolbar and make it keyboard reachable"
```

---

### Task 3: "Mute on this site" from the toolbar

**Files:**
- Modify: `content/main.js` (`createSelectionPopup` adds a fourth button `data-action="mute"` with `t('toolbarMute')` = "Mute ParsiPad on this site"; its handler calls `addMutedSite(location.hostname)`, removes the toolbar, sets `siteMuted = true`, and shows a toast `t('mutedOnSite')` = "ParsiPad is muted on {host}." with an Undo action calling `removeMutedSite(host)`; `showToast` near line 1063 gains `action?: { label: string, onClick: () => void }` and a `role="status"`)
- Modify: `manifest.json` `web_accessible_resources` (add `lib/muted-sites.js` if Plan D listed it only for block translate's import path; the WAR test decides)
- Modify: `lib/i18n.js` (`toolbarMute`, `mutedOnSite`, `undo`)
- Test: `tests/toolbar-mute.test.js` (create)

**Interfaces:**
- Consumes: `addMutedSite`, `removeMutedSite`, `normalizeHost` (Plan D). Settings re-renders its list from `chrome.storage.onChanged` (Plan D Task 5), and block translate turns itself off through the same key.
- Produces: `showToast({ message, withSettings = true, action })`, used again in Task 5 for the partial-failure summary.

- [ ] **Step 1: Write the failing test**

```js
// tests/toolbar-mute.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
const fn = (name) => { const s = js.slice(js.search(new RegExp(`\\n(async )?function ${name}\\(`)) + 1); const n = s.search(/\n(async )?function [A-Za-z]+\(/); return n === -1 ? s : s.slice(0, n); };
describe('mute from the toolbar', () => {
  it('offers the action and writes the shared list', () => {
    const body = fn('createSelectionPopup');
    expect(body).toMatch(/action: 'mute'/);
    expect(js).toMatch(/addMutedSite\(location\.hostname\)/);
    expect(js).toMatch(/removeMutedSite\(/);
  });
  it('the toast can carry an action and is announced', () => {
    const body = fn('showToast');
    expect(body).toMatch(/action/);
    expect(body).toMatch(/role', 'status'|role="status"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/toolbar-mute.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** per Files. The toast shows the host inside `<bdi dir="ltr">`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/toolbar-mute.test.js tests/muted-sites.test.js tests/web-accessible-resources.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add content/main.js manifest.json lib/i18n.js tests/toolbar-mute.test.js
git commit -m "feat(content): mute ParsiPad on a site from the selection toolbar"
```

---

### Task 4: Confirm a whole-page translation with count and cost

**Files:**
- Create: `lib/cost-estimate.js`, `content/page-confirm.js`
- Modify: `content/main.js` `handleTranslatePage` near line 2118 (after extracting text nodes and batching, and before the first request: when `confirm_page_translate` is not `false`, `await confirmPageTranslation(...)`; on `cancel` reset state and return with no request)
- Modify: `content/styles/index.js` (dialog styles: inset 20px, actions gap 8px)
- Modify: `manifest.json` `web_accessible_resources` (add `lib/cost-estimate.js`, `lib/constants.js`, `content/page-confirm.js`)
- Modify: `lib/i18n.js` (`pageConfirmTitle` = "Translate this page?", `pageConfirmBody` = "{count} paragraphs. About {cost} with {provider}.", `pageConfirmGo` = "Translate page", `pageConfirmCancel` = "Cancel", `pageConfirmDontAsk` = "Don't ask again")
- Test: `tests/cost-estimate.test.js`, `tests/page-confirm.test.js` (create)

**Interfaces:**
- Produces in `lib/cost-estimate.js`: `export const PROMPT_OVERHEAD_TOKENS = 350`, `export function estimateTranslationCost({ chars: number, batches: number, provider: string, targetLang: 'fa'|'en' }): { inputTokens: number, outputTokens: number, usd: number }` with `inputTokens = ceil(chars / 4) + PROMPT_OVERHEAD_TOKENS * batches`, `outputTokens = ceil(chars / 4 * (targetLang === 'fa' ? 1.6 : 1))`, `usd` from `PROVIDER_PRICING`.
- Produces in `content/page-confirm.js`: `export function confirmPageTranslation(root: ShadowRoot | HTMLElement, { count: number, costText: string, providerName: string, lang: string }): Promise<{ go: boolean, dontAsk: boolean }>` rendering `role="dialog" aria-modal="true" aria-labelledby` with Translate (focused on open), Cancel, and a "Don't ask again" checkbox; Escape resolves `{ go: false }`; `dontAsk` with `go` writes `confirm_page_translate: false`.
- Cost text: `formatCurrency` from `lib/format.js` (Plan C) is not imported into the content script; the dialog uses `usd < 0.01 ? '<$0.01' : '$' + usd.toFixed(2)` with Latin digits, matching the held RTL decision.

- [ ] **Step 1: Write the failing tests**

```js
// tests/cost-estimate.test.js
import { describe, it, expect } from 'vitest';
import { estimateTranslationCost } from '../lib/cost-estimate.js';
describe('estimateTranslationCost', () => {
  it('counts input with prompt overhead and heavier Persian output', () => {
    const r = estimateTranslationCost({ chars: 4000, batches: 2, provider: 'claude', targetLang: 'fa' });
    expect(r.inputTokens).toBe(1700);
    expect(r.outputTokens).toBe(1600);
    expect(r.usd).toBeCloseTo(0.00097, 8);
  });
  it('is zero for an unknown provider rather than throwing', () => {
    expect(estimateTranslationCost({ chars: 100, batches: 1, provider: 'x', targetLang: 'en' }).usd).toBe(0);
  });
});
```

```js
// tests/page-confirm.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs'; import path from 'path';
let confirmPageTranslation, document;
beforeAll(async () => {
  const { Window } = await import('happy-dom');
  const w = new Window(); document = w.document; globalThis.document = document; globalThis.KeyboardEvent = w.KeyboardEvent;
  globalThis.chrome = { storage: { local: { set: async () => {} } } };
  ({ confirmPageTranslation } = await import('../content/page-confirm.js'));
});
describe('page confirmation', () => {
  it('names the count, cost and provider and focuses Translate', async () => {
    const root = document.createElement('div'); document.body.append(root);
    const p = confirmPageTranslation(root, { count: 42, costText: '<$0.01', providerName: 'Claude', lang: 'en' });
    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toMatch(/42/); expect(dialog.textContent).toMatch(/Claude/);
    expect(document.activeElement.textContent).toBe('Translate page');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toEqual({ go: false, dontAsk: false });
  });
  it('asks before the first batch request', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
    const body = js.slice(js.indexOf('async function handleTranslatePage'));
    expect(body.indexOf('confirmPageTranslation(')).toBeGreaterThan(-1);
    expect(body.indexOf('confirmPageTranslation(')).toBeLessThan(body.indexOf('requestTranslation('));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cost-estimate.test.js tests/page-confirm.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** per Interfaces. The dialog mounts in the progress overlay's shadow root, which is created before extraction; the progress UI shows only after confirmation. The provider name comes from `PROVIDER_CONFIGS[selectedProvider].name`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cost-estimate.test.js tests/page-confirm.test.js tests/web-accessible-resources.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cost-estimate.js content/page-confirm.js content/main.js content/styles/index.js manifest.json lib/i18n.js tests/cost-estimate.test.js tests/page-confirm.test.js
git commit -m "feat(content): confirm a whole-page translation with paragraph count and cost"
```

---

### Task 5: Partial failures, Retry failed, Cancel and Escape keep work, SPA restore

**Files:**
- Create: `content/utils/page-run.js`
- Modify: `content/main.js` (`handleTranslatePage`: record each batch as ok or failed instead of `continue`, keep `batches` on `pageTranslationState`; after the loop, or on cancel, apply what succeeded, show the toggle, and show a summary toast; add `retryFailedBatches()`; `handleKeyDown` Escape cancels a running translation first, without `stopPropagation`; `installSpaNavigationListener`'s `handleNav` calls `restorePageOriginals()` when `pageTranslationState?.isShowingTranslated` before resetting; `restorePageOriginals` skips nodes where `!node.isConnected`; progress text `t('pageTranslateProgress')` = "Translating section {n} of {total}")
- Modify: `lib/i18n.js` (`pageTranslateProgress`, `pageTranslatePartial` = "Translated {done} of {total} sections. {failed} failed.", `pageTranslateStopped` = "Stopped. {done} of {total} sections translated.", `pageTranslateRetryFailed` = "Retry failed", `pageTranslateDone`)
- Modify: `manifest.json` `web_accessible_resources` (`content/utils/*.js` already covers the new file; confirm)
- Test: `tests/page-run.test.js` (create)

**Interfaces:**
- Produces in `content/utils/page-run.js`: `export function createPageRun(total: number): { total, status: Array<'pending'|'ok'|'failed'> }`, `export function markBatch(run, index, outcome: 'ok'|'failed'): void`, `export function failedIndexes(run): number[]`, `export function summarizeRun(run): { done: number, failed: number, pending: number, total: number }`, `export function summaryMessageKey(summary, cancelled: boolean): 'pageTranslateDone'|'pageTranslatePartial'|'pageTranslateStopped'`.

- [ ] **Step 1: Write the failing test**

```js
// tests/page-run.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { createPageRun, markBatch, failedIndexes, summarizeRun, summaryMessageKey } from '../content/utils/page-run.js';
const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
const fn = (name) => { const s = js.slice(js.search(new RegExp(`\\n(async )?function ${name}\\(`)) + 1); const n = s.search(/\n(async )?function [A-Za-z]+\(/); return n === -1 ? s : s.slice(0, n); };
describe('page run', () => {
  it('tracks outcomes and picks the summary', () => {
    const run = createPageRun(4);
    markBatch(run, 0, 'ok'); markBatch(run, 1, 'failed'); markBatch(run, 2, 'ok');
    expect(failedIndexes(run)).toEqual([1]);
    expect(summarizeRun(run)).toEqual({ done: 2, failed: 1, pending: 1, total: 4 });
    expect(summaryMessageKey(summarizeRun(run), true)).toBe('pageTranslateStopped');
    markBatch(run, 3, 'ok');
    expect(summaryMessageKey(summarizeRun(run), false)).toBe('pageTranslatePartial');
    markBatch(run, 1, 'ok');
    expect(summaryMessageKey(summarizeRun(run), false)).toBe('pageTranslateDone');
  });
  it('keeps work on cancel and retries only failures', () => {
    expect(fn('handleTranslatePage')).toMatch(/markBatch\(/);
    expect(fn('handleTranslatePage')).not.toMatch(/console\.error\('Batch translation error:'[^\n]*\n\s*continue;/);
    expect(fn('retryFailedBatches')).toMatch(/failedIndexes\(/);
  });
  it('Escape cancels a running translation and SPA navigation restores originals', () => {
    expect(fn('handleKeyDown')).toMatch(/pageTranslationState\?\.isTranslating/);
    expect(fn('handleKeyDown')).not.toMatch(/stopPropagation/);
    const nav = fn('installSpaNavigationListener');
    expect(nav.indexOf('restorePageOriginals()')).toBeGreaterThan(-1);
    expect(nav.indexOf('restorePageOriginals()')).toBeLessThan(nav.indexOf('pageTranslationState = null'));
    expect(fn('restorePageOriginals')).toMatch(/isConnected/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/page-run.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** per Files. A missing-key response still stops the run with the existing toast. The summary toast uses Task 3's `action` for Retry failed when `failed > 0`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/page-run.test.js tests/batch-round-trip.test.js`
Expected: PASS

- [ ] **Step 5: Check in the browser**

Load `dist/` with the API mocked to fail every third request (or a real key and a long page under a rate limit). Expected: summary toast with the counts; Retry failed fills the gaps; pressing Escape mid-run leaves the done sections translated.

- [ ] **Step 6: Commit**

```bash
git add content/utils/page-run.js content/main.js lib/i18n.js tests/page-run.test.js
git commit -m "feat(content): report partial page translations and retry only what failed"
```

---

### Task 6: "Reload the page" state for every box, and the review line fix

**Files:**
- Create: `content/reload-state.js`
- Modify: `content/main.js` (`showError` near line 1025, `showPolishError` near 1730, `showDictionaryError` near 2108: when `isContextInvalidated(errorOrResponse)` or the response's `errorCode === 'CONTEXT_INVALIDATED'`, render `renderReloadState(content, userLang)` and return; raw `error.message` fallbacks become `t(errorI18nKey(toTranslationError(error).code), userLang)`; the "Open Settings" button through `t('openSettings')`)
- Modify: `content/main.js` (`createFloatingBox` markup gains `<div class="parsipad-review-slot"></div>` after `.parsipad-content`, outside the live region; `maybeShowReviewLine(box)` appends there, and after its `await` returns without showing when the content region holds `.parsipad-loading` or the card it was called for is no longer `currentCardEl`)
- Modify: `manifest.json` `web_accessible_resources` (add `content/reload-state.js`)
- Modify: `lib/i18n.js` (`reloadPage` = "Reload page")
- Test: `tests/reload-state.test.js` (create), `tests/content-review-line.test.js` (extend)

**Interfaces:**
- Consumes: `isContextInvalidated`, `toTranslationError`, `errorI18nKey` from `lib/translation/errors.js`; `errorContextInvalidated` copy (exists).
- Produces in `content/reload-state.js`: `export function renderReloadState(container: HTMLElement, lang: string, { reload = () => location.reload() } = {}): void` replacing the container's children with a `role="alert"` message and a `<button type="button">` that calls `reload`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/reload-state.test.js
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs'; import path from 'path';
let renderReloadState;
beforeAll(async () => {
  const { Window } = await import('happy-dom'); globalThis.document = new Window().document;
  ({ renderReloadState } = await import('../content/reload-state.js'));
});
describe('reload state', () => {
  it('explains and offers the one fix', () => {
    const c = document.createElement('div'); const reload = vi.fn();
    renderReloadState(c, 'en', { reload });
    expect(c.querySelector('[role="alert"]').textContent).toMatch(/Reload the page/);
    c.querySelector('button').click();
    expect(reload).toHaveBeenCalled();
  });
  it('every box uses it', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
    for (const name of ['showError', 'showPolishError', 'showDictionaryError']) {
      const s = js.slice(js.indexOf(`function ${name}(`));
      expect(s.slice(0, s.indexOf('\n}\n')), name).toMatch(/renderReloadState\(/);
    }
  });
});
```

Add to `tests/content-review-line.test.js`:

```js
it('sits outside the live region and is not claimed under a skeleton', () => {
  expect(js).toMatch(/class="parsipad-content"[^>]*aria-live="polite"[\s\S]*?<\/div>\s*<div class="parsipad-review-slot">/);
  const body = functionBody('maybeShowReviewLine');
  expect(body).toMatch(/parsipad-review-slot/);
  expect(body).toMatch(/\.parsipad-loading/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reload-state.test.js tests/content-review-line.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** per Files. Adjust the existing review-line assertions in `tests/content-review-line.test.js` that expect `maybeShowReviewLine(content)` to the new argument.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reload-state.test.js tests/content-review-line.test.js tests/web-accessible-resources.test.js`
Expected: PASS

- [ ] **Step 5: Check in the browser**

Load `dist/`, open a page, reload the extension at `chrome://extensions`, then translate, polish and look up a word on the old page. Expected: each box says ParsiPad was updated with a Reload page button that works.

- [ ] **Step 6: Commit**

```bash
git add content/reload-state.js content/main.js manifest.json lib/i18n.js tests/reload-state.test.js tests/content-review-line.test.js
git commit -m "fix(content): show the reload state in every box and keep the review line visible"
```

---

### Task 7: Live regions, decorative SVGs, reduced motion, Alt+B in the shortcuts UI

**Files:**
- Modify: `content/main.js` (`.parsipad-polish-content` in `createPolishBox` and `.parsipad-dictionary-content` in `createDictionaryBox` get `aria-live="polite"`; progress bar gets `role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow aria-valuetext` updated in `updatePageProgress`; the page toggle button gets `aria-pressed` and a label that names the state; every `<svg` in template strings and every `createElementNS(..., 'svg')` without a label gets `aria-hidden="true"`; the progress title and Cancel through `t()`; the logo `<img>` in the progress overlay gets `alt=""`)
- Modify: `content/styles/index.js` (each `animation:` and hover `transform` moves inside `@media (prefers-reduced-motion: no-preference)`; `transition: width` on the progress bar becomes `transform: scaleX()` inside the same guard)
- Modify: `settings/settings.html` `#shortcuts` (an "On web pages" group listing `Alt+B` translate the paragraph under the pointer and `Esc` close or stop, with a note that these are fixed keys, not in `chrome://extensions/shortcuts`), `lib/i18n.js` (`pageShortcuts`, `shortcutBlockTranslate`, `shortcutEscape`, `shortcutsFixedNote`, `pageTranslating`, `pageTranslateCancel`, `pageToggleShowOriginal`, `pageToggleShowTranslation`)
- Test: `tests/content-a11y.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// tests/content-a11y.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const js = read('content/main.js'); const css = read('content/styles/index.js');
const outsideNoPreference = (s) => s.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
describe('in-page accessibility', () => {
  it('announces polish, dictionary and progress', () => {
    expect(js).toMatch(/class="parsipad-polish-content"[^>]*aria-live="polite"/);
    expect(js).toMatch(/class="parsipad-dictionary-content"[^>]*aria-live="polite"/);
    expect(js).toMatch(/role="progressbar"/);
    expect(js).toMatch(/aria-valuenow/);
  });
  it('hides decorative SVGs from assistive tech', () => {
    const svgs = js.match(/<svg[^>]*>/g) || [];
    for (const svg of svgs) expect(svg).toMatch(/aria-hidden="true"|role="img"/);
  });
  it('runs no animation outside the motion guard', () => {
    const rest = outsideNoPreference(css);
    expect(rest).not.toMatch(/animation:\s*[a-z-]+\s+\d/);
    expect(rest).not.toMatch(/:hover[^{]*\{[^}]*transform:/);
    expect(css).not.toMatch(/transition:\s*width/);
  });
  it('lists Alt+B in the shortcuts section', () => {
    const html = read('settings/settings.html');
    const section = html.slice(html.indexOf('<section id="shortcuts"'));
    expect(section.slice(0, section.indexOf('</section>'))).toMatch(/data-i18n="shortcutBlockTranslate"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content-a11y.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** per Files. `tests/card-styles.test.js` and `tests/block-render.test.js` must stay green.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add content/main.js content/styles/index.js settings/settings.html lib/i18n.js tests/content-a11y.test.js
git commit -m "feat(content): live regions, hidden decorative icons, motion guard, documented Alt+B"
```

---

### Task 8: Release 3.6.0

**Files:**
- Modify: `store-assets/DESCRIPTION.txt` (selection toolbar on touch and keyboard, never in text fields; mute a site from the toolbar; page translate shows paragraphs and cost first, reports failures and retries them), `store-assets/STORE_LISTING.md`, `README.md` (Usage: page translate confirmation, Alt+B and Escape), `CHANGELOG.md`, `manifest.json`, `package.json`, `package-lock.json`

- [ ] **Step 1: Docs and changelog**

`CHANGELOG.md` under `## [Unreleased]`: `### Added` (page translate confirmation with cost, Retry failed, Mute on this site, toolbar keyboard path and touch), `### Changed` (Cancel and Escape keep translated sections; toolbar placement), `### Fixed` (toolbar in text fields, originals lost on SPA navigation, reload state in every box, review line hidden under a loading skeleton).

```bash
git add CHANGELOG.md README.md
git add -f store-assets/DESCRIPTION.txt store-assets/STORE_LISTING.md
git commit -m "docs(release): describe the in-page reading changes"
```

- [ ] **Step 2: Landing page**

`landing/index.html` describes page translate and the toolbar; update the wording on disk if it no longer matches, deploy per CLAUDE.md, never stage. Otherwise record "landing: no change needed".

- [ ] **Step 3: Version bump**

`3.6.0` in `manifest.json`, `package.json`, both `package-lock.json` top-level fields; `## [3.6.0] - <today>` with a fresh `## [Unreleased]` above.

```bash
git add manifest.json package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): bump version to 3.6.0"
```

- [ ] **Step 4: Verify and package**

Run: `npm test && npm run lint && npm run build && (cd dist && zip -r ../store-assets/parsipad-v3.6.0.zip .)`
Expected: all pass; `manifest.json` at the zip root. Walk the five Review Focus cases on the unpacked build.

- [ ] **Step 5: Merge and push**

```bash
git checkout main
git merge --no-ff feat/in-page-reading -m "Merge feat/in-page-reading: ParsiPad 3.6.0"
git push origin main
```

Report which release chores were done, and say explicitly if any was skipped.
