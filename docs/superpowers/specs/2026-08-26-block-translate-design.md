# Block Translate (ParsiPad 3.1)

Date: 2026-08-26
Status: approved design, pending implementation plan
Depends on: translation core and translation card, both merged to `main`

Scope: `content/blocks/` (new), `content/host-page.js` (new, extracted), `content/main.js`, `manifest.json`, `lib/constants.js`, `lib/i18n.js`, `settings/`, `PRIVACY.md`, tests.

## 1. Goal

A reader on an English page should be able to point at one paragraph and get it in Persian, without selecting text and without translating the whole page.

ParsiPad has the two ends of that range and nothing in the middle. Selection translate needs a precise drag, which is painful on X where post text is wrapped in nested interactive spans. Full-page translate walks every text node on the page and fires a request per 3,000-character batch, which on a long Wikipedia article is a lot of the user's own tokens spent to read three paragraphs.

That gap matters more here than it would for a free translator, because ParsiPad users pay per request on their own API key. Block translate is the pay-for-what-you-read rung of the ladder.

After this feature, hovering a paragraph, a post, or a heading shows one small icon; clicking it inserts the Persian directly beneath, leaving the original in place.

## 2. Decisions already made

| Decision | Choice |
|---|---|
| Rendering | Bilingual. The Persian is inserted after the block; the original is never modified |
| Icon trigger | Hover. One icon element exists for the whole page and is moved, never duplicated |
| Block unit | The leaf block under the pointer. A heading resolves to its whole section |
| Detection | Lazy, on hover. No page scan, no index, no detection-time observer |
| Landmark policy | Reject known-bad landmarks rather than require a known-good content root |
| Direction | Reuses existing detection: the block's language translated to the other one, honoring `translateOtherLanguages` |
| Adapters | Declarative and opt-in. X gets one; Wikipedia deliberately does not |
| Default | On, with a settings toggle |

### 2.1 Why bilingual and not in place

`applyPageTranslations` in `content/main.js` writes into the host page's own text nodes and holds `Text` references in a `Map` so it can restore them. That is defensible for full-page translate, a one-shot action on a page the user has chosen to freeze in a translated state.

It is the wrong basis for an ambient hover feature, which lives on the page far longer and rides through many more re-renders. On X the timeline is a virtualized React list whose rows are recycled during scroll. Mutating a text node React owns gives two failure modes:

1. React re-renders and overwrites the translation, so the user's work silently vanishes.
2. The row is recycled for a different post and our Persian stays attached to it, so a translation of post A appears under post B's author name.

The second does not read as a glitch. It reads as the extension inventing text. The held `Text` references also go stale, so the restore path cannot reliably undo it.

Inserting our own element instead makes the worst case benign: a re-render removes our node, we lose a translation, and the page is untouched. This is the safety property the rest of the design is built to preserve, and §9 makes it a test rather than an intention.

### 2.2 Why lazy detection

Dynamic content, SPA navigation, duplicate icons, and performance on large pages are four symptoms of one cause: maintaining an index. An index must be built, kept current through mutation, and deduplicated.

Hover removes the need for one. `mouseover` hands us `event.target`, the exact element under the pointer; the block is found by walking up from it at the moment the user expresses interest. The other several thousand nodes are never examined, because the user is not pointing at them.

So a stale index is impossible, because there is no index. X can recycle its entire timeline and the next `mouseover` resolves against whatever is now there. Duplicate icons are not defended against; a singleton icon makes them unrepresentable.

The cost is that judgment is local: a candidate is judged from itself and its ancestors, without comparison to other candidates on the page. A Readability-style scoring pass would discriminate better, because scoring is comparative. It would also pay for every problem above, on every page, whether or not the user ever hovers anything. We take Readability's heuristics (§4) and drop its indexing.

### 2.3 Why permissive

A false positive is an icon the user ignores. A false negative is a feature that appears broken.

So the gate rejects known-bad landmarks rather than requiring a known-good content root. Requiring `<main>` would be cheaper and sharper, but comment threads, sidebars, and posts frequently sit outside it, and those failures are the expensive kind.

## 3. The block model

```js
/**
 * @typedef {Object} Block
 * @property {string}            id     - unique for the page session
 * @property {'leaf'|'section'}  kind
 * @property {Element}           anchor - what the icon positions against
 * @property {Element[]}         parts  - elements whose text is translated, in order
 */
```

A paragraph is `parts: [p]`. A section is `parts: [h2, p, p, ul]`. That is the only difference between them.

Rendering inserts one Persian node after *each* part, so a section comes out interleaved, every source paragraph followed by its translation, rather than as a wall of Persian at the end. The render, dismiss, and reattach paths never learn that sections exist.

