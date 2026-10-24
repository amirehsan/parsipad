# Redesign phases C to F

Date: 2026-10-24. Addendum to
`docs/superpowers/specs/2026-10-23-ui-review-and-side-panel-design.md`. That
spec covered Phase 1 (3.2.0, shipped) and the side panel with the popup
rework (Plan B, 3.3.0). This one records the owner's decisions for the
remaining phases and what each covers. Findings are cited from the audit at
`.superpowers/sdd/2026-10-23-side-panel-and-popup/ui-audit-report.md`
(sections B to G); its line numbers predate 3.2.0 and drift by a few lines.

## Binding decisions

1. **New Tab is dropped from the package.** Flashcards move into a Practice
   view reachable from the side panel and the Library. The
   `chrome_url_overrides.newtab` override, the `bookmarks` permission, the
   optional `topSites` permission, and every file that only served them
   (`newtab/`, `lib/top-sites.js`, the New Tab settings) are removed. The
   `favicon` permission is used only by `lib/top-sites.js` and goes with it.
   Existing favorites are untouched and feed Practice. The store
   description, permission justifications, privacy text, README and landing
   page drop the bookmark and most-visited claims.
2. **The Persian-interface RTL rework stays held**: no logical-property
   sweep, no mirrored layouts, no Persian digits or Persian calendar in the
   UI. Only content-level direction is fixed (`dir`, `lang`, `<bdi>` on
   Persian and mixed runs) where a task touches that code anyway. The shared
   formatter keeps one locale constant so the held phase can switch digits
   and calendar in one place.
3. **Grammar lessons explain in Persian by default**, with English examples
   and English quiz options, and a per-lesson toggle between English and
   Persian explanations using the same pill as the key how-to ("English" /
   "فارسی"). The prompt takes a language parameter, the lesson cache key
   includes the language, and the lesson page sets `dir` and `lang` per
   block.
4. **One release per phase**, in order: 3.4.0 (C), 3.5.0 (D), 3.6.0 (E),
   3.7.0 (F). Each follows CLAUDE.md "Every change ships with its release
   chores", merges into `main` with `--no-ff`, and is pushed.
5. Commit messages use a conventional prefix with a scope and carry no
   attribution trailer. No em dashes or emoji in code or copy. Every
   user-visible string goes through `t()` with `en` and `fa`.
6. New CSS uses the semantic spacing tokens: `--space-inset-card` (20px),
   `--space-stack-section` (24px), `--space-stack-group` (16px),
   `--space-stack-item` (12px), `--space-inline-actions` (8px).

## Phase C, 3.4.0: Library and Practice

One `library/library.html` replaces History and Favorites: tabs History,
Favorites, Grammar lessons; search on every tab; type chips All,
Translations, Dictionary, Polishes; a direction select; cards grouped by
day, original and translation side by side; per-card actions as real
buttons (favorite toggle, copy, open in side panel, open lesson, delete with
an Undo toast). Filters and search live in the URL query; search is
debounced. Dictionary history, stored since 2.x but never shown, appears
under the Dictionary chip. A saved grammar lesson reopens on the lesson page
from storage with no new request. `history/history.html` and
`favorites/favorites.html` redirect to the Library. Practice
(`practice/practice.html`) shows flashcards built from favorites, flips with
a real button and the keyboard, and has no 3D motion under reduced motion.
New Tab is removed per decision 1. One shared formatter (`lib/format.js`)
does relative times, day groups, dates, numbers and currency with `Intl`.

## Phase D, 3.5.0: Settings and Welcome

Settings becomes one page with a left nav and hash deep links: AI provider
& key, Reading on web pages, Language & appearance, Flashcards, Data &
backup, Shortcuts, About. Provider cards come first, each with "Save &
test" (Plan B's `TEST_API_KEY` and `lib/key-help.js`) and a localized
inline status. Toggles become real switches with visible focus. Reading on
web pages holds hover translate, the selection toolbar (never in text
fields), translate other languages, a Muted sites chip list (one storage key
read by block translate and the selection toolbar), and "Ask before
translating a whole page" (consumed in Phase E). Dead Tailwind classes leave
`settings.html`. Welcome puts provider, key and Save & test above the fold,
a privacy and cost note beside it, feature cards below, and ends on a sample
sentence translated in place; opened from Settings it returns to Settings.

## Phase E, 3.6.0: In-page reading

Selection toolbar: never inside inputs, textareas or contenteditable;
triggered by `selectionchange` so touch works; placed from its measured size;
roving tabindex and a keyboard path to it; a "Mute on this site" action
writing the Phase D list. Page translate: a confirmation with paragraph
count and estimated cost when the setting is on; a partial-failure summary
with "Retry failed"; Cancel and Escape keep what is already translated;
originals restored on SPA navigation. The floating, polish and dictionary
boxes get the "ParsiPad was updated, reload the page" state block translate
already has. `aria-live` on polish, dictionary and progress, `aria-hidden` on
decorative SVGs, keyframes gated on reduced motion, Alt+B listed in the
shortcuts UI. The 3.2.0 review line stops being claimed under a loading
skeleton and moves out of the live region.

## Phase F, 3.7.0: Lessons and polish

Lesson language per decision 3; the lesson title rendered and
`document.title` set; quiz options as a radiogroup of buttons with keyboard
support and `aria-live` feedback; the unescaped per-option explanation
fixed; Cancel for a long lesson request; error copy with a next step.
Analytics: `Intl` numbers, currency and dates through `lib/format.js`,
local-day buckets, bar values reachable by keyboard, an empty-state hint.
Component pass: page buttons, inputs, switches and icon buttons on the
`pp-*` classes in `lib/components.css`, `[data-theme]` as the only theme
hook, no `transition: all`. Remaining 3.2.0 minors: the register label's
language and direction, `STORE_REVIEWS_URL` used instead of restated URLs,
the Settings Rate link recording "rated", review active days in local time.

## Out of scope

- The Persian-interface RTL rework (decision 2), Persian digits and the
  Persian calendar in the UI.
- Firefox support.
- A companion New Tab extension.
- Dictionary mode returning to the popup (Plan B removed it; Alt+D and the
  context menu remain).
- Cloud sync of favorites or settings.
- Screenshot selection by keyboard (audit E 2659-2718); parked for a later
  accessibility pass.
