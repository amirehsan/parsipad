# Firefox Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ParsiPad for Firefox desktop from the same source as the Chrome build, ready to submit to addons.mozilla.org, and point the landing page's Firefox visitors at it.

**Architecture:** Every runtime difference between the browsers lives in a new `lib/platform.js`, detected by the extension's own URL scheme. The build script derives a Firefox manifest from `manifest.json` with a pure, tested function and writes a second output, `dist-firefox/`. Release tooling packages a Chrome zip, a Firefox zip and the source zip AMO's reviewers require.

**Tech Stack:** Plain ES modules, esbuild 0.24, Vitest 2 with happy-dom, ESLint 9, Mozilla `web-ext` 10.8.

**Spec:** `docs/superpowers/specs/2026-10-24-firefox-port-design.md`

## Global Constraints

- Firefox add-on ID: `parsipad@parsipad.com`. Never changes once published.
- `strict_min_version`: `"140.0"`. esbuild target for the Firefox build: `firefox140`.
- Data collection: `data_collection_permissions: { required: ["websiteContent"] }`.
- AMO slug `parsipad`. Listing: `https://addons.mozilla.org/firefox/addon/parsipad/`. Reviews: `https://addons.mozilla.org/firefox/addon/parsipad/reviews/`.
- Output folders: Chrome `dist/` (unchanged), Firefox `dist-firefox/` (git-ignored, ESLint-ignored).
- No `webextension-polyfill`; existing `chrome.*` calls stay as they are.
- The Chrome package must not change in behaviour. Every Chrome test keeps passing with the same meaning.
- Only `lib/platform.js` asks which browser it is running in.
- Release version: `3.9.0` (minor). Its bump is its own commit: `chore(release): bump version to 3.9.0`.
- Nothing under `landing/` is ever staged or committed.
- Code, comments and copy use no em dashes and no emojis. Commit messages carry no Claude or Claude Code attribution and no `Co-Authored-By` line.
- Work on branch `feat/firefox-port`, cut from `main`.

## Review Focus

1. **The content script after an extension reload.** `chrome.runtime.getURL` throws "Extension context invalidated" in an orphaned content script. `isFirefox()` must return false rather than throw, because i18n calls it on every lookup. Pinned in Task 1.
2. **A top site whose favicon is missing or is not a `data:image/` URL.** It gets the letter tile and is never fetched, since a remote favicon request would leak the user's most visited sites. Pinned in Task 5.
3. **Firefox's default bookmarks tree.** It contains `place:` smart-folder queries, and folders that hold nothing else. Those rows and the folders left empty must not appear. Pinned in Task 5.
4. **The Chrome manifest object must survive the transform.** `firefoxManifest()` must not mutate its input; the Chrome build writes the same object. Pinned in Task 6.
5. **Middle-clicking or opening in a new tab "Rate ParsiPad" in Firefox.** That bypasses the click handler, so the `href` itself must point at AMO. Pinned in Task 3.

---

### Task 0: Branch and commit the design

- [ ] **Step 1: Branch**

```bash
git switch -c feat/firefox-port main
```

- [ ] **Step 2: Commit the spec and this plan**

```bash
git add docs/superpowers/specs/2026-10-24-firefox-port-design.md docs/superpowers/plans/2026-10-24-firefox-port.md
git commit -m "docs: design and plan the Firefox port"
```

---

### Task 1: The platform module

**Files:**
- Create: `lib/platform.js`
- Modify: `lib/constants.js:401-402` (add `AMO_REVIEWS_URL` beside `STORE_REVIEWS_URL`)
- Test: `tests/platform.test.js`

**Interfaces:**
- Produces, all named exports of `lib/platform.js`:
  - `isFirefox(): boolean`
  - `openSidebar(target?: { windowId?: number, tabId?: number }): Promise<boolean>`. It resolves false when the browser has no sidebar API. It calls the browser API synchronously, before any `await`.
  - `storeReviewsUrl(): string`
  - `openShortcutSettings(): Promise<void>`
  - `browserNewTabUrl(): string`