```
content/blocks/
  index.js      entry, hover wiring, lifecycle
  resolve.js    the walk and candidate rules
  render.js     insert, stream, dismiss, reattach
  section.js    heading -> parts
  styles.js     CSS strings, imports themeVars()
  icon.js       the singleton hover icon
  gate.js       pure predicates
  adapters.js   declarative site rules
  anchor.js     pure positioning
```

The directory is flat because `tests/web-accessible-resources.test.js` compiles manifest globs with `*` as `[^/]*`, so `content/blocks/*.js` does not match a nested path.

## 4. Resolution

```
resolveBlock(target):
  1. inside our own UI ([data-parsipad*])          -> null
  2. adapter for this host?
       target.closest(adapter.block)   -> leaf(hit)
       target.closest(adapter.reject)  -> null
  3. walk up, max 25 steps, stop at <body>:
       isHardReject(el)                  -> null
       isHeading(el)                     -> section(el)
       isCandidate(el) && passesGate(el) -> leaf(el)
  4. -> null
```

### 4.1 Hard rejects abandon the walk

A hard reject returns `null` rather than skipping a level. Inside a `<nav>`, nothing above it is a valid block either, so abandoning is both faster and more correct than climbing to `<body>`.

Hard rejects: landmark elements and roles (`nav`, `aside`, `[role=navigation|banner|contentinfo|search|toolbar|tablist]`), editable regions (`[contenteditable]`, `input`, `textarea`, `select`), code (`code`, `pre`, `kbd`, `samp`), `[aria-hidden="true"]`, and media and embeds (`svg`, `canvas`, `iframe`, `video`, `audio`, `object`, `embed`).

`<header>` and `<footer>` are conditional. The spec allows both inside `<article>`, where they hold real content, so they hard-reject only when page-level, determined by `el.closest('article, section, [role=article]') === null`. ARIA's `banner` and `contentinfo` are page-level by definition and always reject.

### 4.2 Candidates, including div soup

Three ways to qualify:

- A block-ish tag: `p`, `li`, `blockquote`, `dd`, `dt`, `figcaption`, `td`, `th`, `h1`–`h6`, `article`, `section`.
- A block-ish role: `article`, `listitem`, `paragraph`, `heading`.
- An element with block-level computed display that *owns* its text, meaning it is the innermost element containing that text run rather than a wrapper around children that each have their own.

The third exists because X has no `<p>` tags. Ownership is tested by looking for a descendant that is itself a block candidate whose `textContent` exceeds `OWNERSHIP_MIN_CHARS` (30); if one exists, this element is a wrapper and the walk continues past it.

### 4.3 The gate

`gate.js` is pure. It takes extracted facts, never an element, so it unit-tests without a DOM, matching `placement.js` and `lib/translation/mode.js`.

```js
passesTextGate({ textLength, linkTextLength, wordCount, hasLetters, classId })
```

| Filter | Threshold | What it removes |
|---|---|---|
| `hasLetters` | at least one letter | counts, timestamps, `7h`, `186`, emoji-only rows |
| Link density | `linkTextLength / textLength < 0.6` | navigation, tag clouds, sidebar link lists |
| Text length | at least 25 chars | buttons, labels, breadcrumbs |
| Word count | at least 4 words | short chrome that clears the char floor |
| Class/id | Readability's `unlikelyCandidates` | ads, promos, share bars, modals |

Link density is the highest-value rule. A nav `<li>` is close to 100% link text; a paragraph with two citations is around 5%. It is what separates content from navigation, and it comes straight from Readability.

`hasLetters` handles the metadata that would otherwise be everywhere. On an X post, `2`, `14`, `186`, and `7h` are each separately hoverable and none contains a letter.

The class/id penalty keeps Readability's `okMaybeItsACandidate` escape hatch, so `class="article-content"` is not rejected for containing the substring "article".

Thresholds live in one exported constants block so they are tunable without hunting through predicates.

### 4.4 Headings to sections

`section.js` handles three real structures:

1. **HTML5 sectioning.** The heading is the first element child of a `<section>` or `<article>`; that container is the unit.
2. **Flat siblings.** Collect following siblings until one contains a heading of equal or higher rank. An h3 stops at the next h3 or h2 and swallows an h4.
3. **Wrapped headings.** Wikipedia emits `<div class="mw-heading"><h2>…</h2></div>`. Handled by a generic rule: if every text-bearing element child of the heading's parent is either the heading itself or fails the §4.3 gate, the parent is the row element the sibling walk starts from. An edit link fails the gate on link density, so the rule catches Wikipedia without naming it.

