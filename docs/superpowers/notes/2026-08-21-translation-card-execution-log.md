# Execution log — plan: docs/superpowers/plans/2026-08-21-translation-card.md

Spec: docs/superpowers/specs/2026-08-21-translation-card-design.md (binding authority)
Branch: feat/card-2a. Base commit: 321ff12.
Workspace: the main checkout, not a worktree. The extension is loaded unpacked from the repo root, so a worktree would break browser verification.

Tasks 1 to 7 were executed through the SDD harness and are recorded in its own
ledger, which is agent working state and not tracked. Tasks 8 to 13 were
executed directly after that harness lost its context mid-Task-8; this log
covers the whole sub-project from the point the record would otherwise stop.

## Outcome

All 13 tasks landed, plus spec section 6, which the plan had left unwired.
Lint reports zero errors and zero warnings. 338 tests across 39 files, up from
284 at the start of Task 8; no test that existed before was removed. Build
succeeds.

## Defects found during execution

**Task 8 died mid-edit.** The agent holding the context was lost partway
through replacing `showTranslation` in a 3,000-line file: imports and
scaffolding applied, the swap itself not. The partial work was discarded
rather than salvaged, since repairing a half-applied rewrite blind from a
diff is worse than redoing it.

**web_accessible_resources, three times.** `content/content.js` loads
`content/main.js` as a raw ES module, so every file in its transitive import
graph must be listed in the manifest or the unpacked extension fails to load
entirely. The packaged build bundles these away, so `npm run build` passes
regardless: only the development path breaks. `tests/web-accessible-resources.test.js`,
added after this defect shipped in sub-project 1, caught it on
`shared/card/`, then on `shared/speech.js`, then on `shared/source-override.js`.
It is the highest-value test in the suite.

**`.pp-card` collided with the shared component library.** `lib/components.css`
already defines a `.pp-card` component, imported by eight page stylesheets.
The card used the same class for its root, so in the popup both rules landed
on the same element and it rendered with a border, a 16px radius and a shadow
meant for something else. The floating box was unaffected throughout, because
components.css does not reach inside a shadow root: one bug, visible on one
surface only. Root renamed to `pp-card-root`; a test now compares every class
the card emits against the component library. The colliding component is
referenced by no markup anywhere in the extension and was left in place.

**Spec section 6 was built but never wired.** `directionPill` lived in
parts.js with its own tests and no card rendered it, so the pill never
appeared and `onSwapDirection` was a callback into nothing. The plan's own
self-review table claimed the section was covered by Tasks 3 and 8. The
symptom was visible twice during execution, as a callback no card read, and
was filed as plan cruft rather than traced. The popup was left worse than
before, having lost its direction badge with nothing replacing it.

**Swapping direction appeared to do nothing.** Reported by the user against
the shipped build. The swap did reach the provider and was answered, but
`finalizeResult` then applied its detected-source correction on the way home:
the model, seeing Latin characters, reported `detectedSource: 'en'`, and the
direction was flipped back to the one the user had just rejected. That
correction exists to repair script-based guessing, above all Persian typed in
Latin letters. It now runs only when the source was actually guessed.

**The session override was stored as a bare language.** Found while fixing the
above. One swap forced every later selection into that language, and this
extension's users move between English and Persian on the same page
constantly, so correcting one Finglish word would have sent the next English
word back in the wrong direction. Now stored as the pair it was made against,
in `shared/source-override.js`, shared by both hosts.

**Two tests were written that verified nothing.** The first popup token test
asserted computed colours under happy-dom and passed with the mapping
deliberately deleted; happy-dom was reporting inherited `body` colour, not the
card's own rules. The first collision guard reused a helper scoped to
`pp-card-*` names and so could not see a root class called `pp-card`. Both
were caught by deliberately reintroducing the defect and confirming the test
failed. Neither would have been caught by reading it.

## Deviations from the plan

- The box shell's footer was kept and hidden rather than deleted: the
  screenshot result still renders through it, so the plan's own condition,
  "once nothing references it", was not met.
- `onSwapDirection` was omitted from the Task 8 and 11 call sites as written,
  since no card read it. See section 6 above: the correct fix was to render
  the pill, done later.
- The popup keeps its grammar block, rebuilt in JS inside the card using the
  popup's existing classes, rather than losing the styling along with the
  markup.
- The page-translation `alert()` was replaced with the existing toast rather
  than the card's error rendering, which needs a box that flow does not have.
- `--pp-motion-skeleton` was wired up rather than removed. The plan offered
  either; it was defined under `prefers-reduced-motion` and read by nothing,
  so the shimmer animated regardless, in the task named for accessibility.
- The session override refines the spec's wording, which says only that the
  choice is remembered. Remembering it literally is broken for bilingual use.

## Post-merge spec audit

Run after the merge, section by section against the code, because the earlier
completeness claim had already been wrong once about section 6.

Holding: 3.1, 3.2, 4.1, 4.2 (including the two-line clamp and its expand
control), 4.3, 5 (all ten keys in both languages, all three replaced keys
gone), 6, 7, 7.1, 8 (both `BOX_HEIGHT_ESTIMATE` and `clampBoxIntoViewport`
absent), 10, 11.

One gap found and closed: section 3.3's callback contract lists `isSaved`,
which nothing implemented. Saved state was applied by the host reaching into
the card's DOM after rendering, leaving the control with no `aria-pressed`
until an async favourites check returned.

Three deliberate departures, left as they are:

- **7, sentence highlighting.** The spec highlights the originating word in
  both source and translation. The plan narrowed this to the source alone,
  reasoning that the word's position in Persian cannot be derived from the
  English and a wrong highlight is worse than none. The plan's call stands.
- **9, `role="dialog"` on the card container.** Applied to the box shell
  instead. The card also renders inside the popup panel, which is not a
  dialog, so following the spec literally would announce one that is not
  there. The box is the dialog and carries the role.
- **4.4, a direction pill during loading.** The spec asks for one "as soon as
  the direction is known", but section 6 requires the pill to show the
  resolved direction rather than the pre-request guess, and that is not known
  until the result arrives. The two cannot both hold; section 6 is the
  stronger commitment, so the pill appears with the result.

## Not verified

The live probe table in Task 13 needs the extension loaded in Chrome with a
real API key, which the execution environment could not do. Verified instead
against a harness serving the real modules and stylesheets: every card branch
produces the controls the table specifies, the popup token mapping resolves to
distinct real colours in both themes, Persian resolves to Vazirmatn, tab order
through the card is correct with visible focus rings, and the pill and
detection note render correctly in both interface languages.

Unverified: the floating box's focus-in and focus-out behaviour, Escape
closing it, and everything depending on real model output, including sentence
expansion and grammar. The polish, dictionary and screenshot flows were
touched by the placement change and were not exercised.