- Produces in `lib/constants.js`: `export const AMO_REVIEWS_URL = 'https://addons.mozilla.org/firefox/addon/parsipad/reviews/';`

- [ ] **Step 1: Write the failing tests** in `tests/platform.test.js`.
  - `stubChrome(base)` sets `globalThis.chrome` with `runtime.getURL: (p = '') => base + p`, `sidePanel.open`, `tabs.create` and `windows`.
  - `stubFirefox()` sets `globalThis.chrome` with only `runtime.getURL` (base `moz-extension://abc/`) and `tabs.create`, with no `sidePanel`, as in real Firefox. It also sets `globalThis.browser = { sidebarAction: { open: vi.fn(async () => {}) }, commands: { openShortcutSettings: vi.fn(async () => {}) } }`.
  - `afterEach` deletes both globals.

  `openSidebar` uses `chrome.sidePanel` when it exists, then `browser.sidebarAction`, and otherwise resolves false.

```js
it('is Firefox only when the extension URL is moz-extension', () => {
  stubChrome('chrome-extension://abc/'); expect(isFirefox()).toBe(false);
  stubChrome('moz-extension://abc/'); expect(isFirefox()).toBe(true);
});
it('is not Firefox, and does not throw, when the extension context is gone', () => {
  globalThis.chrome = { runtime: { getURL: () => { throw new Error('Extension context invalidated.'); } } };
  expect(isFirefox()).toBe(false);
  delete globalThis.chrome; expect(isFirefox()).toBe(false);
});
it('opens Chrome\'s panel for a tab, or else for a window', async () => {
  stubChrome('chrome-extension://abc/');
  expect(await openSidebar({ tabId: 7 })).toBe(true);
  expect(chrome.sidePanel.open).toHaveBeenLastCalledWith({ tabId: 7 });
  await openSidebar({ windowId: 3 });
  expect(chrome.sidePanel.open).toHaveBeenLastCalledWith({ windowId: 3 });
});
it('opens Firefox\'s sidebar synchronously, before the returned promise settles', () => {
  stubFirefox();
  openSidebar({ windowId: 3 });
  expect(browser.sidebarAction.open).toHaveBeenCalledTimes(1);
});
it('resolves false where there is no sidebar API at all', async () => {
  globalThis.chrome = { runtime: { getURL: (p = '') => 'chrome-extension://abc/' + p } };
  expect(await openSidebar({ tabId: 1 })).toBe(false);
});
it('names each browser\'s own review page', () => {
  stubChrome('chrome-extension://abc/'); expect(storeReviewsUrl()).toBe(STORE_REVIEWS_URL);
  stubFirefox(); expect(storeReviewsUrl()).toBe('https://addons.mozilla.org/firefox/addon/parsipad/reviews/');
});
it('opens shortcut settings the way each browser allows', async () => {
  stubChrome('chrome-extension://abc/'); await openShortcutSettings();
  expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
  stubFirefox(); await openShortcutSettings();
  expect(browser.commands.openShortcutSettings).toHaveBeenCalledTimes(1);
});
it('names the browser\'s own New Tab', () => {
  stubChrome('chrome-extension://abc/'); expect(browserNewTabUrl()).toBe('chrome://new-tab-page/');
  stubFirefox(); expect(browserNewTabUrl()).toBe('about:home');
});
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/platform.test.js`
Expected: FAIL, cannot resolve `../lib/platform.js`.

- [ ] **Step 3: Implement `lib/platform.js` and the constant.** Read `chrome` through `globalThis` so it works in tests and in an orphaned content script. Wrap `getURL` in try/catch. Firefox's sidebar is `globalThis.browser.sidebarAction`. Write the file header comment in the house style: why the module exists, and why it uses URL-scheme detection rather than the user agent (see the spec).

