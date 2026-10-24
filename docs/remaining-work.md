# Remaining work after 3.6.0

The UI/UX redesign shipped in four releases on 2026-10-24: 3.3.0 (side panel),
3.4.0 (Library and Practice), 3.5.0 (Settings and Welcome) and 3.6.0 (in-page
reading). This file lists what was planned but not started, and the small
findings the reviews deferred, so the work can be picked up later.

## Not started

### Plan F, release 3.7.0: lessons and polish

The full plan is `docs/superpowers/plans/2026-10-24-lessons-and-polish.md`
and its spec section is Phase F in
`docs/superpowers/specs/2026-10-24-redesign-phases-c-to-f.md`. It was written
before Plans C to E ran, so line numbers, ids and some assumptions have
drifted. Run a pre-flight scan against the current code before the first
task.

1. Lesson language in the prompt, the API and the cache.
2. Cancel a lesson request, and errors with a next step.
3. Lesson page in the lesson's language. Agreed default: Persian explanations
   with English examples, with an English toggle per lesson.
4. Quiz as a radiogroup with live feedback. `lib/roving.js` from 3.6.0 is
   ready for it.
5. Analytics in local days with Intl formatting. Replace the duplicate
   `formatCost` in `analytics/analytics.js` with `formatCurrency` from
   `lib/format.js`.
6. One theme hook and no `transition: all` anywhere.
7. Page controls on the shared `pp-*` classes.
8. Remaining 3.2.0 minors.
9. Release 3.7.0.

### Persian-interface RTL rework (Phase 3)

Held by decision. The Persian interface still mirrors pages through the
existing `dir="rtl"` behaviour, without a logical-property pass. Several
deferred items below come from that.

## Deferred findings, by area

### Lessons and grammar (fits Plan F tasks 2 to 4)

- The grammar page never shows the lesson title. Its header reads "Grammar
  Lesson" for every lesson.
- Grammar quiz feedback writes `quiz.explanation` with `innerHTML`. Saved
  lessons now reach it, so it needs an escape pass.
- Explain-grammar failures other than an extension reload still show the raw
  message in the grammar slot.

### Practice and Library

- Practice has no end-of-session "Deal again" button.
- Holding Space auto-repeats card flips; ignore `event.repeat`.
- The card hints say "Show answer" and "Hide answer", but the back of a card
  is now the original text.
- "Open in side panel" is dropped after 60 s if the panel shows Practice.
- At 375 px the Library's direction menu keeps its narrow width.
- The Library and Practice page titles are English in both languages.
- History and favorites lists can lose a write when two contexts change them
  at the same moment (service worker, another Library tab, the popup).

### Settings and Welcome

- In Persian, the left-to-right key and site fields align their text to the
  right.
- Unused i18n keys: `selectionPopup`, `selectionPopupSubtitle`,
  `enableSelectionPopup`, `selectionPopupHint`, and the test-pinned
  `blockTranslate*` and `translateOtherLanguages*` keys.
- The unchecked switch track is 3.06:1 contrast; forced-colors mode has no
  disabled style.
- Welcome still carries old Tailwind utility shims.
- Welcome's text input shows focus on `:focus` instead of `:focus-visible`.
- First run keeps only a key that passed its test, so a key cannot be saved
  offline there.
- Claude and OpenAI map a 403 to UNKNOWN, so a key without permission is
  saved as untested instead of rejected.
- Done on Welcome drops a rejected typed key without a message. Saving a
  working key for a provider that is not selected gives no hint to select it.
- Settings says Space flips a Practice card, but only while the card has
  focus.

### In-page reading

- The whole-page dialog counts paragraphs, while progress and the summary
  count sections (batches). Use one unit.
- A router that draws more than 250 ms after its address change is not
  detected as a page change.
- Retry failed always re-sends; only Translate Page skips a batch that
  failed twice.
- An editor inside a closed shadow root is not detected when unfocused, and
  Escape or Alt+B inside one is seen as coming from its host.
- A very busy page firing `selectionchange` constantly can postpone the
  toolbar; there is no maximum wait.
- When page translation starts from the side panel, keyboard focus stays in
  the panel. A content script cannot move it.

### Tests and code health

- Three copies of the `functionBody` test helper predate
  `tests/helpers/source.js`; move them there. Its function-name match also
  stops only at `[A-Za-z]+` names.
- Several tests check source text or order rather than behaviour (placement,
  library CSS, muted-sites wiring).
- `tests/format.test.js` uses literal invisible characters in its Persian
  regex ranges; use `\u` escapes.
- `formatCurrency` in Persian puts an LRM and a space before the dollar sign.

## Store and release notes

- The 3.4.0, 3.5.0 and 3.6.0 zips are in `store-assets/` (git-ignored) for
  the Chrome Web Store upload.
- The provider price table in `lib/cost-estimate.js` was checked against
  published rates on 2026-10-24. Re-check it when providers change prices.
