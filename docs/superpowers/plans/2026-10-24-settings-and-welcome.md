# Settings and Welcome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Settings into one page with a left nav and deep links, provider cards first with Save & test, real switches, a Muted sites list and an "Ask before translating a whole page" setting; rebuild Welcome around a working key and a first translation. Ships as 3.5.0.

**Architecture:** Settings keeps one HTML page and one controller; the section list and hash resolution move into a small pure module, and every toggle becomes a native checkbox with `role="switch"` styled by a shared `.pp-switch` class. Key testing reuses Plan B's `TEST_API_KEY` message and `lib/key-help.js`, extended with one function that turns a test result into a localized sentence for both Settings and Welcome. Muted sites live in one storage key behind `lib/muted-sites.js`, read by the selection toolbar and block translate in the content script.

**Tech Stack:** Manifest V3, vanilla ES modules, esbuild, vitest (node), happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-24-redesign-phases-c-to-f.md` (Phase D, decisions 2, 4 to 6). Audit: `.superpowers/sdd/2026-10-23-side-panel-and-popup/ui-audit-report.md` section C (settings, welcome).

## Global Constraints

- Branch `feat/settings-welcome` off `main` after Plan C (3.4.0) is merged. Consumes Plan B's `TEST_API_KEY` action, `renderKeyHelp(provider, lang)` and `KEY_HELP` in `lib/key-help.js`, the provider badge link `settings/settings.html#providers`; and Plan C's Flashcards card (`#practice-size-slider`).
- Commit per task, conventional prefix with scope (`feat(settings): ...`), no attribution trailer.
- No em dashes or emoji in code or copy. Every user-visible string through `t()` with `en` and `fa`; placeholders end in `…`, not `...`.
- The Persian-interface RTL rework is held: no logical-property sweep or mirrored layout. Content runs (hosts, key prefixes, sample sentences) get `dir` and `lang` or `<bdi>`.
- No request to a provider except on an explicit click (Save & test, the Welcome sample Translate).
- Spacing in new or rewritten CSS uses only `--space-inset-card` (20px), `--space-stack-section` (24px), `--space-stack-group` (16px), `--space-stack-item` (12px), `--space-inline-actions` (8px). Durations use `--motion-*`. No `transition: all`; every interactive control has a visible `:focus-visible` style.
- `npm test`, `npm run lint`, `npm run build` pass after every task. `landing/` is never staged.

## Review Focus

1. Deep links from older surfaces: `#providers` (Plan B badge), `#general` and `#more` (3.3.0 tabs) land on Providers, Reading and About. Pinned in Task 1.
2. Muting `www.example.com` also mutes `example.com` and `docs.example.com` but never `notexample.com`. Pinned in Task 4.
3. Save & test on one provider with a malformed key: a localized message under that field, focus back in the field, the other providers' stored keys untouched. Pinned in Task 3.
4. Welcome opened from Settings, then Done: the tab returns to Settings About instead of closing. Pinned in Task 7.
5. The Welcome sample translation fails (rejected key, offline): the message names a next step and Done still finishes onboarding. Pinned in Task 7.

---

### Task 1: One page with a left nav and deep links