- [ ] **Step 4: Run and see it pass**

Run: `npx vitest run tests/platform.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/platform.js lib/constants.js tests/platform.test.js
git commit -m "feat(platform): one module for the Chrome and Firefox differences"
```

---

### Task 2: Open the sidebar through the platform module

**Files:**
- Modify: `background/service-worker.js:751-753` (`handleOpenSidePanel`)
- Modify: `popup/popup.js:386-396` (the `openSidePanelBtn` click handler)
- Modify: `library/library.js:356-357` (`openInPanel`)
- Test: `tests/sidepanel-open.test.js`, `tests/service-worker.test.js`

**Interfaces:**
- Consumes: `openSidebar`, `isFirefox` from Task 1.

- [ ] **Step 1: Update the source-shape tests** in `tests/sidepanel-open.test.js`. In "opens the panel before any other await in the click handler" and "opens the panel with a window id cached at init", replace the `chrome.sidePanel.open` expectations with these:
  - the handler body contains `openSidebar({ windowId })`
  - the body contains `isFirefox() ? undefined : currentWindowId ?? (await chrome.windows.getCurrent()).id`
  - the text before `await openSidebar` holds exactly one `await`, and that `await` comes after `isFirefox() ?`

  Add a test: `library/library.js` `openInPanel` contains `openSidebar({ windowId })` and no `await`.

- [ ] **Step 2: Add a Firefox case** to `tests/service-worker.test.js`, next to the `OPEN_SIDE_PANEL` tests (around line 551). Make `chrome.sidePanel` undefined, have `chrome.runtime.getURL` return `moz-extension://abc/...`, and set `globalThis.browser = { sidebarAction: { open: vi.fn(async () => {}) } }`. Then `await sendMessage({ action: 'OPEN_SIDE_PANEL' }, { tab: { id: 42 } })` resolves `{ success: true }` and `browser.sidebarAction.open` was called once. Restore the stub afterwards.

- [ ] **Step 3: Run and see them fail**

Run: `npx vitest run tests/sidepanel-open.test.js tests/service-worker.test.js`
Expected: FAIL on the new and changed assertions.

- [ ] **Step 4: Implement.**
  - `handleOpenSidePanel(tabId)` becomes `{ success: tabId !== undefined && await openSidebar({ tabId }) }`.
  - The popup handler computes `windowId` per the test line above, then `await openSidebar({ windowId })` and `window.close()`.
  - `openInPanel` calls `openSidebar({ windowId }).catch(...)`.
  - Update the comments that name `sidePanel.open()` so they say "the sidebar".
  - Leave `chrome.sidePanel.setPanelBehavior` (already guarded) as it is.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add background/service-worker.js popup/popup.js library/library.js tests/sidepanel-open.test.js tests/service-worker.test.js
git commit -m "feat(sidebar): open Firefox's sidebar where Chrome opens its side panel"
```

---

### Task 3: Links into each browser's own pages

**Files:**
- Modify: `background/service-worker.js:142` (review prompt "rated")
- Modify: `popup/popup.js:2004` (`handleReviewRateClick`), and its init, which sets `#review-rate-btn`'s `href`
- Modify: `settings/settings.html:667` (add `id="about-rate-link"`), and `settings/settings.js`, which sets its `href` at init
- Modify: `settings/settings.js:694-698` (Customize shortcuts)
- Modify: `newtab/newtab.js:31,278-291` (drop `CHROME_NEW_TAB`; rename `openChromeNewTab` to `openBrowserNewTab`)
- Test: `tests/popup-review-banner.test.js`, `tests/newtab-page-dom.test.js`, new `tests/platform-links.test.js`

**Interfaces:**
- Consumes: `storeReviewsUrl`, `openShortcutSettings`, `browserNewTabUrl` from Task 1.

