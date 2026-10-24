# Side Panel and Popup Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chrome side panel that hosts the popup's functionality persistently, show the active provider and its health in both headers, give first run a working "Save and test key" flow, and reorder the popup around the textarea.

**Architecture:** The side panel page reuses `popup/popup.js` and the popup's element ids, with a panel-specific stylesheet that makes the layout fluid and a small panel script for what the popup cannot do (page-selection chip). The service worker gains three message actions: `OPEN_SIDE_PANEL`, `TEST_API_KEY`, and `SELECTION_CHANGED` pass-through. Provider health is a stored record written after every real provider call and read by the badge.

**Tech Stack:** Manifest V3 `chrome.sidePanel` (Chrome 114+; manifest targets 120), vanilla ES modules, esbuild, vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-ui-review-and-side-panel-design.md`, sections "Side panel" and "Popup rework".

## Global Constraints

- Branch `feat/side-panel` off `main`, after `fix/ui-phase-1` is merged (Task 6 depends on the status line from that plan).
- Commit per task, conventional prefix with scope, no attribution trailers.
- No em dashes or emoji in code or copy. Every string through `t()` with `en` and `fa`.
- `chrome.sidePanel.open()` must run inside a user-gesture handler; never from a timer or a message handler that was not itself triggered by a click or command.
- No request to a provider except on an explicit user action (Translate, Save and test key). The health badge never polls.
- New markup uses the spacing tokens from Plan A Task 9 (`--space-inset-card`, `--space-stack-section`, `--space-stack-group`, `--space-stack-item`, `--space-inline-actions`); no literal spacing values in new CSS.
- `npm test`, `npm run lint`, `npm run build` pass after every task. `landing/` untouched.

## Review Focus

1. Panel open on a tab where the content script cannot run (chrome://, Web Store): the selection chip stays empty and the rest of the panel works. Pinned in Task 4.
2. Selection inside an input, textarea or contenteditable: no chip update. Pinned in Task 4.
3. "Save and test key" with a key the provider rejects: the status shows the provider's reason and a next step, Translate stays disabled, the key is still saved so the user can edit it. Pinned in Task 5.
4. Provider switched in Settings while the panel is open: the badge updates without a reload. Pinned in Task 3.
5. Popup opened by keyboard: focus lands in the textarea; `⌘↵` submits; Tab order is pill, textarea, Translate, page actions. Pinned in Task 6.

---

### Task 1: Manifest, build entries, and the panel page shell

**Files:**
- Modify: `manifest.json` (add `"sidePanel"` to `permissions`; add `"side_panel": { "default_path": "sidepanel/sidepanel.html" }`)
- Modify: `scripts/build.mjs` (`MODULE_ENTRIES` gains `{ in: 'sidepanel/sidepanel.js', out: 'sidepanel/sidepanel.js' }`; `STATIC` gains `'sidepanel/sidepanel.html', 'sidepanel/sidepanel.css'`)
- Create: `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.js`
- Test: `tests/sidepanel-manifest.test.js` (create)

**Interfaces:**
- Produces: `sidepanel/sidepanel.html` containing every element id that `popup/popup.js` queries, in the same nesting, with `<body data-surface="panel">`. `sidepanel/sidepanel.js` is `import '../popup/popup.js'; import { initPanel } from './panel.js';` after Task 4; for now only the first import.

- [ ] **Step 1: Write the failing test**

```js
// tests/sidepanel-manifest.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const popupHtml = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const panelHtml = fs.readFileSync(path.join(root, 'sidepanel/sidepanel.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
describe('side panel', () => {
  it('is declared in the manifest', () => {
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.side_panel.default_path).toBe('sidepanel/sidepanel.html');
  });
  it('carries every id the popup script queries', () => {
    const ids = new Set((popupJs.match(/getElementById\('([^']+)'\)/g) || []).map(s => s.slice(17, -2)));
    for (const id of ids) expect(panelHtml, id).toMatch(new RegExp(`id="${id}"`));
  });
  it('marks itself as the panel surface', () => {
    expect(panelHtml).toMatch(/<body data-surface="panel">/);
    expect(popupHtml).not.toMatch(/data-surface="panel"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sidepanel-manifest.test.js`
Expected: FAIL, no `side_panel`.

- [ ] **Step 3: Create the shell**

`sidepanel/sidepanel.html`: copy `popup/popup.html`, change `<title>` to `ParsiPad`, set `<body data-surface="panel">`, link `../popup/popup.css` then `sidepanel.css`, keep `../lib/theme-boot.js`, load `sidepanel.js` as the module. `sidepanel/sidepanel.css`: `body[data-surface="panel"] { width: auto; min-width: 320px; min-height: 100vh; }` and `.popup { width: auto; max-width: none; }`. `sidepanel/sidepanel.js`: `import '../popup/popup.js';`. Update `manifest.json` and `scripts/build.mjs`.

- [ ] **Step 4: Run test and build**

Run: `npx vitest run tests/sidepanel-manifest.test.js && npm run build`
Expected: PASS; `dist/sidepanel/` exists with three files.

- [ ] **Step 5: Open it once**

Load `dist/` unpacked, open `chrome-extension://<id>/sidepanel/sidepanel.html` in a tab.
Expected: the popup UI renders fluid at the tab's width; a translation works.

- [ ] **Step 6: Commit**

```bash
git add manifest.json scripts/build.mjs sidepanel tests/sidepanel-manifest.test.js
git commit -m "feat(sidepanel): declare a side panel that reuses the popup"
```

---

### Task 2: Opening the panel

**Files:**
- Modify: `background/service-worker.js` (`onInstalled` menu creation near line 707; `handleMessage` switch near line 45; `contextMenus.onClicked` near line 784)
- Modify: `lib/constants.js` (`ACTIONS` gains `OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL'`, context menu id `CONTEXT_MENU_IDS.openSidePanel = 'parsipad-open-side-panel'` if a similar map exists; otherwise a literal in the worker)
- Modify: `popup/popup.html` header (add `<button id="open-sidepanel-btn" class="icon-btn" aria-label="…">`), `popup/popup.js` (click handler), `lib/i18n.js` (`openInSidebar`, `ctxOpenSidePanel`)
- Modify: `_locales/en/messages.json`, `_locales/fa/messages.json` (`ctxOpenSidePanel` for the context menu title)
- Test: `tests/service-worker.test.js` (extend)

**Interfaces:**
- Produces: message `{ action: 'OPEN_SIDE_PANEL', tabId?: number }` handled in the worker by `chrome.sidePanel.open({ tabId })` where `tabId` defaults to the sender's tab. The popup button calls `chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id })` directly, then `window.close()`.

- [ ] **Step 1: Write the failing test**

Extend the stub in `tests/service-worker.test.js` with `sidePanel: { open: vi.fn().mockResolvedValue(undefined), setPanelBehavior: vi.fn().mockResolvedValue(undefined) }`, then:

```js
it('OPEN_SIDE_PANEL opens the panel for the sender tab', async () => {
  await sendMessage({ action: 'OPEN_SIDE_PANEL' }, { tab: { id: 42 } });
  expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
});
it('registers a context menu item that opens the panel', () => {
  const ids = chrome.contextMenus.create.mock.calls.map(c => c[0].id);
  expect(ids).toContain('parsipad-open-side-panel');
});
it('keeps the toolbar icon on the popup', () => {
  expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/service-worker.test.js`
Expected: FAIL on the three new cases.

- [ ] **Step 3: Implement**

Worker: on install call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` guarded by `if (chrome.sidePanel)`; create the context menu item with `contexts: ['all']`, title `chrome.i18n.getMessage('ctxOpenSidePanel')`; in `onClicked`, `chrome.sidePanel.open({ tabId: tab.id })`; in `handleMessage`, the `OPEN_SIDE_PANEL` case. Popup: the header button with the sidebar icon from the mockup, handler as in Interfaces.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/service-worker.test.js`
Expected: PASS

- [ ] **Step 5: Check the gesture rule in the browser**

Load `dist/`, click the popup's sidebar button; right-click a page and choose the menu item.
Expected: the panel opens both ways with no "user gesture required" error in the worker console.

- [ ] **Step 6: Commit**

```bash
git add background/service-worker.js lib/constants.js popup/popup.html popup/popup.js lib/i18n.js _locales tests/service-worker.test.js
git commit -m "feat(sidepanel): open the panel from the popup and the context menu"
```

---

### Task 3: Provider badge with health

**Files:**
- Create: `lib/provider-health.js`
- Modify: `lib/constants.js` (`STORAGE_KEYS.providerHealth = 'provider_health'`)
- Modify: `lib/api.js` (wrap each provider call: after `provider.complete/stream/vision` resolves or rejects, call `recordProviderHealth`)
- Modify: `popup/popup.html` header (add `<a id="provider-badge" class="provider-health-badge" href="#"><span class="provider-health-dot"></span><span id="provider-badge-name"></span></a>`), `popup/popup.css`, `popup/popup.js` (render on load and on `chrome.storage.onChanged`)
- Modify: `settings/settings.js:388-420` (read `location.hash` on load and activate the matching tab; write the hash on tab change)
- Test: `tests/provider-health.test.js` (create)

**Interfaces:**
- Produces in `lib/provider-health.js`:
  - `export async function recordProviderHealth(provider: string, outcome: { ok: boolean, code?: string, ms?: number }): Promise<void>` storing `{ [provider]: { ok, code, ms, at: Date.now() } }` merged under `STORAGE_KEYS.providerHealth`.
  - `export async function getProviderHealth(provider: string): Promise<{ ok: boolean, code?: string, ms?: number, at: number } | null>`.
  - `export function healthTone(record): 'ok' | 'warn' | 'error' | 'unknown'`: `null` → `unknown`; `ok` → `ok`; code in `RATE_LIMITED`, `TIMEOUT` → `warn`; anything else → `error`.
- Consumes: `ERROR_CODES` from `lib/translation/errors.js`.

- [ ] **Step 1: Write the failing test**

```js
// tests/provider-health.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { recordProviderHealth, getProviderHealth, healthTone } from '../lib/provider-health.js';
const store = new Map();
beforeEach(() => { store.clear(); globalThis.chrome = { storage: { local: {
  get: async (k) => ({ [k]: store.get(k) }), set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); } } } }; });
describe('provider health', () => {
  it('records and reads back the latest outcome per provider', async () => {
    await recordProviderHealth('claude', { ok: true, ms: 812 });
    await recordProviderHealth('gemini', { ok: false, code: 'INVALID_API_KEY' });
    expect((await getProviderHealth('claude')).ok).toBe(true);
    expect((await getProviderHealth('gemini')).code).toBe('INVALID_API_KEY');
    expect(await getProviderHealth('openai')).toBeNull();
  });
  it('maps outcomes to a tone', () => {
    expect(healthTone(null)).toBe('unknown');
    expect(healthTone({ ok: true })).toBe('ok');
    expect(healthTone({ ok: false, code: 'RATE_LIMITED' })).toBe('warn');
    expect(healthTone({ ok: false, code: 'INVALID_API_KEY' })).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/provider-health.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the module, the recording, and the badge**

Module per Interfaces. In `lib/api.js`, record after every provider call in `translate`, `polish`, `lookupWord`, `translateImage`, `getGrammarLesson` (ok with `ms` on success; `code` from the caught `TranslationError` on failure, `UNKNOWN` otherwise). Badge: `popup.js` renders `PROVIDER_CONFIGS[provider].name` and sets `data-tone` on the badge from `healthTone`; `title` and `aria-label` read `t('providerHealthOk').replace('{ago}', …)` etc. with keys `providerHealthOk`, `providerHealthWarn`, `providerHealthError`, `providerHealthUnknown`; `href` is `settings/settings.html#providers` opened through `chrome.tabs.create` on click; `chrome.storage.onChanged` re-renders when `selectedProvider` or `provider_health` changes. CSS: pill per mockup, dot colours `--color-success-500`, `--color-warning-500`, `--color-error-500`, `--color-gray-500`. Settings: `#providers`, `#general`, `#data`, `#more` select the tab on load and are written on click.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/provider-health.test.js tests/service-worker.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/provider-health.js lib/constants.js lib/api.js popup/popup.html popup/popup.css popup/popup.js settings/settings.js lib/i18n.js tests/provider-health.test.js
git commit -m "feat(popup): show the active provider and its last request outcome"
```

---

### Task 4: Page-selection chip in the panel

**Files:**
- Create: `sidepanel/panel.js`
- Modify: `sidepanel/sidepanel.js` (add `import { initPanel } from './panel.js'; initPanel();`), `sidepanel/sidepanel.html` (chip markup above the mode pill: `<div id="selection-chip" class="selection-chip" hidden><span class="selection-chip-label" data-i18n="selectedOnPage"></span><span id="selection-chip-text" class="selection-chip-text"></span><button id="selection-chip-translate" type="button" data-i18n="translate"></button></div>`), `sidepanel/sidepanel.css`
- Modify: `content/main.js` (near the existing `mouseup` listener at line 100: add a `selectionchange` listener)
- Create: `content/selection-report.js`
- Modify: `lib/constants.js` (`ACTIONS.SELECTION_CHANGED`), `lib/i18n.js` (`selectedOnPage`)
- Test: `tests/selection-report.test.js` (create)

**Interfaces:**
- Produces in `content/selection-report.js`: `export function selectionToReport(selection: Selection | null, activeElement: Element | null): string | null` returning the trimmed text when it has at least 2 characters and `activeElement` is not an `input`, `textarea` or `isContentEditable` element, else `null`. `export function createSelectionReporter(send: (text: string) => void, { delay = 300 } = {})` returning a debounced handler that calls `send` only when the report changed.
- Message: `{ action: 'SELECTION_CHANGED', text: string, tabId?: number }` sent with `chrome.runtime.sendMessage`; the panel listens with `chrome.runtime.onMessage` and shows the first 120 characters. `chrome.tabs.onActivated` hides the chip.
- The worker's `handleMessage` returns `{ ok: true }` for `SELECTION_CHANGED` so the sender never sees an "unknown action" error.

- [ ] **Step 1: Write the failing test**

```js
// tests/selection-report.test.js
import { describe, it, expect, vi } from 'vitest';
import { selectionToReport, createSelectionReporter } from '../content/selection-report.js';
const sel = (text) => ({ toString: () => text });
describe('selectionToReport', () => {
  it('returns trimmed text of two or more characters', () => {
    expect(selectionToReport(sel('  hello  '), null)).toBe('hello');
    expect(selectionToReport(sel('h'), null)).toBeNull();
    expect(selectionToReport(null, null)).toBeNull();
  });
  it('ignores selections inside editable elements', () => {
    expect(selectionToReport(sel('hello'), { tagName: 'TEXTAREA' })).toBeNull();
    expect(selectionToReport(sel('hello'), { tagName: 'DIV', isContentEditable: true })).toBeNull();
  });
});
describe('createSelectionReporter', () => {
  it('debounces and sends only on change', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const report = createSelectionReporter(send, { delay: 300 });
    report('hello'); report('hello world'); vi.advanceTimersByTime(300);
    report('hello world'); vi.advanceTimersByTime(300);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('hello world');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selection-report.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`content/selection-report.js` per Interfaces. In `content/main.js`: `const reporter = createSelectionReporter(text => chrome.runtime.sendMessage({ action: 'SELECTION_CHANGED', text }).catch(() => {}));` and `document.addEventListener('selectionchange', () => reporter(selectionToReport(document.getSelection(), document.activeElement)), { passive: true });`. Add `content/selection-report.js` to `web_accessible_resources` if `content/main.js` is loaded as a module that imports it (it is; the manifest lists `content/*.js` patterns per folder, so add the file). `sidepanel/panel.js`: `initPanel()` registers the `onMessage` listener, fills the chip, and the chip button sets `#input-text`, switches to the Translate mode, and clicks `#action-btn`.

- [ ] **Step 4: Run tests and the web-accessible-resources test**

Run: `npx vitest run tests/selection-report.test.js tests/web-accessible-resources.test.js`
Expected: PASS

- [ ] **Step 5: Check the two review cases**

Load `dist/`, open the panel. (a) Select text on a normal page: chip shows within half a second. (b) Select inside a textarea: chip unchanged. (c) Switch to a `chrome://extensions` tab: chip hides, panel still translates typed text.

- [ ] **Step 6: Commit**

```bash
git add sidepanel content/selection-report.js content/main.js lib/constants.js lib/i18n.js manifest.json tests/selection-report.test.js
git commit -m "feat(sidepanel): show the page selection as a one-click chip"
```

---

### Task 5: Save and test key

**Files:**
- Modify: `lib/api.js` (add `export async function testApiKey(provider: string, key: string): Promise<{ ok: true, model: string, ms: number } | { ok: false, code: string, message: string }>`)
- Modify: `background/service-worker.js` (`TEST_API_KEY` case calling `testApiKey`, then `recordProviderHealth`)
- Modify: `lib/constants.js` (`ACTIONS.TEST_API_KEY`)
- Modify: `popup/popup.html` (replace the `#api-key-warning` block with the first-run section from the mockup: provider radios `name="first-run-provider"`, `#first-run-key` password input with `autocomplete="off" spellcheck="false"`, reveal button, `#first-run-test` button, `#first-run-status` with `role="status" aria-live="polite"`), `popup/popup.js` (show the section when the selected provider has no key; disable `#action-btn` until a test succeeds), `popup/popup.css`
- Modify: `settings/settings.js:646-698` (`handleSaveApiKey` sends `TEST_API_KEY` after saving and renders the result inline under the field), `settings/settings.html` (an inline `role="status"` element per key panel; rename the button to `Save & Test`)
- Modify: `lib/i18n.js` (`saveAndTestKey`, `keyTestOk`, `keyTestFailed`, `firstRunTitle`, `firstRunBody`, `keyHelpTitle`, and per provider `keyHelp{Claude|Gemini|Openai}Step1..3` plus `keyHelp{…}Cost`)
- Create: `lib/key-help.js`
- Test: `tests/service-worker.test.js` (extend), `tests/api-test-key.test.js` (create)

**Interfaces:**
- Consumes: `recordProviderHealth` from Task 3; `getProvider(provider)` and `PROVIDER_CONFIGS` from `lib/providers/index.js` and `lib/constants.js`.
- Produces in `lib/key-help.js`: `export const KEY_HELP = { claude: { url: 'https://console.anthropic.com/settings/keys', prefix: 'sk-ant-', steps: ['keyHelpClaudeStep1','keyHelpClaudeStep2','keyHelpClaudeStep3'], cost: 'keyHelpClaudeCost' }, gemini: { url: 'https://aistudio.google.com/apikey', prefix: 'AIza or AQ.', … }, openai: { url: 'https://platform.openai.com/api-keys', prefix: 'sk-', … } }` and `export function renderKeyHelp(provider: string, lang: string): HTMLElement` returning a `<details class="key-help">` with `<summary>` = `t('keyHelpTitle')`, an `<ol>` of the three steps (step 1 contains the link as `<a target="_blank" rel="noopener">`), and a `<p>` with the prefix and cost note.
- `testApiKey` calls `provider.complete({ systemPrompt: 'Reply with the single word OK.', userPrompt: 'OK', maxTokens: 5, apiKey: key, timeoutMs: 15000 })` and measures `performance.now()` around it. Failures map through the provider's existing `handleError` to a `TranslationError` code.

- [ ] **Step 1: Write the failing tests**

```js
// tests/api-test-key.test.js
import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/providers/index.js', () => ({ getProvider: vi.fn() }));
import { getProvider } from '../lib/providers/index.js';
import { testApiKey } from '../lib/api.js';
import { TranslationError, ERROR_CODES } from '../lib/translation/errors.js';
describe('testApiKey', () => {
  it('reports ok with the model and timing', async () => {
    getProvider.mockReturnValue({ config: { model: 'claude-haiku-5-5' }, complete: vi.fn().mockResolvedValue({ text: 'OK' }) });
    const r = await testApiKey('claude', 'sk-ant-x');
    expect(r.ok).toBe(true); expect(r.model).toBe('claude-haiku-5-5'); expect(r.ms).toBeGreaterThanOrEqual(0);
  });
  it('reports the provider error code', async () => {
    getProvider.mockReturnValue({ config: { model: 'm' }, complete: vi.fn().mockRejectedValue(new TranslationError(ERROR_CODES.INVALID_API_KEY)) });
    const r = await testApiKey('claude', 'bad');
    expect(r).toMatchObject({ ok: false, code: 'INVALID_API_KEY' });
  });
});
```

And in `tests/service-worker.test.js` (where `lib/api.js` is already mocked, add `testApiKey: vi.fn()` to the mock):

```js
it('TEST_API_KEY returns the outcome and records health', async () => {
  testApiKey.mockResolvedValue({ ok: true, model: 'm', ms: 50 });
  const r = await sendMessage({ action: 'TEST_API_KEY', provider: 'claude', key: 'sk-ant-x' });
  expect(r.ok).toBe(true);
  expect(store.get('provider_health').claude.ok).toBe(true);
});
```

Adjust the import path of `getProvider` to whatever `lib/api.js` actually imports from `lib/providers/index.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api-test-key.test.js tests/service-worker.test.js`
Expected: FAIL, `testApiKey` is not exported.

- [ ] **Step 3: Implement the API, the worker case, and both UIs**

Per Interfaces. `lib/key-help.js` per Interfaces; the step copy in both locales reads, for Claude: (1) "Open console.anthropic.com and sign in or create an account." (2) "Go to Settings, API keys, and click Create Key." (3) "Copy the key that starts with sk-ant- and paste it here." Cost: "Claude needs a payment method or credits on the account. A translation costs about $0.0001." Gemini: (1) "Open aistudio.google.com/apikey and sign in with Google." (2) "Click Create API key and pick or create a project." (3) "Copy the key (starts with AIza or AQ.) and paste it here." Cost: "Gemini has a free tier that covers everyday use." ChatGPT: (1) "Open platform.openai.com/api-keys and sign in." (2) "Click Create new secret key." (3) "Copy the key that starts with sk- and paste it here." Cost: "ChatGPT needs prepaid credits on the account." Mount `renderKeyHelp(provider)` under the key field in the popup first-run section and under each key input in Settings, re-rendered when the provider radio changes. Popup first-run section: visible only when `getProviderApiKey(selectedProvider)` is empty; "Save and test key" stores the key with `setProviderApiKey`, sends `TEST_API_KEY`, shows `t('keyTestOk')` with `{model}` and `{ms}` filled on success and hides the section after 1500 ms, or `t('keyTestFailed')` with the localized error message and keeps the key in the field. Settings: same message after save, result inline under the input.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api-test-key.test.js tests/service-worker.test.js`
Expected: PASS

- [ ] **Step 4b: Pin the key help**

Add to `tests/api-test-key.test.js`:

```js
import { KEY_HELP } from '../lib/key-help.js';
import { translations } from '../lib/i18n.js';
it('every provider has three localized steps and a cost note', () => {
  for (const [provider, help] of Object.entries(KEY_HELP)) {
    expect(help.url, provider).toMatch(/^https:\/\//);
    expect(help.steps).toHaveLength(3);
    for (const key of [...help.steps, help.cost]) {
      expect(translations.en[key], key).toBeTruthy();
      expect(translations.fa[key], key).toBeTruthy();
    }
  }
});
```

Run: `npx vitest run tests/api-test-key.test.js`
Expected: PASS

- [ ] **Step 5: Check the rejected-key case**

Load `dist/`, clear the key, open the popup, enter `sk-ant-wrong`, click Save and test key.
Expected: red status with the provider's reason and "Check the key and try again."; Translate stays disabled; the field still holds the key.

- [ ] **Step 6: Commit**

```bash
git add lib/api.js lib/constants.js background/service-worker.js popup settings lib/i18n.js tests/api-test-key.test.js tests/service-worker.test.js
git commit -m "feat(onboarding): save and test the API key with one real request"
```

---

### Task 6: Popup reorder

**Files:**
- Modify: `popup/popup.html` (restructure the body per the spec's "Popup rework" order; delete the `#stats-section` block and the full-width `#translate-page-btn`; add `<nav class="page-actions" aria-label="This page">` with two buttons carrying `data-shortcut-for` and a `<kbd>`; keep every id the script queries except the stats ids)
- Modify: `popup/popup.js` (remove the stats code at lines 117-125 and 527-545 and `loadStats`; focus `#input-text` on `DOMContentLoaded`; the mode pill handles Document and Image by activating the existing tab logic; `Meta+Enter`/`Ctrl+Enter` already submit)
- Modify: `popup/popup.css` (pill, page-actions list, kbd)
- Modify: `sidepanel/sidepanel.html` (mirror the structural change; the panel keeps a Library link that opens `history/history.html`)
- Modify: `analytics/analytics.html` (nothing to add: the four counters already exist there)
- Test: `tests/popup-structure.test.js` (create); update `tests/sidepanel-manifest.test.js` expectations if ids changed

- [ ] **Step 1: Write the failing test**

```js
// tests/popup-structure.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
const order = (ids) => ids.map(id => html.indexOf(`id="${id}"`));
describe('popup order', () => {
  it('puts the textarea before any page-level action and has no stats section', () => {
    const [textarea, actionBtn, pageActions] = order(['input-text', 'action-btn', 'translate-page-btn']);
    expect(textarea).toBeGreaterThan(0);
    expect(textarea).toBeLessThan(actionBtn);
    expect(actionBtn).toBeLessThan(pageActions);
    expect(html).not.toMatch(/id="stats-section"/);
    expect(js).not.toMatch(/getElementById\('stats-toggle'\)/);
  });
  it('focuses the textarea on open and shows the submit shortcut', () => {
    expect(js).toMatch(/inputText\.focus\(\)/);
    expect(html).toMatch(/<kbd[^>]*>⌘↵<\/kbd>|<kbd[^>]*>Ctrl\+Enter<\/kbd>/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/popup-structure.test.js`
Expected: FAIL on order and stats.

- [ ] **Step 3: Restructure**

Follow the mockup "Popup, reworked": header (logo, provider badge, sidebar button, settings), mode pill, textarea with the Explain grammar checkbox and count under it, primary Translate with the platform's submit `kbd` (`⌘↵` on Mac, `Ctrl+Enter` elsewhere, decided at runtime with `navigator.platform`), status line, page actions with real shortcuts from `getBoundShortcuts()`, Recent one-liner with a Library link. Remove stats; "View Analytics" lives in the Recent row's menu or Settings > More.

- [ ] **Step 4: Run tests and lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 5: Keyboard walk**

Load `dist/`, open the popup with the keyboard (assign a shortcut to `_execute_action` at `chrome://extensions/shortcuts` for the test).
Expected: focus is in the textarea; Tab order is pill, textarea, checkbox, Translate, page actions; `⌘↵` translates; Escape closes.

- [ ] **Step 6: Commit**

```bash
git add popup sidepanel tests/popup-structure.test.js tests/sidepanel-manifest.test.js
git commit -m "feat(popup): lead with the textarea and move page actions below the form"
```

---

### Task 7: Release

- [ ] **Step 1: Changelog and docs**

`CHANGELOG.md` under `## [Unreleased]`: `### Added` (side panel, selection chip, provider badge, save and test key) and `### Changed` (popup order, stats moved to Analytics). `README.md` Usage: one paragraph on opening the sidebar. `store-assets/PERMISSION-JUSTIFICATIONS.txt`: a line for `sidePanel`.

- [ ] **Step 2: Full verification**

Run: `npm test && npm run lint && npm run build`. Load `dist/` unpacked and walk the five Review Focus cases.

- [ ] **Step 3: Commit and merge**

```bash
git add CHANGELOG.md README.md store-assets/PERMISSION-JUSTIFICATIONS.txt
git commit -m "docs: changelog and permission justification for the side panel"
git checkout main && git merge --no-ff feat/side-panel -m "Merge feat/side-panel: side panel, provider badge, key test, popup reorder"
```

This is a minor version bump (3.2.0) when released; the bump is its own commit.
