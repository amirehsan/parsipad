# UI Phase 1 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine confirmed UI defects from the 2026-10-23 review without changing any surface's structure, and make the review prompt fire on real use.

**Architecture:** Each task is a small, independent change in one surface plus a regression test. Tests follow the repo's existing pattern for presentation code: read the CSS/HTML/JS file as text and assert on it (see `tests/design-tokens.test.js`, `tests/popup-card-tokens.test.js`), or unit-test a pure helper in `lib/`. No new dependencies.

**Tech Stack:** Vanilla JS ES modules, esbuild, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-10-23-ui-review-and-side-panel-design.md`, section "Confirmed defects".

## Global Constraints

- Branch `fix/ui-phase-1` off `main`; one commit per task; merge with a merge commit as the repo does.
- Commit messages: conventional prefix with scope (`fix(popup): …`), no attribution trailers.
- No em dashes or emoji in code or copy.
- Every user-visible string goes through `t()` in `lib/i18n.js` with both `en` and `fa` entries.
- `npm test` and `npm run lint` pass after every task. `npm run build` succeeds.
- Do not touch `landing/`.

## Review Focus

1. Popup: copy fails while a translation is on screen. The translation must stay; the failure appears in the status line. Pinned in Task 6.
2. Settings: Clear API key clicked by accident. Nothing is removed until confirmed. Pinned in Task 8.
3. Favorites saved by older versions carry `direction: 'en-fa'`, `'en-to-fa'`, or an already formatted `'EN → FA'`. All three must render `EN → FA`. Pinned in Task 4.
4. Grammar lesson with `direction=fa-to-en`: the original is Persian and must still render right-to-left while the explanation stays left-to-right. Pinned in Task 5.
5. Floating box closed mid-stream: the port disconnects within the same tick, so no further deltas arrive and the service worker aborts the provider request. Pinned in Task 7.

---

### Task 1: Review banner button colours and `color-scheme`

**Files:**
- Modify: `popup/popup.css:1735-1760`
- Modify: `lib/design-tokens.css` (the `:root` block and the dark block starting near line 270)
- Test: `tests/popup-review-banner.test.js` (create), `tests/design-tokens.test.js` (extend)

**Interfaces:**
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing tests**

```js
// tests/popup-review-banner.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const css = fs.readFileSync(path.resolve(__dirname, '../popup/popup.css'), 'utf8');
function rule(selector) {
  const m = css.match(new RegExp(selector.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
}
describe('review banner buttons', () => {
  it('primary button label is not painted in its own background colour', () => {
    const body = rule('.review-btn-primary');
    expect(body).toMatch(/background:\s*var\(--color-warning-500\)/);
    expect(body).toMatch(/color:\s*#fff(fff)?|color:\s*var\(--color-gray-50\)/);
  });
  it('primary hover differs from rest', () => {
    expect(rule('.review-btn-primary:hover')).not.toMatch(/background:\s*var\(--color-warning-500\)/);
  });
});
```

Add to `tests/design-tokens.test.js`:

```js
it('declares color-scheme for both themes', () => {
  expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
  expect(css).toMatch(/\[data-theme=['"]dark['"]\][^{]*\{[^}]*color-scheme:\s*dark/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/popup-review-banner.test.js tests/design-tokens.test.js`
Expected: FAIL on the colour assertion and on `color-scheme`.

- [ ] **Step 3: Fix the CSS**

In `popup/popup.css`: `.review-btn-primary { background: var(--color-warning-500); color: #ffffff; }`, hover `background: var(--color-warning-600)` if that token exists, otherwise `filter: brightness(0.92)`. `.review-btn-secondary` keeps its text colour and gets `background: var(--color-warning-100)` on hover. In `lib/design-tokens.css`: add `color-scheme: light;` to `:root` and `color-scheme: dark;` to the dark selector block (`:root.dark, :root[data-theme='dark']`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/popup-review-banner.test.js tests/design-tokens.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add popup/popup.css lib/design-tokens.css tests/popup-review-banner.test.js tests/design-tokens.test.js
git commit -m "fix(popup): make the Rate Now label visible and declare color-scheme"
```

---

### Task 2: Settings dictionary labels

**Files:**
- Modify: `lib/i18n.js` (add `translateEnToFaHint`, `translateFaToEnHint` to `en` and `fa`)
- Modify: `settings/settings.html:109,119`
- Test: `tests/i18n-keys.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// tests/i18n-keys.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { translations } from '../lib/i18n.js';
const html = fs.readFileSync(path.resolve(__dirname, '../settings/settings.html'), 'utf8');
describe('settings dictionary card', () => {
  it('label and hint use different keys that exist in both locales', () => {
    for (const key of ['translateEnToFa', 'translateEnToFaHint', 'translateFaToEn', 'translateFaToEnHint']) {
      expect(translations.en[key], key).toBeTruthy();
      expect(translations.fa[key], key).toBeTruthy();
    }
    expect(translations.en.translateEnToFa).not.toBe(translations.en.translateEnToFaHint);
    expect(html).toMatch(/class="toggle-hint" data-i18n="translateEnToFaHint"/);
    expect(html).toMatch(/class="toggle-hint" data-i18n="translateFaToEnHint"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/i18n-keys.test.js`
Expected: FAIL, `translateEnToFaHint` undefined.

- [ ] **Step 3: Add the keys and point the hint spans at them**

`en`: `translateEnToFa: 'Show Persian translation for English words'`, `translateEnToFaHint: 'Dictionary entries for English words include the Persian meaning.'`, and the mirror pair for FA to EN. `fa`: equivalent Persian. Change the two `toggle-hint` spans in `settings/settings.html` to the `…Hint` keys.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/i18n-keys.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.js settings/settings.html tests/i18n-keys.test.js
git commit -m "fix(settings): give the dictionary toggles their own hint strings"
```

---

### Task 3: Welcome page theme toggle in dark mode

**Files:**
- Modify: `welcome/welcome.html:22-31` (the two SVGs inside `#theme-toggle`)
- Modify: `welcome/welcome.css:129-153`
- Test: `tests/welcome-theme-toggle.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// tests/welcome-theme-toggle.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'welcome/welcome.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'welcome/welcome.css'), 'utf8');
describe('welcome theme toggle', () => {
  it('uses stylesheet-defined icon classes, not Tailwind names', () => {
    expect(html).not.toMatch(/dark:block|dark:hidden/);
    expect(html).toMatch(/<button id="theme-toggle"[^>]*aria-label=/);
    expect(html).toMatch(/class="theme-icon theme-icon-sun"/);
    expect(html).toMatch(/class="theme-icon theme-icon-moon"/);
  });
  it('shows exactly one icon per theme', () => {
    expect(css).toMatch(/\.theme-icon\s*\{[^}]*width:\s*20px/);
    expect(css).toMatch(/\.theme-icon-sun\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.dark \.theme-icon-sun\s*\{[^}]*display:\s*block/);
    expect(css).toMatch(/\.dark \.theme-icon-moon\s*\{[^}]*display:\s*none/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/welcome-theme-toggle.test.js`
Expected: FAIL, `dark:block` present.

- [ ] **Step 3: Replace the icon classes and style them**

In the HTML: give the button `aria-label="Toggle theme"`, the sun SVG `class="theme-icon theme-icon-sun" aria-hidden="true"`, the moon SVG `class="theme-icon theme-icon-moon" aria-hidden="true"`. In the CSS: `.theme-icon { width: 20px; height: 20px; }`, `.theme-icon-sun { display: none; }`, `.dark .theme-icon-sun { display: block; }`, `.dark .theme-icon-moon { display: none; }`, and `.dark .theme-btn { color: var(--gray-100); }` so the icon is light on the dark button.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/welcome-theme-toggle.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add welcome/welcome.html welcome/welcome.css tests/welcome-theme-toggle.test.js
git commit -m "fix(welcome): show the theme toggle icon in dark mode"
```

---

### Task 4: One direction label formatter

**Files:**
- Create: `lib/direction-label.js`
- Modify: `history/history.js:401-409` (delete `formatDirectionBadge`, import the new one), `favorites/favorites.js:161,171`, `newtab/newtab.js:263`, `popup/popup.js:302-310`
- Test: `tests/direction-label.test.js` (create)

**Interfaces:**
- Produces: `export function directionLabel(direction: string): string` returning `'EN → FA'`, `'FA → EN'`, or `''` when unknown. Accepts `'en-to-fa'`, `'en-fa'`, `'EN → FA'`, `'en→fa'`, any case, surrounding whitespace, and `undefined`.

- [ ] **Step 1: Write the failing test**

```js
// tests/direction-label.test.js
import { describe, it, expect } from 'vitest';
import { directionLabel } from '../lib/direction-label.js';
describe('directionLabel', () => {
  it.each([
    ['en-to-fa', 'EN → FA'], ['en-fa', 'EN → FA'], ['EN → FA', 'EN → FA'], ['en→fa', 'EN → FA'],
    ['fa-to-en', 'FA → EN'], ['FA-EN', 'FA → EN'], [' fa-to-en ', 'FA → EN']
  ])('%s -> %s', (input, expected) => expect(directionLabel(input)).toBe(expected));
  it('returns empty for unknown or missing input', () => {
    expect(directionLabel(undefined)).toBe('');
    expect(directionLabel('xx-yy')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/direction-label.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `directionLabel` in `lib/direction-label.js`**

Normalise: lower-case, strip whitespace, split on `/-to-|-|→|\s*→\s*/`, keep the first and last two-letter codes, require both to be `en` or `fa` and different. Format `${a.toUpperCase()} → ${b.toUpperCase()}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/direction-label.test.js`
Expected: PASS

- [ ] **Step 5: Use it in the four call sites**

Replace each page's local formatter or raw `item.direction` with `directionLabel(...)`. In `favorites/favorites.js:161` and `newtab/newtab.js:263` the fallback `'EN → FA'` goes away: an empty label renders no badge. Each badge element gets `dir="ltr"`.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: all pass; `dist/` builds.

- [ ] **Step 7: Commit**

```bash
git add lib/direction-label.js tests/direction-label.test.js history/history.js favorites/favorites.js newtab/newtab.js popup/popup.js
git commit -m "fix(ui): format direction badges in one place instead of showing storage values"
```

---

### Task 5: Grammar page content direction

**Files:**
- Modify: `grammar/grammar.js:189-195, 360-393` and the example renderer near line 440 (where `example.target` is written)
- Modify: `grammar/grammar.css:934-952`
- Test: `tests/grammar-direction.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// tests/grammar-direction.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'grammar/grammar.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'grammar/grammar.css'), 'utf8');
describe('grammar lesson direction', () => {
  it('never sets the whole lesson right-to-left', () => {
    expect(js).not.toMatch(/lessonContent\.setAttribute\('dir', 'rtl'\)/);
    expect(js).not.toMatch(/loadingSection\?\.setAttribute\('dir', 'rtl'\)/);
  });
  it('marks Persian runs individually', () => {
    expect(js).toMatch(/dir="rtl" lang="fa"[^>]*>\$\{escapeHtml\(example\.target\)\}/);
  });
  it('scopes the Persian font to Persian text, not to every descendant', () => {
    expect(css).not.toMatch(/\[dir="rtl"\]\s*\*\s*\{/);
    expect(css).toMatch(/\[lang="fa"\]\s*\{[^}]*font-family:\s*var\(--font-persian\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grammar-direction.test.js`
Expected: FAIL on all three.

- [ ] **Step 3: Change the page**

Delete the `contentIsRtl` blocks at `grammar/grammar.js:189-195` and `380-393`. Keep the original/translation `dir` logic at `360-374` but add `lang="fa"` wherever `dir="rtl"` is set. In the example template, render `example.target` inside `<div class="example-target" dir="rtl" lang="fa">`. In `grammar/grammar.css` replace the `[dir="rtl"], [dir="rtl"] *` rule with `[lang="fa"], [dir="rtl"] { font-family: var(--font-persian); }` and remove the `#lesson-content[dir="rtl"]` block. The UI-language RTL (Persian interface) still comes from `html[dir="rtl"]` set by `applyTranslations`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grammar-direction.test.js`
Expected: PASS

- [ ] **Step 5: Check it by eye**

Run: `npm run build`, load `dist/` unpacked, open `chrome-extension://<id>/grammar/grammar.html?original=I%20would%20like%20to%20book%20a%20table&translation=%D9%85%DB%8C%E2%80%8C%D8%AE%D9%88%D8%A7%D9%87%D9%85&direction=en-to-fa`.
Expected: English explanation left-aligned with trailing periods; Persian example targets right-aligned in Vazirmatn.

- [ ] **Step 6: Commit**

```bash
git add grammar/grammar.js grammar/grammar.css tests/grammar-direction.test.js
git commit -m "fix(grammar): lay English lesson text out left-to-right"
```

---

### Task 6: Popup status line, separate from the error box

**Files:**
- Modify: `popup/popup.html:379-382` (error section) and add the status line directly above it
- Modify: `popup/popup.js:1285-1300` (`showError`), and the eight secondary-action failure sites at lines 1079, 1114, 1455, 1980, 2078, 2139, 2201, 2225, plus the "Copied" feedback at 1087
- Modify: `popup/popup.css` (style `.status-line`)
- Test: `tests/popup-status-line.test.js` (create)

**Interfaces:**
- Produces: `function showNotice(message: string, tone: 'success' | 'warning' = 'success'): void` in `popup/popup.js`. Writes to `#status-line`, never hides outputs, clears itself after 3000 ms.

- [ ] **Step 1: Write the failing test**

```js
// tests/popup-status-line.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
describe('popup feedback channels', () => {
  it('has a polite status line and an assertive error box', () => {
    expect(html).toMatch(/<div id="status-line" class="status-line" role="status" aria-live="polite">/);
    expect(html).toMatch(/<div id="error-section" class="error-section" role="alert"/);
  });
  it('secondary actions report through showNotice, not showError', () => {
    expect(js).toMatch(/function showNotice\(message, tone = 'success'\)/);
    for (const handler of ['copyTranslation', 'copyPolish', 'toggleFavorite', 'regeneratePolish']) {
      const body = js.slice(js.indexOf(`function ${handler}`));
      const end = body.indexOf('\nfunction ');
      expect(body.slice(0, end), handler).not.toMatch(/showError\(/);
    }
  });
});
```

Adjust the four handler names to the real function names at the listed lines before running; the assertion is that none of them calls `showError`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/popup-status-line.test.js`
Expected: FAIL, no `#status-line`.

- [ ] **Step 3: Add the status line and route secondary failures to it**

HTML: `<div id="status-line" class="status-line" role="status" aria-live="polite"></div>` above the error section; add `role="alert"` to the error section. JS: implement `showNotice`; replace `showError(...)` with `showNotice(t('…'), 'warning')` at the eight sites, with i18n keys `copyFailed`, `favoriteFailed`, `regenerateFailed` added to `lib/i18n.js` in both locales, each ending in a next step ("Try again."). Route "Copied" through `showNotice(t('copied'))`. CSS: `.status-line { min-height: 18px; font-size: var(--text-xs); font-weight: 600; color: var(--color-success); } .status-line.is-warning { color: var(--color-warning); }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/popup-status-line.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add popup/popup.html popup/popup.js popup/popup.css lib/i18n.js tests/popup-status-line.test.js
git commit -m "fix(popup): keep the translation on screen when a secondary action fails"
```

---

### Task 7: Abort the stream when the floating box closes

**Files:**
- Modify: `content/main.js` near line 83 (declare `let boxAbortController = null;`), the `translateAndShow` request near lines 253-300, and `removeFloatingBox` at 1232-1252
- Test: `tests/client.test.js` (extend)

**Interfaces:**
- Consumes: `requestTranslation(payload, { onDelta, signal })` from `lib/translation/client.js`.

- [ ] **Step 1: Write the failing test**

Add to `tests/client.test.js`, using its existing port stub:

```js
it('disconnects the port when the signal aborts mid-stream', async () => {
  const controller = new AbortController();
  const promise = requestTranslation({ text: 'a long passage '.repeat(40), mode: 'text' }, { signal: controller.signal });
  controller.abort();
  const result = await promise;
  expect(result.errorCode).toBe('ABORTED');
  expect(port.disconnect).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run tests/client.test.js`
Expected: PASS if the client already handles abort (it does at `client.js:55-63`); keep the test as the pin. If it fails, fix the client first.

- [ ] **Step 3: Wire an AbortController into the floating box**

In `translateAndShow`: `boxAbortController?.abort(); boxAbortController = new AbortController();` before the request; pass `signal: boxAbortController.signal` to `requestTranslation`. In `removeFloatingBox`: `boxAbortController?.abort(); boxAbortController = null;` as the first lines. The ABORTED result is already ignored by the caller.

- [ ] **Step 4: Verify in the browser**

Run: `npm run build`, load `dist/`, select a long paragraph on any page, press Alt+T, press Escape while the text is still streaming. Open the service worker console.
Expected: no further `delta` messages after the box closes; the provider fetch is aborted (network tab shows the request cancelled).

- [ ] **Step 5: Commit**

```bash
git add content/main.js tests/client.test.js
git commit -m "fix(content): abort the translation stream when the floating box closes"
```

---

### Task 8: Confirm destructive actions

**Files:**
- Modify: `settings/settings.js:703-716` (`handleClearApiKey`), `settings/settings.js:938-945` (replace import)
- Modify: `popup/popup.js:534-537` (reset stats)
- Modify: `lib/i18n.js` (add `confirmClearApiKey`, `confirmReplaceImport` in `en` and `fa`)
- Test: `tests/i18n-keys.test.js` (extend), `tests/destructive-confirm.test.js` (create)

- [ ] **Step 1: Write the failing tests**

```js
// tests/destructive-confirm.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'settings/settings.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
describe('destructive actions ask first', () => {
  it('clear API key confirms before removing', () => {
    const body = settings.slice(settings.indexOf('async function handleClearApiKey'));
    expect(body.indexOf("t('confirmClearApiKey'")).toBeLessThan(body.indexOf('removeProviderApiKey('));
  });
  it('replace import confirms before writing', () => {
    expect(settings).toMatch(/isReplace && !confirm\(t\('confirmReplaceImport'/);
  });
  it('reset stats uses the two-tap confirm', () => {
    const body = popup.slice(popup.indexOf('resetStatsBtn.addEventListener'));
    expect(body.slice(0, 600)).toMatch(/tapToConfirm/);
  });
});
```

Extend `tests/i18n-keys.test.js` to require `confirmClearApiKey` and `confirmReplaceImport` in both locales.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/destructive-confirm.test.js tests/i18n-keys.test.js`
Expected: FAIL.

- [ ] **Step 3: Add the confirmations**

`handleClearApiKey`: `if (!confirm(t('confirmClearApiKey', currentLang).replace('{provider}', config.name))) return;` before `removeProviderApiKey`. Import: after computing `isReplace`, `if (isReplace && !confirm(t('confirmReplaceImport', currentLang))) return;`. Reset stats: copy the two-stage pattern used by the Clear All history button (first click sets the label to `t('tapToConfirm')` and arms a 3 s timer; second click resets).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/destructive-confirm.test.js tests/i18n-keys.test.js`
Expected: PASS

- [ ] **Step 5: Run everything and commit**

Run: `npm test && npm run lint && npm run build`

```bash
git add settings/settings.js popup/popup.js lib/i18n.js tests/destructive-confirm.test.js tests/i18n-keys.test.js
git commit -m "fix(settings): confirm before clearing a key, replacing data or resetting stats"
```

---

### Task 9: Spacing rhythm

**Files:**
- Modify: `lib/design-tokens.css` (`:root`: add semantic spacing tokens)
- Modify: `popup/popup.css` (`.popup`, `.header`, `.section`, `.output-section`, `.polish-card`, `.polish-section`, `.history-item`, `.input-footer`)
- Modify: `shared/card/styles.js` (every `gap` and the footer action padding)
- Modify: `history/history.css`, `favorites/favorites.css` (card inset and the gaps inside a card and between cards)
- Modify: `settings/settings.css` (`.toggle-row` vertical padding, `.card-content` gap)
- Test: `tests/spacing-rhythm.test.js` (create)

**Interfaces:**
- Produces in `lib/design-tokens.css`: `--space-inset-card: var(--space-5)` (20px, inside any card), `--space-stack-section: var(--space-6)` (24px, between sections), `--space-stack-group: var(--space-4)` (16px, between related blocks), `--space-stack-item: var(--space-3)` (12px, between items in a list), `--space-inline-actions: var(--space-2)` (8px, between buttons in a row). The mockups on the ParsiPad UI Proposals canvas use these values.
- The shared card cannot read page tokens (it also renders in the content script's shadow root), so it keeps literal px values on the same scale.

- [ ] **Step 1: Write the failing test**

```js
// tests/spacing-rhythm.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { CARD_STYLES } from '../shared/card/styles.js';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tokens = read('lib/design-tokens.css');
const rule = (css, sel) => (css.match(new RegExp(sel.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}')) || [, ''])[1];
describe('spacing rhythm', () => {
  it('defines the semantic spacing tokens', () => {
    for (const t of ['--space-inset-card', '--space-stack-section', '--space-stack-group', '--space-stack-item', '--space-inline-actions'])
      expect(tokens, t).toMatch(new RegExp(t + ':\\s*var\\(--space-\\d\\)'));
  });
  it('the card never packs things closer than 8px', () => {
    const gaps = [...CARD_STYLES.matchAll(/gap:\s*(\d+)px/g)].map(m => Number(m[1]));
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(8);
  });
  it('cards on every page use the card inset', () => {
    expect(rule(read('popup/popup.css'), '.popup')).toMatch(/padding:\s*var\(--space-inset-card\)/);
    expect(rule(read('popup/popup.css'), '.polish-card')).toMatch(/padding:\s*var\(--space-inset-card\)/);
    expect(rule(read('history/history.css'), '.history-card')).toMatch(/padding:\s*var\(--space-inset-card\)/);
    expect(rule(read('favorites/favorites.css'), '.favorite-card')).toMatch(/padding:\s*var\(--space-inset-card\)/);
  });
  it('settings rows have room to breathe', () => {
    expect(rule(read('settings/settings.css'), '.toggle-row')).toMatch(/padding:\s*1\.125rem 0/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spacing-rhythm.test.js`
Expected: FAIL, tokens missing and card gaps of 4, 5 and 6px.

- [ ] **Step 3: Apply the rhythm**

Tokens per Interfaces. Popup: `.popup` padding `var(--space-inset-card)`; `.header` margin-bottom `var(--space-stack-section)`; sections separated by `var(--space-stack-section)`; `.input-footer` margin-top `var(--space-stack-item)`; `.polish-card` padding `var(--space-inset-card)`; `.polish-section` and `.history-list` gap `var(--space-stack-item)`. Card: raise every gap below 8px to 8px, card-level gaps of 10 to 12px to 16px, footer action buttons padding `6px 10px` with an 8px gap so each target is at least 32px tall. History and Favorites: card padding `var(--space-inset-card)`, the list between cards `var(--space-stack-item)`, inside a card `var(--space-stack-item)` between header, original and translation. Settings: `.toggle-row` padding `1.125rem 0`, `.card-content` gap `1.25rem`.

- [ ] **Step 4: Run test and the suite**

Run: `npx vitest run tests/spacing-rhythm.test.js && npm test`
Expected: PASS; no other test regresses (card tests assert structure, not spacing).

- [ ] **Step 5: Compare against the mockups**

Run: `npm run build`, load `dist/`, screenshot the popup with a word result, Settings General, History with three items. Compare with the canvas.
Expected: no two interactive controls closer than 8px; card content inset 20px; sections visibly separated.

- [ ] **Step 6: Commit**

```bash
git add lib/design-tokens.css popup/popup.css shared/card/styles.js history/history.css favorites/favorites.css settings/settings.css tests/spacing-rhythm.test.js
git commit -m "fix(ui): give cards, rows and action groups consistent breathing room"
```

---

### Task 10: Review prompt that actually fires

**Files:**
- Create: `lib/review-prompt.js`
- Modify: `lib/constants.js` (`STORAGE_KEYS.reviewPrompt = 'review_prompt'`; keep the two legacy keys for migration), `lib/storage.js:727-757` (replace `shouldShowReviewPrompt`, `dismissReviewPrompt`, `markReviewClicked` with thin wrappers over the new module)
- Modify: `background/service-worker.js` (after every successful translate, polish, dictionary, block and page batch result: `await recordTranslationSuccess()`; new message case `REVIEW_PROMPT_STATE` returning `{ show: boolean }`; `REVIEW_PROMPT_RESPONSE` with `{ response: 'rated' | 'later' | 'never' }`)
- Modify: `popup/popup.html:385-397` (banner gets a third button `#review-never-btn`, `data-i18n="dontAskAgain"`; move the banner so it sits directly under `#output-section`), `popup/popup.js:2258-2295` (call `checkReviewPrompt()` only after a result renders at lines 1038 and after polish renders, not at line 170 on open; wire the three responses)
- Modify: `content/main.js` (after the card renders in the floating box: ask `REVIEW_PROMPT_STATE`; when `show`, append `<div class="parsipad-review-line">` to the footer with a link `t('rateParsipad')` and a `t('later')` button; link opens the store URL through `OPEN_URL` or `chrome.tabs.create` in the worker and sends `rated`; button sends `later`), `content/styles/index.js` (one rule block)
- Modify: `lib/i18n.js` (`dontAskAgain`, `rateParsipad`, `later`, `enjoyingParsipad` already exists)
- Test: `tests/review-prompt.test.js` (create)

**Interfaces:**
- Produces in `lib/review-prompt.js`:
  - `export const REVIEW_RULES = Object.freeze({ minSuccesses: 15, minDaysSinceInstall: 3, minActiveDays: 2, snoozeDays: [14, 45], maxShows: 3 })`.
  - `export function emptyReviewState(now: number): ReviewState` where `ReviewState = { installedAt: number, successes: number, activeDays: string[] /* 'YYYY-MM-DD', max 30 kept */, shownCount: number, lastShownAt: number | null, snoozedUntil: number | null, rated: boolean, optedOut: boolean }`.
  - `export function recordSuccess(state: ReviewState, now: number): ReviewState` (pure; increments `successes`, adds today's day key once).
  - `export function shouldShowReview(state: ReviewState, now: number): boolean` applying every rule: not rated, not opted out, `shownCount < maxShows`, `now >= snoozedUntil` when set, `successes >= minSuccesses`, `now - installedAt >= minDaysSinceInstall days`, `activeDays.length >= minActiveDays`.
  - `export function applyResponse(state: ReviewState, response: 'shown' | 'rated' | 'later' | 'never', now: number): ReviewState` (pure; `shown` increments `shownCount` and sets `lastShownAt`; `later` sets `snoozedUntil` to `now + snoozeDays[min(shownCount - 1, snoozeDays.length - 1)]` days; `rated` and `never` set their flags).
  - `export function migrateLegacyReviewState(legacy: { dismissed?: boolean, clicked?: boolean }, state: ReviewState): ReviewState` (`clicked` → `rated: true`; `dismissed` → one `later` applied at migration time, not `optedOut`).
- `lib/storage.js` wrappers: `getReviewState()`, `saveReviewState(state)`, `recordTranslationSuccess()`, `shouldShowReviewPrompt()`, `respondToReviewPrompt(response)`; `installedAt` is set the first time the state is created.

- [ ] **Step 1: Write the failing test**

```js
// tests/review-prompt.test.js
import { describe, it, expect } from 'vitest';
import { REVIEW_RULES, emptyReviewState, recordSuccess, shouldShowReview, applyResponse, migrateLegacyReviewState } from '../lib/review-prompt.js';
const DAY = 86400000;
const t0 = Date.UTC(2026, 9, 1);
function eligible() {
  let s = emptyReviewState(t0);
  for (let d = 0; d < 3; d++) for (let i = 0; i < 5; i++) s = recordSuccess(s, t0 + d * DAY);
  return s;
}
describe('shouldShowReview', () => {
  it('is false on a fresh install', () => expect(shouldShowReview(emptyReviewState(t0), t0)).toBe(false));
  it('is true after 15 successes over 2+ days and 3 days since install', () => {
    expect(shouldShowReview(eligible(), t0 + 3 * DAY)).toBe(true);
  });
  it('is false when successes came on a single day', () => {
    let s = emptyReviewState(t0);
    for (let i = 0; i < 20; i++) s = recordSuccess(s, t0);
    expect(shouldShowReview(s, t0 + 5 * DAY)).toBe(false);
  });
  it('is false before 3 days since install', () => expect(shouldShowReview(eligible(), t0 + 2 * DAY)).toBe(false));
  it('never shows again after rated or never', () => {
    expect(shouldShowReview(applyResponse(eligible(), 'rated', t0 + 3 * DAY), t0 + 90 * DAY)).toBe(false);
    expect(shouldShowReview(applyResponse(eligible(), 'never', t0 + 3 * DAY), t0 + 90 * DAY)).toBe(false);
  });
  it('later snoozes 14 days, then 45, then stops after the third show', () => {
    let s = eligible(); const show = t0 + 3 * DAY;
    s = applyResponse(applyResponse(s, 'shown', show), 'later', show);
    expect(shouldShowReview(s, show + 13 * DAY)).toBe(false);
    expect(shouldShowReview(s, show + 14 * DAY)).toBe(true);
    const show2 = show + 14 * DAY;
    s = applyResponse(applyResponse(s, 'shown', show2), 'later', show2);
    expect(shouldShowReview(s, show2 + 44 * DAY)).toBe(false);
    expect(shouldShowReview(s, show2 + 45 * DAY)).toBe(true);
    const show3 = show2 + 45 * DAY;
    s = applyResponse(applyResponse(s, 'shown', show3), 'later', show3);
    expect(s.shownCount).toBe(REVIEW_RULES.maxShows);
    expect(shouldShowReview(s, show3 + 400 * DAY)).toBe(false);
  });
});
describe('migrateLegacyReviewState', () => {
  it('maps clicked to rated and dismissed to a snooze', () => {
    expect(migrateLegacyReviewState({ clicked: true }, eligible()).rated).toBe(true);
    const s = migrateLegacyReviewState({ dismissed: true }, eligible());
    expect(s.optedOut).toBe(false);
    expect(s.snoozedUntil).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/review-prompt.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/review-prompt.js` per Interfaces**

Day keys from `new Date(now).toISOString().slice(0, 10)`; keep the last 30 keys. `migrateLegacyReviewState` applies `applyResponse(state, 'later', Date.now())` for `dismissed` without incrementing `shownCount`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/review-prompt.test.js`
Expected: PASS

- [ ] **Step 5: Wire storage, worker, popup and floating box**

Per Files. In the worker, count a success where `handleTranslate`, `handlePolish`, `handleDictionaryLookup` and the streaming port's `done` already update usage stats, so one call sits next to each. The popup banner shows only after a result renders and calls `respondToReviewPrompt('shown')` once per popup session. The floating box line appears once per eligibility window: the worker's `REVIEW_PROMPT_STATE` handler applies `shown` when it answers `true`, so a second box in the same window gets `false`.

- [ ] **Step 6: Extend the worker test**

Add to `tests/service-worker.test.js`, using its store and `sendMessage`:

```js
it('REVIEW_PROMPT_STATE answers false on a fresh install and marks a show when true', async () => {
  expect((await sendMessage({ action: 'REVIEW_PROMPT_STATE' })).show).toBe(false);
  const DAY = 86400000; const now = Date.now();
  store.set('review_prompt', { installedAt: now - 10 * DAY, successes: 20, activeDays: ['2026-10-01', '2026-10-02'], shownCount: 0, lastShownAt: null, snoozedUntil: null, rated: false, optedOut: false });
  expect((await sendMessage({ action: 'REVIEW_PROMPT_STATE' })).show).toBe(true);
  expect(store.get('review_prompt').shownCount).toBe(1);
  expect((await sendMessage({ action: 'REVIEW_PROMPT_STATE' })).show).toBe(false);
});
```

Run: `npx vitest run tests/service-worker.test.js tests/review-prompt.test.js`
Expected: PASS

- [ ] **Step 7: See it once**

Run: `npm run build`, load `dist/`, in the worker console set `chrome.storage.local.set({ review_prompt: { installedAt: Date.now() - 10 * 86400000, successes: 20, activeDays: ['2026-10-01', '2026-10-02'], shownCount: 0, lastShownAt: null, snoozedUntil: null, rated: false, optedOut: false } })`, then translate something in the popup and once in a page.
Expected: the banner appears under the popup result with three readable buttons; the floating box shows the one-line prompt; after Later, neither shows again.

- [ ] **Step 8: Commit**

```bash
git add lib/review-prompt.js lib/storage.js lib/constants.js background/service-worker.js popup content/main.js content/styles/index.js lib/i18n.js tests/review-prompt.test.js tests/service-worker.test.js
git commit -m "feat(review): ask for a rating after real use, with snooze and backoff"
```

---

### Task 11: Release

- [ ] **Step 1: Changelog**

Add a `### Fixed` list and a `### Changed` entry for the review prompt under `## [Unreleased]` in `CHANGELOG.md`, one entry per task in the repo's explanatory style (what the user saw, why it happened, what changed).

- [ ] **Step 2: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all green. Load `dist/` unpacked and walk: popup review banner (set `review_prompt` state so it shows), Settings General and Providers tabs, Welcome in dark, History and Favorites with a saved item, grammar page, floating box Escape mid-stream.

- [ ] **Step 3: Commit and merge**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for the UI phase 1 fixes"
git checkout main && git merge --no-ff fix/ui-phase-1 -m "Merge fix/ui-phase-1: visible UI defects from the 2026-10-23 review"
```

Version bump is a separate decision; this merge does not bump.