- [ ] **Step 1: Write the failing tests.**
  - `tests/popup-review-banner.test.js:101`: expect `chrome.tabs.create({ url: storeReviewsUrl() })`.
  - New `tests/platform-links.test.js`, source-shape tests in the style of `sidepanel-open.test.js`:
    - `popup.js` assigns `reviewRateBtn.href = storeReviewsUrl()`, or equivalent, inside `init`. This pins Review Focus 5.
    - `settings.js` sets `about-rate-link`'s `href` from `storeReviewsUrl()`.
    - `settings.js` calls `openShortcutSettings()` and no longer contains `chrome://extensions/shortcuts`.
    - `service-worker.js` opens `storeReviewsUrl()`.
    - No file outside `lib/platform.js` and `tests/` contains `chrome://new-tab-page` or `chrome://extensions/shortcuts`.
  - `tests/newtab-page-dom.test.js`, beside "opens Chrome's own New Tab in this tab": with `installChrome` given a Firefox base URL, the off-state button calls `chrome.tabs.update` with a properties object whose `url` is `'about:home'`. When that rejects, `#nt-off-fallback` is shown. Give `installChrome` a `base` option (default `chrome-extension://parsipad/`) that feeds `runtime.getURL`.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run tests/popup-review-banner.test.js tests/platform-links.test.js tests/newtab-page-dom.test.js`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement** the edits listed under Files. The HTML `href`s keep their Chrome value as the static default, so the Chrome page reads the same before script runs.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add background/service-worker.js popup/popup.js settings/settings.html settings/settings.js newtab/newtab.js tests/popup-review-banner.test.js tests/platform-links.test.js tests/newtab-page-dom.test.js
git commit -m "feat(platform): rating, shortcut and New Tab links for each browser"
```

---

### Task 4: Firefox wording

**Files:**
- Modify: `lib/i18n.js:1121-1123` (`t`), plus English and Persian Firefox variants
- Modify: `manifest.json` `web_accessible_resources` (add `lib/platform.js`, since `lib/i18n.js` is in the content-script graph)
- Test: new `tests/i18n-firefox.test.js`. `tests/web-accessible-resources.test.js` must stay green.

**Interfaces:**
- Consumes: `isFirefox` from Task 1.
- Produces: the convention that a key `<name>Firefox` overrides `<name>` in Firefox. `t(key, lang)` resolves in this order: `translations[lang][key + 'Firefox']` (Firefox only), `translations.en[key + 'Firefox']` (Firefox only), then today's chain.

- [ ] **Step 1: Write the failing tests** in `tests/i18n-firefox.test.js`:

```js
const VARIANTS = ['shortcutNotSetHint', 'shortcutsFixedNote', 'newTabOpenChrome', 'newTabOpenChromeFailed',
  'newTabEnabledHint', 'newTabRecentsHint', 'newTabRecentsDenied'];
it('has a Firefox variant for every Chrome-specific string, in both languages', () => {
  for (const key of VARIANTS) for (const lang of ['en', 'fa'])
    expect(translations[lang][`${key}Firefox`], `${lang}.${key}Firefox`).toBeTruthy();
});
it('names no Chrome in any Firefox variant', () => {
  for (const lang of ['en', 'fa']) for (const [k, v] of Object.entries(translations[lang]))
    if (k.endsWith('Firefox')) expect(v, k).not.toMatch(/Chrome|chrome:\/\/|کروم/);
});
it('every Firefox variant overrides a real key', () => { /* base key exists in en */ });
it('t() picks the variant only in Firefox', () => {
  globalThis.chrome = { runtime: { getURL: (p = '') => 'moz-extension://abc/' + p } };
  expect(t('newTabOpenChrome', 'fa')).toBe(translations.fa.newTabOpenChromeFirefox);
  globalThis.chrome.runtime.getURL = (p = '') => 'chrome-extension://abc/' + p;
  expect(t('newTabOpenChrome', 'fa')).toBe(translations.fa.newTabOpenChrome);
});
```

  Also grep the UI strings for any other "Chrome" or "کروم" that is wrong in Firefox, and add each one to `VARIANTS`.

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/i18n-firefox.test.js`
Expected: FAIL, the variants are missing.

- [ ] **Step 3: Implement** the `t` lookup order and write the variants, matching the tone of their Chrome originals.
  - Shortcuts live under Firefox's "Add-ons and themes, gear menu, Manage Extension Shortcuts".
  - The New Tab button reads "Open Firefox Home".
  - Firefox asks for the top-sites permission the same way Chrome does.

  Add `lib/platform.js` to `web_accessible_resources`.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS, including `web-accessible-resources.test.js` and `i18n-keys.test.js`.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.js manifest.json tests/i18n-firefox.test.js
git commit -m "feat(i18n): Firefox wording where the text names Chrome"
```

