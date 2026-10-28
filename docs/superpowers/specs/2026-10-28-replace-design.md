# Replace: put generated text back where it was typed

Date: 2026-10-28. Status: approved in conversation; builder check done, its
questions answered below.

## Intent

ParsiPad already polishes and translates text, but the result ends at Copy.
When the text came from a box the user is typing in (an email reply, a
comment, a chat message), finishing the job means switching back to the
box, selecting the old text again and pasting. Replace does that in one
click: the generated text goes exactly where the selected text was, and
Undo brings the old text back.

The feature has a prerequisite. Since 2026-10-24 the selection toolbar
deliberately ignores selections inside inputs, textareas and rich editors,
so that it never pops up while someone types, never reads a password
field, and never touches custom elements that hide their field behind a
closed shadow root. Replace needs the toolbar in exactly those fields it
can write to, so that rule is narrowed, not dropped.

## Goals

1. A Replace button in three places:
   - the in-page Polish box, one per version (Professional, Conversational,
     Concise);
   - the in-page translation card, one for the main translation;
   - the popup's Polish cards, one per version.
2. The selection toolbar appears when text is selected inside a text input,
   a textarea or a contenteditable editor, with the same buttons as on page
   text.
3. In the page, Replace writes the generated text over the selected text in
   that field, closes the box, and shows a toast with Undo.
4. In the popup, Replace puts the version into the popup's own text box.
5. If the field has changed under the user, Replace copies the text to the
   clipboard instead and the toast says so.

## Non-goals

- No Replace for selections on ordinary page text. The button is simply
  absent there.
- No Replace on the popup's translation result, the dictionary, the side
  panel, grammar lessons, block or page translation, or screenshot
  translation.
- No keyboard shortcut for Replace, and no shortcut hint on the button.
  Ehsan asked for the button without the hint; a shortcut is a later
  decision.
- The side panel's selection chip keeps skipping editable fields. (My
  call: the chip feeds the panel's own text box, not a Replace, and the
  2026-10-23 side panel spec promises it never reads fields.)
- No change to the Polish variants, prompts or providers.

## Anti-goals

Any of these makes the feature a failure even if it "works":

- Writing into a field the user did not select in, or into a different
  field than the one selected in.
- Losing the user's text. Every replacement is undoable from the toast,
  and a replacement that cannot be verified is not made.
- Submitting a form, firing Enter, or otherwise acting on the site beyond
  changing the field's text.
- A greyed-out Replace. When Replace cannot work, it is not rendered.
- A confirmation dialog before replacing. The action is reversible.
- The toolbar appearing in password fields, non-text inputs, read-only or
  disabled fields, or inside custom elements with a closed shadow root.
- Text that reads "REPLACE". The label is sentence case, one word.

## Constraints

- Plain ES modules, no framework, as the rest of the extension. Content
  script UI lives in shadow roots created in `content/main.js`.
- Both browsers, Chrome and Firefox desktop, from the same source. Inside
  an input or textarea, `window.getSelection().toString()` is empty in
  Firefox, so field text is always read from `value`, `selectionStart` and
  `selectionEnd`, never from the Selection object.
- Every user-visible string is in `lib/i18n.js` in English and Persian.
  Persian zero-width non-joiners are written as `‌` escapes.
- No new permissions in `manifest.json`.
- The release chores in `CLAUDE.md` apply: store description, changelog,
  version bump, verification, packaging, landing page.
- The 2026-10-24 safety reasons for skipping fields stay true for the
  fields this design still skips. The new rule is written as one pure,
  tested function so the toolbar and the write-back agree on what counts.

## Behaviour, as decided

### 1. What counts as a replaceable selection

A new pure module, `content/editable-target.js` (no DOM creation, testable
under happy-dom), exports `captureEditableTarget(selection, activeElement)`.
It returns one of:

