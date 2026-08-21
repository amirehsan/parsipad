# Translation Card Implementation Plan (ParsiPad 3.0, sub-project 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating box's and the popup's hand-rolled result rendering with one shared card renderer that shows what the pipeline actually returns: the contextual answer first, the source word with its pronunciation and part of speech, and the other senses with their examples available but out of the way.

**Architecture:** A new `shared/card/` package turns a result object into DOM and knows nothing about Chrome. Hosts supply a shell and a set of callbacks; an omitted callback omits its control. Card styles ship as a string so the floating box can inject them into its closed shadow root and the popup into its document. Placement becomes a pure function fed real measurements instead of a hardcoded height estimate.

**Tech Stack:** Chrome MV3 extension, ES modules bundled by esbuild (`npm run build`), Vitest (`npm test`), ESLint (`npm run lint`), no framework.

**Spec:** `docs/superpowers/specs/2026-08-21-translation-card-design.md`

## Global Constraints

- Branch `feat/card-2a` off `main`; one commit per task; conventional commit messages; never mention "claude code" and never add a `Co-Authored-By` trailer.
- No em dashes and no emojis in code, comments, docs, labels or commit messages. Invisible characters are written as `\uXXXX` escapes in source and tests; visible Persian and Arabic letters stay literal.
- ESLint per `eslint.config.js`: single quotes, semicolons, `eqeqeq`, `no-var`, `prefer-const`, unused args prefixed `_`. No-interpolation template literals are flagged by the quotes rule. Lint must end with zero errors and zero warnings.
- `shared/card/` must not import from `lib/storage.js`, `lib/cache.js`, `background/`, or reference `chrome.*` or `window.*`. It may import `lib/i18n.js` and `lib/language-detect.js`. It builds DOM through `document.createElement` only.
- Every card selector is prefixed `pp-card-` so it cannot collide with popup or host-page styles.
- Every icon-only control carries an `aria-label`. `title` alone is never sufficient.
- Persian text nodes carry `lang="fa"`; each node's `dir` comes from its own text through `getTextDirection`, never from the translation direction.
- **Test environment decision:** card tests need a real DOM. Add `happy-dom` as a dev dependency and opt in per file with a `@vitest-environment happy-dom` docblock, leaving `vitest.config.js` on `node` so all 199 existing tests keep their current environment. Rationale: a hand-rolled shim covering `querySelector` is where shims stop being small, and assertions about card structure are only meaningful against a real query engine.
- The app must build and work at the end of every task. Unlike sub-project 1 there is no deliberate broken window: the old rendering stays in place until the task that replaces it.
- Tests live in `tests/*.test.js` and run with `npx vitest run <file>`.

## File structure

| File | Responsibility |
|---|---|
| `shared/card/labels.js` (new) | `cardLabel(key, lang)`, the card's only source of wording |
| `shared/card/styles.js` (new) | `CARD_STYLES` CSS string, `injectCardStyles(root)` guard helper |
| `shared/card/parts.js` (new) | direction pill, source line, note, disclosure, actions row, provider indicator |
| `shared/card/word-card.js` (new) | word and phrase body |
| `shared/card/sentence-card.js` (new) | sentence body |
| `shared/card/text-card.js` (new) | text and batch body |
| `shared/card/index.js` (new) | `renderCard(result, options)` dispatcher |
| `content/placement.js` (new) | `computeBoxPosition(rects)` pure placement |
| `content/main.js` | floating box adopts the card; measure-then-place; `clampBoxIntoViewport` and `BOX_HEIGHT_ESTIMATE` deleted |
| `content/styles/index.js` | card styles appended to the shadow styles; dead rules removed |
| `popup/popup.js`, `popup/popup.html`, `popup/popup.css` | popup adopts the card |
| `lib/i18n.js` | card label keys in both languages; dead keys removed |
| `package.json`, `vitest.config.js` | `happy-dom` dev dependency |

---

### Task 1: Card labels

**Files:**
- Create: `shared/card/labels.js`
- Modify: `lib/i18n.js`
- Test: `tests/card-labels.test.js`

**Interfaces:**
- Produces: `CARD_LABEL_KEYS` (frozen array of the key names), `cardLabel(key, lang, vars)` returning the localized string with `{provider}`-style placeholders substituted.

- [ ] **Step 1: Write the failing test**

```js
// tests/card-labels.test.js
import { describe, it, expect } from 'vitest';
import { CARD_LABEL_KEYS, cardLabel } from '../shared/card/labels.js';
import { translations } from '../lib/i18n.js';

describe('card labels', () => {
  it.each(CARD_LABEL_KEYS)('%s exists in both languages', (key) => {
    expect(typeof translations.en[key]).toBe('string');
    expect(translations.en[key].length).toBeGreaterThan(0);
    expect(typeof translations.fa[key]).toBe('string');
    expect(translations.fa[key].length).toBeGreaterThan(0);
  });

  it('returns the localized string', () => {
    expect(cardLabel('cardOtherMeanings', 'en')).toBe('Other meanings');
    expect(cardLabel('cardOtherMeanings', 'fa')).toBe(translations.fa.cardOtherMeanings);
  });

  it('falls back to English for an unknown language', () => {
    expect(cardLabel('cardAlso', 'de')).toBe('Also');
  });

  it('substitutes placeholders', () => {
    const en = cardLabel('cardProviderHint', 'en', { provider: 'Gemini' });
    expect(en).toContain('Gemini');
    expect(en).not.toContain('{provider}');
    const fa = cardLabel('cardProviderHint', 'fa', { provider: 'Gemini' });
    expect(fa).toContain('Gemini');
    expect(fa).not.toContain('{provider}');
  });

  it('leaves an unsubstituted placeholder alone rather than printing undefined', () => {
    expect(cardLabel('cardProviderHint', 'en')).not.toContain('undefined');
  });

  it('returns the key itself for an unknown key, never empty', () => {
    expect(cardLabel('cardNoSuchKey', 'en')).toBe('cardNoSuchKey');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/card-labels.test.js`
Expected: FAIL with "Failed to load url ../shared/card/labels.js"

- [ ] **Step 3: Write the implementation**

```js
// shared/card/labels.js
import { t } from '../../lib/i18n.js';

/**
 * Every label the card can render. The test asserts each one resolves in
 * both interface languages, so adding a key here without translating it
 * fails the suite rather than shipping an English string to a Persian UI.
 */
export const CARD_LABEL_KEYS = Object.freeze([
  'cardOtherMeanings',
  'cardAlso',
  'cardHere',
  'cardNote',
  'cardListen',
  'cardCopy',
  'cardSave',
  'cardSentence',
  'cardExplain',
  'cardSwap',
  'cardClose',
  'cardExpandSource',
  'cardProviderHint',
  'cardSynonyms',
  'cardAntonyms'
]);

/**
 * Localized card label with {name} placeholder substitution.
 * @param {string} key
 * @param {string} lang - interface language
 * @param {Object} [vars] - placeholder values
 * @returns {string}
 */
export function cardLabel(key, lang, vars) {
  const raw = t(key, lang);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  ));
}
```

In `lib/i18n.js`, add to the `en` block immediately after the existing `explainGrammar` entry:

```js
    cardOtherMeanings: 'Other meanings',
    cardAlso: 'Also',
    cardHere: 'Here',
    cardNote: 'Note',
    cardListen: 'Listen',
    cardCopy: 'Copy',
    cardSave: 'Save to favorites',
    cardSentence: 'Translate the sentence',
    cardExplain: 'Explain grammar',
    cardSwap: 'Swap direction',
    cardClose: 'Close',
    cardExpandSource: 'Show full text',
    cardProviderHint: 'Translated by {provider}. Open provider settings',
    cardSynonyms: 'Similar',
    cardAntonyms: 'Opposite',
```

and to the `fa` block immediately after its `explainGrammar` entry:

```js
    cardOtherMeanings: 'معنی\u200cهای دیگر',
    cardAlso: 'همچنین',
    cardHere: 'در این جمله',
    cardNote: 'نکته',
    cardListen: 'خواندن',
    cardCopy: 'کپی',
    cardSave: 'افزودن به علاقه\u200cمندی\u200cها',
    cardSentence: 'ترجمه جمله',
    cardExplain: 'توضیح گرامر',
    cardSwap: 'تغییر جهت ترجمه',
    cardClose: 'بستن',
    cardExpandSource: 'نمایش متن کامل',
    cardProviderHint: 'ترجمه با {provider}. باز کردن تنظیمات ارائه\u200cدهنده',
    cardSynonyms: 'مشابه',
    cardAntonyms: 'متضاد',
```

