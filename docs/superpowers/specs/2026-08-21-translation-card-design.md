# Translation Card (ParsiPad 3.0, sub-project 2a)

Date: 2026-08-21
Status: approved design, pending implementation plan
Depends on: sub-project 1 (translation core), merged and released to `main` at 321ff12

Scope: `shared/card/` (new), `content/main.js`, `content/styles/index.js`, `popup/popup.js`, `popup/popup.css`, `lib/i18n.js`, tests.

## 1. Goal

Sub-project 1 made the model return the right thing. This sub-project makes the extension show it.

The card today displays a fraction of what the pipeline produces, and mislabels part of what it does show. Selecting `charge` in "charge the phone" returns the correct sense plus four other senses, each with a part of speech and a worked example, plus IPA for the headword. The box renders the translation, throws away the parts of speech, the examples and the IPA, and lists the other senses under the heading "Alternative translations", so "to accuse someone of a crime" appears as an alternative way of saying "charge the phone". That is worse than showing nothing, because it is confidently wrong.

After this sub-project the card reads like a translator: the answer for this context first, the word it answered for, and the other meanings available but out of the way.

## 2. Decisions already made

| Decision | Choice |
|---|---|
| Word card shape | Contextual answer first and large; source word with IPA and part of speech above it; the note explaining why this sense; other meanings collapsed behind a disclosure |
| Renderer | One shared renderer in `shared/card/`, used by the floating box and the popup, and by the side panel in sub-project 3. Each surface supplies only its shell |
| Listen | English only, browser `speechSynthesis`, never offered for Persian. Consistent with the 2.11.5 decision that browser Persian voices are not worth shipping |
| Document and Image | Stay reachable from the popup behind a `...` overflow control (the popup's tab removal itself is sub-project 2b) |
| Split | 2a is the card. 2b is the surfaces around it: selection bubble, dictionary removal, popup restructure, history restore |

## 3. Architecture

### 3.1 Why one renderer

The card body exists twice today, in `content/main.js` and `popup/popup.js`, and has already drifted. In sub-project 1 the same direction bug and the same label problem had to be fixed separately in each. Sub-project 3 adds a third surface.

`shared/card/` owns everything from the result object down to DOM. Each host owns everything above it.

```
shared/card/
  index.js         renderCard(result, options) -> DocumentFragment
  word-card.js     word and phrase results
  sentence-card.js sentence results
  text-card.js     text and batch results
  parts.js         shared pieces: direction pill, source line, disclosure, note, actions row
  styles.js        CARD_STYLES, a CSS string
  labels.js        label lookup, so wording lives in one place
```

`renderCard` is pure with respect to the DOM it builds: it takes a result and a set of callbacks, returns a fragment, and never touches `document` outside `document.createElement`. It performs no network calls and reads no storage. That makes it testable in the node environment with a minimal DOM shim, and it makes both hosts trivial.

### 3.2 The CSS problem, and its solution

The floating box needs its styles inside a closed shadow root. The popup needs them in the document. The side panel will need them in its own document.

`shared/card/styles.js` exports `CARD_STYLES` as a string. The box appends it to the styles it already injects into its shadow root. The popup injects it once into its document head. No host imports a stylesheet file, so there is no build-order coupling and no duplicate-injection problem beyond a single guard.

All card selectors are prefixed `pp-card-` so they cannot collide with the popup's existing styles or with a host page's.

### 3.3 Host responsibilities

| Concern | Owner |
|---|---|
| Result rendering, labels, disclosure, direction of each node | `shared/card/` |
| Positioning, shadow root, drag, dismissal | floating box (`content/main.js`) |
| Panel layout, history list, tabs | popup (`popup/popup.js`) |
| Requesting a translation, streaming, favorites, grammar | host, passed into the card as callbacks |

The card never calls `chrome.*`. Actions are callbacks the host supplies:

```js
renderCard(result, {
  lang,                       // interface language for labels
  onListen,                   // (text) => void, omitted when unavailable
  onCopy,                     // (text) => Promise<void>
  onSave,                     // (result) => Promise<void>
  onTranslateSentence,        // () => void, omitted when there is no sentence to expand
  onExplainGrammar,           // () => void, omitted for single words
  onSwapDirection,            // (sourceLang) => void
  isSaved                     // boolean, initial state of the save control
})
```

Omitting a callback omits its control. That is how the popup, which has no page selection, drops "Sentence" without the card knowing anything about hosts.

## 4. The card, by mode

### 4.1 Word and phrase

```
+------------------------------------------+
| EN -> FA   [swap]                    [x] |
+------------------------------------------+
| charge   /tSArdZ/   verb                 |
|                                          |
|                          جریمه کردن       |
|                                          |
| Here: to demand money as a penalty, a    |
| fee for late returns.                    |
|                                          |
| > Other meanings (3)                     |
+------------------------------------------+
| [listen] Copy  Save  Sentence  Explain   |
|                                   Gemini |
+------------------------------------------+
```

- **Header**: direction pill showing the resolved direction, a swap control, close. No brand mark and no cache badge. The provider is not in the header, because it competes with the direction pill for the one place a reader looks first; it moves to the footer, see 7.1.
- **Source line**: the selected text, then IPA when `pronunciation` is non-empty, then part of speech when `pos` is non-empty. Each separated by a thin middle dot. English source renders LTR; a Persian source renders RTL and the line reverses order accordingly.
- **Translation**: `result.translation`, 17px, direction from its own content, the visual anchor of the card.
- **Note**: `inContext` when present. Plain, not italic, because Vazirmatn has no italic and a synthesized oblique is wrong for Arabic script. Prefixed with a short lead word ("Here:") rather than a heading.
- **Disclosure**: `Other meanings (N)` where N is `senses.length` minus the one already shown, collapsed by default, a real `<button>` with `aria-expanded`. Open state is remembered for the session so a user who always wants senses is not clicking every time.
- **Each sense**: part of speech, meaning, and the example pair beneath it, source then target, each with its own direction. This is the material the card currently discards.
- **Synonyms and antonyms**: when present, one line each below the senses, inside the disclosure.
- **Actions**: Listen (only when the text to speak is English), Copy, Save, Sentence, Explain.

The sense already shown as the translation is not repeated inside the disclosure. Matching is by `meaning` string equality against `translation` after Persian normalization; when no sense matches, all senses are listed and the count is `senses.length`.

### 4.2 Sentence

```
+------------------------------------------+
| EN -> FA   [swap]                    [x] |
+------------------------------------------+
| They will charge you a fee for late       |
| returns.                                  |
|                                          |
| ... جریمه می‌شوید                          |
|                                          |
| Note: idiomatic; Persian prefers the      |
| passive here.                             |
|                                          |
| > Also (2)                                |
+------------------------------------------+
| [listen] Copy  Save  Explain             |
+------------------------------------------+
```

- Source line is the sentence, clamped to two lines with a expand control when longer.
- `Also (N)` holds `alternatives`, each with its label rendered as a small tag ("more formal", "colloquial", "literal", "other sense") and the text beneath it.
- `note` renders under a "Note:" lead.
- No Sentence action, since this already is one.

### 4.3 Text and batch

Translation only, streamed in progressively, with the truncation notice beneath when `truncated` is true. Source line is omitted; the user selected the text and can see it on the page. Actions are Copy and Save.

### 4.4 Loading and error

Loading keeps the current skeleton, and gains a direction pill as soon as the direction is known so the card does not visibly reflow. Errors render inside the card with the same shell, keeping the header, so an error does not look like a different component. The missing-API-key case keeps its "Open Settings" action, driven by `errorCode` as sub-project 1 established.

## 5. Labels

The current labels are jargon, and one is actively wrong. `lib/i18n.js` gains:

| Key | English | Persian | Replaces |
|---|---|---|---|
| `cardOtherMeanings` | Other meanings | معنی‌های دیگر | `alternatives` misused for senses |
| `cardAlso` | Also | همچنین | `alternatives` for real alternatives |
| `cardHere` | Here | در این جمله | `nuance` heading |
| `cardNote` | Note | نکته | `moreContext` |
| `cardListen` | Listen | خواندن | new |
| `cardSentence` | Translate the sentence | ترجمه جمله | new |
| `cardExplain` | Explain grammar | توضیح گرامر | existing `explainGrammar`, reused |
| `cardSwap` | Swap direction | تغییر جهت ترجمه | new |
| `cardProviderHint` | Translated by {provider}. Open provider settings | ترجمه با {provider}. باز کردن تنظیمات ارائه‌دهنده | new |
| `cardExpandSource` | Show full text | نمایش متن کامل | new |

`moreContext`, `nuance` and `alternatives` are removed once no caller remains.

## 6. Direction pill and swap

The pill shows the resolved direction from the result, not the guess made before the request. When the model reports `detectedSource: 'fa-latn'`, the pill shows FA to EN, which is already what the service worker computes.

Swap re-issues the same request with an explicit `sourceLang`, the opposite of the current source. The card calls `onSwapDirection(nextSourceLang)`; the host re-requests and re-renders. The manual choice is remembered for the session in a module-level variable in each host, so a user correcting a mis-detection once is not correcting it repeatedly. It is not persisted, because a stale override across sessions would be worse than the occasional wrong guess.

## 7. Actions

| Action | Shown when | Behavior |
|---|---|---|
| Listen | The text to speak is English (`getTextDirection` is ltr) and `speechSynthesis` exists | Speaks the English side using the same voice-selection logic `grammar/grammar.js` already uses. Never offered for Persian |
| Copy | Always | Copies the translation, normalized, with the existing toast |
| Save | Always | Existing favorites path |
| Sentence | Mode is word or phrase, and the host captured a context with a sentence in it | Re-requests with the enclosing sentence as the text, rendering a sentence card. The originating word is highlighted in both source and translation when it can be located |
| Explain | Mode is not word | Existing `EXPLAIN_GRAMMAR` path, rendered inside the card |

Every icon control carries an `aria-label`, never `title` alone.

### 7.1 Provider indicator

The footer carries a quiet indicator of which provider produced the translation, so a user always knows what answered without it competing with the result. It sits at the opposite end of the footer from the actions, in the muted secondary text colour at 11px, with no pill or background: the provider's display name only.

It is a button, not a label. Activating it opens the settings page at the provider section, which makes the common follow-up action ("this answer looks wrong, let me try another model") one click instead of four. It carries an `aria-label` naming both the current provider and what activating it does.

The `From cache` badge does not return. Whether an answer came from cache is a property of the extension's plumbing, not of the translation, and a user who wants a fresh answer has the swap and re-request paths.

## 8. Positioning

`BOX_HEIGHT_ESTIMATE` is removed. The box is created off-screen with `visibility: hidden`, populated, measured, then positioned and revealed in the same frame, so there is no visible jump. Placement prefers below the selection, flips above when there is not room and more space exists above, and clamps into the viewport in both axes. `clampBoxIntoViewport`, added as a stopgap in sub-project 1, is deleted.

Streaming complicates this: the box grows as deltas arrive. Position is computed once when the first content lands and only re-clamped if the box would leave the viewport, never re-anchored, so text does not slide while being read.

## 9. Accessibility

Everything in this list was found in the sub-project 1 review and is fixed here for surfaces the card owns:

- `aria-label` on every icon-only control in the card and the box shell.
- The disclosure is a `button` with `aria-expanded` and `aria-controls`.
- The card container is `role="dialog"` with `aria-label`, focus moved to it on open, focus returned to the page on close, and Escape closing it (Escape already works; it gains the focus return).
- `alert()` in page translation is replaced by the card's error rendering.
- Persian text keeps `lang="fa"` so screen readers select the right voice.
- `transition: all` on `.parsipad-favorite` is replaced by explicit properties, and the unused `--pp-motion-skeleton` token is either used by the skeleton or removed.

## 10. Testing

`shared/card/` is DOM-building, not DOM-reading, so it is testable in the node environment with a small `document` shim over `createElement`, `createTextNode` and `appendChild`, or with `happy-dom` if the project accepts one dev dependency. The decision is deferred to the plan; the shim is preferred if it stays under about 40 lines.

| Area | Cases |
|---|---|
| `renderCard` word | Source line composition with and without IPA and part of speech; translation direction from content; disclosure count excludes the shown sense; senses render pos, meaning and both example sides; synonyms and antonyms appear only when present |
| `renderCard` sentence | Alternatives render with labels; note renders; no Sentence action |
| `renderCard` text | Truncation notice appears only when truncated; no source line |
| Callbacks | An omitted callback omits its control; Listen is omitted for Persian text; Explain is omitted for a single word |
| Labels | Every key resolves in both languages, as sub-project 1's i18n test does |
| Direction | Each node's direction comes from its own text, including a Persian sense meaning inside an English-source card |
| Positioning | Pure placement function tested against synthetic viewport and selection rectangles: below, flipped above, clamped at each edge |

The floating box and popup integration remain verified by build, lint and manual check, as they were in sub-project 1, plus the service-worker harness that now exists.

## 11. Out of scope

Selection bubble behavior and default, dictionary removal, popup tab removal and the `...` overflow, history restoring a full card: all sub-project 2b. Side panel, tap-to-look-up, glossary and formal/casual rewrites: sub-project 3.