- `{ kind: 'field', element, start, end, text }` when the deepest active
  element (walking open shadow roots, as `selection-report.js` does) is a
  textarea, or an input whose `type` is `text`, `search`, `url` or
  missing (not `email`: browsers expose no selection on it), the field is neither `readOnly` nor `disabled`, and
  `selectionStart < selectionEnd`. `text` is `value.slice(start, end)`.
- `{ kind: 'rich', element, range, text }` when the selection is not
  collapsed and its anchor is inside a `[contenteditable]` region that is
  not `contenteditable="false"` (the same `closest()` rule as today, so an
  island inside an editor still belongs to the editor). `element` is that
  region, `range` is a clone of the selection's first range, `text` is
  `selection.toString()`.
- `null` otherwise: password and every other input type, read-only and
  disabled fields, selects, opaque custom elements (hyphenated tag with no
  reachable shadow root), and any selection on ordinary page text.

`isEditableSelection` in `selection-report.js` keeps its current meaning
and the side panel keeps using it. The toolbar stops using it directly and
uses the new function (see 2).

### 2. The toolbar in fields

`evaluateSelection` in `content/main.js` changes in one place: where it
currently hides the toolbar for an editable selection, it first calls
`captureEditableTarget`. A non-null target shows the toolbar; a null target
inside something editable still hides it, exactly as today.

The text the toolbar works with is `target.text`, trimmed, with the same
length limits as page selections (2 to `MAX_REPORT_LENGTH`).

Anchor: for a `rich` target, the selection's range rectangle, as today.
For a `field` target there is no range rectangle, so the toolbar anchors to
the field element's bounding rectangle: placed above it, centred, flipping
below and clamping at the viewport edges through the existing placement
code. The builder may compute a tighter rectangle (a caret-mirror
measurement) later; the field rectangle is the required minimum and must
be the fallback.

