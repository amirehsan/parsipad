# Firefox port design

Date: 2026-10-24. Source: a conversation with Ehsan, a read of every
Chrome-specific call in ParsiPad 3.8.1, MDN's browser compatibility data, and
the Firefox Add-ons (AMO) policy pages. A plan will implement it.

## Intent

Ehsan uses Firefox (157 on macOS) and Zen, a Firefox-based browser, and wants
ParsiPad there, published on addons.mozilla.org for anyone to install. It is
the same extension: same features, same look, same settings, built from the
same source. Ehsan asked that it follow industry best practice throughout.

## Goals

- One source tree produces two packages: the Chrome package as today, and a
  Firefox package that AMO accepts.
- Every feature works in Firefox desktop as it does in Chrome, with exactly
  three visible differences, which Ehsan approved:
  1. The side panel opens in Firefox's sidebar. Same page, but Firefox draws
     its own header above it and the user picks the side.
  2. New Tab site tiles use the icon Firefox supplies with its top-sites list,
     falling back to the existing letter tile. Chrome's favicon service does
     not exist in Firefox.
  3. The two places that link to Chrome-internal pages (Chrome's own New Tab,
     and chrome://extensions/shortcuts) get Firefox equivalents or a Firefox
     note.
- Releases ship both packages every time, with the chores in `CLAUDE.md`
  covering both stores.
- The landing page's install buttons send Firefox-family visitors to the AMO
  listing.

## Non-goals

- Firefox for Android. Its extension support lacks the sidebar, context menus
  and commands. AMO treats Android compatibility as opt-in; leave it off.
- Safari, and a Manifest V2 build.
- `webextension-polyfill`. Firefox's MV3 implementation exposes the `chrome`
  namespace with promise-returning methods, so the existing `chrome.*` calls
  work unchanged. Mozilla and Chrome both document this.
- A separate Firefox copy of any page or module.

## Anti-goals

- Any change Chrome users can see. The Chrome package must come out the same
  as before apart from the version number.
- Browser checks scattered through the code. Differences live in one small
  module.
- Committing anything under `landing/`.
- A Firefox build that quietly drops a feature beyond the three differences
  above. If something cannot work, it is raised, not hidden.

## Constraints and verified facts

- Firefox does not run extension service workers. MV3 extensions use
  `background.scripts`, which may be an ES module (`type: "module"`, Firefox
  112+). The page is an event page and unloads when idle, like the service
  worker. The worker uses nothing service-worker-only (`self.registration`,
  `clients`, `importScripts`): checked.
- `sidebarAction.open()` works only inside a user action (an extension button
  click, a context-menu click, a command). The call must happen before any
  `await` in the handler, and a gesture does not survive `runtime.sendMessage`.
  Chrome's `sidePanel.open()` has the same rule, so the existing code is already
  shaped for it.
- `sidebar_action.open_at_install` defaults to true. The welcome page already
  opens on install, so it must be set to false.
- Supported in Firefox at or below the minimum version chosen here:
  `storage.session` and its `onChanged` (115), `options_page` (126),
  `commands.openShortcutSettings()` (137, Firefox only), `topSites.get` with
  `includeFavicon` (63, Firefox only; Chrome's `topSites.get` takes no options),
  and `tabs.captureVisibleTab` with `activeTab` (126). `storage.session
  .setAccessLevel` is not supported in Firefox; ParsiPad does not use it.
- `tabs.create` and `tabs.update` in Firefox refuse `chrome:`, `file:`, `data:`,
  `javascript:` and privileged `about:` URLs. `about:blank` is allowed. MDN
  does not say whether `about:home` is allowed.
- AMO requires `browser_specific_settings.gecko.id` for MV3, and since
  2025-11-03 every new extension must declare
  `browser_specific_settings.gecko.data_collection_permissions`. Firefox shows
  that declaration in the install prompt from version 140. Older versions need
  a custom consent screen, which `strict_min_version` of 140 avoids.
- AMO requires the source code for any bundled or minified upload, with a
  README that lists the OS, tool versions and exact build commands. Reviewers
  default to Ubuntu 24.04, Node 24, npm 11. It must be uploaded with every
  version; a repository link is not described as an alternative.
- The first time an extension's New Tab shows, Firefox shows a one-off notice,
  "Your new tab has changed", with "Keep Changes" and "Manage New Tabs". In
  Firefox 157 the second button opens Settings > Home, where the user can
  choose Firefox Home for new tabs; it does not disable the add-on. Checked in
  the shipped `ext-url-overrides.js` and `ExtensionControlledPopup.sys.mjs`:
  the popup only falls back to disabling when no settings location is given,
  and New Tab gives one. Every New Tab extension gets this notice, and it
  cannot be suppressed. Decision: keep the New Tab override in Firefox, with no
  extra warning.
- Zen 1.23.4b ships no user-agent override (checked in its bundled prefs), so
  its `navigator.userAgent` is identical to Firefox's. A web page cannot tell
  Zen from Firefox. The same holds for LibreWolf, Floorp and Waterfox. AMO
  installs into all of them, so the link is correct for every one.

## Decisions

### Build

- `scripts/build.mjs` gains a browser target. `npm run build` builds both:
  Chrome into `dist/` (unchanged path, so the existing load-unpacked folder,
  CI check and zip step keep working) and Firefox into `dist-firefox/`.
  `build:dev` and `build:watch` take the same target. `dist-firefox/` is
  git-ignored and ESLint-ignored.
- The esbuild target for the Firefox build is `firefox140`.
- `manifest.json` stays the single source. The Firefox manifest is derived by
  a pure, unit-tested function (in `scripts/`) that:
  - replaces `background.service_worker` with
    `background.scripts: ["background/service-worker.js"]`, keeping
    `type: "module"`. The file keeps its name to avoid churn.
  - removes `side_panel` and the `sidePanel` and `favicon` permissions.
  - adds `sidebar_action` with `default_panel: "sidepanel/sidepanel.html"`,
    `default_title: "__MSG_extensionName__"`, the existing icons, and
    `open_at_install: false`.
  - adds `browser_specific_settings.gecko` with the add-on ID,
    `strict_min_version: "140.0"` and the data collection declaration.
  - keeps everything else, including `options_page`, `commands`,
    `chrome_url_overrides`, `web_accessible_resources` and `optional_permissions`.
- Mozilla's `web-ext` CLI becomes a dev dependency: `web-ext lint` runs against
  `dist-firefox/` in CI and as an npm script, and `web-ext run` launches a
  clean Firefox profile with the build loaded for manual testing.

### Runtime differences live in one module

A new module (for example `lib/platform.js`) owns every browser difference and
uses feature detection, not user-agent sniffing:

- `isFirefox()`: true when the extension's own base URL
  (`chrome.runtime.getURL('')`) starts with `moz-extension://`. This works in
  every context, content scripts included; `runtime.getBrowserInfo` does not
  exist in Firefox content scripts, and the i18n module that needs the answer
  also runs there.
- `openSidebar({ windowId, tabId })`: calls `chrome.sidePanel.open` where it
  exists, otherwise `browser.sidebarAction.open()`. It must call the browser
  API synchronously, so callers keep their existing "no await before this"
  rule. Used by the popup button, the Library's open-in-sidebar call
  (`library/library.js`), the context-menu item and the `OPEN_SIDE_PANEL`
  handler. Nothing sends `OPEN_SIDE_PANEL` today except tests, so its
  gesture loss over messaging does not matter in practice.
- The store review URL (calls 2026-10-24, Claude's): Chrome keeps
  `STORE_REVIEWS_URL`; Firefox uses
  `https://addons.mozilla.org/firefox/addon/parsipad/reviews/`. The slug
  `parsipad` was free on AMO when checked, and Ehsan claims it at submission.
  Every rating link reads from the module, including the hard-coded `href`s in
  `popup/popup.html`, `sidepanel/sidepanel.html` and `settings/settings.html`.
  Pointing a Firefox user at the store they installed from is a correction,
  not a new visible difference.
- The optional `topSites` permission request runs with no `await` before it in
  its click handler, since Firefox enforces the user-action rule strictly.
- The shortcut-settings opener: `chrome.tabs.create` to
  `chrome://extensions/shortcuts` in Chrome, `commands.openShortcutSettings()`
  in Firefox.
- The browser's own New Tab URL (see below).

Callers import from this module. `chrome.sidePanel.setPanelBehavior` is
already guarded and stays as is.

### Side panel

- The panel page, its script and its CSS are reused unchanged. It already
  detects itself by `data-surface="panel"` and scopes itself to its window with
  `windows.getCurrent()`, which returns the sidebar's window in Firefox.
- In the popup's "Open in sidebar" handler, the Firefox path calls
  `sidebarAction.open()` before anything else and needs no window id.

### Favicons on New Tab tiles

- In Firefox, top sites are fetched with
  `topSites.get({ includeFavicon: true })`. Each tile carries the returned
  `favicon` (a data URL from Firefox's own cache, so nothing leaves the
  browser). When a site has none, the existing letter fallback shows.
- Bookmark rows in Firefox have no icon source, so they use the same fallback.
- Chrome keeps `_favicon` exactly as now.

### Chrome-internal links and wording

- "Open Chrome's New Tab" (off state of the New Tab override): in Firefox,
  label it for Firefox and try `tabs.update` to `about:home`. If Firefox
  refuses, the existing failure path already shows the "turn it back on in
  Settings" note. If testing shows `about:home` is always refused, the Firefox
  build hides the button and shows that note directly.
- "Customize shortcuts" in Settings: Firefox calls
  `commands.openShortcutSettings()`.
- User-facing strings that name Chrome and are wrong in Firefox get Firefox
  variants in both English and Persian: `shortcutNotSetHint`,
  `shortcutsFixedNote`, `newTabOpenChrome`, `newTabOpenChromeFailed`,
  `newTabEnabledHint`, `newTabRecentsHint`, `newTabRecentsDenied`. Any other
  "Chrome" found in UI strings, HTML or locale files is checked the same way.
- Bookmarks whose URL Firefox cannot open from an extension (`place:` queries,
  `file:`, privileged `about:`) are left out of the Firefox bookmark list
  rather than shown as links that do nothing.

### Store package and listing

- Add-on ID: `parsipad@parsipad.com`. It is permanent once published.
- Data collection: `required: ["websiteContent"]`. Selected page text goes
  to the AI provider the user picked, which is "handled outside the add-on",
  and page URLs and titles are not sent (checked). AMO's review may ask for
  changes; follow its wording if so.
- Every release produces three zips in `store-assets/`:
  `parsipad-vX.Y.Z.zip` (Chrome, as today), `parsipad-vX.Y.Z-firefox.zip` (or
  the `web-ext build` output, renamed), and `parsipad-vX.Y.Z-source.zip`
  (`git archive` of the release commit, which leaves out untracked `landing/`
  by construction). A packaging script does all three so it is not done by hand.
- A short reviewer-facing build section (in `CONTRIBUTING.md`, or a
  `BUILDING.md` the README links to) lists Node and npm versions, `npm ci`, and
  `npm run build`, and says where the Firefox output lands. It is written so it
  works on the reviewers' default Ubuntu and Node 24 setup.
- Ehsan creates the AMO developer account and submits the listing; Claude
  prepares every file and the listing text.
- One store description serves both stores (Ehsan's decision). The lines in
  `store-assets/DESCRIPTION.txt` and `store-assets/STORE_LISTING.md` that name
  Chrome (the New Tab permission prompt, the button back to the browser's own
  New Tab, the keyboard shortcut settings) are reworded to fit both browsers.
  This slightly changes the Chrome listing text, which is accepted. Release
  chore 1 keeps covering the same three tracked files. `PRIVACY.md` is
  reworded the same way ("the browser's storage", "your bookmarks").

### Release chores and docs

- `CLAUDE.md` "Every change ships with its release chores" step 4 is updated
  to build and verify both packages, run `web-ext lint`, and produce all three
  zips, and to name both stores.
- This change is a minor version: 3.9.0, with a changelog entry.
- README gains a Firefox install section once the listing is live, and
  CONTRIBUTING's manual test step adds Firefox. PRIVACY.md is checked for
  Chrome-only wording.
- Apart from the browser-neutral rewording above, the Chrome store
  description does not change.

### Landing page (after the AMO listing is live)

- The CTA script gains a Gecko branch: a user agent containing `Firefox/`
  (which covers Firefox, Zen, LibreWolf, Floorp and Waterfox) switches every
  `.browser-cta` href to the AMO listing and its label to "Add to Firefox".
  Desktop only; Firefox for Android and iOS keep today's behaviour.
- The FAQ answer "Which browsers does ParsiPad work in?", its JSON-LD copy,
  the `installUrl` list in the JSON-LD, the code comment above the CTA script,
  and `llms.txt` / `llms-full.txt` are updated to include Firefox.
- Deployed per `CLAUDE.md`: preview, check in Firefox, Zen and Chrome, then
  promote. Never committed.

## Testing

- Unit tests (Vitest, matching the existing style): the manifest transform;
  `lib/platform.js` branches with stubbed `chrome` and `browser`; the popup and
  context-menu sidebar paths calling the API before any await; Firefox favicon
  and fallback tiles; the shortcut opener; the New Tab fallback; the Firefox
  string variants exist in both languages. The existing Chrome tests stay green
  and unchanged in meaning.
- CI builds both targets, checks the required files in both, and runs
  `web-ext lint` (errors fail the build; warnings are reviewed once and either
  fixed or noted).
- Manual run in Firefox 157 and Zen via `web-ext run`, covering: install (no
  sidebar pops open, welcome page shows), every context-menu item, all four
  shortcuts (Alt+D is Firefox's address-bar key on Windows and Linux; confirm
  which wins on macOS and record it), the selection toolbar and hover icon,
  page translate, screenshot translate, the popup, the sidebar from the popup
  and the context menu, the selection chip in the sidebar, Settings including
  Customize shortcuts, New Tab with and without top sites, bookmarks, Library,
  Practice, Grammar, theme switching, Persian fonts inside pages with strict
  CSP, speech, the rating links (they open AMO), and the first-New-Tab notice
  ("Manage New Tabs" opens Settings and leaves ParsiPad on).

## Left to the builder

- Exact file names for the platform module and the manifest transform.
- How the build script's target flag is spelled.
- Whether the Firefox string variants are separate keys or a placeholder.
- How to word the Firefox variants, matching the existing English and Persian
  tone.