Write every zero-width non-joiner in those Persian strings as `\u200c`. The affected strings are `cardOtherMeanings` (معنی\u200cهای), `cardSave` (علاقه\u200cمندی\u200cها) and `cardProviderHint` (ارائه\u200cدهنده).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/card-labels.test.js`
Expected: PASS (20 tests: 15 from `it.each` plus 5)

- [ ] **Step 5: Commit**

```bash
npm run lint && npm test && git add shared/card/labels.js lib/i18n.js tests/card-labels.test.js && git commit -m "feat(card): add card label keys in English and Persian"
```

---

### Task 2: Card styles

**Files:**
- Create: `shared/card/styles.js`
- Test: `tests/card-styles.test.js`

**Interfaces:**
- Produces: `CARD_STYLES` (CSS string), `injectCardStyles(root, doc)` which appends a `<style>` carrying `CARD_STYLES` to `root` once and returns whether it injected.

- [ ] **Step 1: Write the failing test**

```js
// tests/card-styles.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { CARD_STYLES, injectCardStyles } from '../shared/card/styles.js';

describe('CARD_STYLES', () => {
  it('scopes every class selector under the pp-card prefix', () => {
    const classes = CARD_STYLES.match(/\.[a-zA-Z][\w-]*/g) || [];
    const unscoped = [...new Set(classes)].filter(c => !c.startsWith('.pp-card'));
    expect(unscoped).toEqual([]);
  });

  it('defines the dark theme through the same mechanism the box already uses', () => {
    expect(CARD_STYLES).toContain(":host([data-theme='dark'])");
  });

  it('contains no em dashes and no literal invisible characters', () => {
    expect(CARD_STYLES).not.toMatch(/—/);
    expect(CARD_STYLES).not.toMatch(/[\u00ad\u200b\u200c\u200d\ufeff ]/);
  });

  it('gives Persian more leading than Latin at the same size', () => {
    expect(CARD_STYLES).toMatch(/\[dir="rtl"\]/);
  });
});