**Files:**
- Create: `settings/sections.js`
- Modify: `settings/settings.html` (rewrite the shell: header with logo and title only; `<nav class="settings-nav" aria-label>` of seven `<a href="#id">`; `<main>` with seven `<section id aria-labelledby>` each opened by an `<h2 id="<id>-title">`; move the existing cards into them: providers = provider choice and keys; reading = block translate, selection popup, translate other languages, dictionary toggles; appearance = interface language and a theme radio group Light / Dark / System; flashcards = Plan C's practice card; data = cache, backup, an Analytics link and a Library link; shortcuts = the shortcuts card; about = the about card; remove every Tailwind utility class and the `settings-tab` tab bar from Plan B)
- Modify: `settings/settings.css` (delete the `.dark\:` and other utility shims near lines 60-90; nav layout: sticky left column at 200px from 720px wide, a horizontally scrolling strip below it; `html { scroll-padding-top: <header height> }`; `scroll-behavior: smooth` only inside `@media (prefers-reduced-motion: no-preference)`)
- Modify: `settings/settings.js` (replace Plan B's tab code near `setupSettingsTabs` with `setupSectionNav()`: on load scroll to `resolveSectionHash(location.hash)`; an `IntersectionObserver` sets `aria-current="location"` on the nav link of the section in view; theme radios call `setTheme` and `applyThemeToRoot`)
- Modify: `lib/i18n.js` (`settingsNavLabel`, `sectionProviders` = "AI provider & key", `sectionReading` = "Reading on web pages", `sectionAppearance` = "Language & appearance", `sectionFlashcards` = "Flashcards", `sectionData` = "Data & backup", `sectionShortcuts` = "Shortcuts", `sectionAbout` = "About", `themeLight`, `themeDark`, `themeSystem`)
- Test: `tests/settings-sections.test.js` (create)

**Interfaces:**
- Produces in `settings/sections.js`: `export const SETTINGS_SECTIONS = Object.freeze(['providers', 'reading', 'appearance', 'flashcards', 'data', 'shortcuts', 'about'])` and `export function resolveSectionHash(hash: string): string` (strips `#`; aliases `general` to `reading`, `more` to `about`; unknown or empty gives `providers`). Later tasks and Plan E link to `settings.html#reading` and `#shortcuts`.

- [ ] **Step 1: Write the failing test**

```js
// tests/settings-sections.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { SETTINGS_SECTIONS, resolveSectionHash } from '../settings/sections.js';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const html = read('settings/settings.html'); const css = read('settings/settings.css');
describe('settings sections', () => {
  it('resolves hashes, old ones included', () => {
    expect(resolveSectionHash('#providers')).toBe('providers');
    expect(resolveSectionHash('#general')).toBe('reading');
    expect(resolveSectionHash('#more')).toBe('about');
    expect(resolveSectionHash('')).toBe('providers');
    expect(resolveSectionHash('#nope')).toBe('providers');
  });
  it('has a nav link and a section per id, providers first', () => {
    for (const id of SETTINGS_SECTIONS) {
      expect(html, id).toMatch(new RegExp(`<a[^>]+href="#${id}"`));
      expect(html, id).toMatch(new RegExp(`<section[^>]+id="${id}"`));
    }
    const firstSection = html.match(/<section[^>]+id="([a-z]+)"/)[1];
    expect(firstSection).toBe('providers');
  });
  it('carries no dead utility classes', () => {
    const classes = [...html.matchAll(/class="([^"]+)"/g)].map(m => m[1]).join(' ');
    expect(classes).not.toMatch(/\b(dark:\S+|bg-gray-\d+|text-gray-\d+|p[xy]-\d|m[xy]-auto|max-w-\S+|backdrop-blur\S*|w-5|h-5|rounded-lg|sticky|top-0|z-50)\b/);
    expect(css).not.toMatch(/\.dark\\:/);
  });
  it('scrolls under the header and respects reduced motion', () => {
    expect(css).toMatch(/scroll-padding-top/);
    expect(css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\}\s*\}/g, '')).not.toMatch(/scroll-behavior:\s*smooth/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings-sections.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `settings/sections.js`, the page shell, the CSS and `setupSectionNav()` per Files. Section gap `--space-stack-section`; card inset `--space-inset-card`. Keep every existing control id so the controller keeps working; the test files `tests/version.test.js`, `tests/i18n-keys.test.js` and `tests/destructive-confirm.test.js` must still pass.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add settings lib/i18n.js tests/settings-sections.test.js
git commit -m "feat(settings): one page with a section nav and hash deep links"
```

---

### Task 2: Real switches and distinct labels

**Files:**
- Modify: `lib/components.css` (add `.pp-switch`: `appearance: none` checkbox drawn as a track and thumb, `:checked` state, `:focus-visible` outline using the focus ring token, transition on `background-color` and `transform` with `--motion-fast`)
- Modify: `settings/settings.html` (every toggle row becomes the pattern below; language and provider radio cards get a focus style through `:has(input:focus-visible)`), `settings/settings.css` (delete `.toggle-switch`, `.toggle-slider` rules near lines 480-520; the `outline: none` on the range input near line 587 gets a `:focus-visible` replacement)
- Modify: `lib/i18n.js` (`hoverTranslateLabel` = "Translate paragraphs on hover", `hoverTranslateHint`, `selectionToolbarLabel` = "Selection toolbar", `selectionToolbarHint` = "Shows Translate, Polish and Dictionary buttons when you select text. Never appears inside text fields.", `translateOtherLabel`, `translateOtherHint`)
- Test: `tests/settings-switches.test.js` (create)

**Interfaces:**
- Produces: the row pattern used by every boolean setting from here on (Task 5 adds two more):

```html
<div class="setting-row">
  <div class="setting-text">
    <label for="block-translate-toggle" data-i18n="hoverTranslateLabel"></label>
    <p id="block-translate-hint" class="setting-hint" data-i18n="hoverTranslateHint"></p>
  </div>
  <input type="checkbox" role="switch" class="pp-switch" id="block-translate-toggle" aria-describedby="block-translate-hint">
</div>
```

- Produces: `.pp-switch` in `lib/components.css`, consumed by Plan F's component pass.

- [ ] **Step 1: Write the failing test**

```js
// tests/settings-switches.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { translations } from '../lib/i18n.js';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const html = read('settings/settings.html');
const rows = html.split('<div class="setting-row">').slice(1).map(r => r.split('</section>')[0]);
describe('settings switches', () => {
  it('every checkbox is a labelled, described switch', () => {
    const boxes = [...html.matchAll(/<input[^>]+type="checkbox"[^>]*>/g)].map(m => m[0]).filter(b => !/export-/.test(b));
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    for (const box of boxes) {
      expect(box).toMatch(/role="switch"/);
      expect(box).toMatch(/class="pp-switch"/);
      const id = box.match(/id="([^"]+)"/)[1];
      const hint = box.match(/aria-describedby="([^"]+)"/)[1];
      expect(html, id).toMatch(new RegExp(`<label[^>]+for="${id}"`));
      expect(html, hint).toMatch(new RegExp(`id="${hint}"`));
    }
  });
  it('label and hint never share a key, and both exist in en and fa', () => {
    for (const row of rows) {
      const keys = [...row.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
      expect(new Set(keys).size, keys.join()).toBe(keys.length);
      for (const k of keys) { expect(translations.en[k], k).toBeTruthy(); expect(translations.fa[k], k).toBeTruthy(); }
    }
  });
  it('switches and radio cards show focus', () => {
    const components = read('lib/components.css'); const css = read('settings/settings.css');
    expect(components).toMatch(/\.pp-switch:focus-visible\s*\{[^}]*outline:\s*(?!none)/);
    expect(css).toMatch(/:has\(input:focus-visible\)/);
    expect(css).not.toMatch(/toggle-slider/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings-switches.test.js`
Expected: FAIL, no `role="switch"`.

- [ ] **Step 3: Implement** the class and convert every row; the `change` handlers in `settings.js` keep working because ids and `checked` are unchanged. Remove the now-duplicate card title where a section holds a single row.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/settings-switches.test.js tests/i18n-keys.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/components.css settings lib/i18n.js tests/settings-switches.test.js
git commit -m "feat(settings): real switches with labels, hints and visible focus"
```

---

### Task 3: Provider cards with Save & test

**Files:**
- Modify: `lib/key-help.js` (add `describeKeyTest`)
- Modify: `lib/storage.js` `setProviderApiKey` (a bad prefix throws an `Error` with `code = 'INVALID_KEY_FORMAT'` and `prefixes` instead of an English sentence)
- Modify: `settings/settings.html` (the providers section becomes a `<fieldset>` with `<legend>` of three `<article class="provider-card" data-provider>`; each holds the provider radio, a `<label for>` and key `<input type="password" name="<provider>-api-key" autocomplete="off" spellcheck="false">` with a `…` placeholder, a reveal `<button type="button" aria-label aria-pressed>`, a Save & test `<button type="button">`, a Clear button, a `<p class="key-test-status" role="status" aria-live="polite">`, and the mount for `renderKeyHelp`; the old `api-key-tabs` and shared `#api-status` go)
- Modify: `settings/settings.js` (`handleSaveApiKey(provider)` saves and tests only that provider, then writes `describeKeyTest` into that card's status; on failure focuses its input; `updateKeyStatus` and the clear handler use `t()` for every string near lines 312-324, 601, 694-696, 715)
- Modify: `lib/i18n.js` (`keyFormatInvalid` = "{provider} keys start with {prefixes}. Check you copied the whole key.", `keyConfigured`, `keyNotConfigured`, `revealKey`, `hideKey`, `useThisProvider`, `keyCleared`)
- Test: `tests/key-test-message.test.js` (create), `tests/settings-strings.test.js` (create)

**Interfaces:**
- Consumes: `TEST_API_KEY` returning `{ ok: true, model, ms } | { ok: false, code, message }` and `renderKeyHelp(provider, lang)` (Plan B); `errorI18nKey(code)` from `lib/translation/errors.js`.
- Produces in `lib/key-help.js`: `export function describeKeyTest(result, lang: string, provider: string): { tone: 'ok'|'error', text: string }`. ok: `t('keyTestOk')` with `{model}` and `{ms}` filled (`ms` via `formatNumber` from `lib/format.js`). Failure: `t('keyTestFailed')` followed by `t(errorI18nKey(result.code))`, or for `INVALID_KEY_FORMAT` `t('keyFormatInvalid')` with `{provider}` and `{prefixes}` (joined with ` / `, each in the text as given). Task 6 uses it on Welcome.

- [ ] **Step 1: Write the failing tests**

```js
// tests/key-test-message.test.js
import { describe, it, expect } from 'vitest';
import { describeKeyTest } from '../lib/key-help.js';
import { translations } from '../lib/i18n.js';
describe('describeKeyTest', () => {
  it('reports success with model and time', () => {
    const r = describeKeyTest({ ok: true, model: 'claude-haiku-5-5', ms: 812 }, 'en', 'claude');
    expect(r.tone).toBe('ok');
    expect(r.text).toContain('claude-haiku-5-5'); expect(r.text).toContain('812');
  });
  it('localizes a provider rejection', () => {
    const r = describeKeyTest({ ok: false, code: 'INVALID_API_KEY' }, 'fa', 'claude');
    expect(r.tone).toBe('error');
    expect(r.text).toMatch(/[؀-ۿ]/);
    expect(r.text).not.toMatch(/INVALID_API_KEY/);
  });
  it('names the expected prefix for a malformed key', () => {
    const r = describeKeyTest({ ok: false, code: 'INVALID_KEY_FORMAT', prefixes: ['sk-ant-'] }, 'en', 'claude');
    expect(r.text).toContain('sk-ant-');
    expect(translations.fa.keyFormatInvalid).toMatch(/\{prefixes\}/);
  });
});
```

```js
// tests/settings-strings.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const js = fs.readFileSync(path.resolve(__dirname, '../settings/settings.js'), 'utf8');
describe('settings strings', () => {
  it('shows no hardcoded English status or titles', () => {
    expect(js).not.toMatch(/showStatus\(\s*['"`][A-Z]/);
    expect(js).not.toMatch(/\.title\s*=\s*['"`][A-Z]/);
    expect(js).not.toMatch(/No changes to save/);
  });
  it('saves and tests only the clicked provider', () => {
    const body = js.slice(js.indexOf('async function handleSaveApiKey'));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    expect(fn).not.toMatch(/for \(const p of allProviders\)/);
    expect(fn).toMatch(/ACTIONS\.TEST_API_KEY/);
    expect(fn).toMatch(/describeKeyTest\(/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/key-test-message.test.js tests/settings-strings.test.js`
Expected: FAIL, `describeKeyTest` not exported.

- [ ] **Step 3: Implement** per Interfaces and Files. When `setProviderApiKey` throws `INVALID_KEY_FORMAT`, skip the request and pass `{ ok: false, code: 'INVALID_KEY_FORMAT', prefixes: error.prefixes }` to `describeKeyTest`. Cards stack with `--space-stack-group`; the status line sits directly under its input. Update any test that asserted the old English `setProviderApiKey` message (`tests/storage-settings.test.js`) to assert `code === 'INVALID_KEY_FORMAT'`; the popup first-run panel from Plan B shows `describeKeyTest` too.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Check the review case**

Load `dist/`, Settings > AI provider & key, paste `"sk-ant-wrong"` (with quotes) into Claude and click Save & test.
Expected: the provider's rejection appears under the Claude field in the UI language; focus is back in that field; Gemini and ChatGPT keys are unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/key-help.js lib/storage.js settings lib/i18n.js popup tests/key-test-message.test.js tests/settings-strings.test.js tests/storage-settings.test.js
git commit -m "feat(settings): provider cards with Save & test and localized results"
```

---

### Task 4: Muted sites, storage and content check

**Files:**
- Create: `lib/muted-sites.js`
- Modify: `lib/constants.js` (`STORAGE_KEYS.mutedSites = 'muted_sites'`)
- Modify: `content/main.js` (a module-level `siteMuted` loaded with `chrome.storage.local.get('muted_sites')` in `init`, kept current in the existing `storage.onChanged` listener; `handleTextSelection` returns first when `siteMuted`)
- Modify: `content/blocks/index.js` `initBlockTranslate` (read `muted_sites` with `block_translate_enabled`; the effective state is `stored && !isHostMuted(list, location.hostname)`, recomputed when either key changes)
- Modify: `manifest.json` `web_accessible_resources` (add `lib/muted-sites.js`)
- Test: `tests/muted-sites.test.js` (create)

**Interfaces:**
- Produces in `lib/muted-sites.js` (Task 5 and Plan E's "Mute on this site" consume these):
  - `export function normalizeHost(input: string): string | null`: accepts a URL or bare host, lowercases, strips one leading `www.`, rejects anything without a dot, with spaces, or with a non-http(s) scheme.
  - `export function isHostMuted(list: string[], hostname: string): boolean`: true when the normalized host equals an entry or ends with `.` plus an entry.
  - `export async function getMutedSites(): Promise<string[]>`, `export async function addMutedSite(input): Promise<string | null>` (returns the stored host, keeps the list unique and sorted, `null` for invalid input), `export async function removeMutedSite(host): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/muted-sites.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs'; import path from 'path';
import { normalizeHost, isHostMuted, addMutedSite, getMutedSites, removeMutedSite } from '../lib/muted-sites.js';
const store = new Map();
beforeEach(() => { store.clear(); globalThis.chrome = { storage: { local: {
  get: async (k) => ({ [k]: store.get(k) }), set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); } } } }; });
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
describe('muted sites', () => {
  it('normalizes what people paste', () => {
    expect(normalizeHost('https://www.Example.com/path?q=1')).toBe('example.com');
    expect(normalizeHost('docs.example.com')).toBe('docs.example.com');
    expect(normalizeHost('not a host')).toBeNull();
    expect(normalizeHost('chrome://extensions')).toBeNull();
    expect(normalizeHost('')).toBeNull();
  });
  it('mutes the host and its subdomains only', () => {
    const list = ['example.com'];
    expect(isHostMuted(list, 'www.example.com')).toBe(true);
    expect(isHostMuted(list, 'docs.example.com')).toBe(true);
    expect(isHostMuted(list, 'notexample.com')).toBe(false);
  });
  it('stores a unique sorted list', async () => {
    expect(await addMutedSite('www.zeta.org')).toBe('zeta.org');
    await addMutedSite('alpha.com'); await addMutedSite('https://alpha.com/x');
    expect(await addMutedSite('nope')).toBeNull();
    expect(await getMutedSites()).toEqual(['alpha.com', 'zeta.org']);
    await removeMutedSite('alpha.com');
    expect(await getMutedSites()).toEqual(['zeta.org']);
  });
  it('both in-page features honour the list', () => {
    expect(read('content/blocks/index.js')).toMatch(/isHostMuted\(/);
    const main = read('content/main.js');
    const body = main.slice(main.indexOf('function handleTextSelection'));
    expect(body.slice(0, 200)).toMatch(/if \(siteMuted\) return;/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/muted-sites.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** per Interfaces and Files.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/muted-sites.test.js tests/web-accessible-resources.test.js tests/block-index.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/muted-sites.js lib/constants.js content/main.js content/blocks/index.js manifest.json tests/muted-sites.test.js
git commit -m "feat(content): mute ParsiPad on chosen sites for hover and selection"
```

---

### Task 5: Reading on web pages: muted list and page-translate confirmation

**Files:**
- Modify: `lib/constants.js` (`STORAGE_KEYS.confirmPageTranslate = 'confirm_page_translate'`), `lib/storage.js` (`getConfirmPageTranslate(): Promise<boolean>` default `true`, `setConfirmPageTranslate(value: boolean)`)
- Modify: `settings/settings.html` reading section (a switch row `#confirm-page-translate-toggle` with `confirmPageTranslateLabel` = "Ask before translating a whole page" and its hint "Shows how many paragraphs and the estimated cost first."; a Muted sites group: `<h3>`, `<ul id="muted-sites-list" class="muted-chips">` of chips, each `<li><bdi dir="ltr">host</bdi><button type="button" aria-label="Unmute {host}">`, an add form `<label for="muted-site-input">`, `<input id="muted-site-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com">`, `<button type="submit">`, and a `role="status"` line), `settings/settings.css` (chips wrap with `--space-inline-actions`)
- Modify: `settings/settings.js` (`renderMutedSites(list)`; add form submit calls `addMutedSite`, shows `mutedSiteInvalid` inline for `null`; re-render on `chrome.storage.onChanged` for `muted_sites`, so Plan E's in-page mute shows up live)
- Modify: `lib/i18n.js` (`confirmPageTranslateLabel`, `confirmPageTranslateHint`, `mutedSitesTitle`, `mutedSitesHint`, `mutedSitesEmpty`, `mutedSiteAdd`, `mutedSiteInvalid`, `unmuteSite` = "Unmute {host}")
- Test: `tests/settings-reading.test.js` (create)

**Interfaces:**
- Consumes: Task 4's `getMutedSites`, `addMutedSite`, `removeMutedSite`.
- Produces: `getConfirmPageTranslate()` and storage key `confirm_page_translate`, consumed by Plan E's page-translate confirmation (the content script reads the key directly with default `true`).

- [ ] **Step 1: Write the failing test**

```js
// tests/settings-reading.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs'; import path from 'path';
import * as storage from '../lib/storage.js';
const store = new Map();
beforeEach(() => { store.clear(); globalThis.chrome = { storage: { local: {
  get: async (k) => ({ [k]: store.get(k) }), set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); } } } }; });
const html = fs.readFileSync(path.resolve(__dirname, '../settings/settings.html'), 'utf8');
describe('reading section', () => {
  it('asks before a whole-page translation by default', async () => {
    expect(await storage.getConfirmPageTranslate()).toBe(true);
    await storage.setConfirmPageTranslate(false);
    expect(await storage.getConfirmPageTranslate()).toBe(false);
  });
  it('has the confirmation switch and a labelled muted-sites form', () => {
    const reading = html.slice(html.indexOf('<section id="reading"'), html.indexOf('</section>', html.indexOf('<section id="reading"')));
    expect(reading).toMatch(/id="confirm-page-translate-toggle"[^>]*role="switch"|role="switch"[^>]*id="confirm-page-translate-toggle"/);
    expect(reading).toMatch(/<label[^>]+for="muted-site-input"/);
    expect(reading).toMatch(/id="muted-sites-list"/);
    expect(reading).toMatch(/role="status"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings-reading.test.js`
Expected: FAIL, `getConfirmPageTranslate` undefined.

- [ ] **Step 3: Implement** per Files. Chips are built with `createElement`/`textContent`; the unmute button's `aria-label` is `t('unmuteSite').replace('{host}', host)`. After removing a chip, focus moves to the next chip's button, or to the input when the list is empty.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/settings-reading.test.js tests/settings-switches.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/constants.js lib/storage.js settings lib/i18n.js tests/settings-reading.test.js
git commit -m "feat(settings): muted sites list and ask before translating a whole page"
```

---

### Task 6: Welcome: key setup above the fold

**Files:**
- Modify: `welcome/welcome.html` (order: compact hero with `<h1>`; `<section id="setup">` with `<h2>`, provider radios in a `<fieldset><legend>`, `<label for="api-key">` and the key input (`spellcheck="false"`, `…` placeholder), reveal button with `aria-label`, Save & test button, `<p id="api-status" role="status" aria-live="polite">`, the key-help mount, and `<p class="privacy-note">` with `welcomePrivacyNote`; then `<section id="features">` with `<h2>` and the feature cards as `<h3>`; the Screenshot card through `t()` (`featureScreenshot`, `featureScreenshotDesc`); `href="#"` console link removed, since key help carries the link; `aria-hidden="true"` on decorative SVGs)
- Modify: `welcome/welcome.js` (save and test through `TEST_API_KEY`, status through `describeKeyTest`, mount `renderKeyHelp(provider, lang)` and re-render on provider change; no hardcoded strings near line 176)
- Modify: `welcome/welcome.css` (setup card first, inset `--space-inset-card`; remove `transition: all` near lines 351 and 501)
- Modify: `lib/i18n.js` (`welcomePrivacyNote` = "Your key stays in this browser. What you translate goes straight to the provider you choose, who bills you for it. ParsiPad has no server.", `featureScreenshot`, `featureScreenshotDesc`, `welcomeSetupTitle`)
- Test: `tests/welcome-setup.test.js` (create)

**Interfaces:**
- Consumes: `describeKeyTest` (Task 3), `renderKeyHelp`, `TEST_API_KEY` (Plan B), `setProviderApiKey`, `setSelectedProvider`.
- Produces: a module-level `keyWorks: boolean` in `welcome.js` that Task 7 reads to enable the sample translation.

- [ ] **Step 1: Write the failing test**

```js
// tests/welcome-setup.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const html = read('welcome/welcome.html'); const js = read('welcome/welcome.js'); const css = read('welcome/welcome.css');
describe('welcome setup', () => {
  it('puts setup before features and keeps heading order', () => {
    expect(html.indexOf('id="setup"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="setup"')).toBeLessThan(html.indexOf('id="features"'));
    const headings = [...html.matchAll(/<h([1-6])/g)].map(m => Number(m[1]));
    for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
  });
  it('tests the key and explains privacy and cost', () => {
    expect(js).toMatch(/ACTIONS\.TEST_API_KEY/);
    expect(js).toMatch(/describeKeyTest\(/);
    expect(js).toMatch(/renderKeyHelp\(/);
    expect(html).toMatch(/data-i18n="welcomePrivacyNote"/);
    expect(html).toMatch(/<label[^>]+for="api-key"/);
    expect(html).not.toMatch(/href="#"/);
  });
  it('has no hardcoded copy or transition: all', () => {
    expect(html).not.toMatch(/<h3 class="feature-title">[A-Z]/);
    expect(css).not.toMatch(/transition:\s*all/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/welcome-setup.test.js`
Expected: FAIL, no `id="setup"`.

- [ ] **Step 3: Implement** per Files. Update `tests/welcome-theme-toggle.test.js` if its selectors moved.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/welcome-setup.test.js tests/welcome-theme-toggle.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add welcome lib/i18n.js tests/welcome-setup.test.js tests/welcome-theme-toggle.test.js
git commit -m "feat(welcome): put the key and a real test above the fold"
```

---

### Task 7: Welcome: first translation and a finish that does not strand

**Files:**
- Create: `welcome/finish.js`
- Modify: `welcome/welcome.html` (between setup and features, `<section id="try-it">` with `<h2>`, the sample in `<p id="try-it-source" lang="en" dir="ltr">`, a Translate button disabled until `keyWorks`, `<p id="try-it-result" lang="fa" dir="rtl" aria-live="polite">`, and a Done button; a quiet "Skip for now" button beside Done)
- Modify: `welcome/welcome.js` (Translate sends `{ action: ACTIONS.TRANSLATE, text: WELCOME_SAMPLE }` and writes `response.translation` into `#try-it-result`; an error writes `t(errorI18nKey(code))` plus `welcomeTryAgainHint`; Done and Skip both call `setOnboardingComplete()` then act on `finishTarget(location.search)`)
- Modify: `settings/settings.js` (the "View Welcome Guide" handler near line 522 sets `location.href = '../welcome/welcome.html?from=settings'` in the same tab instead of `chrome.tabs.create`)
- Modify: `lib/i18n.js` (`welcomeTryTitle`, `welcomeTryTranslate`, `welcomeTryAgainHint` = "Check the key above, then try again.", `welcomeDone`, `welcomeSkip`)
- Test: `tests/welcome-finish.test.js` (create)

**Interfaces:**
- Produces in `welcome/finish.js`: `export const WELCOME_SAMPLE = 'The meeting was moved to Thursday afternoon.'` (English content to translate, not UI copy, so it stays English in both UI languages) and `export function finishTarget(search: string): { type: 'navigate', url: '../settings/settings.html#about' } | { type: 'close' }` (`from=settings` navigates, anything else closes).

- [ ] **Step 1: Write the failing test**

```js
// tests/welcome-finish.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { finishTarget, WELCOME_SAMPLE } from '../welcome/finish.js';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
describe('welcome finish', () => {
  it('returns to Settings when opened from Settings', () => {
    expect(finishTarget('?from=settings')).toEqual({ type: 'navigate', url: '../settings/settings.html#about' });
    expect(finishTarget('')).toEqual({ type: 'close' });
  });
  it('Settings opens the guide in the same tab', () => {
    const js = read('settings/settings.js');
    expect(js).toMatch(/welcome\/welcome\.html\?from=settings/);
  });
  it('the sample is a real translation through the worker, marked as English', () => {
    const js = read('welcome/welcome.js'); const html = read('welcome/welcome.html');
    expect(WELCOME_SAMPLE).toMatch(/^[A-Za-z ,.]+$/);
    expect(js).toMatch(/action: ACTIONS\.TRANSLATE/);
    expect(html).toMatch(/id="try-it-source"[^>]*lang="en"/);
    expect(html).toMatch(/id="try-it-result"[^>]*aria-live="polite"/);
    expect(js).toMatch(/errorI18nKey\(/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/welcome-finish.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** per Files. The Done button does not wait for the sample to succeed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/welcome-finish.test.js`
Expected: PASS

- [ ] **Step 5: Walk both entry points**

Load `dist/` on a fresh profile: Welcome opens; Save & test with a real key; Translate shows Persian under the sample; Done closes the tab. Then Settings > About > View Welcome Guide: same tab; Done returns to Settings at About. Repeat with a revoked key: the sample shows the rejection and the hint; Done still works.

- [ ] **Step 6: Commit**

```bash
git add welcome settings/settings.js lib/i18n.js tests/welcome-finish.test.js
git commit -m "feat(welcome): end on a first translation and return to Settings when opened there"
```

---

### Task 8: Release 3.5.0

**Files:**
- Modify: `store-assets/DESCRIPTION.txt` (Settings sections, Save & test, Muted sites, ask before translating a page), `store-assets/STORE_LISTING.md` (settings lines near 125), `README.md` (Settings section), `CHANGELOG.md`, `manifest.json`, `package.json`, `package-lock.json`. `extensionDescription` is unchanged unless the new copy demands it (then also `STORE_LISTING.md`, 132 characters max).

- [ ] **Step 1: Docs and changelog**

`CHANGELOG.md` under `## [Unreleased]`: `### Added` (Muted sites, Ask before translating a whole page, Save & test in Settings, Welcome first translation), `### Changed` (Settings is one page with a section nav and deep links; switches; Welcome order), `### Fixed` (hardcoded English statuses, Welcome from Settings closing the tab, Save saving every provider's key).

```bash
git add CHANGELOG.md README.md
git add -f store-assets/DESCRIPTION.txt store-assets/STORE_LISTING.md
git commit -m "docs(release): describe the new Settings and Welcome"
```

- [ ] **Step 2: Landing page**

If `landing/` describes Settings or onboarding, update it on disk and deploy per CLAUDE.md (`npm run build:css`, `npx vercel deploy --yes`, check, `npx vercel promote <preview-url> --scope personal-46ddfab5 --yes`). Never stage it. Otherwise record "landing: no change needed".

- [ ] **Step 3: Version bump**

`3.5.0` in `manifest.json`, `package.json`, both `package-lock.json` top-level fields; `## [3.5.0] - <today>` with a fresh `## [Unreleased]` above.

```bash
git add manifest.json package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): bump version to 3.5.0"
```

- [ ] **Step 4: Verify and package**

Run: `npm test && npm run lint && npm run build && (cd dist && zip -r ../store-assets/parsipad-v3.5.0.zip .)`
Expected: all pass; the zip has `manifest.json` at its root.

- [ ] **Step 5: Merge and push**

```bash
git checkout main
git merge --no-ff feat/settings-welcome -m "Merge feat/settings-welcome: ParsiPad 3.5.0"
git push origin main
```

Report which release chores were done, and say explicitly if any was skipped.