---

### Task 5: New Tab icons and bookmarks in Firefox

**Files:**
- Modify: `lib/top-sites.js` (`toTile`, `getTopSites`)
- Modify: `newtab/newtab.js` (`siteIcon`, `bookmarkLink`, `isOpenable`, `hasBookmarks`), and `newtab/newtab.css` for a bookmark initial
- Test: `tests/top-sites.test.js`, `tests/newtab-page-dom.test.js`, `tests/platform-links.test.js`

**Interfaces:**
- Consumes: `isFirefox` from Task 1.
- Produces: tiles shaped `{ url, title, host, initial, favicon? }`, where `favicon` is present only when it is a string that starts with `data:image/`.

- [ ] **Step 1: Write the failing tests.**
  - In `tests/top-sites.test.js`:
    - `getTopSites()` calls `chrome.topSites.get` with no arguments under a Chrome base URL, and with `{ includeFavicon: true }` under a Firefox base URL.
    - `toTile` keeps `favicon: 'data:image/png;base64,AA'`.
    - `toTile` drops `favicon` given `'https://evil.example/f.ico'`, `''` or `42`. This pins Review Focus 2.
  - In `tests/newtab-page-dom.test.js`, Firefox base URL:
    - A tile with a data favicon renders `<img src="data:image/...">`.
    - A tile without one shows its `.nt-tile-initial` and has no `img`.
    - No element's `src` contains `_favicon`.
    - A Firefox tree holding `{ title: 'Recent Tags', url: 'place:type=6&sort=14' }`, a folder that contains only a `place:` entry, and a `file:///` bookmark shows none of the three. The `https` bookmarks still show, each with an initial. This pins Review Focus 3.
  - In `tests/platform-links.test.js`: in `settings/settings.js` `handleNewTabRecentsChange`, the first `await` in the checked branch is `requestTopSitesPermission()`, because Firefox enforces the user-action rule.

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run tests/top-sites.test.js tests/newtab-page-dom.test.js tests/platform-links.test.js`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement.**
  - `siteIcon(url, fallback, favicon)` uses `faviconUrl(url)` in Chrome, and `favicon`, or no `img` at all, in Firefox.
  - `bookmarkLink` passes a `.nt-bookmark-initial` fallback built from `tileInitial`.
  - In Firefox, `isOpenable` also requires `isLinkableUrl(url)`. `hasBookmarks` uses `isOpenable`, so a folder holding only unopenable entries disappears.
  - Chrome rendering stays byte-for-byte the same.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/top-sites.js newtab/newtab.js newtab/newtab.css tests/top-sites.test.js tests/newtab-page-dom.test.js tests/platform-links.test.js
git commit -m "feat(newtab): Firefox's own favicons, and only bookmarks Firefox can open"
```

---

### Task 6: The Firefox build