The third is why Wikipedia needs no adapter. Rank comes from the tag or from `aria-level` on `[role=heading]`.

Sections cap at 30 parts and 12,000 characters, so one click can never become a request storm. When capped, the footer states how much was covered.

### 4.5 Adapters

```js
{ id: 'x',
  match:  (host) => /(^|\.)(x|twitter)\.com$/.test(host),
  block:  '[data-testid="tweetText"]',
  reject: '[role="group"], [data-testid="caret"]' }
```

An adapter hit wins outright and skips the heuristic, which is both faster and exact. The registry starts with X only; those selectors must be verified against the live DOM during implementation, since X renames its testids.

Wikipedia deliberately gets no adapter. If the generic path cannot handle Wikipedia, the generic path is wrong, so it serves as the proof case in §9.

## 5. The icon

One `position: fixed` shadow host, `pointer-events: none` except the button inside it, `z-index: 2147483647`, themed through `applyHostTheme`. It is moved and toggled, never recreated, and never enters the page's own DOM.

`anchor.js` is pure, mirroring `content/placement.js`:

```js
computeIconPosition({ block, icon, viewport, dir, gutter }) -> { top, left, placement }
```

The rule: `top: block.top - icon.height / 2`. Horizontally, the icon sits outside the block's inline-start edge when the space between that edge and the viewport edge is at least `icon.width + gutter`; otherwise it sits flush to the edge. Mirrored for RTL.

Centering vertically on the top edge is deliberate. It places the icon in the inter-paragraph margin, and block-level elements nearly always have vertical margin even when they have no horizontal gutter, so it lands in whitespace instead of over the first line of text. Both axes clamp to the viewport.

## 6. Rendering

```js
insertFor(part, blockId) {
  const host = document.createElement('div');
  host.setAttribute('data-parsipad-translation', blockId);
  const shadow = host.attachShadow({ mode: 'closed' });
  // typography bridge, then layout safety, then:
  part.insertAdjacentElement('afterend', host);
}
```

`insertAdjacentElement('afterend', …)` is the entire write surface of this feature. Nothing assigns to a text node the site owns, removes one of its elements, or reorders anything.

**Typography bridge.** A shadow root inherits nothing, so without this, Persian in an X post renders at the same size as Persian in a Wikipedia paragraph. One `getComputedStyle(part)` per insertion copies `font-size` and `line-height` onto the host as custom properties.

**Layout safety.** An extra child of a flex or grid container tries to become a column. One read of the parent's computed `display` sets `flex-basis: 100%` for flex or `grid-column: 1 / -1` for grid.

Presentation is a right-border accent in `--pp-accent`, Vazirmatn via `ensurePersianFontLoaded`, `dir="rtl"`, `lang="fa"`, muted body text, and a footer row carrying the dismiss control. Tokens come from `themeVars()` in `content/styles/index.js`, so there is one palette rather than two.

### 6.1 Extraction from `content/main.js`

`applyHostTheme` and `ensurePersianFontLoaded` are needed here and are currently unexported inside a 3,164-line module. Both move to `content/host-page.js`, which `content/main.js` then imports.

This is an improvement rather than a shuffle: `themedHosts` and `hostThemeObserver` are module state, so a shared module means one theme observer serving every ParsiPad surface. Two copies would be the wrong outcome.

### 6.2 The seam with `content/main.js`

`content/blocks/` must not import from `content/main.js`; it would form a cycle and drag the whole content script into every test. The feature is initialized with a small deps object:

```js
initBlockTranslate({ onMissingApiKey: showMissingApiKeyToast });
```

## 7. Lifecycle

### 7.1 Observers

Detection needs no observer; that follows from §2.2. The feature owns exactly one, and it exists only to notice when a site re-render removes a translation we inserted.

A single `MutationObserver(childList, subtree)` on `document.body`, **started when the first translation is inserted and disconnected when the last is dismissed.** On a page with nothing translated, this feature observes nothing.

The callback is trailing-debounced at 300ms and **ignores the mutation records entirely**, sweeping active records instead: if `!record.host.isConnected`, re-insert when the source part is still connected, otherwise drop the record. That is O(active translations), realistically under ten. Ignoring the records is the point, because one scroll on X produces hundreds and inspecting them would cost more than the sweep.

Scroll and resize get a rAF-throttled reposition, but only while an icon is visible. SPA navigation reuses the `parsipad:locationchange` event that `installSpaNavigationListener` already dispatches, and drops all state.

### 7.2 Hover cost

`mouseover` fires constantly, so the hot path is ordered by cost:

1. `if (event.target === lastTarget) return`. This catches the overwhelming majority, since consecutive events over one element share a target. A pointer resting on a paragraph costs one comparison per event.
2. rAF-coalesce the survivors, so a fast sweep resolves once per frame rather than once per element crossed.
3. A `WeakMap<Element, Block|null>` verdict cache, so re-entering a block is free and eviction is garbage collection's problem.
4. Only then walk, and call `getComputedStyle` only on the final candidate, never during the climb.

`textContent.length` is used for length checks; `innerText` is never used in the hot path because it forces layout. `Element.checkVisibility()` is used where available (Chrome 105+), falling back to the existing `getComputedStyle` chain.

Hiding has a 120ms grace period so the pointer can travel from block to icon without the icon evaporating.

### 7.3 Keyboard

`Alt+B` translates the block containing `document.activeElement` or the caret, falling back to `document.elementFromPoint` at the viewport centre.

It is handled in the content script's existing `handleKeyDown` rather than `manifest.commands`, because Chrome allows only four `suggested_key` commands and all four are taken. `Escape` dismisses the icon, joining the existing dismissal chain.

## 8. Errors

The translation node is inserted **immediately** in a skeleton state, before the request is sent, so a click always produces visible feedback and shows where the answer will land.

| Case | Behavior |
|---|---|
| Missing API key | injected `onMissingApiKey` toast; skeleton removed |
| Any other failure | inline error row inside the translation node, with Retry |
| `errorCode: 'ABORTED'` | node removed silently, matching every other caller |
| Dismissed mid-flight | the block's `AbortController` aborts |

Failures render next to the block that failed rather than in a corner toast, because that is where the user is looking.

Concurrency caps at three in-flight leaf translations, one section at a time. `errorRateLimited` exists in `lib/i18n.js` for a reason.

Leaf blocks call `requestTranslation` with the mode `classifyMode` picks, usually `text`, which streams, so `onDelta` fills the node progressively. Sections use `mode: 'batch'` with the existing `batchTextNodesForTranslation` and `parseNumberedTranslations`; both already read only `.text`, so they work on parts unchanged, though their JSDoc says "text nodes" and should widen to match what they accept. Caching comes free from the service worker at `background/service-worker.js:246`.

## 9. Testing

| Test | Covers |
|---|---|
| `tests/block-gate.test.js` | link density, length floors, `hasLetters`, class/id penalty |
| `tests/block-anchor.test.js` | position math, RTL mirroring, viewport clamping |
| `tests/block-resolve.test.js` | Wikipedia-like article, X-like div soup, nav list, code block, comment thread |
| `tests/block-section.test.js` | flat siblings, `<section>`-wrapped, `.mw-heading` wrapper, rank boundaries |
| `tests/block-render.test.js` | append-only, flex and grid, dismiss, no double-insert |

Pure modules get table-driven unit tests; DOM logic gets happy-dom fixtures. This follows the split already used across `tests/`.

The load-bearing assertion is in `block-render.test.js`: **snapshot the source element's `outerHTML` before insertion and assert it is byte-identical afterwards.** That turns §2.1's safety property from an intention into something CI fails on. If a future change starts writing into the site's own nodes, that assertion breaks first.

`tests/web-accessible-resources.test.js` passes once the manifest gains `content/blocks/*.js` and `content/host-page.js`.

## 10. Surrounding changes

| File | Change |
|---|---|
| `content/main.js` | init the feature, `Alt+B` in `handleKeyDown`, extractions removed |
| `manifest.json` | `content/blocks/*.js` and `content/host-page.js` in `web_accessible_resources` |
| `lib/constants.js` | `blockTranslate: 'block_translate_enabled'`, default on |
| `settings/` | toggle in the General tab |
| `lib/i18n.js` | en and fa strings for the icon label, footer, errors, and setting |
| `PRIVACY.md` | broaden line 32 past "the selected text" to cover any text the user asks to translate |

No new permissions. The `<all_urls>` content script already ships, so there is no added store-review surface.

The default is on, unlike `selection_popup_enabled`, which defaults off. That setting fires on every text selection and interrupts; a hover icon is passive and appears only where the pointer already is.

## 11. Out of scope

- **The floating card on block translations.** Grammar, favorites, and listen are not wired to blocks in this pass. Cheap to add once blocks exist, and not needed for the feature to be good.
- **Persisting translations across reloads.** A translation lives for the page session.
- **Adapters beyond X.** Added only when the generic path is shown to fail on a real site.
- **Replacing full-page translate.** Block translate may absorb most of its use in practice, but removing it is a separate decision with its own migration.
- **An always-on or pinned icon mode.** Hover only, with `Alt+B` as the non-pointer path.