Inside a field the toolbar is for a drag or a long-press only. A selection
that arrives without a pointer gesture (Shift+Arrow while typing, a page
selecting a field's contents on focus) never raises it, and one that
merely settles again keeps a toolbar already on screen. (Decided after
the builder review: the toolbar flashing over a box someone is typing in
is worse than a keyboard route that already exists.)

The toolbar's buttons and their order do not change: Translate, Polish,
Dictionary, Mute. (My call, answering a question Ehsan left open: the
toolbar in a compose box looks exactly like the toolbar on page text.)

The toolbar keeps the captured target. When Translate or Polish is pressed
from it, the target is stored as `currentReplaceTarget` (module state in
`content/main.js`) for the box that opens. It is cleared when that box
closes, when the toolbar is rebuilt for a new selection, and on navigation.

The context menu and shortcut paths (`SHOW_POLISH`, `SHOW_TRANSLATION`
and `TRANSLATE_SELECTION` messages from the service worker) capture the
target at the moment the message arrives, since the selection in the
field is still there then. If capture returns null, the box opens with no
Replace, as today.

The target survives re-renders started from inside the box (Swap
direction, Translate sentence, Regenerate, which go through
`removeFloatingBox`) and is cleared only by the box's close button, a new
selection evaluation, or navigation.

Field offsets are shrunk to the trimmed text, so a replacement never eats
whitespace the user dragged over at either end.

Firefox fires `selectionchange` for text controls on the element itself
and it does not bubble, so the listener that feeds the toolbar trigger is
registered in the capture phase on the document.

### 3. Rendering Replace

In-page Polish box (`showPolishResults`): when `currentReplaceTarget` is
set, each version's card gets a footer row with one primary button, text
`t('replace')`, class `parsipad-polish-replace`, `data-version` set. The
three existing icon buttons stay where they are. Without a target the
footer row is not rendered.

In-page translation card: when `currentReplaceTarget` is set and the result
has a `translation`, the card's action row gets a primary button with
`data-action="cardReplace"`, after Copy and Save. The shared card parts
(`shared/card/parts.js`, `actionsRow`) derive the action and its label
from one `CARD_LABEL_KEYS` key, so this button's string is the i18n key
`cardReplace` (same text as `replace` in both languages) with a `primary`
flag on the action. It appears on every card mode that has
`result.translation`: text, sentence and word.
It replaces with `result.translation` only, never with an alternative from
the sentence card. (My call: one obvious target per card; alternatives
still have Copy.) The screenshot result, which is not a card, gets no
Replace.

Popup Polish cards (`popup/popup.html`, `displayPolishResults`): each
`.polish-card` gets a footer with a primary `.polish-replace-btn`,
`data-version` set, text `t('replace')`. It is always rendered there,
since the popup's own text box is always available.

The primary button uses the extension's existing primary button tokens
(the blue of the popup's action button) so it reads as the main action,
with Copy, Regenerate and Save staying as quiet icon buttons.

### 4. Writing back

A new pure module, `content/replace-text.js`, exports
`applyReplacement(target, text)` returning `{ ok: true, undo }` or
`{ ok: false }`, where `undo()` restores the original text through the
same path.

Field target:

1. Fail if `element` is not connected, is now read-only or disabled, or
   `value.slice(start, end) !== target.text`. If the slice differs but
   `target.text` occurs exactly once in `value`, use that position; else
   fail. The user's text is never guessed at.
2. Focus the field with `preventScroll`, select `[start, end]`, and call
   `document.execCommand('insertText', false, text)`. This goes through the
   browser's editing path, so the site sees `beforeinput` and `input`
   events as it would from typing (React-controlled fields update), and
   the browser's own undo stack stays coherent.
3. If `execCommand` returns false or the value did not change, fall back
   to the native value setter from the element's prototype plus
   `setRangeText`, then dispatch `input` (an `InputEvent` with
   `inputType: 'insertReplacementText'`, bubbling) and `change`.
4. Leave the caret collapsed at the end of the inserted text.

Rich target:

1. Fail if the range's start or end container is no longer connected, or
   is no longer inside `element`.
2. Restore the selection to the saved range, focus `element`, and call
   `execCommand('insertText', false, text)`.
3. If that reports failure or the editor's text does not now contain
   `text`, fall back to `range.deleteContents()` plus a text node, then
   dispatch `input` as above.

`undo()` selects the inserted text (field: `[start, start + text.length]`;
rich: a range around the inserted text) and inserts the original text by
the same path. Undo is offered only when the replacement succeeded.

### 5. After the click

Success, in the page: the Polish box or translation box closes, the
toolbar is not re-shown (the caret is collapsed, so evaluation finds no
selection), and a toast appears through the existing `showToast`:

- Polish: `t('replacedWithVariant')` with `{variant}` filled from the
  version's existing label, e.g. "Replaced with the Professional version".
- Translation: `t('replacedWithTranslation')`, "Replaced with the
  translation".

The toast carries one action, Undo (`t('libraryUndo')`), and follows the
existing toast rules (Escape closes it, it does not vanish while focused,
focus returns where it was). Pressing Undo runs `undo()` and closes the
toast; no second toast. (My call.)

Failure, in the page: the text is copied to the clipboard and the toast
says `t('replaceFailedCopied')`, "Could not replace. Copied instead." No
Undo. The box stays open so the user can still copy another version.

Popup: Replace puts the version into the text box through the same
editing path as the page (select all, `execCommand('insertText')`, with
the value-setter fallback), so the browser's own Ctrl+Z brings the
original back; the popup has no toast, and the original also stays in
the Polish history entry. (My call, answering the reviewer: that is the
popup's undo; no new control.) It dispatches `input` so the character
count updates, moves focus to the text box, and leaves the Polish results
on screen so another version can be tried. The button text flips to
`t('replaced')` for 1.5 seconds, the way Copy flips to Copied.

### 6. Strings

Add to both languages in `lib/i18n.js`:

| key | English | Persian |
|---|---|---|
| `replace` | Replace | جایگزینی |
| `replaced` | Replaced | جایگزین شد |
| `replacedWithVariant` | Replaced with the {variant} version | نسخهٔ {variant} جایگزین شد |
| `replacedWithTranslation` | Replaced with the translation | ترجمه جایگزین شد |
| `replaceFailedCopied` | Could not replace. Copied instead. | جایگزینی ممکن نبود. به جای آن کپی شد. |
| `cardReplace` | Replace | جایگزینی |

`{variant}` takes the already-localised version name.

### 7. Accessibility

Replace is a real `<button type="button">` with visible text, so it needs
no `aria-label`. It joins the box's existing keyboard handling: Tab reaches
it in document order after the icon buttons of its card. The toast's Undo
is reachable as the mute toast's Undo is today.

Inside a field, Tab must keep leaving the field, so the toolbar there is
reached by mouse and touch only. The keyboard routes to Replace are the
ones that already exist: the `translate-selection` command (Alt+T) and
the context menu, both of which capture the target (section 2). No new
key is added. (My call, answering the reviewer.)

Two texts currently promise the toolbar never appears in fields and must
change, in English and Persian: the Settings hint `selectionToolbarHint`
in `lib/i18n.js` (its last sentence becomes "Also appears in text boxes
you are typing in, so Polish and Translate can replace what you selected."
and the Persian equivalent), with the assertion in
`tests/toolbar-trigger.test.js` updated to the new wording; and README.md
line 65, "never appears inside text fields", which becomes "and in text
boxes you type in, where Replace puts the result back".

### 8. Tests

Vitest with happy-dom, in `tests/`, following existing names:

- `editable-target.test.js`: textarea and each accepted input type give a
  field target with the right offsets and text; password, number and other
  types, read-only, disabled, select, and collapsed selections give null;
  contenteditable gives a rich target; a `contenteditable="false"` island
  inside an editor still gives the editor; a field inside an open shadow
  root is found; an opaque custom element gives null.
- `replace-text.test.js`: field replacement changes the value and
  dispatches `input` and `change` (happy-dom has no `execCommand`, so the
  fallback path is what runs; the test asserts the fallback is taken when
  `execCommand` is missing or returns false); a mismatched slice with a
  unique occurrence still succeeds; a mismatched slice with no or several
  occurrences fails without touching the value; undo restores the exact
  original and offsets; a detached element fails; rich replacement puts the
  text in the editor and dispatches `input`.
- Toolbar: `evaluateSelection` shows the toolbar for a textarea selection
  and hides it for a password field (extend `toolbar-*` tests).
- Polish box and translation card: Replace is rendered with a target and
  absent without one.
- Popup: Replace fills the text box and fires `input`.
- `i18n-keys.test.js` already checks both languages carry the same keys.

### 9. Release chores for this change

The branch `fix/persian-orthography-prompts` currently holds an
unreleased 3.9.1 bump. Ehsan confirmed on 2026-10-28 that nothing was
uploaded to either store: he asked for this feature "before upload the
packages". This feature ships in the same release, so:

- The changelog heading `## [3.9.1] - 2026-10-28` becomes
  `## [3.10.0] - 2026-10-28` (a new feature is a minor bump), with this
  feature under "Added" and the toolbar change under "Changed", above the
  existing non-joiner fix.
- `manifest.json`, `package.json` and both `package-lock.json` fields move
  to 3.10.0, in their own `chore(release)` commit.
- The three `store-assets/parsipad-v3.9.1*.zip` files are deleted before
  packaging; `npm run package` writes the 3.10.0 zips.
- `store-assets/DESCRIPTION.txt` gains a sentence about Replace in the
  Polish paragraph. The short description does not change.
- The landing page describes Polish; add Replace there and deploy it,
  without committing it.

## Left to the builder

- Exact styles for the footer row and the primary button inside the shadow
  roots, using the existing design tokens.
- Whether to measure a caret rectangle for field anchoring, or ship with
  the field rectangle (acceptable).
- How `currentReplaceTarget` is threaded through `createFloatingBox`,
  `createPolishBox` and the card renderer with the least disturbance.
- Test file layout and any helpers in `tests/helpers`.