**Files:**
- Create: `scripts/manifest-targets.mjs`
- Modify: `scripts/build.mjs` (target flag, out dir, esbuild target, manifest writer)
- Modify: `package.json` (scripts, `engines.node` to `>=20.0.0` because web-ext 10 needs it, devDependency `web-ext@^10.8.0`), `package-lock.json`
- Modify: `.gitignore` (add `dist-firefox/`), `eslint.config.js` ignores (add `dist-firefox/**`)
- Test: new `tests/manifest-firefox.test.js`

**Interfaces:**
- Produces, from `scripts/manifest-targets.mjs`:
  - `export const FIREFOX_ADDON_ID = 'parsipad@parsipad.com'`
  - `export const FIREFOX_MIN_VERSION = '140.0'`
  - `export function firefoxManifest(manifest: object): object`, a new object; the input is untouched.
- Produces npm scripts:
  - `build`: both targets
  - `build:chrome` and `build:firefox`
  - `build:dev` and `build:watch`, which take `-- --browser=firefox` and default to chrome
  - `lint:firefox`: `web-ext lint --source-dir dist-firefox`
  - `start:firefox`: `web-ext run --source-dir dist-firefox`
- `build.mjs` accepts `--browser=chrome|firefox|all`, default `all`.

- [ ] **Step 1: Write the failing tests** in `tests/manifest-firefox.test.js`, against the real `manifest.json`:

```js
const fx = firefoxManifest(chromeManifest);
it('runs the worker file as a module background script', () => {
  expect(fx.background).toEqual({ scripts: ['background/service-worker.js'], type: 'module' });
});
it('swaps the side panel for a sidebar that does not open at install', () => {
  expect(fx.side_panel).toBeUndefined();
  expect(fx.sidebar_action).toEqual({ default_panel: 'sidepanel/sidepanel.html',
    default_title: '__MSG_extensionName__', default_icon: chromeManifest.icons, open_at_install: false });
});
it('drops the Chrome-only permissions and keeps the rest', () => {
  expect(fx.permissions).toEqual(chromeManifest.permissions.filter(p => p !== 'sidePanel' && p !== 'favicon'));
});
it('declares the ID, the minimum version and the data it sends', () => {
  expect(fx.browser_specific_settings).toEqual({ gecko: { id: 'parsipad@parsipad.com',
    strict_min_version: '140.0', data_collection_permissions: { required: ['websiteContent'] } } });
});
it('keeps everything else as Chrome has it', () => {
  for (const key of ['version', 'commands', 'chrome_url_overrides', 'web_accessible_resources',
    'optional_permissions', 'options_page', 'content_scripts', 'host_permissions', 'action'])
    expect(fx[key], key).toEqual(chromeManifest[key]);
});
it('leaves the Chrome manifest untouched', () => {
  const before = structuredClone(chromeManifest); firefoxManifest(chromeManifest);
  expect(chromeManifest).toEqual(before);
});
```

- [ ] **Step 2: Run and see it fail**

Run: `npx vitest run tests/manifest-firefox.test.js`
Expected: FAIL, cannot resolve `../scripts/manifest-targets.mjs`.

- [ ] **Step 3: Implement** `manifest-targets.mjs`, then wire `build.mjs`.
  - The out dir is `dist` for chrome and `dist-firefox` for firefox.
  - `COMMON.target` is `chrome120` for Chrome and `firefox140` for Firefox.
  - `writeManifest` writes `firefoxManifest(...)` for Firefox.
  - `clean()` removes only the target's own dir.
  - Watch mode builds one target.
  - Install the dependency with `npm install -D web-ext@^10.8.0`, then edit the scripts, engines and ignores.

- [ ] **Step 4: Build and lint**

Run: `npm test && npm run lint && npm run build && npm run lint:firefox`
Expected:
- Tests and lint pass.
- The Chrome manifest is still copied verbatim: `diff manifest.json dist/manifest.json` prints nothing.
- `web-ext lint` reports 0 errors.

  Record every warning in the commit body, and fix each one that is ours rather than a known false positive. For example, an `innerHTML` assignment that already goes through DOMPurify is a false positive.

