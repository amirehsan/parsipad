# Block Translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hovering a paragraph, post, or heading on any page shows one small icon; clicking it inserts the Persian translation directly beneath, leaving the original untouched.

**Architecture:** Blocks are resolved lazily by walking up from the `mouseover` target, so there is no index to build, invalidate, or deduplicate. Rendering is strictly append-only: `insertAdjacentElement('afterend', …)` is the feature's entire write surface, so a site re-render can lose a translation but can never corrupt the page. One singleton icon element serves the whole page.

**Tech Stack:** Vanilla ES modules, Chrome MV3 content script, Shadow DOM (closed), vitest with happy-dom for DOM tests.

**Spec:** `docs/superpowers/specs/2026-08-26-block-translate-design.md`

## Global Constraints

- Branch is `feat/block-translate`. Do not merge to `main`.
- **Never write to a node the host page owns.** `insertAdjacentElement('afterend', …)` on the source element is the only permitted mutation of page structure. No `textContent` assignment, no `setAttribute` on page elements, no removal, no reordering. Block identity uses a `WeakMap`, never a data attribute on the page.
- `content/blocks/` stays **flat**. `tests/web-accessible-resources.test.js` compiles manifest globs with `*` as `[^/]*`, so `content/blocks/*.js` will not match a nested path.
- Every new file reachable by `import` from `content/main.js` must be added to `web_accessible_resources` in `manifest.json` or `tests/web-accessible-resources.test.js` fails.
- Tests default to `environment: 'node'` (`vitest.config.js`). A test needing a DOM must declare `// @vitest-environment happy-dom` on line 2, following `tests/card-a11y.test.js`.
- Commit messages: no mention of Claude or Claude Code, no `Co-Authored-By` trailer. Conventional-commit prefixes matching the existing log (`feat(blocks):`, `refactor(content):`, `test(blocks):`).
- Never stage anything under `landing/` (see `CLAUDE.md`).
- Gate thresholds, verbatim: `MIN_CHARS: 25`, `MIN_WORDS: 4`, `MAX_LINK_DENSITY: 0.6`, `OWNERSHIP_MIN_CHARS: 30`, `SECTION_MAX_PARTS: 30`, `SECTION_MAX_CHARS: 12000`, `MAX_WALK: 25`.
- Run `npm test` before every commit. Run `npm run lint` before every commit.

---

### Task 1: Extract host-page helpers from `content/main.js`

`applyHostTheme` and `ensurePersianFontLoaded` are needed by the new icon and render modules but are unexported inside a 3,164-line file. Moving them out gives one theme observer serving every ParsiPad surface instead of two.

**Files:**
- Create: `content/host-page.js`
- Modify: `content/main.js:83-140` (remove `themedHosts`, `hostThemeObserver`, `detectHostTheme`, `applyHostTheme`, `ensureHostThemeObserver`), `content/main.js:2345-2363` (remove `ensurePersianFontLoaded`), `content/main.js:6-22` (add import)
- Modify: `manifest.json` (`web_accessible_resources`)
- Test: `tests/host-page.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `detectHostTheme(): 'light'|'dark'`, `applyHostTheme(host: Element): void`, `ensurePersianFontLoaded(): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/host-page.test.js`:

```js
// tests/host-page.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectHostTheme, applyHostTheme, ensurePersianFontLoaded } from '../content/host-page.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.style.backgroundColor = '';
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
});

describe('detectHostTheme', () => {
  it('reports dark for a dark page background', () => {
    document.body.style.backgroundColor = 'rgb(20, 20, 30)';
    expect(detectHostTheme()).toBe('dark');
  });

  it('reports light for a light page background', () => {
    document.body.style.backgroundColor = 'rgb(250, 250, 250)';
    expect(detectHostTheme()).toBe('light');
  });

  it('falls back to light for a transparent background', () => {
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    expect(detectHostTheme()).toBe('light');
  });
});