describe('injectCardStyles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('injects once and reports it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    expect(injectCardStyles(host, document)).toBe(true);
    expect(host.querySelectorAll('style')).toHaveLength(1);
  });

  it('is idempotent', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    injectCardStyles(host, document);
    expect(injectCardStyles(host, document)).toBe(false);
    expect(host.querySelectorAll('style')).toHaveLength(1);
  });

  it('treats separate roots independently, so a shadow root and the document each get their own', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    expect(injectCardStyles(a, document)).toBe(true);
    expect(injectCardStyles(b, document)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/card-styles.test.js`
Expected: FAIL with "Failed to load url ../shared/card/styles.js" (and, if `happy-dom` is not yet installed, an environment error; install it in step 3)

- [ ] **Step 3: Write the implementation**

First add the dev dependency:

```bash
npm install --save-dev happy-dom
```

Then write `shared/card/styles.js`. The CSS below is the complete card stylesheet; type sizes and leading follow what shipped in sub-project 1 (17px translation, Persian leading above Latin) and the colours reuse the box's existing custom properties so the card inherits the host's theme rather than defining its own palette.

```js
// shared/card/styles.js
/**
 * The card's stylesheet, exported as a string.
 *
 * The floating box needs these rules inside a closed shadow root and the
 * popup needs them in its document, so they cannot live in a stylesheet
 * file that only one of the two can load. Colours come from the custom
 * properties the box already defines, so the card follows whatever theme
 * its host is in without knowing which host that is.
 */
export const CARD_STYLES = `
    .pp-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .pp-card-source {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px;
      font-size: 13px;
      color: var(--pp-text-secondary);
    }
    .pp-card-source-text {
      font-weight: 600;
      color: var(--pp-text);
    }
    .pp-card-source-ipa {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }
    .pp-card-source-pos {
      font-style: italic;
    }
    .pp-card-source-expand {
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      color: var(--pp-primary);
      cursor: pointer;
      text-decoration: underline;
    }

    .pp-card-translation {
      font-size: 17px;
      line-height: 1.55;
      color: var(--pp-text);
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .pp-card-translation[dir="rtl"] {
      line-height: 1.75;
      text-align: right;
    }

    .pp-card-note {
      font-size: 13px;
      line-height: 1.6;
      color: var(--pp-text-secondary);
    }
    .pp-card-note[dir="rtl"] {
      line-height: 1.8;
      text-align: right;
    }
    .pp-card-note-lead {
      font-weight: 600;
    }

    .pp-card-disclosure {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      background: none;
      border: none;
      border-top: 1px solid var(--pp-border);
      padding: 10px 0 0;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      color: var(--pp-text-secondary);
      cursor: pointer;
      text-align: start;
    }
    .pp-card-disclosure:hover {
      color: var(--pp-text);
    }
    .pp-card-disclosure-caret {
      display: inline-block;
      transition: transform 0.15s ease;
    }
    .pp-card-disclosure[aria-expanded="true"] .pp-card-disclosure-caret {
      transform: rotate(90deg);
    }

    .pp-card-senses {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pp-card-sense-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .pp-card-sense-pos {
      font-size: 11px;
      font-style: italic;
      color: var(--pp-text-muted);
      flex-shrink: 0;
    }
    .pp-card-sense-meaning {
      font-size: 14px;
      line-height: 1.6;
      color: var(--pp-text);
    }
    .pp-card-sense-meaning[dir="rtl"] {
      line-height: 1.8;
    }
    .pp-card-example {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--pp-text-secondary);
    }
    .pp-card-example[dir="rtl"] {
      line-height: 1.8;
    }

    .pp-card-alternatives {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pp-card-alternative-label {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--pp-text-muted);
      margin-bottom: 2px;
    }
    .pp-card-alternative-text {
      font-size: 14px;
      line-height: 1.6;
      color: var(--pp-text);
    }
    .pp-card-alternative-text[dir="rtl"] {
      line-height: 1.8;
    }

    .pp-card-wordlist {
      font-size: 12px;
      line-height: 1.7;
      color: var(--pp-text-secondary);
    }
    .pp-card-wordlist-label {
      font-weight: 600;
    }

    .pp-card-truncated {
      font-size: 12px;
      line-height: 1.5;
      color: #b45309;
    }
    :host([data-theme='dark']) .pp-card-truncated {
      color: #fbbf24;
    }
    .pp-card-truncated[dir="rtl"] {
      line-height: 1.8;
    }

    .pp-card-provider {
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      font-size: 11px;
      color: var(--pp-text-muted);
      cursor: pointer;
    }
    .pp-card-provider:hover {
      color: var(--pp-text-secondary);
      text-decoration: underline;
    }
`;

const INJECTED = new WeakSet();

/**
 * Append the card stylesheet to a root once.
 *
 * Roots are tracked by identity rather than by a marker element, so a
 * shadow root and the document can each hold their own copy without one
 * suppressing the other.
 *
 * @param {Node} root - shadow root, document head, or any container
 * @param {Document} doc - document used to create the style element
 * @returns {boolean} true when this call performed the injection
 */
export function injectCardStyles(root, doc) {
  if (!root || INJECTED.has(root)) return false;
  const style = doc.createElement('style');
  style.textContent = CARD_STYLES;
  root.appendChild(style);
  INJECTED.add(root);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/card-styles.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Confirm the existing suite is unaffected by the new dependency**

Run: `npm test`
Expected: all previous tests still pass in the node environment; only the new file uses happy-dom.

- [ ] **Step 6: Commit**

```bash
npm run lint && git add shared/card/styles.js tests/card-styles.test.js package.json package-lock.json && git commit -m "feat(card): add the card stylesheet as an injectable string"
```

---

### Task 3: Card parts

**Files:**
- Create: `shared/card/parts.js`
- Test: `tests/card-parts.test.js`

**Interfaces:**
- Consumes: `cardLabel` (Task 1), `getTextDirection` from `lib/language-detect.js`.
- Produces: `directionPill({ direction, onSwap, lang, doc })`, `sourceLine({ text, pronunciation, pos, onExpand, lang, doc })`, `note({ lead, text, lang, doc })`, `disclosure({ label, expanded, onToggle, content, lang, doc, idSuffix })`, `wordList({ label, words, doc })`, `truncationNotice({ text, doc })`, `providerButton({ provider, onOpenSettings, lang, doc })`, `actionsRow({ actions, lang, doc })`.
- Every builder takes an explicit `doc` so nothing reaches for a global `document`, and returns an `HTMLElement`.
- `directionText(direction)` returns the pill's text, for example `en-fa` becomes `EN to FA` rendered with an arrow glyph.

- [ ] **Step 1: Write the failing test**

```js
// tests/card-parts.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { directionPill, sourceLine, note, disclosure, wordList, truncationNotice, providerButton, actionsRow } from '../shared/card/parts.js';

const doc = () => document;

describe('directionPill', () => {
  it('shows the resolved direction and swaps on activation', () => {
    const onSwap = vi.fn();
    const el = directionPill({ direction: 'en-fa', onSwap, lang: 'en', doc: doc() });
    expect(el.textContent).toContain('EN');
    expect(el.textContent).toContain('FA');
    const swap = el.querySelector('button');
    expect(swap.getAttribute('aria-label')).toBe('Swap direction');
    swap.click();
    expect(onSwap).toHaveBeenCalledWith('fa');
  });

  it('swaps the other way from a Persian source', () => {
    const onSwap = vi.fn();
    const el = directionPill({ direction: 'fa-en', onSwap, lang: 'en', doc: doc() });
    el.querySelector('button').click();
    expect(onSwap).toHaveBeenCalledWith('en');
  });

  it('omits the swap control when no handler is given', () => {
    const el = directionPill({ direction: 'en-fa', lang: 'en', doc: doc() });
    expect(el.querySelector('button')).toBeNull();
  });
});

describe('sourceLine', () => {
  it('renders text, pronunciation and part of speech, each present only when supplied', () => {
    const full = sourceLine({ text: 'charge', pronunciation: '/tʃɑːrdʒ/', pos: 'verb', lang: 'en', doc: doc() });
    expect(full.querySelector('.pp-card-source-text').textContent).toBe('charge');
    expect(full.querySelector('.pp-card-source-ipa').textContent).toContain('rd');
    expect(full.querySelector('.pp-card-source-pos').textContent).toBe('verb');

    const bare = sourceLine({ text: 'charge', pronunciation: '', pos: '', lang: 'en', doc: doc() });
    expect(bare.querySelector('.pp-card-source-ipa')).toBeNull();
    expect(bare.querySelector('.pp-card-source-pos')).toBeNull();
  });

  it('takes its direction from the source text', () => {
    const fa = sourceLine({ text: 'کتاب', pronunciation: '', pos: '', lang: 'en', doc: doc() });
    expect(fa.getAttribute('dir')).toBe('rtl');
    expect(fa.getAttribute('lang')).toBe('fa');
  });

  it('offers an expand control only when a handler is given', () => {
    const onExpand = vi.fn();
    const long = sourceLine({ text: 'a '.repeat(60), pronunciation: '', pos: '', onExpand, lang: 'en', doc: doc() });
    const btn = long.querySelector('.pp-card-source-expand');
    expect(btn.textContent).toBe('Show full text');
    btn.click();
    expect(onExpand).toHaveBeenCalled();
    const short = sourceLine({ text: 'charge', pronunciation: '', pos: '', lang: 'en', doc: doc() });
    expect(short.querySelector('.pp-card-source-expand')).toBeNull();
  });
});

describe('note', () => {
  it('renders a lead word and the text, with direction from the text', () => {
    const el = note({ lead: 'Here', text: 'a fee for late returns', lang: 'en', doc: doc() });
    expect(el.querySelector('.pp-card-note-lead').textContent).toContain('Here');
    expect(el.textContent).toContain('a fee for late returns');
    expect(el.getAttribute('dir')).toBe('ltr');

    const fa = note({ lead: 'نکته', text: 'این یک نکته است', lang: 'fa', doc: doc() });
    expect(fa.getAttribute('dir')).toBe('rtl');
    expect(fa.getAttribute('lang')).toBe('fa');
  });
});

describe('disclosure', () => {
  it('is a button wired to aria-expanded and toggles its content', () => {
    const content = document.createElement('div');
    content.textContent = 'senses';
    const el = disclosure({ label: 'Other meanings (3)', expanded: false, content, lang: 'en', doc: doc(), idSuffix: 'x' });
    const btn = el.querySelector('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBeTruthy();
    expect(el.querySelector('#' + btn.getAttribute('aria-controls')).hidden).toBe(true);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#' + btn.getAttribute('aria-controls')).hidden).toBe(false);
  });

  it('reports toggles so a host can remember the state', () => {
    const onToggle = vi.fn();
    const el = disclosure({ label: 'Other meanings (2)', expanded: true, onToggle, content: document.createElement('div'), lang: 'en', doc: doc(), idSuffix: 'y' });
    const btn = el.querySelector('button');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('wordList', () => {
  it('renders only when there are words', () => {
    const el = wordList({ label: 'Similar', words: ['هزینه', 'مبلغ'], doc: doc() });
    expect(el.textContent).toContain('Similar');
    expect(el.textContent).toContain('هزینه');
    expect(wordList({ label: 'Similar', words: [], doc: doc() })).toBeNull();
  });
});

describe('truncationNotice', () => {
  it('carries its own direction', () => {
    const el = truncationNotice({ text: 'ترجمه ناقص ماند.', doc: doc() });
    expect(el.getAttribute('dir')).toBe('rtl');
  });
});

describe('providerButton', () => {
  it('names the provider and opens settings', () => {
    const onOpenSettings = vi.fn();
    const el = providerButton({ provider: 'Gemini', onOpenSettings, lang: 'en', doc: doc() });
    expect(el.textContent).toBe('Gemini');
    expect(el.getAttribute('aria-label')).toContain('Gemini');
    el.click();
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('renders nothing without a provider', () => {
    expect(providerButton({ provider: '', lang: 'en', doc: doc() })).toBeNull();
  });
});

describe('actionsRow', () => {
  it('renders one labelled control per supplied action and skips the rest', () => {
    const onCopy = vi.fn();
    const el = actionsRow({ actions: [
      { key: 'cardCopy', onActivate: onCopy },
      { key: 'cardListen', onActivate: null }
    ], lang: 'en', doc: doc() });
    const buttons = el.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Copy');
    buttons[0].click();
    expect(onCopy).toHaveBeenCalled();
  });

  it('returns null when nothing is actionable', () => {
    expect(actionsRow({ actions: [{ key: 'cardCopy', onActivate: null }], lang: 'en', doc: doc() })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/card-parts.test.js`
Expected: FAIL with "Failed to load url ../shared/card/parts.js"

- [ ] **Step 3: Write the implementation**

Write `shared/card/parts.js` implementing exactly the interfaces the test exercises. Requirements that the test pins and that you must not drift from:

- Every builder accepts `doc` and uses `doc.createElement`; none reads a global `document`.
- A builder whose content would be empty returns `null` rather than an empty element, so callers can append unconditionally with a falsy guard. This applies to `wordList`, `providerButton` and `actionsRow`.
- `directionPill` renders the two language codes uppercased with an arrow between them, and calls `onSwap` with the language code that should become the new source: the current target. Derive both from the `direction` string by splitting on the hyphen.
- `sourceLine` sets `dir` and, when right to left, `lang="fa"` on the container, derived from the source text through `getTextDirection`. It appends the pronunciation and part of speech spans only when those strings are non-empty, and the expand control only when `onExpand` is supplied.
- `note` renders the lead inside `.pp-card-note-lead` followed by a colon and a space, then the text, with `dir` and `lang` from the text.
- `disclosure` builds a wrapper containing a `button` and a content container. The button carries `aria-expanded` and `aria-controls` pointing at the content container's id, which is `pp-card-disclosure-${idSuffix}`. Clicking flips `aria-expanded`, flips the content container's `hidden`, and calls `onToggle(nextExpanded)` when supplied. The caret span is present so the stylesheet can rotate it.
- `truncationNotice` sets `role="status"` and takes its direction from its text.
- `providerButton` is a `button` whose text is the provider name and whose `aria-label` is `cardProviderHint` with the provider substituted.
- `actionsRow` maps each entry with a truthy `onActivate` to a `button` whose `aria-label` is the localized label for its `key`, and whose visible content is the label text. Entries without a handler are skipped entirely.

Use `getTextDirection` from `lib/language-detect.js` for every direction decision so the card behaves the same way the rest of the extension does.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/card-parts.test.js`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && npm test && git add shared/card/parts.js tests/card-parts.test.js && git commit -m "feat(card): add the shared card parts"
```

---

### Task 4: Word and phrase card

**Files:**
- Create: `shared/card/word-card.js`
- Test: `tests/card-word.test.js`

**Interfaces:**
- Consumes: everything from Task 3, plus `cardLabel`.
- Produces: `renderWordCard(result, options) -> HTMLElement`.
- `options` carries `lang`, `doc`, `sensesExpanded`, `onToggleSenses`, and the action callbacks described in the spec.

- [ ] **Step 1: Write the failing test**

```js
// tests/card-word.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderWordCard } from '../shared/card/word-card.js';

const base = {
  translation: 'جریمه کردن',
  mode: 'word',
  direction: 'en-fa',
  sourceText: 'charge',
  pronunciation: '/tʃɑːrdʒ/',
  pos: 'verb',
  register: 'neutral',
  inContext: 'Here it means to demand money as a penalty.',
  senses: [
    { pos: 'verb', meaning: 'جریمه کردن', example: { src: 'they charged a fee', tgt: 'هزینه گرفتند' } },
    { pos: 'noun', meaning: 'اتهام', example: { src: 'a charge of fraud', tgt: 'اتهام کلاهبرداری' } },
    { pos: 'verb', meaning: 'شارژ کردن', example: { src: 'charge the phone', tgt: 'گوشی را شارژ کن' } }
  ],
  synonyms: ['bill', 'levy'],
  antonyms: ['refund'],
  correction: '',
  truncated: false
};
const opts = () => ({ lang: 'en', doc: document });

describe('renderWordCard', () => {
  it('leads with the contextual translation', () => {
    const el = renderWordCard(base, opts());
    const t = el.querySelector('.pp-card-translation');
    expect(t.textContent).toBe('جریمه کردن');
    expect(t.getAttribute('dir')).toBe('rtl');
    expect(t.getAttribute('lang')).toBe('fa');
  });

  it('shows the source word with its pronunciation and part of speech', () => {
    const el = renderWordCard(base, opts());
    expect(el.querySelector('.pp-card-source-text').textContent).toBe('charge');
    expect(el.querySelector('.pp-card-source-ipa')).not.toBeNull();
    expect(el.querySelector('.pp-card-source-pos').textContent).toBe('verb');
  });

  it('renders the in-context note under the Here lead', () => {
    const el = renderWordCard(base, opts());
    expect(el.querySelector('.pp-card-note').textContent).toContain('Here');
    expect(el.querySelector('.pp-card-note').textContent).toContain('demand money');
  });

  it('counts other meanings excluding the one already shown', () => {
    const el = renderWordCard(base, opts());
    expect(el.querySelector('.pp-card-disclosure').textContent).toContain('Other meanings (2)');
  });

  it('renders each remaining sense with its part of speech and both example sides', () => {
    const el = renderWordCard(base, { ...opts(), sensesExpanded: true });
    const senses = el.querySelectorAll('.pp-card-senses > li');
    expect(senses).toHaveLength(2);
    expect(senses[0].textContent).toContain('noun');
    expect(senses[0].textContent).toContain('اتهام');
    expect(senses[0].textContent).toContain('a charge of fraud');
    expect(senses[0].textContent).toContain('اتهام کلاهبرداری');
  });

  it('gives each sense meaning its own direction', () => {
    const el = renderWordCard(base, { ...opts(), sensesExpanded: true });
    const meaning = el.querySelector('.pp-card-sense-meaning');
    expect(meaning.getAttribute('dir')).toBe('rtl');
  });

  it('lists synonyms and antonyms only when present', () => {
    const withLists = renderWordCard(base, { ...opts(), sensesExpanded: true });
    expect(withLists.textContent).toContain('bill');
    expect(withLists.textContent).toContain('refund');
    const without = renderWordCard({ ...base, synonyms: [], antonyms: [] }, { ...opts(), sensesExpanded: true });
    expect(without.querySelector('.pp-card-wordlist')).toBeNull();
  });

  it('omits the disclosure entirely when there is no other sense', () => {
    const single = renderWordCard({ ...base, senses: [base.senses[0]] }, opts());
    expect(single.querySelector('.pp-card-disclosure')).toBeNull();
  });

  it('omits the note when the model returned none', () => {
    const el = renderWordCard({ ...base, inContext: '' }, opts());
    expect(el.querySelector('.pp-card-note')).toBeNull();
  });

  it('offers Listen for an English source and never for a Persian one', () => {
    const onListen = vi.fn();
    const en = renderWordCard(base, { ...opts(), onListen });
    expect([...en.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Listen')).toBe(true);

    const faSource = { ...base, direction: 'fa-en', sourceText: 'کتاب', translation: 'book', senses: [] };
    const fa = renderWordCard(faSource, { ...opts(), onListen });
    const listen = [...fa.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Listen');
    expect(listen).toBeDefined();
    listen.click();
    expect(onListen).toHaveBeenCalledWith('book');
  });

  it('shows a correction when the source was wrong', () => {
    const el = renderWordCard({ ...base, correction: 'charge' }, opts());
    expect(el.querySelector('.pp-card-correction')).not.toBeNull();
  });

  it('renders the provider in the footer and opens settings', () => {
    const onOpenSettings = vi.fn();
    const el = renderWordCard(base, { ...opts(), provider: 'Gemini', onOpenSettings });
    const p = el.querySelector('.pp-card-provider');
    expect(p.textContent).toBe('Gemini');
    p.click();
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/card-word.test.js`
Expected: FAIL with "Failed to load url ../shared/card/word-card.js"

- [ ] **Step 3: Write the implementation**

`renderWordCard(result, options)` composes, in order: the correction line when `result.correction` is non-empty, the source line, the translation, the note, the disclosure, and the footer.

Rules the tests pin:

- The disclosure's sense list excludes the sense whose `meaning` equals `result.translation`. Compare after trimming. When no sense matches, list all of them. The count in the label is the length of the list actually rendered.
- When that list is empty, omit the disclosure entirely rather than rendering an empty one.
- Synonyms and antonyms render inside the disclosure content, after the senses, through `wordList`, which returns null when empty.
- The Listen action is offered when the text it would speak is English. The text to speak is the English side of the pair: `sourceText` when the direction starts with `en`, otherwise `translation`. Pass that text to `onListen`.
- The Explain action is omitted for a single word regardless of whether a handler is supplied, because a lone word has no grammar to explain. Phrases keep it.
- The footer holds the actions row on one side and the provider button on the other. Both are omitted when they would be empty, and the footer itself is omitted when both are.

Use the parts from Task 3 for every piece; this module composes, it does not build elements directly except for its own container and the correction line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/card-word.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && npm test && git add shared/card/word-card.js tests/card-word.test.js && git commit -m "feat(card): render word and phrase results with senses and examples"
```

---

### Task 5: Sentence and text cards

**Files:**
- Create: `shared/card/sentence-card.js`, `shared/card/text-card.js`
- Test: `tests/card-sentence.test.js`, `tests/card-text.test.js`

**Interfaces:**
- Produces: `renderSentenceCard(result, options) -> HTMLElement`, `renderTextCard(result, options) -> HTMLElement`. Same options shape as Task 4.

- [ ] **Step 1: Write the failing tests**

```js
// tests/card-sentence.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderSentenceCard } from '../shared/card/sentence-card.js';

const base = {
  translation: 'جریمه می\u200cشوید',
  mode: 'sentence',
  direction: 'en-fa',
  sourceText: 'They will charge you a fee for late returns.',
  register: 'neutral',
  alternatives: [
    { text: 'مبلغی از شما دریافت می\u200cشود', label: 'more formal' },
    { text: 'ازت پول می\u200cگیرن', label: 'colloquial' }
  ],
  note: 'Persian prefers the passive here.',
  correction: '',
  truncated: false
};
const opts = () => ({ lang: 'en', doc: document });

describe('renderSentenceCard', () => {
  it('shows the source sentence and the translation', () => {
    const el = renderSentenceCard(base, opts());
    expect(el.querySelector('.pp-card-source-text').textContent).toContain('charge you a fee');
    expect(el.querySelector('.pp-card-translation').textContent).toBe('جریمه می\u200cشوید');
  });

  it('labels alternatives under Also with a count', () => {
    const el = renderSentenceCard(base, opts());
    expect(el.querySelector('.pp-card-disclosure').textContent).toContain('Also (2)');
  });

  it('renders each alternative with its label tag and its own direction', () => {
    const el = renderSentenceCard(base, { ...opts(), sensesExpanded: true });
    const items = el.querySelectorAll('.pp-card-alternatives > li');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.pp-card-alternative-label').textContent).toContain('more formal');
    expect(items[0].querySelector('.pp-card-alternative-text').getAttribute('dir')).toBe('rtl');
  });

  it('renders the note under the Note lead', () => {
    const el = renderSentenceCard(base, opts());
    expect(el.querySelector('.pp-card-note').textContent).toContain('Note');
    expect(el.querySelector('.pp-card-note').textContent).toContain('passive');
  });

  it('never offers the Sentence action, because this already is one', () => {
    const el = renderSentenceCard(base, { ...opts(), onTranslateSentence: vi.fn() });
    expect([...el.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Translate the sentence')).toBe(false);
  });

  it('offers Explain when a handler is supplied', () => {
    const el = renderSentenceCard(base, { ...opts(), onExplainGrammar: vi.fn() });
    expect([...el.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Explain grammar')).toBe(true);
  });

  it('omits the disclosure when there are no alternatives', () => {
    const el = renderSentenceCard({ ...base, alternatives: [] }, opts());
    expect(el.querySelector('.pp-card-disclosure')).toBeNull();
  });
});
```

```js
// tests/card-text.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderTextCard } from '../shared/card/text-card.js';

const base = {
  translation: 'یک. دو. سه.',
  mode: 'text',
  direction: 'en-fa',
  sourceText: 'One. Two. Three.',
  truncated: false
};
const opts = () => ({ lang: 'en', doc: document });

describe('renderTextCard', () => {
  it('shows the translation and no source line', () => {
    const el = renderTextCard(base, opts());
    expect(el.querySelector('.pp-card-translation').textContent).toBe('یک. دو. سه.');
    expect(el.querySelector('.pp-card-source')).toBeNull();
  });

  it('shows the truncation notice only when truncated', () => {
    expect(renderTextCard(base, opts()).querySelector('.pp-card-truncated')).toBeNull();
    const cut = renderTextCard({ ...base, truncated: true }, opts());
    expect(cut.querySelector('.pp-card-truncated')).not.toBeNull();
  });

  it('offers Copy and Save but not Sentence or Explain', () => {
    const el = renderTextCard(base, {
      ...opts(),
      onCopy: vi.fn(), onSave: vi.fn(), onTranslateSentence: vi.fn(), onExplainGrammar: vi.fn()
    });
    const labels = [...el.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
    expect(labels).toContain('Copy');
    expect(labels).not.toContain('Translate the sentence');
    expect(labels).not.toContain('Explain grammar');
  });

  it('exposes the translation element so a host can stream into it', () => {
    const el = renderTextCard({ ...base, translation: '' }, opts());
    const target = el.querySelector('.pp-card-translation');
    expect(target).not.toBeNull();
    target.textContent = 'partial';
    expect(el.querySelector('.pp-card-translation').textContent).toBe('partial');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/card-sentence.test.js tests/card-text.test.js`
Expected: FAIL, both modules missing

- [ ] **Step 3: Write the implementations**

`renderSentenceCard` composes: correction when present, source line (with an expand handler when the source exceeds 160 characters, so long sentences clamp), translation, note under the `cardNote` lead, disclosure labelled `Also (N)` holding the alternatives list, then the footer. Each alternative is a list item containing its label tag and its text, the text carrying its own direction and `lang`. The Sentence action is never offered.

`renderTextCard` composes: translation, truncation notice when `result.truncated`, then the footer with Copy and Save only. No source line, because the user selected the text and can see it. The translation element must be present even when `result.translation` is empty, so a host can stream into it.

Both reuse the Task 3 parts and follow the same footer rules as Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/card-sentence.test.js tests/card-text.test.js`
Expected: PASS (7 + 4 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && npm test && git add shared/card/sentence-card.js shared/card/text-card.js tests/card-sentence.test.js tests/card-text.test.js && git commit -m "feat(card): render sentence and text results"
```

---

### Task 6: The renderCard dispatcher

**Files:**
- Create: `shared/card/index.js`
- Test: `tests/card-render.test.js`

**Interfaces:**
- Produces: `renderCard(result, options) -> HTMLElement`, dispatching on `result.mode`, defaulting to the text card for an unknown or missing mode.

- [ ] **Step 1: Write the failing test**

```js
// tests/card-render.test.js
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderCard } from '../shared/card/index.js';

const opts = () => ({ lang: 'en', doc: document });
const of = (mode, extra = {}) => ({
  translation: 'ترجمه', direction: 'en-fa', sourceText: 'source', mode,
  senses: [], alternatives: [], truncated: false, correction: '', ...extra
});

describe('renderCard', () => {
  it('routes each mode to its card', () => {
    expect(renderCard(of('word', { pronunciation: '/x/', pos: 'noun' }), opts()).querySelector('.pp-card-source')).not.toBeNull();
    expect(renderCard(of('phrase'), opts()).querySelector('.pp-card-source')).not.toBeNull();
    expect(renderCard(of('sentence'), opts()).querySelector('.pp-card-source')).not.toBeNull();
    expect(renderCard(of('text'), opts()).querySelector('.pp-card-source')).toBeNull();
    expect(renderCard(of('batch'), opts()).querySelector('.pp-card-source')).toBeNull();
  });

  it('falls back to the text card for an unknown or missing mode', () => {
    expect(renderCard(of(undefined), opts()).querySelector('.pp-card-translation')).not.toBeNull();
    expect(renderCard(of('nonsense'), opts()).querySelector('.pp-card-translation')).not.toBeNull();
  });

  it('always produces a container carrying the card class', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      expect(renderCard(of(mode), opts()).classList.contains('pp-card')).toBe(true);
    }
  });

  it('never throws on a minimal result', () => {
    expect(() => renderCard({ translation: 'x', mode: 'word' }, opts())).not.toThrow();
    expect(() => renderCard({ translation: 'x' }, opts())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/card-render.test.js`
Expected: FAIL with "Failed to load url ../shared/card/index.js"

- [ ] **Step 3: Write the implementation**

```js
// shared/card/index.js
import { renderWordCard } from './word-card.js';
import { renderSentenceCard } from './sentence-card.js';
import { renderTextCard } from './text-card.js';

export { CARD_STYLES, injectCardStyles } from './styles.js';

/**
 * Turn a translation result into DOM.
 *
 * The card knows nothing about Chrome, storage or the network. Hosts pass
 * their document and a set of callbacks; an omitted callback omits its
 * control, which is how a surface with no page selection drops the
 * Sentence action without the card knowing hosts exist.
 *
 * @param {object} result - the result contract from the service worker
 * @param {object} options - lang, doc, sensesExpanded, provider and callbacks
 * @returns {HTMLElement}
 */
export function renderCard(result, options) {
  switch (result?.mode) {
    case 'word':
    case 'phrase':
      return renderWordCard(result, options);
    case 'sentence':
      return renderSentenceCard(result, options);
    default:
      return renderTextCard(result, options);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/card-render.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && npm test && git add shared/card/index.js tests/card-render.test.js && git commit -m "feat(card): add the renderCard dispatcher"
```

---

### Task 7: Pure box placement

**Files:**
- Create: `content/placement.js`
- Test: `tests/placement.test.js`

**Interfaces:**
- Produces: `computeBoxPosition({ selection, box, viewport, scroll, gap, padding }) -> { top, left, placement }` where every input is a plain rectangle or number, so the function is testable without a DOM.
- `selection` is `{ top, bottom, left }` in viewport coordinates; `box` is `{ width, height }`; `viewport` is `{ width, height }`; `scroll` is `{ x, y }`. `placement` is `'below'` or `'above'`.

- [ ] **Step 1: Write the failing test**

```js
// tests/placement.test.js
import { describe, it, expect } from 'vitest';
import { computeBoxPosition } from '../content/placement.js';

const viewport = { width: 1200, height: 800 };
const scroll = { x: 0, y: 0 };
const box = { width: 450, height: 400 };
const base = { box, viewport, scroll, gap: 8, padding: 12 };

describe('computeBoxPosition', () => {
  it('places the box below the selection when there is room', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 100, bottom: 120, left: 200 } });
    expect(r.placement).toBe('below');
    expect(r.top).toBe(128);
    expect(r.left).toBe(200);
  });

  it('flips above when there is not room below and more room above', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 700, bottom: 720, left: 200 } });
    expect(r.placement).toBe('above');
    expect(r.top).toBe(700 - 400 - 8);
  });

  it('uses the real box height when flipping, not a guess', () => {
    const tall = computeBoxPosition({ ...base, box: { width: 450, height: 600 }, selection: { top: 700, bottom: 720, left: 200 } });
    expect(tall.top).toBe(12);
  });

  it('clamps to the top padding rather than going off the top edge', () => {
    const r = computeBoxPosition({ ...base, box: { width: 450, height: 900 }, selection: { top: 700, bottom: 720, left: 200 } });
    expect(r.top).toBe(12);
  });

  it('clamps the right edge', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 100, bottom: 120, left: 1100 } });
    expect(r.left).toBe(1200 - 450 - 12);
  });

  it('clamps the left edge', () => {
    const r = computeBoxPosition({ ...base, selection: { top: 100, bottom: 120, left: -50 } });
    expect(r.left).toBe(12);
  });

  it('falls back to the padding when the box is wider than the viewport', () => {
    const r = computeBoxPosition({ ...base, box: { width: 2000, height: 400 }, viewport: { width: 500, height: 800 }, selection: { top: 100, bottom: 120, left: 100 } });
    expect(r.left).toBe(12);
  });

  it('returns page coordinates by adding the scroll offset', () => {
    const r = computeBoxPosition({ ...base, scroll: { x: 30, y: 500 }, selection: { top: 100, bottom: 120, left: 200 } });
    expect(r.top).toBe(628);
    expect(r.left).toBe(230);
  });

  it('stays below when neither side has room, choosing the larger space', () => {
    const r = computeBoxPosition({ ...base, box: { width: 450, height: 700 }, selection: { top: 300, bottom: 320, left: 200 } });
    expect(r.placement).toBe('below');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/placement.test.js`
Expected: FAIL with "Failed to load url ../content/placement.js"

- [ ] **Step 3: Write the implementation**

Implement `computeBoxPosition` so that every assertion above holds. The decisions it encodes:

- Prefer below. Flip above only when the box does not fit below and there is strictly more space above than below.
- When flipping, subtract the real box height, then clamp so the top never goes above `padding`.
- Clamp horizontally to `[padding, viewport.width - box.width - padding]`, and when that range is empty because the box is wider than the viewport, use `padding`.
- Return page coordinates by adding `scroll.y` to the top and `scroll.x` to the left, after all viewport-space reasoning is done.

Keep the function free of any DOM reference so it stays unit-testable.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/placement.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
npm run lint && npm test && git add content/placement.js tests/placement.test.js && git commit -m "feat(content): add pure box placement computed from real measurements"
```

---

### Task 8: The floating box adopts the card

**Files:**
- Modify: `content/main.js`, `content/styles/index.js`
- No new test file; verified by the existing suite staying green, lint, build and a browser check.

**Interfaces:**
- Consumes: `renderCard`, `injectCardStyles` (Tasks 2 and 6), `computeBoxPosition` (Task 7).
- Produces: `showTranslation(result, originalText)` rendering through the card; `createFloatingBox` measuring before placing.

This is the task where the user sees the change. Take it carefully.

- [ ] **Step 1: Inject the card styles into the shadow root**

In `createFloatingBox`, after the existing `shadowRoot.appendChild(style)`, call `injectCardStyles(shadowRoot, document)`. The box's own shell styles stay where they are; the card's styles are additive.

- [ ] **Step 2: Measure before placing**

`createFloatingBox(position)` currently receives a position computed from `BOX_HEIGHT_ESTIMATE` before any content exists. Change the flow:

1. `createFloatingBox` builds the host with `visibility: hidden` and appends it, so it has real dimensions but is not yet visible.
2. Add `placeFloatingBox(selectionRect)` which reads `floatingBox.getBoundingClientRect()`, calls `computeBoxPosition` with that height and width, the viewport, and the scroll offset, applies `top` and `left`, then sets `visibility: visible`.
3. `translateAndShow` captures the selection rectangle before the box is created (the selection is cleared once the box takes focus), passes it through, and calls `placeFloatingBox` once after the first content lands, whether that is the loading skeleton or the result.
4. Delete `BOX_HEIGHT_ESTIMATE` and the whole of `getBoxPosition`. Delete `clampBoxIntoViewport` and its call site; `computeBoxPosition` subsumes it.
5. For streamed results, do not re-place on every delta. Re-place only if the box's bottom would leave the viewport, so text does not slide while it is being read.

Update the other creators that used `getBoxPosition`: the polish box, the dictionary box and the screenshot result flow all call it today. They keep their current behavior by calling `placeFloatingBox` in the same way; do not redesign them here.

- [ ] **Step 3: Replace the body of showTranslation**

`showTranslation` currently builds the correction hint, the translation, the rich-context block, the truncation notice and the grammar affordance by hand, and adapts the new result shape onto the old element names. Replace all of that with a single `renderCard` call, keeping the surrounding responsibilities that belong to the host:

```js
function showTranslation(result, originalText) {
  if (!shadowRoot) return;

  currentTranslationData = {
    type: 'translation',
    originalText,
    savedText: result.translation,
    direction: result.displayDirection || result.direction,
    provider: result.provider
  };

  const content = shadowRoot.querySelector('.parsipad-content');
  content.replaceChildren(renderCard(result, {
    lang: userLang,
    doc: document,
    provider: result.provider,
    sensesExpanded: sensesExpandedForSession,
    onToggleSenses: (open) => { sensesExpandedForSession = open; },
    onListen: buildListenHandler(result),
    onCopy: () => handleCopy(),
    onSave: () => handleTranslationFavorite(),
    onTranslateSentence: buildSentenceHandler(result, originalText),
    onExplainGrammar: buildGrammarHandler(result, originalText),
    onSwapDirection: (sourceLang) => translateAndShow(originalText, { sourceLang }),
    onOpenSettings: () => chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' })
  }));

  shadowRoot.querySelector('.parsipad-footer').style.display = 'none';
  placeFloatingBox();
  checkTranslationFavoriteStatus();
}
```

`sensesExpandedForSession` is a new module-level boolean, default false, so a user who opens the senses once keeps them open for the rest of the page's life.

The box's own footer is hidden because the card now carries its own actions and provider indicator. Remove the footer element from the box shell in a later step of this task once nothing references it, along with the cache badge and the provider badge in the header.

`buildListenHandler`, `buildSentenceHandler` and `buildGrammarHandler` are added in Tasks 9 and 10; for this task, pass `null` for the two that do not exist yet so their controls are simply absent, and wire them in those tasks.

- [ ] **Step 4: Delete what the card replaced**

Remove from `content/main.js`: `appendInlineGrammarAffordance` and `renderInlineGrammar` are kept for now and rewired in Task 10, but the hand-built correction hint, translation element, rich-context block and truncation notice inside `showTranslation` all go. Remove from `content/styles/index.js` the rules that nothing references any more: `.parsipad-rich-context*`, `.parsipad-truncated-note`, `.parsipad-text`, `.parsipad-correction-*`, and the provider and cache badge rules in the header. Verify with a grep for each class name before deleting it.

- [ ] **Step 5: Verify**

Run `npm run lint`, `npm test` and `npm run build`. Then reload the extension and check in the browser, on the probe page at `http://localhost:8731/index.html` if it is still served or any page with text:

- Selecting a single word shows the source word with IPA and part of speech, the translation, the note, and a collapsed `Other meanings (N)`.
- Opening the disclosure shows each sense with its part of speech and both example sides.
- Selecting a sentence shows `Also (N)` with labelled alternatives.
- Selecting several paragraphs streams into the card.
- The box near the bottom of the viewport flips above the selection and stays fully on screen.
- The provider name appears in the footer and opens settings.

Report what you saw for each.

- [ ] **Step 6: Commit**

```bash
git add content/main.js content/styles/index.js && git commit -m "feat(content): render the floating box through the shared card"
```

---

### Task 9: Listen

**Files:**
- Create: `shared/speech.js`
- Modify: `content/main.js`
- Test: `tests/speech.test.js`

**Interfaces:**
- Produces: `canSpeak(text)` returning whether the text is English and speech synthesis exists; `speak(text, { onStateChange })`; `cancelSpeech()`.
- `grammar/grammar.js` already contains voice-selection logic and a guard rejecting Persian. Move that logic here and have `grammar.js` import it, so there is one implementation rather than two.

- [ ] **Step 1: Write the failing test**

```js
// tests/speech.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function installSpeechStub() {
  const spoken = [];
  globalThis.speechSynthesis = {
    speaking: false,
    cancel: vi.fn(),
    speak: vi.fn((u) => { spoken.push(u); }),
    getVoices: () => [
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Dariush', lang: 'fa-IR' }
    ]
  };
  globalThis.SpeechSynthesisUtterance = function (text) { this.text = text; };
  return spoken;
}

describe('speech', () => {
  let speech;
  beforeEach(async () => {
    installSpeechStub();
    vi.resetModules();
    speech = await import('../shared/speech.js');
  });

  it('speaks English', () => {
    expect(speech.canSpeak('hello there')).toBe(true);
  });

  it('refuses Persian, because browser Persian voices are not worth shipping', () => {
    expect(speech.canSpeak('سلام دنیا')).toBe(false);
  });

  it('refuses empty text', () => {
    expect(speech.canSpeak('')).toBe(false);
    expect(speech.canSpeak(null)).toBe(false);
  });

  it('reports unavailable when the API is missing', async () => {
    delete globalThis.speechSynthesis;
    vi.resetModules();
    const fresh = await import('../shared/speech.js');
    expect(fresh.canSpeak('hello')).toBe(false);
  });

  it('picks an English voice and never a Persian one', () => {
    const spoken = installSpeechStub();
    speech.speak('hello');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].voice?.lang || spoken[0].lang).toMatch(/^en/);
  });

  it('does not speak Persian even if asked directly', () => {
    const spoken = installSpeechStub();
    speech.speak('سلام');
    expect(spoken).toHaveLength(0);
  });

  it('cancels any current utterance before starting a new one', () => {
    speech.speak('one');
    speech.speak('two');
    expect(globalThis.speechSynthesis.cancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/speech.test.js`
Expected: FAIL with "Failed to load url ../shared/speech.js"

- [ ] **Step 3: Write the implementation**

Read `grammar/grammar.js` first: it already contains the voice-selection loop and the `lang === 'fa'` guard added in 2.11.5. Move that logic into `shared/speech.js` rather than writing new logic, keeping its behavior, then change `grammar/grammar.js` to import `speak` and `cancelSpeech` from the shared module and delete its local copies. `canSpeak` decides by `getTextDirection(text) === 'ltr'` and the presence of `speechSynthesis`.

- [ ] **Step 4: Wire it into the card**

In `content/main.js`, add:

```js
function buildListenHandler(result) {
  const spoken = result.direction?.startsWith('en') ? result.sourceText : result.translation;
  if (!canSpeak(spoken)) return null;
  return () => speak(spoken);
}
```

and pass it as `onListen` in `showTranslation`. Returning null omits the control, which is exactly the behavior Task 4's test pins.

- [ ] **Step 5: Verify and commit**

Run `npx vitest run tests/speech.test.js`, then `npm run lint`, `npm test`, `npm run build`. Check in the browser that Listen appears on an English word and is absent on a Persian one.

```bash
git add shared/speech.js grammar/grammar.js content/main.js tests/speech.test.js && git commit -m "feat(card): add English speech playback shared with the grammar page"
```

---

### Task 10: Sentence expansion and grammar

**Files:**
- Modify: `content/main.js`

**Interfaces:**
- Consumes: `captureSelectionContext` (sub-project 1), `requestTranslation`.
- Produces: `buildSentenceHandler(result, originalText)` and `buildGrammarHandler(result, originalText)`, each returning a callback or null.

- [ ] **Step 1: Sentence expansion**

When the current result is a word or phrase and the captured context contains a sentence around it, offer the action. The handler re-requests with the full sentence as the text and an explicit `mode: 'sentence'`, then renders the resulting card in place.

Reconstruct the sentence from the context the content script already captured: `context.before + selection + context.after`, then trim to sentence boundaries using the terminator rules from `lib/translation/mode.js` so the request is one sentence rather than the whole 600-character window. Return null when no sentence can be recovered, so the control is absent rather than broken.

After rendering the sentence card, highlight the originating word in the source line when it can be located by a case-insensitive search. Highlighting the translation is not attempted: the word's position in Persian cannot be derived reliably from the source, and a wrong highlight is worse than none.

- [ ] **Step 2: Grammar**

Rewrite `appendInlineGrammarAffordance` and `renderInlineGrammar` as `buildGrammarHandler`, which sends `EXPLAIN_GRAMMAR` with `{ source, translation, direction }` exactly as it does today, and renders the returned points into the card's body beneath the translation. Keep the existing "Learn More" control that opens the full lesson page.

Return null for single words, so the control does not appear where there is no grammar to explain.

Preserve the failure behavior sub-project 1 established: a grammar failure must never disturb the translation already on screen. Wrap the request so a rejection cannot escape.

- [ ] **Step 3: Verify and commit**

Run `npm run lint`, `npm test`, `npm run build`. In the browser: select a word inside a sentence, confirm Sentence appears and produces a sentence card with alternatives; select a sentence, confirm Explain produces grammar points without changing the translation; select a single word, confirm Explain is absent.

```bash
git add content/main.js && git commit -m "feat(card): add sentence expansion and rewire grammar through the card"
```

---

### Task 11: The popup adopts the card

**Files:**
- Modify: `popup/popup.js`, `popup/popup.html`, `popup/popup.css`

**Interfaces:**
- Consumes: `renderCard`, `injectCardStyles`.

The popup keeps its tabs in this sub-project; only the result rendering changes. Removing the tab bar is sub-project 2b.

- [ ] **Step 1: Satisfy the card's token contract, then inject the styles**

The card's stylesheet consumes four custom properties: `--pp-text`, `--pp-text-secondary`, `--pp-text-muted` and `--pp-border`. The floating box defines these already. The popup does not: its own tokens are named `--color-*`, a different namespace, and it does not load `lib/design-tokens.css`. Injecting the card styles without addressing that renders every colour in the card as unset.

Add a small mapping block to `popup/popup.css`, scoped to the popup's root, translating its existing tokens onto the four names the card expects. Use the popup's own light and dark values so the card follows the popup's theme rather than defining a second one. Confirm the mapping by checking the computed colour of a rendered card element in the browser, not by reading the CSS.

Then, at popup init, call `injectCardStyles(document.head, document)`. The popup's own panel styles stay.

- [ ] **Step 2: Replace the output section's body**

In `popup/popup.html`, the output section currently holds a badges row, an actions row, `#output-text`, `#cache-badge` and the grammar section. Replace everything between the section's opening tag and its closing tag with a single `<div id="card-slot"></div>`, keeping the section element and its id so the existing show and hide logic still works.

Delete `#direction-badge`, `#provider-badge`, `#favorite-translation-btn`, `#copy-btn`, `#output-text`, `#cache-badge` and the whole grammar block from the markup, and delete their now-dead rules from `popup/popup.css`. Verify each with a grep for its id before deleting.

- [ ] **Step 3: Replace displayTranslation**

`displayTranslation` currently adapts the result onto the old elements and calls `renderTranslationCorrections`, `renderTranslationRichContext`, `updateProviderBadge` and `displayGrammarExplanation`. Replace its body with a `renderCard` call into `#card-slot`, supplying the popup's callbacks: `onCopy`, `onSave`, `onExplainGrammar`, `onSwapDirection`, `onOpenSettings`, and `onListen` built the same way as the content script. Do not supply `onTranslateSentence`; the popup has no page selection, and omitting the callback omits the control.

Then delete `renderTranslationCorrections`, `renderTranslationRichContext`, `updateProviderBadge`, `displayGrammarExplanation` and `formatDirectionBadge` if nothing else calls them. Grep each before deleting; `formatDirectionBadge` is also used by the history list, so it very likely stays.

- [ ] **Step 4: Streaming**

`handleTranslate`'s `onDelta` currently writes into `#output-text`. Change it to render a text card once on the first delta and then write into that card's `.pp-card-translation` element, so streaming and the final render use the same element and the panel does not visibly rebuild when the stream ends.

- [ ] **Step 5: Verify**

Run `npm run lint`, `npm test`, `npm run build`. Then in the browser, open the popup and check: a word shows the same card the floating box shows; a paragraph streams; the grammar checkbox still produces grammar without replacing the translation; clicking a history entry still restores a result; the Sentence control is absent.

- [ ] **Step 6: Commit**

```bash
git add popup/popup.js popup/popup.html popup/popup.css && git commit -m "feat(popup): render results through the shared card"
```

---

### Task 12: Accessibility and cleanup

**Files:**
- Modify: `content/main.js`, `content/styles/index.js`, `lib/i18n.js`
- Test: `tests/card-a11y.test.js`

Every item here was found in the sub-project 1 review and deferred to this one.

- [ ] **Step 1: Write the failing test**

```js
// tests/card-a11y.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderCard } from '../shared/card/index.js';

const result = {
  translation: 'جریمه کردن', mode: 'word', direction: 'en-fa', sourceText: 'charge',
  pronunciation: '/x/', pos: 'verb', inContext: 'note', correction: '', truncated: false,
  senses: [
    { pos: 'verb', meaning: 'جریمه کردن', example: { src: 'a', tgt: 'ب' } },
    { pos: 'noun', meaning: 'اتهام', example: { src: 'c', tgt: 'د' } }
  ],
  synonyms: [], antonyms: []
};

describe('card accessibility', () => {
  const opts = { lang: 'en', doc: document, provider: 'Gemini', onCopy: vi.fn(), onSave: vi.fn(), onOpenSettings: vi.fn(), onSwapDirection: vi.fn() };

  it('gives every button an accessible name', () => {
    const el = renderCard(result, opts);
    for (const btn of el.querySelectorAll('button')) {
      const name = btn.getAttribute('aria-label') || btn.textContent.trim();
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('never relies on title alone for a control with no text', () => {
    const el = renderCard(result, opts);
    for (const btn of el.querySelectorAll('button')) {
      if (!btn.textContent.trim()) {
        expect(btn.getAttribute('aria-label')).toBeTruthy();
      }
    }
  });

  it('marks Persian text with lang so a screen reader picks the right voice', () => {
    const el = renderCard(result, opts);
    const rtl = el.querySelectorAll('[dir="rtl"]');
    expect(rtl.length).toBeGreaterThan(0);
    for (const node of rtl) {
      expect(node.getAttribute('lang')).toBe('fa');
    }
  });

  it('wires the disclosure to aria-expanded and aria-controls', () => {
    const el = renderCard(result, opts);
    const btn = el.querySelector('.pp-card-disclosure');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const target = el.querySelector('#' + btn.getAttribute('aria-controls'));
    expect(target).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it, fix what it catches**

Run: `npx vitest run tests/card-a11y.test.js`. Fix any failure in the card modules rather than weakening the test.

- [ ] **Step 3: The host-side items**

In `content/main.js`:
- Add `aria-label` to the polish box close button and the dictionary box close button, and to every icon-only control in those shells.
- Give the box container `role="dialog"` and an `aria-label`, move focus to it when it opens, and return focus to the previously focused element when it closes.
- Replace the `alert()` in the page-translation flow with the card's error rendering.

In `content/styles/index.js`:
- Replace `transition: all` on `.parsipad-favorite` with the specific properties it animates.
- Either use `--pp-motion-skeleton` in the skeleton rules or remove the token. Decide by grepping for it; if nothing uses it, remove it.

In `lib/i18n.js`:
- Remove `moreContext`, `nuance` and `alternatives` once a grep confirms nothing references them. If the popup's history or another surface still does, leave them and say so in your report.

- [ ] **Step 4: Verify and commit**

Run `npm run lint`, `npm test`, `npm run build`, and tab through the box in the browser to confirm focus moves in and back out.

```bash
git add content/main.js content/styles/index.js lib/i18n.js tests/card-a11y.test.js && git commit -m "feat(card): accessibility pass and dead style cleanup"
```

---

### Task 13: Verification, changelog, live probes

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Full verification**

Run `npm run lint`, `npm test` and `npm run build`. Lint must report zero errors and zero warnings. Every test that existed before this sub-project must still pass.

- [ ] **Step 2: Live probes**

Reload the extension, then walk the probe page. Record what you see for each, and treat any mismatch as a finding rather than an explanation:

| Probe | Expected |
|---|---|
| `charge` in the fee sentence | Source line with IPA and part of speech; جریمه کردن; a Here note; `Other meanings (N)` collapsed |
| Same word in the fraud sentence | A different leading sense, اتهام |
| Same word in the phone sentence | شارژ کردن |
| Open the disclosure | Each sense shows part of speech, meaning, and both example sides |
| `run the migration` | Phrase card, Explain present, Sentence present |
| A full sentence | `Also (N)` with labelled alternatives, no Sentence action |
| Three paragraphs | Streams into the card, no visible rebuild at the end |
| A selection at the bottom of the window | Box flips above and stays fully on screen |
| A single English word | Listen present |
| A single Persian word | Listen absent |
| The footer | Provider name shown, opens settings |
| Tab into the box | Focus enters the card, Escape closes and returns focus |

- [ ] **Step 3: Changelog**

Add an entry under the existing `## [Unreleased]` heading, in the same style as the entry sub-project 1 added, describing what a user sees: the card, senses with examples, the direction pill and swap, Listen for English, sentence expansion, the provider moving to the footer, and the labels being corrected.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md && git commit -m "docs: changelog for the translation card"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| 3.1 shared renderer, module layout | 1 to 6 |
| 3.2 CSS as a string, per-root injection | 2, 8, 11 |
| 3.3 host responsibilities, callback contract | 3 to 6, 8, 11 |
| 4.1 word and phrase card | 4 |
| 4.2 sentence card | 5 |
| 4.3 text and batch card | 5 |
| 4.4 loading and error | 8 |
| 5 labels | 1, 12 |
| 6 direction pill and swap | 3, 8 |
| 7 actions | 3 to 5, 9, 10 |
| 7.1 provider indicator | 3, 4, 8, 11 |
| 8 positioning | 7, 8 |
| 9 accessibility | 12 |
| 10 testing | every task; happy-dom decision in Global Constraints |
| 11 out of scope | respected: bubble, dictionary removal, popup tabs and history restore are all absent |

**Placeholder scan:** no TBD or TODO. Tasks 1 to 7 carry complete test code and either complete implementations or precise, pinned requirements where the implementation is a straightforward composition of already-specified parts. Tasks 8 to 13 are host integration and are specified as numbered edits against named functions, matching how sub-project 1's tasks 15 to 18 were written and executed successfully.

**Type consistency:** `renderCard(result, options)` and every `render*Card` share one options shape (Tasks 4, 5, 6, 8, 11). Part builders all take `doc` and return `HTMLElement` or null (Task 3), and Tasks 4 and 5 rely on the null contract for optional pieces. `computeBoxPosition` inputs and outputs match between Tasks 7 and 8. `canSpeak` and `speak` match between Tasks 9 and 4's Listen test. `cardLabel(key, lang, vars)` matches between Tasks 1 and 3.

**Known risk:** Task 8 is the largest single step and touches the file with the least test coverage. It is deliberately placed after all six card modules are proven, so its failure modes are integration rather than rendering. If it needs more than two fix rounds, split it: shell and placement first, then the `showTranslation` swap.