- [ ] **Step 5: Commit**

```bash
git add scripts/manifest-targets.mjs scripts/build.mjs package.json package-lock.json .gitignore eslint.config.js tests/manifest-firefox.test.js
git commit -m "build: produce a Firefox package from the same source"
```

---

### Task 7: CI and packaging

**Files:**
- Modify: `.github/workflows/ci.yml` (`build` job)
- Create: `scripts/package.mjs`
- Modify: `package.json` (add a `package` script)

**Interfaces:**
- Consumes: the `npm run build` and `npm run lint:firefox` scripts from Task 6.
- Produces: `npm run package`, which reads the version from `manifest.json` and writes into `store-assets/`:
  - `parsipad-vX.Y.Z.zip` (the contents of `dist/`)
  - `parsipad-vX.Y.Z-firefox.zip` (the contents of `dist-firefox/`)
  - `parsipad-vX.Y.Z-source.zip`, from `git archive --format=zip HEAD`

  It refuses to run with a dirty working tree, because the source zip must match the build.

- [ ] **Step 1: CI.** The build job:
  - runs `npm run build`
  - checks the same five files in `dist-firefox/`
  - runs `npm run lint:firefox`
  - uploads `dist-firefox/` as artifact `parsipad-extension-firefox`, beside the existing one

- [ ] **Step 2: Implement `scripts/package.mjs`.** Use `execFileSync('zip', ['-r', '-X', out, '.'], { cwd })` so the files sit at the zip root, and `git archive` for the source zip.

- [ ] **Step 3: Commit.** The package script needs a clean tree, so commit before trying it.

```bash
git add .github/workflows/ci.yml scripts/package.mjs package.json
git commit -m "build: package Chrome, Firefox and source zips, and lint Firefox in CI"
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm run package && unzip -l store-assets/parsipad-v3.8.1-firefox.zip | head && unzip -l store-assets/parsipad-v3.8.1-source.zip | grep -c landing/`
Expected:
- `manifest.json` is listed at the zip root.
- The `landing/` count is `0`.
- With an uncommitted edit, `npm run package` refuses and names the problem.

  Delete these trial zips afterwards; the real ones are made at release. A fix found here gets its own commit.

---

### Task 8: Documentation, store text and release chores