describe('applyHostTheme', () => {
  it('stamps data-theme on the host', () => {
    document.body.style.backgroundColor = 'rgb(20, 20, 30)';
    const host = document.createElement('div');
    applyHostTheme(host);
    expect(host.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores a null host without throwing', () => {
    expect(() => applyHostTheme(null)).not.toThrow();
  });
});

describe('ensurePersianFontLoaded', () => {
  it('registers the Vazirmatn faces once', () => {
    ensurePersianFontLoaded();
    ensurePersianFontLoaded();
    const styles = document.querySelectorAll('#parsipad-persian-font');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('Vazirmatn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/host-page.test.js`
Expected: FAIL — `Failed to resolve import "../content/host-page.js"`

- [ ] **Step 3: Create `content/host-page.js`**

Move the five theme functions and the font loader out of `content/main.js` verbatim, adding `export` to the three that are now public. The full file:

```js
/**
 * Helpers that read from, or register against, the host page itself.
 *
 * These are shared by every ParsiPad surface that mounts a Shadow DOM host
 * on a third-party page: the floating box, the selection popup, the page
 * progress overlay, and block translate. Keeping them in one module means
 * one theme observer serves all of them, rather than each surface starting
 * its own.
 */

// Every Shadow DOM host we own. The theme observer iterates over this to
// re-apply data-theme when the host page toggles between dark and light.
const themedHosts = new Set();
let hostThemeObserver = null;

/**
 * Read the host page's effective background color and pick "dark" or "light".
 * Uses Y luminance > 0.5 = light, otherwise dark. Transparent backgrounds
 * fall back to "light" (most pages without an explicit background are white).
 *
 * @returns {'light' | 'dark'}
 */
export function detectHostTheme() {
  try {
    const target = document.body || document.documentElement;
    if (!target) return 'light';
    const bg = getComputedStyle(target).backgroundColor;
    const match = bg.match(/(\d+(?:\.\d+)?)/g);
    if (!match || match.length < 3) return 'light';
    const [r, g, b, a = '1'] = match.map(Number);
    if (a < 0.1) return 'light';
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5 ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Stamp data-theme on a Shadow DOM host (or any element). Tracks the host so
 * future runtime theme changes on the page propagate automatically.
 */
export function applyHostTheme(host) {
  if (!host) return;
  host.setAttribute('data-theme', detectHostTheme());
  themedHosts.add(host);
  ensureHostThemeObserver();
}

/**
 * Start one MutationObserver that watches the page's <html> and <body> for
 * class/style mutations (Twitter, YouTube, GitHub toggle dark mode by adding
 * classes here). On any change, refresh every known host's data-theme.
 */
function ensureHostThemeObserver() {
  if (hostThemeObserver) return;
  hostThemeObserver = new MutationObserver(() => {
    const theme = detectHostTheme();
    for (const host of themedHosts) {
      // host may have been removed from the DOM; drop dangling refs.
      if (!host.isConnected) {
        themedHosts.delete(host);
        continue;
      }
      host.setAttribute('data-theme', theme);
    }
  });
  const opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] };
  if (document.documentElement) hostThemeObserver.observe(document.documentElement, opts);
  if (document.body) hostThemeObserver.observe(document.body, opts);
}

/**
 * Register the bundled Vazirmatn faces on the host document.
 *
 * Font faces resolve against the document's font set, so a @font-face
 * declared only inside a shadow root is not a reliable way to load Persian
 * type. Everything that renders Persian on a host page depends on this
 * running first.
 *
 * Idempotent, and loads the woff2 from the extension's own bundle via
 * chrome.runtime.getURL so no third-party request is made.
 */
export function ensurePersianFontLoaded() {
  const styleId = 'parsipad-persian-font';
  if (document.getElementById(styleId)) return;

  const face = (weight) => {
    const url = chrome.runtime.getURL(`fonts/vazirmatn-arabic-${weight}-normal.woff2`);
    return `@font-face { font-family: 'Vazirmatn'; font-weight: ${weight}; font-display: swap; src: url('${url}') format('woff2'); }`;
  };

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = [400, 500, 600, 700].map(face).join('\n');
  document.head.appendChild(style);
}
```

- [ ] **Step 4: Delete the moved code from `content/main.js` and import instead**

Delete these blocks from `content/main.js`:
- lines 83-86: the `themedHosts` / `hostThemeObserver` declarations and their comment
- lines 88-140: `detectHostTheme`, `applyHostTheme`, `ensureHostThemeObserver`
- lines 2345-2363: `ensurePersianFontLoaded`

Add to the import block at the top (after the `batch.js` import on line 22):

```js
import { applyHostTheme, ensurePersianFontLoaded } from './host-page.js';
```

`detectHostTheme` is not imported — after this move nothing in `main.js` calls it directly.

- [ ] **Step 5: Add the manifest entry**

In `manifest.json`, inside the `web_accessible_resources[0].resources` array, add `"content/host-page.js"` immediately after `"content/placement.js"`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, including `tests/host-page.test.js` and `tests/web-accessible-resources.test.js`.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no errors. If `detectHostTheme` is reported as unused in `main.js`, the deletion in Step 4 was incomplete.

- [ ] **Step 8: Commit**

```bash
git add content/host-page.js content/main.js manifest.json tests/host-page.test.js
git commit -m "refactor(content): extract host theme and Persian font helpers

Block translate needs applyHostTheme and ensurePersianFontLoaded, both
unexported inside a 3,164-line module. Sharing the module also means one
theme observer serves every surface instead of one per surface."
```

---

### Task 2: `gate.js` — the pure content-quality predicates

**Files:**
- Create: `content/blocks/gate.js`
- Modify: `manifest.json`
- Test: `tests/block-gate.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `GATE` (frozen thresholds), `containsLetters(text: string): boolean`, `linkDensity(textLength: number, linkTextLength: number): number`, `isUnlikelyClassId(classId: string): boolean`, `passesTextGate(facts: {textLength, linkTextLength, wordCount, hasLetters, classId}): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/block-gate.test.js`:

```js
// tests/block-gate.test.js
import { describe, it, expect } from 'vitest';
import { GATE, containsLetters, linkDensity, isUnlikelyClassId, passesTextGate } from '../content/blocks/gate.js';

// A paragraph that should always pass, used as the base for single-factor tests.
const ok = {
  textLength: 120,
  linkTextLength: 6,
  wordCount: 22,
  hasLetters: true,
  classId: 'article-body'
};

describe('containsLetters', () => {
  it.each([
    ['hello', true],
    ['سلام', true],
    ['186', false],
    ['7h', true],
    ['', false],
    ['   ', false],
    ['2', false],
    ['·', false]
  ])('containsLetters(%j) === %s', (input, expected) => {
    expect(containsLetters(input)).toBe(expected);
  });
});

describe('linkDensity', () => {
  it('is 1 for empty text so empty candidates never pass', () => {
    expect(linkDensity(0, 0)).toBe(1);
  });

  it('is the ratio of link text to all text', () => {
    expect(linkDensity(100, 25)).toBe(0.25);
  });
});

describe('isUnlikelyClassId', () => {
  it.each([
    ['nav-menu', true],
    ['site-footer', true],
    ['promo banner', true],
    ['sidebar', true],
    ['article-content', false],
    ['post-body', false],
    ['', false]
  ])('isUnlikelyClassId(%j) === %s', (input, expected) => {
    expect(isUnlikelyClassId(input)).toBe(expected);
  });

  it('lets a content word rescue an otherwise unlikely class', () => {
    // "main-nav" would be rejected on "nav", but "main" is an okMaybeItsACandidate word.
    expect(isUnlikelyClassId('main-nav')).toBe(false);
  });
});

describe('passesTextGate', () => {
  it('accepts an ordinary paragraph', () => {
    expect(passesTextGate(ok)).toBe(true);
  });

  it('rejects text with no letters at all', () => {
    expect(passesTextGate({ ...ok, hasLetters: false })).toBe(false);
  });

  it('rejects text below the character floor', () => {
    expect(passesTextGate({ ...ok, textLength: GATE.MIN_CHARS - 1 })).toBe(false);
  });

  it('rejects text below the word floor', () => {
    expect(passesTextGate({ ...ok, wordCount: GATE.MIN_WORDS - 1 })).toBe(false);
  });

  it('rejects a navigation list, which is nearly all link text', () => {
    expect(passesTextGate({ ...ok, linkTextLength: 118 })).toBe(false);
  });

  it('accepts a paragraph carrying a couple of citations', () => {
    expect(passesTextGate({ ...ok, linkTextLength: 12 })).toBe(true);
  });

  it('rejects an element whose class marks it as chrome', () => {
    expect(passesTextGate({ ...ok, classId: 'share-toolbar' })).toBe(false);
  });

  it('tolerates a fully absent facts object', () => {
    expect(passesTextGate({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-gate.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/gate.js"`

- [ ] **Step 3: Write the implementation**

Create `content/blocks/gate.js`:

```js
/**
 * Pure content-quality predicates for block detection.
 *
 * Nothing here touches the DOM. Callers extract facts with describe.js and
 * pass them in, which keeps every threshold decision unit-testable without a
 * document — the same split used by content/placement.js and
 * lib/translation/mode.js.
 *
 * The gate is deliberately permissive. A false positive is an icon the user
 * ignores; a false negative is a feature that looks broken.
 */

export const GATE = Object.freeze({
  MIN_CHARS: 25,
  MIN_WORDS: 4,
  MAX_LINK_DENSITY: 0.6,
  OWNERSHIP_MIN_CHARS: 30
});

// Adapted from Mozilla Readability's unlikelyCandidates. Matched against the
// element's own class and id, on word-ish boundaries so "download" does not
// match "ad" and "navigation" does not match twice.
const UNLIKELY = /(^|[\s_-])(ads?|advert|banner|breadcrumbs?|combx|cookie|disqus|extra|foot(er)?|header|legends?|menu|meta|modal|nav|pag(er|ination)|popup|promo|related|scroll|shar(e|ing)|shopping|sidebar|skyscraper|social|sponsor|toolbar|widget)([\s_-]|$)/i;

// Readability's okMaybeItsACandidate: a content word outweighs an unlikely
// one, so class="main-nav-content" is not thrown away for containing "nav".
const MAYBE_OK = /(^|[\s_-])(article|body|column|content|entry|main|post|story|text|tweet)([\s_-]|$)/i;

/**
 * True if the text contains at least one letter in any script.
 *
 * This is what removes the metadata that would otherwise be everywhere: on an
 * X post, the reply count, repost count, view count and relative timestamp are
 * each separately hoverable, and none of them contains a letter.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsLetters(text) {
  return /\p{L}/u.test(String(text || ''));
}

/**
 * Share of the text that sits inside links. The single highest-value signal
 * for telling navigation from content: a nav list item is close to 1, a
 * paragraph with two citations is around 0.05.
 *
 * Empty text returns 1 so an empty candidate can never clear the threshold.
 *
 * @param {number} textLength
 * @param {number} linkTextLength
 * @returns {number}
 */
export function linkDensity(textLength, linkTextLength) {
  if (!textLength) return 1;
  return linkTextLength / textLength;
}

/**
 * @param {string} classId - the element's class and id, joined
 * @returns {boolean}
 */
export function isUnlikelyClassId(classId) {
  const value = String(classId || '');
  if (!value) return false;
  if (MAYBE_OK.test(value)) return false;
  return UNLIKELY.test(value);
}

/**
 * @param {{textLength?: number, linkTextLength?: number, wordCount?: number,
 *          hasLetters?: boolean, classId?: string}} facts
 * @returns {boolean}
 */
export function passesTextGate(facts) {
  const {
    textLength = 0,
    linkTextLength = 0,
    wordCount = 0,
    hasLetters = false,
    classId = ''
  } = facts || {};

  if (!hasLetters) return false;
  if (textLength < GATE.MIN_CHARS) return false;
  if (wordCount < GATE.MIN_WORDS) return false;
  if (linkDensity(textLength, linkTextLength) >= GATE.MAX_LINK_DENSITY) return false;
  if (isUnlikelyClassId(classId)) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/block-gate.test.js`
Expected: PASS.

- [ ] **Step 5: Add the manifest entry**

In `manifest.json`, inside `web_accessible_resources[0].resources`, add `"content/blocks/*.js"` immediately after `"content/utils/*.js"`. This one entry covers every module added by the remaining tasks.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add content/blocks/gate.js tests/block-gate.test.js manifest.json
git commit -m "feat(blocks): add the content-quality gate

Link density carries most of the load: a nav list item is nearly all
link text, a paragraph with citations is around five percent. The letter
check removes the counts and timestamps that surround every X post."
```

---

### Task 3: `anchor.js` — where the icon sits

**Files:**
- Create: `content/blocks/anchor.js`
- Test: `tests/block-anchor.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `ICON_GUTTER: number`, `computeIconPosition({block, icon, viewport, dir, gutter, padding}): {top, left, placement}` where `block` is `{top, left, right, bottom}` in viewport coordinates and `placement` is `'outside'|'inset'`.

- [ ] **Step 1: Write the failing test**

Create `tests/block-anchor.test.js`:

```js
// tests/block-anchor.test.js
import { describe, it, expect } from 'vitest';
import { computeIconPosition } from '../content/blocks/anchor.js';

const viewport = { width: 1200, height: 800 };
const icon = { width: 24, height: 24 };
const base = { icon, viewport, gutter: 6, padding: 4 };

describe('computeIconPosition', () => {
  it('sits outside the inline-start edge when the margin has room', () => {
    const r = computeIconPosition({ ...base, block: { top: 200, left: 300, right: 900, bottom: 260 } });
    expect(r.placement).toBe('outside');
    expect(r.left).toBe(300 - 24 - 6);
  });

  it('straddles the block top edge so it lands in the paragraph margin', () => {
    const r = computeIconPosition({ ...base, block: { top: 200, left: 300, right: 900, bottom: 260 } });
    expect(r.top).toBe(200 - 12);
  });

  it('falls back to flush with the edge when there is no room outside', () => {
    const r = computeIconPosition({ ...base, block: { top: 200, left: 8, right: 900, bottom: 260 } });
    expect(r.placement).toBe('inset');
    expect(r.left).toBe(8);
  });

  it('mirrors to the right edge in RTL', () => {
    const r = computeIconPosition({ ...base, dir: 'rtl', block: { top: 200, left: 300, right: 900, bottom: 260 } });
    expect(r.placement).toBe('outside');
    expect(r.left).toBe(900 + 6);
  });

  it('insets against the right edge in RTL when the margin is too narrow', () => {
    const r = computeIconPosition({ ...base, dir: 'rtl', block: { top: 200, left: 300, right: 1190, bottom: 260 } });
    expect(r.placement).toBe('inset');
    expect(r.left).toBe(1190 - 24);
  });

  it('clamps a block scrolled above the viewport to the top padding', () => {
    const r = computeIconPosition({ ...base, block: { top: -50, left: 300, right: 900, bottom: 20 } });
    expect(r.top).toBe(4);
  });

  it('clamps a block below the viewport to the bottom padding', () => {
    const r = computeIconPosition({ ...base, block: { top: 900, left: 300, right: 900, bottom: 960 } });
    expect(r.top).toBe(800 - 24 - 4);
  });

  it('degrades to the padding rather than a negative offset in a viewport narrower than the icon', () => {
    const r = computeIconPosition({
      ...base,
      viewport: { width: 20, height: 800 },
      block: { top: 200, left: 0, right: 20, bottom: 260 }
    });
    expect(r.left).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-anchor.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/anchor.js"`

- [ ] **Step 3: Write the implementation**

Create `content/blocks/anchor.js`:

```js
/**
 * Decide where the hover icon goes, given real measurements.
 *
 * Pure: no DOM reference of any kind, so the placement rules are unit-testable
 * without a document. Mirrors the contract of content/placement.js, which does
 * the same job for the floating box.
 *
 * All reasoning is in viewport coordinates, because the icon host is
 * position: fixed and never needs the scroll offset.
 */

export const ICON_GUTTER = 6;
export const ICON_PADDING = 4;

/**
 * Clamp that degrades to `min` when the range is empty, rather than returning
 * a `max` that sits outside the viewport. Matters on narrow viewports where
 * the icon is wider than the space available.
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * @param {Object} input
 * @param {{top: number, left: number, right: number, bottom: number}} input.block - viewport coordinates
 * @param {{width: number, height: number}} input.icon
 * @param {{width: number, height: number}} input.viewport
 * @param {'ltr'|'rtl'} [input.dir]
 * @param {number} [input.gutter] - space between the block edge and the icon
 * @param {number} [input.padding] - minimum space to keep from the viewport edges
 * @returns {{top: number, left: number, placement: 'outside'|'inset'}}
 */
export function computeIconPosition({
  block,
  icon,
  viewport,
  dir = 'ltr',
  gutter = ICON_GUTTER,
  padding = ICON_PADDING
}) {
  // Centre on the block's top edge rather than sitting inside it. Block-level
  // elements almost always have vertical margin even when they have no
  // horizontal gutter, so this reliably lands in whitespace instead of on top
  // of the first line of text.
  const top = clamp(block.top - icon.height / 2, padding, viewport.height - icon.height - padding);

  let left;
  let placement;

  if (dir === 'rtl') {
    if (viewport.width - block.right >= icon.width + gutter) {
      left = block.right + gutter;
      placement = 'outside';
    } else {
      left = block.right - icon.width;
      placement = 'inset';
    }
  } else if (block.left >= icon.width + gutter) {
    left = block.left - icon.width - gutter;
    placement = 'outside';
  } else {
    left = block.left;
    placement = 'inset';
  }

  return {
    top,
    left: clamp(left, padding, viewport.width - icon.width - padding),
    placement
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/block-anchor.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add content/blocks/anchor.js tests/block-anchor.test.js
git commit -m "feat(blocks): add pure icon placement

Centring on the block's top edge puts the icon in the inter-paragraph
margin. Block elements nearly always have vertical margin even where
they have no horizontal gutter, so it lands in whitespace."
```

---

### Task 4: `describe.js` — Element to facts

**Files:**
- Create: `content/blocks/describe.js`
- Test: `tests/block-describe.test.js`

**Interfaces:**
- Consumes: `containsLetters` from Task 2.
- Produces: `describeElement(el: Element): {textLength, linkTextLength, wordCount, hasLetters, classId}`.

This module exists so `gate.js` stays free of the DOM while both `resolve.js` and `section.js` need element facts. Without it, `section.js` would import the extractor from `resolve.js`, which imports `section.js` back.

- [ ] **Step 1: Write the failing test**

Create `tests/block-describe.test.js`:

```js
// tests/block-describe.test.js
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { describeElement } from '../content/blocks/describe.js';

function el(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild;
}

describe('describeElement', () => {
  it('measures trimmed text length and word count', () => {
    const facts = describeElement(el('<p>  one two three four  </p>'));
    expect(facts.textLength).toBe(18);
    expect(facts.wordCount).toBe(4);
  });

  it('sums the text of descendant links', () => {
    const facts = describeElement(el('<p>alpha <a href="#">beta</a> gamma <a href="#">delta</a></p>'));
    expect(facts.linkTextLength).toBe(9);
  });

  it('counts an anchor element as entirely link text', () => {
    const facts = describeElement(el('<a href="#">a fairly long link caption here</a>'));
    expect(facts.linkTextLength).toBe(facts.textLength);
  });

  it('counts role=link the same as an anchor', () => {
    const facts = describeElement(el('<div role="link">a fairly long link caption here</div>'));
    expect(facts.linkTextLength).toBe(facts.textLength);
  });

  it('joins class and id for the class/id penalty', () => {
    const facts = describeElement(el('<div class="promo box" id="top-ad">x</div>'));
    expect(facts.classId).toContain('promo');
    expect(facts.classId).toContain('top-ad');
  });

  it('reports zero words for whitespace-only content', () => {
    const facts = describeElement(el('<p>   </p>'));
    expect(facts.wordCount).toBe(0);
    expect(facts.hasLetters).toBe(false);
  });

  it('survives an element with a non-string className', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(() => describeElement(svg)).not.toThrow();
    expect(describeElement(svg).classId).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-describe.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/describe.js"`

- [ ] **Step 3: Write the implementation**

Create `content/blocks/describe.js`:

```js
/**
 * Extract the facts gate.js judges, from a real element.
 *
 * Split out from resolve.js so section.js can use it too without the two
 * forming an import cycle, and so gate.js can stay entirely DOM-free.
 *
 * Everything here reads textContent rather than innerText. innerText forces
 * layout, and this runs on the hover path.
 */

import { containsLetters } from './gate.js';

/**
 * @param {Element} el
 * @returns {{textLength: number, linkTextLength: number, wordCount: number,
 *            hasLetters: boolean, classId: string}}
 */
export function describeElement(el) {
  const trimmed = (el.textContent || '').trim();

  // An element that is itself a link contributes all of its text to the link
  // total. Without this a single long anchor reads as a clean paragraph,
  // because querySelectorAll('a') does not match the element it is called on.
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  const selfIsLink = el.tagName === 'A' || role === 'link';

  let linkTextLength = 0;
  if (selfIsLink) {
    linkTextLength = trimmed.length;
  } else if (typeof el.querySelectorAll === 'function') {
    for (const anchor of el.querySelectorAll('a, [role="link"]')) {
      linkTextLength += (anchor.textContent || '').trim().length;
    }
  }

  // className is an SVGAnimatedString on SVG elements, not a string.
  const className = typeof el.className === 'string' ? el.className : '';
  const id = typeof el.id === 'string' ? el.id : '';

  return {
    textLength: trimmed.length,
    linkTextLength,
    wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
    hasLetters: containsLetters(trimmed),
    classId: `${className} ${id}`.trim()
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/block-describe.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add content/blocks/describe.js tests/block-describe.test.js
git commit -m "feat(blocks): extract element facts for the gate

Counting an anchor's own text as link text matters: querySelectorAll('a')
does not match the element it is called on, so without it one long link
reads as a clean paragraph."
```

---

### Task 5: `section.js` — a heading resolves to its section

**Files:**
- Create: `content/blocks/section.js`
- Test: `tests/block-section.test.js`

**Interfaces:**
- Consumes: `passesTextGate`, `GATE` from Task 2; `describeElement` from Task 4.
- Produces: `SECTION_MAX_PARTS: 30`, `SECTION_MAX_CHARS: 12000`, `isHeading(el: Element): boolean`, `headingRank(el: Element): number`, `rowElementFor(heading: Element): Element`, `collectParts(root: Element, out?: Element[]): Element[]`, `resolveSection(heading: Element): {parts: Element[], truncated: boolean}`.

- [ ] **Step 1: Write the failing test**

Create `tests/block-section.test.js`:

```js
// tests/block-section.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { isHeading, headingRank, rowElementFor, resolveSection, SECTION_MAX_PARTS } from '../content/blocks/section.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function mount(html) {
  document.body.innerHTML = html;
  return document.body;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('isHeading and headingRank', () => {
  it('recognises h1 through h6', () => {
    mount('<h3 id="h">Title</h3>');
    expect(isHeading(document.getElementById('h'))).toBe(true);
    expect(headingRank(document.getElementById('h'))).toBe(3);
  });

  it('recognises role=heading and reads aria-level', () => {
    mount('<div id="h" role="heading" aria-level="4">Title</div>');
    expect(isHeading(document.getElementById('h'))).toBe(true);
    expect(headingRank(document.getElementById('h'))).toBe(4);
  });

  it('defaults role=heading with no aria-level to rank 2', () => {
    mount('<div id="h" role="heading">Title</div>');
    expect(headingRank(document.getElementById('h'))).toBe(2);
  });
});

describe('rowElementFor', () => {
  it('returns the heading itself when it has real siblings', () => {
    mount(`<div><h2 id="h">Title</h2><p>${LONG}</p></div>`);
    const h = document.getElementById('h');
    expect(rowElementFor(h)).toBe(h);
  });

  it('returns the wrapper when the heading is alone inside it', () => {
    mount(`<div><div class="mw-heading" id="w"><h2 id="h">Title</h2></div><p>${LONG}</p></div>`);
    expect(rowElementFor(document.getElementById('h'))).toBe(document.getElementById('w'));
  });

  it('returns the wrapper when its only other child is an edit link', () => {
    mount(`<div><div class="mw-heading" id="w"><h2 id="h">History</h2><span><a href="#">edit</a></span></div><p>${LONG}</p></div>`);
    expect(rowElementFor(document.getElementById('h'))).toBe(document.getElementById('w'));
  });
});

describe('resolveSection', () => {
  it('collects following siblings up to the next heading of equal rank', () => {
    mount(`
      <div>
        <h2 id="a">First</h2>
        <p>${LONG} one</p>
        <p>${LONG} two</p>
        <h2 id="b">Second</h2>
        <p>${LONG} three</p>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(3);
    expect(parts[0].id).toBe('a');
    expect(parts.some((p) => p.textContent.includes('three'))).toBe(false);
  });

  it('stops at a higher-rank heading but swallows a lower-rank one', () => {
    mount(`
      <div>
        <h3 id="a">Sub</h3>
        <p>${LONG} one</p>
        <h4 id="b">Deeper</h4>
        <p>${LONG} two</p>
        <h2 id="c">Next chapter</h2>
        <p>${LONG} three</p>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.map((p) => p.id).filter(Boolean)).toEqual(['a', 'b']);
    expect(parts.length).toBe(4);
  });

  it('treats a wrapping <section> as the unit when the heading opens it', () => {
    mount(`
      <section id="s">
        <h2 id="a">Title</h2>
        <p>${LONG} one</p>
        <p>${LONG} two</p>
      </section>
      <p>${LONG} outside</p>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(3);
    expect(parts.some((p) => p.textContent.includes('outside'))).toBe(false);
  });

  it('handles the Wikipedia heading wrapper', () => {
    mount(`
      <div>
        <div class="mw-heading"><h2 id="a">History</h2><span><a href="#">edit</a></span></div>
        <p>${LONG} one</p>
        <div class="mw-heading"><h2 id="b">Legacy</h2></div>
        <p>${LONG} two</p>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.some((p) => p.textContent.includes('one'))).toBe(true);
    expect(parts.some((p) => p.textContent.includes('two'))).toBe(false);
  });

  it('descends to inner paragraphs rather than taking a wrapper whole', () => {
    mount(`
      <div>
        <h2 id="a">Title</h2>
        <div><p>${LONG} one</p><p>${LONG} two</p></div>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(3);
    expect(parts[1].tagName).toBe('P');
  });

  it('keeps a short list as one part instead of splitting it', () => {
    // textContent concatenates list items without separators, so the <ul> reads
    // as "alpha onebeta twogamma threedelta four" — 38 chars and 5 words, which
    // clears the floors, while no single <li> does.
    mount(`
      <div>
        <h2 id="a">Title</h2>
        <ul><li>alpha one</li><li>beta two</li><li>gamma three</li><li>delta four</li></ul>
      </div>`);
    const { parts } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBe(2);
    expect(parts[1].tagName).toBe('UL');
  });

  it('caps runaway sections and reports the truncation', () => {
    const paras = Array.from({ length: 60 }, (_, i) => `<p>${LONG} ${i}</p>`).join('');
    mount(`<div><h2 id="a">Title</h2>${paras}</div>`);
    const { parts, truncated } = resolveSection(document.getElementById('a'));
    expect(parts.length).toBeLessThanOrEqual(SECTION_MAX_PARTS);
    expect(truncated).toBe(true);
  });

  it('reports no truncation for a section that fits', () => {
    mount(`<div><h2 id="a">Title</h2><p>${LONG}</p></div>`);
    expect(resolveSection(document.getElementById('a')).truncated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-section.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/section.js"`

- [ ] **Step 3: Write the implementation**

Create `content/blocks/section.js`:

```js
/**
 * Expand a heading into the section it introduces.
 *
 * A section is not a special kind of block; it is a list of the same leaf
 * elements a paragraph hover would produce. Rendering inserts one translation
 * after each, so a translated section comes out interleaved — every source
 * paragraph followed by its Persian — rather than as a wall of text at the end.
 */

import { passesTextGate } from './gate.js';
import { describeElement } from './describe.js';

export const SECTION_MAX_PARTS = 30;
export const SECTION_MAX_CHARS = 12000;

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isHeading(el) {
  if (!el || !el.tagName) return false;
  if (HEADING_TAGS.has(el.tagName)) return true;
  return typeof el.getAttribute === 'function' && el.getAttribute('role') === 'heading';
}

/**
 * Rank 1-6. role="heading" without aria-level defaults to 2, which is what a
 * section heading almost always is in practice.
 *
 * @param {Element} el
 * @returns {number}
 */
export function headingRank(el) {
  if (HEADING_TAGS.has(el.tagName)) return Number(el.tagName[1]);
  const level = Number(el.getAttribute('aria-level'));
  return Number.isFinite(level) && level >= 1 && level <= 6 ? level : 2;
}

function isContentful(el) {
  return passesTextGate(describeElement(el));
}

/**
 * The element the sibling walk starts from: the heading, or the wrapper that
 * holds nothing but the heading.
 *
 * Wikipedia emits <div class="mw-heading"><h2>…</h2><span><a>edit</a></span></div>,
 * so the heading has no siblings of its own and a naive walk finds nothing.
 * The rule is stated generically — a wrapper whose only other children fail the
 * gate — so it catches that markup without naming Wikipedia. An edit link fails
 * on link density.
 *
 * @param {Element} heading
 * @returns {Element}
 */
export function rowElementFor(heading) {
  const parent = heading.parentElement;
  if (!parent || parent === document.body) return heading;
  if (parent.tagName === 'SECTION' || parent.tagName === 'ARTICLE') return heading;

  const others = [...parent.children].filter(
    (child) => child !== heading && (child.textContent || '').trim()
  );
  if (others.every((child) => !isContentful(child))) return parent;
  return heading;
}

function containsHeadingOfRank(el, maxRank) {
  if (isHeading(el) && headingRank(el) <= maxRank) return true;
  if (typeof el.querySelector !== 'function') return false;
  const inner = el.querySelector(HEADING_SELECTOR);
  return Boolean(inner && headingRank(inner) <= maxRank);
}

/**
 * Gather the innermost translatable elements under root.
 *
 * A part is an element that clears the gate and has no child that also clears
 * it. That descends into a wrapper div holding two paragraphs, but keeps a list
 * of short items whole, because no individual <li> clears the floor while the
 * <ul> does.
 *
 * Headings are always parts and are never descended into, so subheadings inside
 * a section survive even though they are far too short to clear the gate.
 *
 * @param {Element} root
 * @param {Element[]} [out]
 * @returns {Element[]}
 */
export function collectParts(root, out = []) {
  // Overshoot the cap by one deliberately. capParts trims back to the cap and
  // reports truncation by comparing the two lengths, so a collector that
  // stopped at exactly the cap would make every capped section look complete.
  if (out.length > SECTION_MAX_PARTS) return out;

  if (isHeading(root)) {
    out.push(root);
    return out;
  }

  const candidates = [...root.children].filter(
    (child) => isHeading(child) || isContentful(child)
  );

  if (candidates.length === 0) {
    if (isContentful(root)) out.push(root);
    return out;
  }

  for (const child of candidates) {
    if (out.length > SECTION_MAX_PARTS) break;
    collectParts(child, out);
  }
  return out;
}

/**
 * Trim to the part and character caps so one click can never become a request
 * storm. Always keeps at least one part, even an oversized one.
 */
function capParts(parts) {
  const out = [];
  let chars = 0;
  for (const el of parts) {
    if (out.length >= SECTION_MAX_PARTS) break;
    const length = (el.textContent || '').trim().length;
    if (out.length > 0 && chars + length > SECTION_MAX_CHARS) break;
    out.push(el);
    chars += length;
  }
  return { parts: out, truncated: out.length < parts.length };
}

/**
 * @param {Element} heading
 * @returns {{parts: Element[], truncated: boolean}}
 */
export function resolveSection(heading) {
  const rank = headingRank(heading);
  const row = rowElementFor(heading);
  const container = row.parentElement;

  // HTML5 sectioning: the heading opens a <section> or <article>, so that
  // container is the unit and the sibling walk is unnecessary.
  if (
    container &&
    (container.tagName === 'SECTION' || container.tagName === 'ARTICLE') &&
    container.firstElementChild === row
  ) {
    const parts = [heading];
    for (const child of [...container.children].slice(1)) {
      collectParts(child, parts);
    }
    return capParts(parts);
  }

  const parts = [heading];
  let sibling = row.nextElementSibling;
  while (sibling && parts.length <= SECTION_MAX_PARTS) {
    if (containsHeadingOfRank(sibling, rank)) break;
    collectParts(sibling, parts);
    sibling = sibling.nextElementSibling;
  }
  return capParts(parts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/block-section.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add content/blocks/section.js tests/block-section.test.js
git commit -m "feat(blocks): expand a heading into its section

A section is a list of the same leaf elements a paragraph hover
produces, so rendering interleaves each source paragraph with its
translation instead of appending a wall of Persian at the end.

The wrapper rule is stated as \"a parent whose other children fail the
gate\", which catches Wikipedia's mw-heading div without naming it."
```

---

### Task 6: `resolve.js` and `adapters.js` — the walk

**Files:**
- Create: `content/blocks/adapters.js`, `content/blocks/resolve.js`
- Test: `tests/block-resolve.test.js`

**Interfaces:**
- Consumes: `passesTextGate`, `GATE` from Task 2; `describeElement` from Task 4; `isHeading`, `resolveSection` from Task 5.
- Produces: `adapterFor(hostname: string): Adapter|null`, `isHardReject(el: Element): boolean`, `isCandidate(el: Element): boolean`, `ownsItsText(el: Element): boolean`, `resolveBlock(target: EventTarget, hostname?: string): Block|null` where `Block` is `{id: string, kind: 'leaf'|'section', anchor: Element, parts: Element[], truncated: boolean}`.

- [ ] **Step 1: Write the failing test**

Create `tests/block-resolve.test.js`:

```js
// tests/block-resolve.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveBlock, isHardReject, ownsItsText } from '../content/blocks/resolve.js';
import { adapterFor } from '../content/blocks/adapters.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function mount(html) { document.body.innerHTML = html; }
function pick(id) { return document.getElementById(id); }

beforeEach(() => { document.body.innerHTML = ''; });

describe('adapterFor', () => {
  it.each(['x.com', 'www.x.com', 'twitter.com', 'mobile.twitter.com'])('matches %s', (host) => {
    expect(adapterFor(host)?.id).toBe('x');
  });

  it.each(['example.com', 'notx.com', 'x.com.evil.net'])('does not match %s', (host) => {
    expect(adapterFor(host)).toBeNull();
  });
});

describe('isHardReject', () => {
  it('rejects a nav element', () => {
    mount('<nav id="n"><a href="#">Home</a></nav>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects role=navigation', () => {
    mount('<div id="n" role="navigation">x</div>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects aria-hidden content', () => {
    mount('<div id="n" aria-hidden="true">x</div>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects code', () => {
    mount('<pre id="n">npm install</pre>');
    expect(isHardReject(pick('n'))).toBe(true);
  });

  it('rejects a page-level footer', () => {
    mount('<footer id="f">Copyright</footer>');
    expect(isHardReject(pick('f'))).toBe(true);
  });

  it('allows a footer inside an article, where it holds real content', () => {
    mount('<article><footer id="f">Written by someone</footer></article>');
    expect(isHardReject(pick('f'))).toBe(false);
  });
});

describe('ownsItsText', () => {
  it('is false for a wrapper around a substantial child', () => {
    mount(`<div id="w"><div id="inner"><p>${LONG}</p></div></div>`);
    expect(ownsItsText(pick('w'))).toBe(false);
  });

  it('is true for the innermost element holding the text', () => {
    mount(`<div id="leaf">${LONG}</div>`);
    expect(ownsItsText(pick('leaf'))).toBe(true);
  });

  it('is true for a paragraph containing only a short inline link', () => {
    mount(`<p id="leaf">${LONG} <a href="#">src</a></p>`);
    expect(ownsItsText(pick('leaf'))).toBe(true);
  });
});

describe('resolveBlock', () => {
  it('resolves a paragraph from a text node target inside it', () => {
    mount(`<main><p id="p">${LONG}</p></main>`);
    const block = resolveBlock(pick('p').firstChild);
    expect(block.kind).toBe('leaf');
    expect(block.anchor).toBe(pick('p'));
    expect(block.parts).toEqual([pick('p')]);
  });

  it('climbs from an inline span to the paragraph', () => {
    mount(`<main><p id="p">${LONG} <em id="e">emphasis</em></p></main>`);
    expect(resolveBlock(pick('e')).anchor).toBe(pick('p'));
  });

  it('resolves a heading to its section', () => {
    mount(`<main><h2 id="h">Title</h2><p>${LONG}</p></main>`);
    const block = resolveBlock(pick('h'));
    expect(block.kind).toBe('section');
    expect(block.anchor).toBe(pick('h'));
    expect(block.parts.length).toBe(2);
  });

  it('returns null inside a nav, without climbing past it', () => {
    mount(`<nav><ul><li id="li"><a href="#">A fairly long navigation label</a></li></ul></nav><p>${LONG}</p>`);
    expect(resolveBlock(pick('li'))).toBeNull();
  });

  it('returns null for a link list that is not wrapped in nav', () => {
    mount('<div id="d"><a href="#">Alpha beta</a> <a href="#">Gamma delta</a> <a href="#">Epsilon zeta</a></div>');
    expect(resolveBlock(pick('d'))).toBeNull();
  });

  it('returns null for a code block', () => {
    mount('<pre id="c"><code>const answer = compute(fortyTwo, options);</code></pre>');
    expect(resolveBlock(pick('c'))).toBeNull();
  });

  it('returns null for a bare count, the metadata around an X post', () => {
    mount('<div id="d">186</div>');
    expect(resolveBlock(pick('d'))).toBeNull();
  });

  it('returns null inside our own translation output', () => {
    mount(`<div data-parsipad-translation="pp-b1"><p id="p">${LONG}</p></div>`);
    expect(resolveBlock(pick('p'))).toBeNull();
  });

  it('resolves div soup to the innermost div that owns the text', () => {
    mount(`<div><div><div id="leaf">${LONG}</div></div></div>`);
    expect(resolveBlock(pick('leaf')).anchor).toBe(pick('leaf'));
  });

  it('gives the same id for repeated resolutions of one element', () => {
    mount(`<main><p id="p">${LONG}</p></main>`);
    expect(resolveBlock(pick('p')).id).toBe(resolveBlock(pick('p')).id);
  });

  it('gives different ids to different elements', () => {
    mount(`<main><p id="a">${LONG} one</p><p id="b">${LONG} two</p></main>`);
    expect(resolveBlock(pick('a')).id).not.toBe(resolveBlock(pick('b')).id);
  });

  it('never writes to the page while resolving', () => {
    mount(`<main><p id="p">${LONG}</p></main>`);
    const before = pick('p').outerHTML;
    resolveBlock(pick('p'));
    expect(pick('p').outerHTML).toBe(before);
  });

  it('uses an adapter selector in preference to the heuristic', () => {
    mount(`<article><div data-testid="tweetText" id="t"><span id="s">${LONG}</span></div></article>`);
    expect(resolveBlock(pick('s'), 'x.com').anchor).toBe(pick('t'));
  });

  it('honours an adapter reject over its block selector', () => {
    mount('<div role="group" id="g"><button>Reply to this post now</button></div>');
    expect(resolveBlock(pick('g'), 'x.com')).toBeNull();
  });

  it('returns null for a null target', () => {
    expect(resolveBlock(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-resolve.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/resolve.js"`

- [ ] **Step 3: Write `content/blocks/adapters.js`**

```js
/**
 * Site-specific overrides, kept declarative and opt-in.
 *
 * An adapter is added only when the generic path is shown to fail on a real
 * site. Wikipedia deliberately has none: if the heuristic cannot handle
 * Wikipedia, the heuristic is wrong, so it serves as the proof case.
 *
 * @typedef {Object} Adapter
 * @property {string} id
 * @property {(hostname: string) => boolean} match
 * @property {string} block  - selector for the definitive block; a hit skips the heuristic
 * @property {string} reject - selector for regions that are never translatable
 */

/** @type {Adapter[]} */
export const ADAPTERS = [
  {
    id: 'x',
    // X's post body is a definitive selector, so matching it is both faster
    // and more exact than climbing through its div soup. These testids need
    // re-verifying against the live DOM periodically; X renames them.
    match: (hostname) => /(^|\.)(x|twitter)\.com$/i.test(hostname),
    block: '[data-testid="tweetText"]',
    reject: '[role="group"], [data-testid="caret"], [data-testid="UserCell"]'
  }
];

/**
 * @param {string} hostname
 * @returns {Adapter|null}
 */
export function adapterFor(hostname) {
  return ADAPTERS.find((adapter) => adapter.match(String(hostname || ''))) || null;
}
```

- [ ] **Step 4: Write `content/blocks/resolve.js`**

```js
/**
 * Turn the element under the pointer into a Block, or nothing.
 *
 * Resolution is lazy: it runs when the user hovers, walking up from the event
 * target. There is no index of the page, so there is nothing to build,
 * invalidate, or deduplicate, and a virtualized timeline that recycles its rows
 * cannot leave us holding a stale reference.
 */

import { GATE, passesTextGate } from './gate.js';
import { describeElement } from './describe.js';
import { isHeading, resolveSection } from './section.js';
import { adapterFor } from './adapters.js';

const MAX_WALK = 25;

// Reaching one of these abandons the walk rather than skipping a level: if the
// pointer is inside a nav, nothing above it is a valid block either.
const HARD_REJECT_TAGS = new Set([
  'NAV', 'ASIDE', 'CODE', 'PRE', 'KBD', 'SAMP',
  'SVG', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO', 'OBJECT', 'EMBED',
  'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SCRIPT', 'STYLE', 'NOSCRIPT'
]);

const HARD_REJECT_ROLES = new Set([
  'navigation', 'banner', 'contentinfo', 'search',
  'toolbar', 'tablist', 'menu', 'menubar', 'dialog', 'alert'
]);

const BLOCK_TAGS = new Set([
  'P', 'LI', 'BLOCKQUOTE', 'DD', 'DT', 'FIGCAPTION', 'TD', 'TH',
  'ARTICLE', 'SECTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'
]);

const BLOCK_ROLES = new Set(['article', 'listitem', 'paragraph', 'heading', 'note']);

const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'list-item', 'table-cell', 'flow-root']);

// Our own surfaces, which must never resolve to a block. Without the
// translation guard the user could translate a translation.
const OWN_UI = '[data-parsipad-translation], [data-parsipad-icon], #parsipad-host, #parsipad-selection-popup';

// Block identity lives here rather than in a data attribute on the page.
// Marking the source element would be a mutation, and the append-only
// guarantee in tests/block-render.test.js would rightly fail on it.
const idByAnchor = new WeakMap();
let nextId = 0;

function blockIdFor(anchor) {
  let id = idByAnchor.get(anchor);
  if (!id) {
    id = `pp-b${++nextId}`;
    idByAnchor.set(anchor, id);
  }
  return id;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isHardReject(el) {
  if (HARD_REJECT_TAGS.has(el.tagName)) return true;

  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  if (role && HARD_REJECT_ROLES.has(role)) return true;
  if (typeof el.getAttribute === 'function' && el.getAttribute('aria-hidden') === 'true') return true;
  if (el.isContentEditable) return true;

  // <header> and <footer> are page chrome only at page level. The spec allows
  // both inside <article>, where they carry real content.
  if (el.tagName === 'HEADER' || el.tagName === 'FOOTER') {
    return el.closest('article, section, [role="article"]') === null;
  }

  return false;
}

/**
 * True when the element is the innermost one holding its text, rather than a
 * wrapper around children that each hold their own.
 *
 * This is what makes div soup resolvable: X has no <p> tags, so the only way
 * to find the post body generically is to find the div nothing else inside
 * claims.
 *
 * @param {Element} el
 * @returns {boolean}
 */
export function ownsItsText(el) {
  for (const child of el.children) {
    const facts = describeElement(child);
    if (facts.textLength >= GATE.OWNERSHIP_MIN_CHARS && passesTextGate(facts)) return false;
  }
  return true;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isCandidate(el) {
  if (BLOCK_TAGS.has(el.tagName)) return true;

  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  if (role && BLOCK_ROLES.has(role)) return true;

  if (el.tagName !== 'DIV' && el.tagName !== 'SPAN') return false;

  // Ordered so the style read comes last. Every wrapper on the climb fails the
  // textContent-only ownership check, so getComputedStyle runs about once per
  // resolution rather than once per ancestor.
  if (!ownsItsText(el)) return false;
  return BLOCK_DISPLAYS.has(getComputedStyle(el).display);
}

function makeBlock(kind, anchor, parts, truncated) {
  return { id: blockIdFor(anchor), kind, anchor, parts, truncated };
}

/**
 * @param {EventTarget|Node|null} target
 * @param {string} [hostname] - injectable for tests; defaults to the real host
 * @returns {{id: string, kind: 'leaf'|'section', anchor: Element,
 *            parts: Element[], truncated: boolean}|null}
 */
export function resolveBlock(target, hostname = location.hostname) {
  if (!target) return null;

  // Text nodes are the common mouseover target inside a paragraph.
  let el = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
  if (el.closest(OWN_UI)) return null;

  const adapter = adapterFor(hostname);
  if (adapter) {
    if (adapter.reject && el.closest(adapter.reject)) return null;
    const hit = adapter.block && el.closest(adapter.block);
    if (hit) return makeBlock('leaf', hit, [hit], false);
  }

  let steps = 0;
  while (el && el !== document.body && steps < MAX_WALK) {
    if (isHardReject(el)) return null;
    if (isHeading(el)) {
      const { parts, truncated } = resolveSection(el);
      return makeBlock('section', el, parts, truncated);
    }
    if (isCandidate(el) && passesTextGate(describeElement(el))) {
      return makeBlock('leaf', el, [el], false);
    }
    el = el.parentElement;
    steps += 1;
  }

  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/block-resolve.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add content/blocks/resolve.js content/blocks/adapters.js tests/block-resolve.test.js
git commit -m "feat(blocks): resolve the block under the pointer

Lazy resolution by walking up from the hover target, so there is no
index to build, invalidate, or deduplicate, and a recycled timeline row
cannot leave a stale reference behind.

Identity is a WeakMap keyed on the anchor, not a data attribute, so
resolution stays append-only along with everything else."
```

---

### Task 7: `styles.js` and `icon.js` — the singleton hover icon

**Files:**
- Create: `content/blocks/styles.js`, `content/blocks/icon.js`
- Test: `tests/block-icon.test.js`

**Interfaces:**
- Consumes: `themeVars` from `content/styles/index.js`; `applyHostTheme` from Task 1; `computeIconPosition` from Task 3.
- Produces: `getBlockIconStyles(): string`, `getBlockTranslationStyles(): string`, `showIconFor(block, onActivate): void`, `hideIcon(): void`, `repositionIcon(): void`, `currentIconBlock(): object|null`, `isIconElement(node: Node): boolean`, `destroyIcon(): void`, `ICON_SIZE: number`.

- [ ] **Step 1: Write the failing test**

Create `tests/block-icon.test.js`:

```js
// tests/block-icon.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showIconFor, hideIcon, destroyIcon, isIconElement } from '../content/blocks/icon.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function blockFor(el) {
  return { id: 'pp-b1', kind: 'leaf', anchor: el, parts: [el], truncated: false };
}

beforeEach(() => {
  destroyIcon();
  document.body.innerHTML = `<p id="p">${LONG}</p>`;
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
});

describe('the hover icon', () => {
  it('mounts exactly one host element', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    expect(document.querySelectorAll('[data-parsipad-icon]').length).toBe(1);
  });

  it('reuses that host across repeated shows rather than stacking them', () => {
    const block = blockFor(document.getElementById('p'));
    showIconFor(block, vi.fn());
    showIconFor(block, vi.fn());
    showIconFor(block, vi.fn());
    expect(document.querySelectorAll('[data-parsipad-icon]').length).toBe(1);
  });

  it('does not add the source element to the page', () => {
    const before = document.getElementById('p').outerHTML;
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    expect(document.getElementById('p').outerHTML).toBe(before);
  });

  it('positions the host with fixed positioning and the maximum z-index', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    const host = document.querySelector('[data-parsipad-icon]');
    expect(host.style.position).toBe('fixed');
    expect(host.style.zIndex).toBe('2147483647');
  });

  it('lets pointer events through the host but not the button', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    const host = document.querySelector('[data-parsipad-icon]');
    expect(host.style.pointerEvents).toBe('none');
  });

  it('hides without removing the host, so the next show is a move', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    hideIcon();
    const host = document.querySelector('[data-parsipad-icon]');
    expect(host).not.toBeNull();
    expect(host.getAttribute('data-visible')).toBe('false');
  });

  it('recognises its own host, so the resolver can skip it', () => {
    showIconFor(blockFor(document.getElementById('p')), vi.fn());
    expect(isIconElement(document.querySelector('[data-parsipad-icon]'))).toBe(true);
    expect(isIconElement(document.getElementById('p'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-icon.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/icon.js"`

- [ ] **Step 3: Write `content/blocks/styles.js`**

```js
/**
 * CSS strings for the block-translate surfaces.
 *
 * Theme tokens are imported from content/styles/index.js rather than redefined,
 * so there is one palette for the extension rather than two. Kept in its own
 * module instead of appended to that 1,155-line file so the feature stays
 * self-contained.
 */

import { themeVars } from '../styles/index.js';

export const ICON_SIZE = 24;

export function getBlockIconStyles() {
  return `
    ${themeVars()}
    :host {
      pointer-events: none;
    }
    .pp-block-icon {
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: ${ICON_SIZE}px;
      height: ${ICON_SIZE}px;
      padding: 0;
      border: 1px solid var(--pp-border-strong);
      border-radius: 7px;
      background: var(--pp-bg);
      color: var(--pp-accent);
      box-shadow: var(--pp-shadow-card);
      cursor: pointer;
      opacity: 0;
      transform: scale(0.85);
      transition: opacity 120ms ease, transform 120ms ease, background 120ms ease;
    }
    :host([data-visible='true']) .pp-block-icon {
      opacity: 1;
      transform: scale(1);
    }
    .pp-block-icon:hover {
      background: var(--pp-bg-hover);
    }
    .pp-block-icon:focus-visible {
      outline: 2px solid var(--pp-accent);
      outline-offset: 2px;
    }
    .pp-block-icon svg {
      width: 15px;
      height: 15px;
    }
    @media (prefers-reduced-motion: reduce) {
      .pp-block-icon { transition: none; }
    }
  `;
}

export function getBlockTranslationStyles() {
  return `
    ${themeVars()}
    :host {
      display: block;
      margin: 6px 0 10px;
    }
    .pp-block-translation {
      border-inline-start: 3px solid var(--pp-accent);
      padding: 6px 0 6px 12px;
      padding-inline-start: 12px;
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      font-size: var(--pp-source-font-size, 1rem);
      line-height: var(--pp-source-line-height, 1.7);
      color: var(--pp-text);
      direction: rtl;
      text-align: start;
    }
    .pp-block-body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .pp-block-skeleton {
      display: block;
      height: 1em;
      margin-bottom: 6px;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--pp-skeleton-from), var(--pp-skeleton-to), var(--pp-skeleton-from));
      background-size: 200% 100%;
      animation: var(--pp-motion-skeleton);
    }
    .pp-block-skeleton:last-child { width: 60%; }
    .pp-block-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 11px;
      color: var(--pp-text-muted);
      direction: ltr;
    }
    .pp-block-footer button {
      padding: 2px 8px;
      border: 1px solid var(--pp-border);
      border-radius: 5px;
      background: transparent;
      color: var(--pp-text-secondary);
      font: inherit;
      cursor: pointer;
    }
    .pp-block-footer button:hover { background: var(--pp-bg-hover); }
    .pp-block-error {
      color: var(--pp-error);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      direction: ltr;
    }
    @keyframes parsipad-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
}
```

- [ ] **Step 4: Write `content/blocks/icon.js`**

```js
/**
 * The hover icon.
 *
 * There is exactly one, for the page's whole lifetime. It is moved and toggled,
 * never recreated, which is why duplicate icons are not defended against so much
 * as made unrepresentable — and why the render cost is constant rather than
 * proportional to the number of blocks on the page.
 *
 * The host is position: fixed and never enters the page's own DOM tree beyond
 * being appended to <body>.
 */

import { applyHostTheme } from '../host-page.js';
import { computeIconPosition } from './anchor.js';
import { getBlockIconStyles, ICON_SIZE } from './styles.js';

export { ICON_SIZE };

const TRANSLATE_PATH =
  'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129';

let host = null;
let activateHandler = null;
let currentBlock = null;

function build() {
  if (host) return;

  host = document.createElement('div');
  host.setAttribute('data-parsipad-icon', '');
  host.setAttribute('data-visible', 'false');
  host.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';
  applyHostTheme(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = getBlockIconStyles();
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pp-block-icon';
  button.setAttribute('aria-label', 'Translate this block to Persian');

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', TRANSLATE_PATH);
  svg.appendChild(path);
  button.appendChild(svg);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activateHandler && currentBlock) activateHandler(currentBlock);
  });

  shadow.appendChild(button);
  document.body.appendChild(host);
}

/**
 * True for our own icon host, so the resolver can skip it without importing
 * this module's internals.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isIconElement(node) {
  return Boolean(host) && (node === host || (node?.nodeType === Node.ELEMENT_NODE && host.contains(node)));
}

/**
 * Move the icon to a block and show it.
 *
 * @param {{id: string, anchor: Element}} block
 * @param {(block: object) => void} onActivate
 */
export function showIconFor(block, onActivate) {
  build();
  currentBlock = block;
  activateHandler = onActivate;
  repositionIcon();
  host.setAttribute('data-visible', 'true');
}

/** Recompute the icon's position against its current block. */
export function repositionIcon() {
  if (!host || !currentBlock?.anchor?.isConnected) return;

  const rect = currentBlock.anchor.getBoundingClientRect();
  const { top, left } = computeIconPosition({
    block: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
    icon: { width: ICON_SIZE, height: ICON_SIZE },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    dir: getComputedStyle(currentBlock.anchor).direction === 'rtl' ? 'rtl' : 'ltr'
  });

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
}

/** Hide without removing, so the next show is a move rather than a build. */
export function hideIcon() {
  if (!host) return;
  host.setAttribute('data-visible', 'false');
  currentBlock = null;
}

/** The block the icon currently points at, or null. */
export function currentIconBlock() {
  return currentBlock;
}

/** Tear down completely. Used on SPA navigation and by tests. */
export function destroyIcon() {
  if (host) host.remove();
  host = null;
  currentBlock = null;
  activateHandler = null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/block-icon.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add content/blocks/styles.js content/blocks/icon.js tests/block-icon.test.js
git commit -m "feat(blocks): add the singleton hover icon

One host for the page's whole lifetime, moved and toggled rather than
recreated. Duplicate icons are not defended against; they are
unrepresentable, and render cost stays constant with page size."
```

---

### Task 8: `render.js` — insert, stream, dismiss

This task carries the safety property the whole design rests on. Step 1's first test is the one that must never be weakened.

**Files:**
- Create: `content/blocks/render.js`
- Test: `tests/block-render.test.js`

**Interfaces:**
- Consumes: `applyHostTheme`, `ensurePersianFontLoaded` from Task 1; `getBlockTranslationStyles` from Task 7.
- Produces: `renderSkeleton(block): void`, `setPartText(blockId, index, text): void`, `setPartError(blockId, index, message, onRetry): void`, `addFooter(blockId, {truncated, partCount}): void`, `dismissBlock(blockId): void`, `hasRendered(blockId): boolean`, `activeBlockIds(): string[]`, `sweepDetached(): void`, `clearAllRendered(): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/block-render.test.js`:

```js
// tests/block-render.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderSkeleton, setPartText, setPartError, dismissBlock,
  hasRendered, activeBlockIds, sweepDetached, clearAllRendered
} from '../content/blocks/render.js';

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function blockOf(ids, kind = 'leaf') {
  const parts = ids.map((id) => document.getElementById(id));
  return { id: 'pp-b1', kind, anchor: parts[0], parts, truncated: false };
}

beforeEach(() => {
  clearAllRendered();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
});

describe('the append-only guarantee', () => {
  it('leaves the source element byte-identical after a full render', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    const before = document.getElementById('p').outerHTML;

    const block = blockOf(['p']);
    renderSkeleton(block);
    setPartText('pp-b1', 0, 'ترجمه فارسی');

    expect(document.getElementById('p').outerHTML).toBe(before);
  });

  it('leaves every source element of a section byte-identical', () => {
    document.body.innerHTML = `<div id="w"><h2 id="h">Title</h2><p id="a">${LONG}</p><p id="b">${LONG}</p></div>`;
    const before = ['h', 'a', 'b'].map((id) => document.getElementById(id).outerHTML);

    const block = blockOf(['h', 'a', 'b'], 'section');
    renderSkeleton(block);
    setPartText('pp-b1', 0, 'یک');
    setPartText('pp-b1', 1, 'دو');
    setPartText('pp-b1', 2, 'سه');

    expect(['h', 'a', 'b'].map((id) => document.getElementById(id).outerHTML)).toEqual(before);
  });

  it('restores the parent exactly on dismiss', () => {
    document.body.innerHTML = `<div id="w"><p id="p">${LONG}</p></div>`;
    const before = document.getElementById('w').outerHTML;

    renderSkeleton(blockOf(['p']));
    setPartText('pp-b1', 0, 'ترجمه');
    dismissBlock('pp-b1');

    expect(document.getElementById('w').outerHTML).toBe(before);
  });
});

describe('renderSkeleton', () => {
  it('inserts one host immediately after each part', () => {
    document.body.innerHTML = `<div id="w"><p id="a">${LONG}</p><p id="b">${LONG}</p></div>`;
    renderSkeleton(blockOf(['a', 'b'], 'section'));

    expect(document.getElementById('a').nextElementSibling.hasAttribute('data-parsipad-translation')).toBe(true);
    expect(document.getElementById('b').nextElementSibling.hasAttribute('data-parsipad-translation')).toBe(true);
  });

  it('tags every host with the block id', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]').getAttribute('data-parsipad-translation')).toBe('pp-b1');
  });

  it('does not insert twice for the same block', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    renderSkeleton(blockOf(['p']));
    expect(document.querySelectorAll('[data-parsipad-translation]').length).toBe(1);
  });

  it('registers the Persian font', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(document.getElementById('parsipad-persian-font')).not.toBeNull();
  });

  it('spans the full row inside a flex parent', () => {
    document.body.innerHTML = `<div id="w" style="display: flex"><p id="p">${LONG}</p></div>`;
    renderSkeleton(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]').style.flexBasis).toBe('100%');
  });

  it('spans all columns inside a grid parent', () => {
    document.body.innerHTML = `<div id="w" style="display: grid"><p id="p">${LONG}</p></div>`;
    renderSkeleton(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]').style.gridColumn).toBe('1 / -1');
  });
});

describe('lifecycle', () => {
  it('tracks and reports active blocks', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(hasRendered('pp-b1')).toBe(true);
    expect(activeBlockIds()).toEqual(['pp-b1']);
  });

  it('re-inserts a translation a site re-render removed', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    setPartText('pp-b1', 0, 'ترجمه');

    document.querySelector('[data-parsipad-translation]').remove();
    sweepDetached();

    const restored = document.querySelector('[data-parsipad-translation]');
    expect(restored).not.toBeNull();
  });

  it('drops the record when the source element is gone too', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    document.body.innerHTML = '';
    sweepDetached();
    expect(activeBlockIds()).toEqual([]);
  });

  it('forgets the block after dismiss', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    dismissBlock('pp-b1');
    expect(hasRendered('pp-b1')).toBe(false);
    expect(activeBlockIds()).toEqual([]);
  });
});

describe('setPartError', () => {
  // The shadow root is closed, matching the floating box and selection popup,
  // so a test cannot reach the retry button. These assert the observable
  // contract instead: the node survives an error so the user can retry, and a
  // stale block id is inert rather than throwing.
  it('keeps the translation node on screen after an error', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    setPartError('pp-b1', 0, 'Something failed', vi.fn());

    expect(document.querySelector('[data-parsipad-translation]')).not.toBeNull();
    expect(activeBlockIds()).toEqual(['pp-b1']);
  });

  it('ignores an unknown block id without throwing', () => {
    expect(() => setPartError('pp-nope', 0, 'x', vi.fn())).not.toThrow();
  });

  it('ignores an out-of-range part index without throwing', () => {
    document.body.innerHTML = `<p id="p">${LONG}</p>`;
    renderSkeleton(blockOf(['p']));
    expect(() => setPartError('pp-b1', 7, 'x', vi.fn())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-render.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/render.js"`

- [ ] **Step 3: Write the implementation**

Create `content/blocks/render.js`:

```js
/**
 * Insert, fill, and remove the Persian that sits beneath a block.
 *
 * insertAdjacentElement('afterend', ...) is this feature's entire write
 * surface. Nothing here assigns to a text node the site owns, removes one of
 * its elements, or reorders anything. That is what makes the worst case benign:
 * a re-render can take our node away, which loses a translation, but it can
 * never leave the page corrupted or a translation stranded under the wrong post.
 *
 * tests/block-render.test.js asserts the source element's outerHTML is
 * byte-identical across a full render. Do not weaken that test.
 */

import { applyHostTheme, ensurePersianFontLoaded } from '../host-page.js';
import { getBlockTranslationStyles } from './styles.js';

/**
 * @typedef {Object} PartRecord
 * @property {Element} source
 * @property {HTMLElement} host
 * @property {ShadowRoot} shadow
 */

/** @type {Map<string, {block: object, parts: PartRecord[]}>} */
const rendered = new Map();

function mountHost(source, blockId) {
  const host = document.createElement('div');
  host.setAttribute('data-parsipad-translation', blockId);

  // A shadow root inherits nothing, so without bridging these the Persian in an
  // X post would render at the same size as the Persian in a Wikipedia
  // paragraph. One style read per insertion.
  const sourceStyle = getComputedStyle(source);
  host.style.setProperty('--pp-source-font-size', sourceStyle.fontSize);
  host.style.setProperty('--pp-source-line-height', sourceStyle.lineHeight);

  // An extra child of a flex or grid container tries to become a column.
  const parentDisplay = source.parentElement ? getComputedStyle(source.parentElement).display : '';
  if (parentDisplay === 'flex' || parentDisplay === 'inline-flex') {
    host.style.flexBasis = '100%';
    host.style.width = '100%';
  } else if (parentDisplay === 'grid' || parentDisplay === 'inline-grid') {
    host.style.gridColumn = '1 / -1';
  }

  applyHostTheme(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = getBlockTranslationStyles();
  shadow.appendChild(style);

  const wrapper = document.createElement('div');
  wrapper.className = 'pp-block-translation';
  wrapper.setAttribute('lang', 'fa');
  wrapper.setAttribute('dir', 'rtl');
  shadow.appendChild(wrapper);

  source.insertAdjacentElement('afterend', host);
  return { source, host, shadow };
}

function wrapperOf(record) {
  return record.shadow.querySelector('.pp-block-translation');
}

function showSkeleton(record) {
  const wrapper = wrapperOf(record);
  wrapper.textContent = '';
  const body = document.createElement('div');
  body.className = 'pp-block-body';
  for (let i = 0; i < 2; i += 1) {
    const bar = document.createElement('span');
    bar.className = 'pp-block-skeleton';
    body.appendChild(bar);
  }
  wrapper.appendChild(body);
}

/**
 * Insert a loading placeholder after every part, immediately, before any
 * request goes out. A click always produces visible feedback and shows the user
 * where the answer will land.
 *
 * @param {{id: string, parts: Element[]}} block
 */
export function renderSkeleton(block) {
  if (rendered.has(block.id)) return;
  ensurePersianFontLoaded();

  const parts = block.parts
    .filter((source) => source.isConnected)
    .map((source) => {
      const record = mountHost(source, block.id);
      showSkeleton(record);
      return record;
    });

  if (parts.length > 0) rendered.set(block.id, { block, parts });
}

/**
 * Replace one part's content with translated text. Safe to call repeatedly
 * while a response streams.
 *
 * @param {string} blockId
 * @param {number} index
 * @param {string} text
 */
export function setPartText(blockId, index, text) {
  const record = rendered.get(blockId)?.parts[index];
  if (!record) return;

  const wrapper = wrapperOf(record);
  wrapper.textContent = '';
  const body = document.createElement('div');
  body.className = 'pp-block-body';
  body.textContent = text;
  wrapper.appendChild(body);
}

/**
 * Show a failure next to the block that failed, rather than in a corner toast.
 *
 * @param {string} blockId
 * @param {number} index
 * @param {string} message
 * @param {() => void} onRetry
 */
export function setPartError(blockId, index, message, onRetry) {
  const record = rendered.get(blockId)?.parts[index];
  if (!record) return;

  const wrapper = wrapperOf(record);
  wrapper.textContent = '';

  const error = document.createElement('div');
  error.className = 'pp-block-error';
  error.setAttribute('role', 'status');
  error.textContent = message;
  wrapper.appendChild(error);

  const footer = document.createElement('div');
  footer.className = 'pp-block-footer';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'pp-block-retry';
  retry.textContent = 'Retry';
  retry.addEventListener('click', (event) => {
    event.stopPropagation();
    if (onRetry) onRetry();
  });
  footer.appendChild(retry);
  wrapper.appendChild(footer);
}

/**
 * Add the footer row carrying the dismiss control, and the truncation note when
 * a section was capped.
 *
 * @param {string} blockId
 * @param {{truncated?: boolean, partCount?: number}} [options]
 */
export function addFooter(blockId, { truncated = false, partCount = 0 } = {}) {
  const entry = rendered.get(blockId);
  if (!entry) return;

  const last = entry.parts[entry.parts.length - 1];
  if (!last) return;

  const wrapper = wrapperOf(last);
  const footer = document.createElement('div');
  footer.className = 'pp-block-footer';

  if (truncated) {
    const note = document.createElement('span');
    note.textContent = `First ${partCount} parts`;
    footer.appendChild(note);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'pp-block-dismiss';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', (event) => {
    event.stopPropagation();
    dismissBlock(blockId);
  });
  footer.appendChild(dismiss);
  wrapper.appendChild(footer);
}

/**
 * @param {string} blockId
 * @returns {boolean}
 */
export function hasRendered(blockId) {
  return rendered.has(blockId);
}

/** @returns {string[]} */
export function activeBlockIds() {
  return [...rendered.keys()];
}

/** Remove every host for a block and forget it. */
export function dismissBlock(blockId) {
  const entry = rendered.get(blockId);
  if (!entry) return;
  for (const record of entry.parts) record.host.remove();
  rendered.delete(blockId);
}

/**
 * Re-insert translations a site re-render removed, and drop the ones whose
 * source element is gone too.
 *
 * Deliberately ignores mutation records and sweeps our own small set instead:
 * one scroll on X produces hundreds of records, and inspecting them would cost
 * far more than this loop.
 */
export function sweepDetached() {
  for (const [blockId, entry] of rendered) {
    let live = 0;
    for (const record of entry.parts) {
      if (record.host.isConnected) {
        live += 1;
        continue;
      }
      if (record.source.isConnected) {
        record.source.insertAdjacentElement('afterend', record.host);
        live += 1;
      }
    }
    if (live === 0) rendered.delete(blockId);
  }
}

/** Drop everything. Used on SPA navigation and by tests. */
export function clearAllRendered() {
  for (const blockId of [...rendered.keys()]) dismissBlock(blockId);
  rendered.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/block-render.test.js`
Expected: PASS. The append-only assertions are the ones that matter; if any fails, the implementation is writing to the page and must be corrected rather than the test relaxed.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add content/blocks/render.js tests/block-render.test.js
git commit -m "feat(blocks): insert the Persian beneath the block

insertAdjacentElement('afterend', ...) is the feature's entire write
surface, so a site re-render can lose a translation but can never
corrupt the page or strand one under the wrong post.

The byte-identity assertion in the tests makes that a property CI
enforces rather than one the code merely intends."
```

---

### Task 9: `index.js` — hover wiring and translation

**Files:**
- Create: `content/blocks/index.js`
- Test: `tests/block-index.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1-8; `requestTranslation` from `lib/translation/client.js`; `batchTextNodesForTranslation`, `parseNumberedTranslations` from `content/utils/batch.js`; `isMissingApiKeyResponse` from `content/utils/text.js`.
- Produces: `initBlockTranslate(deps: {onMissingApiKey: () => void}): void`, `teardownBlockTranslate(): void`, `translateBlock(block): Promise<void>`, `translateFocusedBlock(): void`, `setEnabled(enabled: boolean): void`, `resetForNavigation(): void`, `hideBlockIcon(): void` (re-exported from `icon.js`).

- [ ] **Step 1: Write the failing test**

Create `tests/block-index.test.js`:

```js
// tests/block-index.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const requestTranslation = vi.fn();
vi.mock('../lib/translation/client.js', () => ({ requestTranslation }));

const { initBlockTranslate, teardownBlockTranslate, translateBlock, setEnabled } =
  await import('../content/blocks/index.js');
const { activeBlockIds, clearAllRendered } = await import('../content/blocks/render.js');

const LONG = 'This sentence is comfortably past the twenty five character floor.';

function blockOf(ids, kind = 'leaf') {
  const parts = ids.map((id) => document.getElementById(id));
  return { id: `pp-t${ids.join('')}`, kind, anchor: parts[0], parts, truncated: false };
}

beforeEach(() => {
  requestTranslation.mockReset();
  clearAllRendered();
  document.head.innerHTML = '';
  document.body.innerHTML = `<p id="p">${LONG}</p>`;
  globalThis.chrome = {
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    storage: {
      local: { get: vi.fn().mockResolvedValue({ block_translate_enabled: true }) },
      onChanged: { addListener: vi.fn() }
    }
  };
});

afterEach(() => { teardownBlockTranslate(); });

describe('translateBlock', () => {
  it('renders the translation returned for a leaf block', async () => {
    requestTranslation.mockResolvedValue({ translation: 'ترجمه شده' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    await translateBlock(blockOf(['p']));

    expect(document.querySelector('[data-parsipad-translation]')).not.toBeNull();
    expect(requestTranslation).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton before the request resolves', async () => {
    let release;
    requestTranslation.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    const pending = translateBlock(blockOf(['p']));
    expect(document.querySelector('[data-parsipad-translation]')).not.toBeNull();

    release({ translation: 'ترجمه' });
    await pending;
  });

  it('calls onMissingApiKey and removes the node when no key is set', async () => {
    requestTranslation.mockResolvedValue({ error: 'API key not set.', errorCode: 'API_KEY_NOT_SET' });
    const onMissingApiKey = vi.fn();
    initBlockTranslate({ onMissingApiKey });

    await translateBlock(blockOf(['p']));

    expect(onMissingApiKey).toHaveBeenCalledTimes(1);
    expect(activeBlockIds()).toEqual([]);
  });

  it('removes the node silently when the request is aborted', async () => {
    requestTranslation.mockResolvedValue({ error: 'Translation cancelled.', errorCode: 'ABORTED' });
    const onMissingApiKey = vi.fn();
    initBlockTranslate({ onMissingApiKey });

    await translateBlock(blockOf(['p']));

    expect(onMissingApiKey).not.toHaveBeenCalled();
    expect(activeBlockIds()).toEqual([]);
  });

  it('keeps the node and shows an error for any other failure', async () => {
    requestTranslation.mockResolvedValue({ error: 'Rate limited.', errorCode: 'RATE_LIMITED' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    await translateBlock(blockOf(['p']));

    expect(activeBlockIds().length).toBe(1);
  });

  it('does not translate the same block twice', async () => {
    requestTranslation.mockResolvedValue({ translation: 'ترجمه' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    const block = blockOf(['p']);
    await translateBlock(block);
    await translateBlock(block);

    expect(requestTranslation).toHaveBeenCalledTimes(1);
  });

  it('sends a section as one batch request', async () => {
    document.body.innerHTML = `<div><h2 id="h">Title</h2><p id="a">${LONG}</p><p id="b">${LONG}</p></div>`;
    requestTranslation.mockResolvedValue({ translation: '[1] یک\n[2] دو\n[3] سه' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });

    await translateBlock(blockOf(['h', 'a', 'b'], 'section'));

    expect(requestTranslation).toHaveBeenCalledTimes(1);
    expect(requestTranslation.mock.calls[0][0].mode).toBe('batch');
    expect(document.querySelectorAll('[data-parsipad-translation]').length).toBe(3);
  });
});

describe('setEnabled', () => {
  it('clears rendered translations when the feature is switched off', async () => {
    requestTranslation.mockResolvedValue({ translation: 'ترجمه' });
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    await translateBlock(blockOf(['p']));

    setEnabled(false);

    expect(activeBlockIds()).toEqual([]);
  });

  it('refuses to translate while disabled', async () => {
    initBlockTranslate({ onMissingApiKey: vi.fn() });
    setEnabled(false);

    await translateBlock(blockOf(['p']));

    expect(requestTranslation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/block-index.test.js`
Expected: FAIL — `Failed to resolve import "../content/blocks/index.js"`

- [ ] **Step 3: Write the implementation**

Create `content/blocks/index.js`:

```js
/**
 * Block translate: wiring, lifecycle, and the translation request itself.
 *
 * Detection needs no observer. Resolution runs on hover, against whatever is in
 * the DOM at that moment, so dynamic content and SPA navigation need no special
 * handling on the detection side. The one observer this feature owns exists only
 * to notice when a site re-render removes a translation we inserted, and it runs
 * only while at least one translation is on screen.
 */

import { requestTranslation } from '../../lib/translation/client.js';
import { isMissingApiKeyResponse } from '../utils/text.js';
import { batchTextNodesForTranslation, parseNumberedTranslations } from '../utils/batch.js';
import { resolveBlock } from './resolve.js';
import { showIconFor, hideIcon, repositionIcon, destroyIcon, currentIconBlock } from './icon.js';
import {
  renderSkeleton, setPartText, setPartError, addFooter,
  dismissBlock, hasRendered, activeBlockIds, sweepDetached, clearAllRendered
} from './render.js';

const HIDE_GRACE_MS = 120;
const SWEEP_DEBOUNCE_MS = 300;
const MAX_CONCURRENT = 3;

let deps = { onMissingApiKey: () => {} };
let enabled = true;
let started = false;
// The stored setting is read asynchronously, so a toggle arriving before that
// read resolves would otherwise be clobbered by the stale stored value. Whoever
// sets the flag first wins.
let settingLoaded = false;

let lastTarget = null;
let pendingTarget = null;
let rafHandle = 0;
let hideTimer = null;

let sweepObserver = null;
let sweepTimer = null;

const inFlight = new Map();
let activeCount = 0;

// Re-exported so content/main.js can join the icon to its existing Escape
// dismissal chain without importing from content/blocks/icon.js directly.
export { hideIcon as hideBlockIcon } from './icon.js';

// ------------------------------------------------------------------
// Hover
// ------------------------------------------------------------------

function onPointerMove(event) {
  if (!enabled) return;
  // The cheap early-out that makes this affordable: consecutive events over one
  // element share a target, so a resting pointer costs one comparison.
  if (event.target === lastTarget) return;
  lastTarget = event.target;
  pendingTarget = event.target;

  if (rafHandle) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = 0;
    const target = pendingTarget;
    pendingTarget = null;
    handleTarget(target);
  });
}

function handleTarget(target) {
  const block = resolveBlock(target);

  if (!block) {
    scheduleHide();
    return;
  }

  clearHide();
  if (currentIconBlock()?.id === block.id) return;
  showIconFor(block, translateBlock);
}

function scheduleHide() {
  if (hideTimer) return;
  // Grace period so the pointer can travel from the block to the icon without
  // the icon evaporating on the way.
  hideTimer = setTimeout(() => {
    hideTimer = null;
    hideIcon();
  }, HIDE_GRACE_MS);
}

function clearHide() {
  if (!hideTimer) return;
  clearTimeout(hideTimer);
  hideTimer = null;
}

let repositionQueued = false;
function onViewportChange() {
  if (!currentIconBlock() || repositionQueued) return;
  repositionQueued = true;
  requestAnimationFrame(() => {
    repositionQueued = false;
    repositionIcon();
  });
}

// ------------------------------------------------------------------
// Reattach sweep
// ------------------------------------------------------------------

function ensureSweepObserver() {
  if (sweepObserver || activeBlockIds().length === 0) return;
  sweepObserver = new MutationObserver(() => {
    if (sweepTimer) return;
    sweepTimer = setTimeout(() => {
      sweepTimer = null;
      sweepDetached();
      stopSweepObserverIfIdle();
    }, SWEEP_DEBOUNCE_MS);
  });
  sweepObserver.observe(document.body, { childList: true, subtree: true });
}

function stopSweepObserverIfIdle() {
  if (activeBlockIds().length > 0 || !sweepObserver) return;
  sweepObserver.disconnect();
  sweepObserver = null;
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
}

// ------------------------------------------------------------------
// Translation
// ------------------------------------------------------------------

function textOf(el) {
  return (el.textContent || '').trim();
}

async function translateLeaf(block, controller) {
  const response = await requestTranslation(
    { text: textOf(block.parts[0]) },
    { signal: controller.signal, onDelta: (chunk) => setPartText(block.id, 0, chunk) }
  );
  return { response, apply: () => setPartText(block.id, 0, response.translation) };
}

async function translateSection(block, controller) {
  const items = block.parts.map((el) => ({ el, text: textOf(el) }));
  const batches = batchTextNodesForTranslation(items);

  let response = null;
  let offset = 0;
  for (const batch of batches) {
    if (controller.signal.aborted) break;
    const numbered = batch.map((item, index) => `[${index + 1}] ${item.text}`).join('\n');
    response = await requestTranslation(
      { text: numbered, mode: 'batch' },
      { signal: controller.signal }
    );
    if (response.error) return { response, apply: () => {} };

    const translations = parseNumberedTranslations(response.translation, batch.length);
    for (let i = 0; i < batch.length; i += 1) {
      setPartText(block.id, offset + i, translations[i] || batch[i].text);
    }
    offset += batch.length;
  }
  return { response: response || {}, apply: () => {} };
}

/**
 * Translate one block and render the result beneath it.
 *
 * @param {{id: string, kind: 'leaf'|'section', parts: Element[], truncated: boolean}} block
 */
export async function translateBlock(block) {
  if (!enabled || !block || hasRendered(block.id) || inFlight.has(block.id)) return;
  if (activeCount >= MAX_CONCURRENT) return;

  const controller = new AbortController();
  inFlight.set(block.id, controller);
  activeCount += 1;

  // Insert the placeholder before the request goes out, so the click always
  // produces visible feedback and shows where the answer will land.
  renderSkeleton(block);
  ensureSweepObserver();

  try {
    const { response, apply } = block.kind === 'section'
      ? await translateSection(block, controller)
      : await translateLeaf(block, controller);

    if (isMissingApiKeyResponse(response)) {
      dismissBlock(block.id);
      deps.onMissingApiKey();
      return;
    }
    if (response.errorCode === 'ABORTED') {
      dismissBlock(block.id);
      return;
    }
    if (response.error) {
      setPartError(block.id, 0, response.error, () => {
        dismissBlock(block.id);
        translateBlock(block);
      });
      return;
    }

    apply();
    addFooter(block.id, { truncated: block.truncated, partCount: block.parts.length });
  } catch (error) {
    if (controller.signal.aborted) {
      dismissBlock(block.id);
      return;
    }
    setPartError(block.id, 0, error?.message || 'Translation failed.', () => {
      dismissBlock(block.id);
      translateBlock(block);
    });
  } finally {
    inFlight.delete(block.id);
    activeCount -= 1;
    stopSweepObserverIfIdle();
  }
}

// ------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------

/**
 * Translate the block holding the keyboard focus, falling back to whatever sits
 * at the centre of the viewport. This is the non-pointer path; the hover icon is
 * invisible to keyboard and touch users without it.
 */
export function translateFocusedBlock() {
  const focused = document.activeElement;
  const fallback = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  const block = resolveBlock(focused && focused !== document.body ? focused : fallback);
  if (block) translateBlock(block);
}

/** @param {boolean} value */
export function setEnabled(value) {
  settingLoaded = true;
  enabled = Boolean(value);
  if (enabled) return;
  hideIcon();
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
  activeCount = 0;
  clearAllRendered();
  stopSweepObserverIfIdle();
}

/** Drop everything a page transition invalidates. */
export function resetForNavigation() {
  for (const controller of inFlight.values()) controller.abort();
  inFlight.clear();
  activeCount = 0;
  clearAllRendered();
  stopSweepObserverIfIdle();
  hideIcon();
  lastTarget = null;
}

/**
 * @param {{onMissingApiKey: () => void}} dependencies
 */
export function initBlockTranslate(dependencies = {}) {
  deps = { onMissingApiKey: () => {}, ...dependencies };
  if (started) return;
  started = true;

  document.addEventListener('mouseover', onPointerMove, { passive: true });
  window.addEventListener('scroll', onViewportChange, { passive: true });
  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('parsipad:locationchange', resetForNavigation);
  window.addEventListener('popstate', resetForNavigation);

  chrome.storage.local.get('block_translate_enabled').then((stored) => {
    if (settingLoaded) return;
    settingLoaded = true;
    enabled = stored.block_translate_enabled ?? true;
  }).catch(() => { settingLoaded = true; });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local' || !changes.block_translate_enabled) return;
    setEnabled(changes.block_translate_enabled.newValue ?? true);
  });
}

/** Remove every listener and surface. Used by tests. */
export function teardownBlockTranslate() {
  document.removeEventListener('mouseover', onPointerMove);
  window.removeEventListener('scroll', onViewportChange);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('parsipad:locationchange', resetForNavigation);
  window.removeEventListener('popstate', resetForNavigation);
  resetForNavigation();
  destroyIcon();
  started = false;
  enabled = true;
  settingLoaded = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/block-index.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add content/blocks/index.js tests/block-index.test.js
git commit -m "feat(blocks): wire hover, translation, and reattachment

Detection needs no observer, so dynamic content and SPA navigation are
handled by resolving fresh on each hover. The one observer here runs
only while a translation is on screen, ignores its mutation records, and
sweeps our own small set instead."
```

---

### Task 10: Wire into the content script, settings, i18n, and privacy

**Files:**
- Modify: `content/main.js` (import and init, `Alt+B` and `Escape` in `handleKeyDown:2616`)
- Modify: `lib/constants.js:91` (storage key)
- Modify: `lib/i18n.js` (en and fa strings)
- Modify: `settings/settings.html`, `settings/settings.js`
- Modify: `PRIVACY.md:32`
- Test: `tests/storage-settings.test.js` (extend)

**Interfaces:**
- Consumes: `initBlockTranslate`, `translateFocusedBlock` from Task 9.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `tests/storage-settings.test.js` (keep the existing imports; add `STORAGE_KEYS` to them if it is not already imported):

```js
describe('block translate setting', () => {
  it('registers a storage key', () => {
    expect(STORAGE_KEYS.blockTranslate).toBe('block_translate_enabled');
  });
});
```

Create `tests/block-i18n.test.js`:

```js
// tests/block-i18n.test.js
import { describe, it, expect } from 'vitest';
import { translations } from '../lib/i18n.js';

const KEYS = [
  'blockTranslate',
  'blockTranslateHint',
  'blockTranslateIconLabel',
  'blockTranslateDismiss',
  'blockTranslateRetry',
  'blockTranslateTruncated'
];

describe('block translate copy', () => {
  it.each(KEYS)('has an English string for %s', (key) => {
    expect(typeof translations.en[key]).toBe('string');
    expect(translations.en[key].length).toBeGreaterThan(0);
  });

  it.each(KEYS)('has a Persian string for %s', (key) => {
    expect(typeof translations.fa[key]).toBe('string');
    expect(translations.fa[key].length).toBeGreaterThan(0);
  });

  it('does not leave a Persian string identical to its English source', () => {
    for (const key of KEYS) {
      expect(translations.fa[key]).not.toBe(translations.en[key]);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/block-i18n.test.js tests/storage-settings.test.js`
Expected: FAIL — `expected undefined to be a string` for every key, and `expected undefined to be 'block_translate_enabled'`.

- [ ] **Step 3: Add the storage key**

In `lib/constants.js`, in the block containing `selectionPopup: 'selection_popup_enabled',` at line 91, add immediately after it:

```js
  blockTranslate: 'block_translate_enabled',
```

- [ ] **Step 4: Add the i18n strings**

In `lib/i18n.js`, add to the `en` object:

```js
    blockTranslate: 'Block translate',
    blockTranslateHint: 'Point at a paragraph, post, or heading to show a translate icon beside it.',
    blockTranslateIconLabel: 'Translate this block to Persian',
    blockTranslateDismiss: 'Dismiss',
    blockTranslateRetry: 'Retry',
    blockTranslateTruncated: 'First {count} parts',
```

And to the `fa` object:

```js
    blockTranslate: 'ترجمه بخش',
    blockTranslateHint: 'نشانگر را روی یک پاراگراف، پست یا عنوان ببرید تا نشان ترجمه کنارش ظاهر شود.',
    blockTranslateIconLabel: 'ترجمه این بخش به فارسی',
    blockTranslateDismiss: 'بستن',
    blockTranslateRetry: 'تلاش دوباره',
    blockTranslateTruncated: '{count} بخش نخست',
```

- [ ] **Step 5: Run the i18n and settings tests**

Run: `npx vitest run tests/block-i18n.test.js tests/storage-settings.test.js`
Expected: PASS.

- [ ] **Step 6: Wire into `content/main.js`**

Add to the import block (after the `host-page.js` import added in Task 1):

```js
import { initBlockTranslate, translateFocusedBlock, hideBlockIcon } from './blocks/index.js';
```

In `init()`, immediately before the `installSpaNavigationListener();` call:

```js
  // Block translate owns its own hover, storage and observer wiring; it needs
  // only the toast, which lives here.
  initBlockTranslate({ onMissingApiKey: showMissingApiKeyToast });
```

Replace `handleKeyDown` at line 2616 in full, so the icon joins the existing Escape dismissal chain:

```js
function handleKeyDown(event) {
  // The non-pointer path into block translate. Kept here rather than in
  // manifest.commands because Chrome allows only four suggested keys and all
  // four are already assigned.
  if (event.altKey && (event.key === 'b' || event.key === 'B')) {
    event.preventDefault();
    translateFocusedBlock();
    return;
  }

  if (event.key === 'Escape') {
    hideBlockIcon();
    if (screenshotOverlay) {
      cancelScreenshotMode();
      return;
    }
    if (floatingBox) {
      removeFloatingBox();
    }
    if (selectionPopup) {
      removeSelectionPopup();
    }
  }
}
```

- [ ] **Step 7: Add the settings toggle**

In `settings/settings.html`, find the General tab row for the selection popup (search for `selection_popup_enabled` or "Selection popup") and duplicate its markup immediately below, changing the id and label:

```html
<div class="setting-row">
  <div class="setting-label">
    <span data-i18n="blockTranslate">Block translate</span>
    <small data-i18n="blockTranslateHint">Point at a paragraph, post, or heading to show a translate icon beside it.</small>
  </div>
  <label class="switch">
    <input type="checkbox" id="blockTranslateToggle">
    <span class="slider"></span>
  </label>
</div>
```

In `settings/settings.js`, follow the existing selection-popup handler exactly. Where that setting is loaded, add:

```js
  const blockToggle = document.getElementById('blockTranslateToggle');
  const blockStored = await chrome.storage.local.get(STORAGE_KEYS.blockTranslate);
  blockToggle.checked = blockStored[STORAGE_KEYS.blockTranslate] ?? true;
  blockToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.blockTranslate]: blockToggle.checked });
  });
```

- [ ] **Step 8: Broaden the privacy wording**

In `PRIVACY.md`, replace line 32:

```markdown
When you request a translation, the selected text is sent to your chosen AI provider's API for processing. This is necessary for the translation functionality to work.
```

with:

```markdown
When you request a translation, the text you asked to translate is sent to your chosen AI provider's API for processing. This is necessary for the translation functionality to work. Depending on which action you use, that text is a selection you made, a block or section you pointed at, or the visible text of the page.
```

- [ ] **Step 9: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, including `tests/web-accessible-resources.test.js`, which now resolves `content/blocks/index.js` and everything it imports.

- [ ] **Step 10: Manual verification**

Build and load the unpacked extension, then check all four:

```bash
npm run build:dev
```

1. On `en.wikipedia.org`, hover a body paragraph — one icon appears in the left margin. Click it; Persian appears beneath, the English is untouched.
2. On the same page, hover a section heading — clicking translates the heading and its paragraphs, interleaved, stopping at the next heading of the same rank.
3. On the same page, hover the left sidebar navigation and the table of contents — **no icon should appear**.
4. On `x.com`, hover a post body — the icon appears. Click, then scroll far enough to recycle the row and scroll back; the translation is still attached to the right post, and no post shows another post's translation.

- [ ] **Step 11: Commit**

```bash
git add content/main.js lib/constants.js lib/i18n.js settings/settings.html settings/settings.js PRIVACY.md tests/block-i18n.test.js tests/storage-settings.test.js
git commit -m "feat(blocks): enable block translate in the content script

Alt+B is handled in the content script rather than manifest.commands,
because Chrome allows only four suggested keys and all four are taken.

The privacy wording said \"the selected text\", which was narrower than
what the extension has actually sent since full-page translate shipped."
```

---

## Verification

After Task 10, the branch is complete when all of these hold:

```bash
npm test          # every suite green, including web-accessible-resources
npm run lint      # no errors
git status        # clean, nothing under landing/ staged
git log --oneline main..feat/block-translate   # 11 commits: spec + 10 tasks
```

And the four manual checks in Task 10 Step 10 pass in a real browser. Tests cannot cover the fourth — timeline recycling on X is the failure mode the whole architecture exists to prevent, and it needs a human to scroll.