**Files:**
- Modify: `store-assets/DESCRIPTION.txt:86,120`, `store-assets/STORE_LISTING.md:107` (browser-neutral wording; leave the file's Chrome heading)
- Modify: `PRIVACY.md:13,15,21,54,60` ("the browser's storage", "your bookmarks")
- Modify: `CONTRIBUTING.md`
  - a "Building from source" section that AMO reviewers can follow on Ubuntu 24.04 with Node 24: `npm ci`, `npm run build`, Firefox output in `dist-firefox/`, Node >= 20
  - the manual test step names Firefox
- Modify: `CLAUDE.md` "Every change ships with its release chores"
  - step 4 runs `npm run lint:firefox` and `npm run package`, and lists all three zips
  - a sentence says the Firefox zip and the source zip go to AMO with every version
- Create (untracked, git-ignored): `store-assets/AMO_LISTING.md`
  - name, a summary of 250 characters or fewer, the description (from `DESCRIPTION.txt`)
  - categories: Language Support, Productivity
  - homepage `https://parsipad.com`, support URL (GitHub issues), privacy policy URL
  - notes for reviewers: the user brings their own AI key; a free Gemini key from Google AI Studio works for testing; build steps as in `CONTRIBUTING.md`
  - "not compatible with Android"

- [ ] **Step 1: Make the edits.** Plain prose, matching each file's style. `npm test` stays green, since `store-copy.test.js` reads the store text.

- [ ] **Step 2: Commit**

```bash
git add -f store-assets/DESCRIPTION.txt store-assets/STORE_LISTING.md
git add PRIVACY.md CONTRIBUTING.md CLAUDE.md
git commit -m "docs: build steps for Firefox, browser-neutral store text and release chores"
```

---

### Task 9: Manual check in Firefox and Zen, then release 3.9.0

- [ ] **Step 1: Run the build in Firefox.** Run `npm run build:firefox && npm run start:firefox`, which opens Firefox with a clean profile and ParsiPad loaded. For Zen, load `dist-firefox/manifest.json` from `about:debugging#/runtime/this-firefox` > "Load Temporary Add-on".

- [ ] **Step 2: Ehsan walks the spec's manual list** (spec, "Testing") in both browsers, with his own API key, and records Alt+D's behaviour on macOS. Any failure becomes a fix inside the task that owns the code, with a test, before going on.

- [ ] **Step 3: Changelog.** Under `## [Unreleased]`, add an `### Added` entry in the existing style. It covers what the user sees (ParsiPad on Firefox and Firefox-based browsers, the sidebar, Firefox's own icons on tiles, and the Firefox wording), why (it was Chrome-only), and what changed.

```bash
git add CHANGELOG.md
git commit -m "docs(release): describe the Firefox build"
```

- [ ] **Step 4: Bump to 3.9.0.**
  - Change `manifest.json`, `package.json`, and both top-level `version` fields in `package-lock.json`.
  - Rename `## [Unreleased]` to `## [3.9.0] - <today>`, and open a fresh `## [Unreleased]` above it.

```bash
git add manifest.json package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): bump version to 3.9.0"
```

- [ ] **Step 5: Verify and package**

Run: `npm test && npm run lint && npm run build && npm run lint:firefox && npm run package`
Expected:
- Every step passes.
- `store-assets/` holds `parsipad-v3.9.0.zip`, `parsipad-v3.9.0-firefox.zip` and `parsipad-v3.9.0-source.zip`.

- [ ] **Step 6: Merge.** Merge into `main` with `--no-ff` and the message `Merge feat/firefox-port: ParsiPad 3.9.0`, the same as earlier releases, once Ehsan says so. Pushing also waits for his go-ahead.

---

### Task 10: AMO submission, then the landing page

- [ ] **Step 1 (Ehsan):**
  - Create the AMO developer account.
  - Submit `parsipad-v3.9.0-firefox.zip` as a listed add-on, with slug `parsipad`.
  - Upload `parsipad-v3.9.0-source.zip` when AMO asks for source.
  - Paste the listing from `store-assets/AMO_LISTING.md`, and leave Android unchecked.
  - Upload the Chrome zip to the Chrome Web Store as usual.

- [ ] **Step 2: Landing page, once the AMO listing is public.** In `landing/index.html`:
  - Browser detection: a desktop user agent matching `/Firefox\//` and not `/Android|Mobile/` returns `"Firefox"`. For Firefox, every `.browser-cta` gets `href = 'https://addons.mozilla.org/firefox/addon/parsipad/'`, and the existing label swap turns "Chrome" into "Firefox".
  - Rewrite the comment above the script. It covers Zen, LibreWolf, Floorp and Waterfox, which send Firefox's user agent and install from AMO.
  - Add the AMO URL to the JSON-LD `installUrl`.
  - Update the "Which browsers" FAQ answer in both the JSON-LD and the HTML (lines 145 and 900), to say Chrome, Chromium-based browsers and Firefox, but not Safari.
  - Make the same change in `llms.txt` and `llms-full.txt`.
  - Deploy as `CLAUDE.md` describes: `npm run build:css`, preview, check the CTAs in Firefox, Zen and Chrome, then promote with `--scope personal-46ddfab5`.
  - Back up `landing/` outside the repo. Never stage it.

- [ ] **Step 3: README.** Add a "Firefox Add-ons" install section with the listing link and the badge `https://img.shields.io/amo/v/parsipad`, and update the browser sentence on line 89.

```bash
git add README.md
git commit -m "docs(readme): install from Firefox Add-ons"
```
