# Lessons and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach grammar lessons in Persian by default with a per-lesson English toggle, make the lesson page and its quiz fully accessible and cancellable, localize Analytics, move every page onto the shared component classes, and close the remaining 3.2.0 minors. Ships as 3.7.0.

**Architecture:** The lesson prompt becomes a function of the explanation language; the worker caches lessons per provider, direction, language and text, and serves them over a port the page can disconnect to cancel. The lesson page's rendering moves out of `grammar/grammar.js` into two DOM-building modules (`lesson-render.js`, `quiz.js`) testable under happy-dom. Analytics aggregation moves into a pure module on top of Plan C's `lib/format.js`. The component pass deletes page-local button, input, switch and icon-button styles in favour of `pp-*` classes in `lib/components.css`, with `[data-theme]` as the only theme hook.

**Tech Stack:** Manifest V3, vanilla ES modules, esbuild, vitest (node), happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-24-redesign-phases-c-to-f.md` (Phase F, decisions 2 to 6). Audit: `.superpowers/sdd/2026-10-23-side-panel-and-popup/ui-audit-report.md` sections C (analytics), D (grammar), F 1 and G Phase 5.

## Global Constraints

- Branch `feat/lessons-polish` off `main` after Plan E (3.6.0) is merged. Consumes Plan C's `lib/format.js` (`localDayKey`, `formatDate`, `formatNumber`, `formatCurrency`) and `grammar/saved-lesson.js` (`lessonFromFavorite`, which defaults `lang` to `'en'`); Plan D's `.pp-switch`; Plan E's `lib/roving.js` (`rovingIndex`, `applyRovingTabindex`).
- Commit per task, conventional prefix with scope (`feat(grammar): ...`), no attribution trailer.
- No em dashes or emoji in code or copy. Every user-visible string through `t()` with `en` and `fa`.
- Grammar lessons: explanations in Persian by default; examples, highlights, quiz options and register alternatives stay English; a per-lesson toggle pill reads `English` (`lang="en"`) when the lesson is Persian and `فارسی` (`lang="fa"`) when it is English, the same pattern as `renderKeyHelp`'s `.key-help-lang`. The toggle never changes the UI language. The lesson cache key includes the language.
- The Persian-interface RTL rework is held. Lesson blocks get `dir` and `lang` per block; no page-level mirroring, no Persian digits.
- No request to a provider except on an explicit action; switching back to a language already fetched is served from cache.
- Spacing in new or rewritten CSS uses only `--space-inset-card` (20px), `--space-stack-section` (24px), `--space-stack-group` (16px), `--space-stack-item` (12px), `--space-inline-actions` (8px). No `transition: all` anywhere.
- `npm test`, `npm run lint`, `npm run build` pass after every task. `landing/` is never staged.

## Review Focus

1. A lesson saved before 3.7.0 (no `lang`): it reopens in English from storage with no request, and its toggle offers `فارسی`, which fetches once. Pinned in Task 3.
2. Toggle to English and back to Persian: the second switch is served from cache, with no second charge. Pinned in Task 1.
3. Cancel a lesson, then Try again quickly: the cancelled request never renders over the new one. Pinned in Task 2 (one port per request; a disconnected port's late result is dropped).
4. The model returns an option explanation containing markup such as `<img src=x onerror=alert(1)>`: it shows as text. Pinned in Task 4.
5. Usage at 23:30 local time: Analytics counts it on that local day, and the review prompt counts that local day as active. Pinned in Tasks 5 and 8.

---

### Task 1: Lesson language in the prompt, the API and the cache

**Files:**
- Modify: `lib/constants.js` (add `export function grammarLessonPrompt(lang)`; `GRAMMAR_LEARNING_PROMPT` stays exported as `grammarLessonPrompt('en')`)
- Modify: `lib/api.js` `getGrammarLesson` near line 285 (signature below; `systemPrompt: grammarLessonPrompt(lang)`; `signal` passed to `provider.complete`; the returned lesson carries `lang`)
- Modify: `background/service-worker.js` (`GET_GRAMMAR_LESSON` passes `message.lang`; `handleGrammarLesson` near line 677 caches through `translationCache` and logs usage only on a miss)
- Test: `tests/prompts.test.js` (extend), `tests/service-worker.test.js` (extend; add `getGrammarLesson: vi.fn()` to the `lib/api.js` mock if absent)

**Interfaces:**
- Produces:
  - `grammarLessonPrompt(lang: 'fa'|'en'): string`. For `fa` the LANGUAGE RULES block says: write `lessonTitle`, every grammar point `title` and `explanation`, `register.note`, both `compareContrast` fields, every `commonMistakes` entry, the quiz `question`, every option `explanation`, and every `relatedPatterns` entry in standard written Persian; keep every example `source` and `highlight`, every quiz option `text`, and `register.alternative` in English; put quoted English words in double quotes; the correct option's explanation begins with `درست`. For `en` it is today's prompt unchanged. Both add `"lang": "<lang>"` to the JSON shape.
  - `getGrammarLesson(originalText: string, translation: string, direction: string, { lang = 'fa', signal }: { lang?: 'fa'|'en', signal?: AbortSignal } = {}): Promise<{ lesson: object & { lang }, inputTokens, outputTokens }>`.
  - `handleGrammarLesson({ originalText, translation, direction, lang = 'fa' }, { signal } = {}): Promise<{ lesson, cached: boolean, provider }>` with cache key parts `[providerId, 'lesson', direction || '', lang, `${originalText}\n${translation}`]`. Task 2 calls it from the port.

- [ ] **Step 1: Write the failing tests**

Add to `tests/prompts.test.js`:

```js
import { grammarLessonPrompt, GRAMMAR_LEARNING_PROMPT } from '../lib/constants.js';
it('teaches in Persian with English examples and options', () => {
  const fa = grammarLessonPrompt('fa');
  expect(fa).toMatch(/standard written Persian/);
  expect(fa).toContain('Keep these in ENGLISH: every example "source" and "highlight", every quiz option "text", and "register.alternative".');
  expect(fa).toMatch(/"lang": "fa"/);
  expect(fa).toMatch(/درست/);
  expect(grammarLessonPrompt('en')).toBe(GRAMMAR_LEARNING_PROMPT);
  expect(GRAMMAR_LEARNING_PROMPT).toMatch(/Write ALL lesson content in ENGLISH/);
});
```

Add to `tests/service-worker.test.js`:

```js
it('caches lessons per language', async () => {
  getGrammarLesson.mockResolvedValue({ lesson: { lessonTitle: 'T', grammarPoints: [] }, inputTokens: 1, outputTokens: 1 });
  const msg = { action: 'GET_GRAMMAR_LESSON', originalText: 'I went', translation: 'رفتم', direction: 'en-fa' };
  await sendMessage({ ...msg, lang: 'fa' });
  await sendMessage({ ...msg, lang: 'fa' });
  expect(getGrammarLesson).toHaveBeenCalledTimes(1);
  expect(getGrammarLesson.mock.calls[0][3]).toMatchObject({ lang: 'fa' });
  await sendMessage({ ...msg, lang: 'en' });
  expect(getGrammarLesson).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/prompts.test.js tests/service-worker.test.js`
Expected: FAIL, `grammarLessonPrompt` not exported; `getGrammarLesson` called on every message.

- [ ] **Step 3: Implement** per Interfaces. The `fa` rules block contains the exact sentence the test asserts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/prompts.test.js tests/service-worker.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/constants.js lib/api.js background/service-worker.js tests/prompts.test.js tests/service-worker.test.js
git commit -m "feat(grammar): explain lessons in Persian by default and cache per language"
```

---

### Task 2: Cancel a lesson request, and errors with a next step

**Files:**
- Modify: `background/service-worker.js` (a `chrome.runtime.onConnect` listener for `port.name === 'grammar-lesson'`, next to the `translate-stream` one near line 515: an `AbortController` per port, aborted on `onDisconnect`; `{ type: 'start', originalText, translation, direction, lang }` runs `handleGrammarLesson(..., { signal })` and posts `{ type: 'done', lesson, cached }` or `{ type: 'error', code }`, where `code` is `GRAMMAR_PARSE_FAILED`, `GRAMMAR_TIMEOUT`, or `toTranslationError(error).code`)
- Modify: `grammar/grammar.js` (`loadLesson` requests through `chrome.runtime.connect({ name: 'grammar-lesson' })`, one port per request held in a module-level `lessonPort`, and its message handler starts with `if (port !== lessonPort) return;`; a Cancel button in the loading section disconnects the port and shows `grammarCancelled` with Try again; `showError` receives a code and renders `t(grammarErrorKey(code))` plus a next-step line; missing URL parameters show `grammarMissingText` with a link to `../library/library.html?tab=lessons`)
- Create: `grammar/errors.js`
- Modify: `grammar/grammar.html` (Cancel button `#cancel-btn` in the loading section; the loading progressbar gets `aria-valuetext`; the save toast gets `role="status"`)
- Modify: `lib/i18n.js` (`grammarCancel`, `grammarCancelled` = "Lesson cancelled. Nothing more will be charged.", `grammarMissingText` = "Open a lesson from a translation's Learn more button, or from your Library.", `grammarNextStepKey` = "Check your key in Settings, then try again.", `grammarNextStepNetwork` = "Check your connection, then try again.")
- Test: `tests/grammar-errors.test.js` (create), `tests/service-worker.test.js` (extend)

**Interfaces:**
- Consumes: `handleGrammarLesson` (Task 1).
- Produces in `grammar/errors.js`: `export function grammarErrorKey(code: string): { message: string, nextStep: string | null }` mapping `GRAMMAR_PARSE_FAILED` to `grammarParseFailed` (no extra step; the copy carries it), `GRAMMAR_TIMEOUT` to `grammarTimeout`, `INVALID_API_KEY` and `MISSING_API_KEY` to `errorI18nKey(code)` with `grammarNextStepKey`, `NETWORK` and `TIMEOUT` to `errorI18nKey(code)` with `grammarNextStepNetwork`, anything else to `errorI18nKey(code)` with `null`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/grammar-errors.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { grammarErrorKey } from '../grammar/errors.js';
const js = fs.readFileSync(path.resolve(__dirname, '../grammar/grammar.js'), 'utf8');
describe('grammar errors and cancel', () => {
  it('pairs each failure with a next step', () => {
    expect(grammarErrorKey('GRAMMAR_TIMEOUT')).toEqual({ message: 'grammarTimeout', nextStep: null });
    expect(grammarErrorKey('INVALID_API_KEY').nextStep).toBe('grammarNextStepKey');
    expect(grammarErrorKey('NETWORK').nextStep).toBe('grammarNextStepNetwork');
  });
  it('requests over a port it can disconnect and never shows a raw message', () => {
    expect(js).toMatch(/chrome\.runtime\.connect\(\{ name: 'grammar-lesson' \}\)/);
    expect(js).toMatch(/\.disconnect\(\)/);
    expect(js).toMatch(/if \(port !== lessonPort\) return;/);
    expect(js).not.toMatch(/let msg = error\.message/);
    expect(js).not.toMatch(/t\('enterTextTranslate'/);
  });
});
```

Add to `tests/service-worker.test.js` (a fake port: `{ name, onMessage: { addListener(fn) { this.fn = fn; } }, onDisconnect: { addListener(fn) { this.dc = fn; } }, postMessage: vi.fn() }`, passed to each `listeners.onConnect` function):

```js
it('aborts the lesson request when the page disconnects', async () => {
  let seen;
  getGrammarLesson.mockImplementation((a, b, c, { signal }) => { seen = signal; return new Promise(() => {}); });
  const port = makePort('grammar-lesson');
  listeners.onConnect.forEach(fn => fn(port));
  port.onMessage.fn({ type: 'start', originalText: 'x', translation: 'y', direction: 'en-fa', lang: 'fa' });
  await vi.waitFor(() => expect(seen).toBeDefined());
  port.onDisconnect.dc();
  expect(seen.aborted).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/grammar-errors.test.js tests/service-worker.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** per Files and Interfaces. Keep the `GET_GRAMMAR_LESSON` message case for any other caller.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/grammar-errors.test.js tests/service-worker.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add background/service-worker.js grammar lib/i18n.js tests/grammar-errors.test.js tests/service-worker.test.js
git commit -m "feat(grammar): cancel a long lesson request and explain failures with a next step"
```

---

### Task 3: Lesson page in the lesson's language

**Files:**
- Create: `grammar/lesson-render.js`
- Modify: `grammar/grammar.js` (`renderLesson` near line 335: title into `<h1 id="lesson-title">`, `document.title = `${title} - ParsiPad``, the language pill, `renderGrammarPoint` for each point; `handleSave` stores `lesson.lang`; the toggle requests the other language through Task 2's port and moves focus to the new pill; delete `createGrammarPointElement` and `createRegisterBadge`)
- Modify: `grammar/grammar.html` (the lesson `<main>` loses `lang="en"`; the header title becomes `<h1 id="lesson-title">`; points render as `<section>` with `<h2>`, their parts with `<h3>`; remove the Tailwind body classes and the hardcoded `aria-label` near line 94)
- Modify: `grammar/grammar.css` (`[lang="fa"]` and `[lang="en"]` font rules stay; Persian blocks align by `dir`)
- Modify: `lib/i18n.js` (`grammarAlternative` = "Alternative" / "شکل دیگر", `lessonLangToggleToFa` = "نمایش درس به فارسی", `lessonLangToggleToEn` = "Show this lesson in English")
- Modify: `tests/grammar-direction.test.js` (replace "marks the lesson itself as English" with per-block assertions below)
- Test: `tests/lesson-render.test.js` (create)

**Interfaces:**
- Consumes: `lessonFromFavorite` (Plan C), Task 1's `lang` on the lesson, Task 2's port request.
- Produces in `grammar/lesson-render.js`:
  - `export function blockAttrs(lang: 'fa'|'en'): { dir: 'rtl'|'ltr', lang }`.
  - `export function renderGrammarPoint(point, number: number, { lessonLang, uiLang }): HTMLElement` built with `createElement` and `textContent` only: `<section class="grammar-point">` with `<h2>` title, the explanation, register note and compare-and-contrast in `blockAttrs(lessonLang)`; examples' `source` as `lang="en" dir="ltr"` with the highlight in `<mark>`, `target` as `lang="fa" dir="rtl"`; `register.alternative` as `lang="en" dir="ltr"` after a label `t('grammarAlternative', lessonLang)` carrying `blockAttrs(lessonLang)`; no quiz yet: in this task `grammar.js` appends the existing quiz markup after the element, and Task 4 moves the quiz inside it through `renderQuiz`.
  - `export function renderLessonLangToggle(lessonLang, onToggle: (next) => void): HTMLButtonElement` returning `<button type="button" class="lesson-lang-toggle">` with text `فارسی` and `lang="fa"` when `lessonLang` is `en`, `English` and `lang="en"` when it is `fa`, `aria-label` from `lessonLangToggleToFa` or `lessonLangToggleToEn`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lesson-render.test.js
import { describe, it, expect, beforeAll, vi } from 'vitest';
let renderGrammarPoint, renderLessonLangToggle;
beforeAll(async () => {
  const { Window } = await import('happy-dom'); globalThis.document = new Window().document;
  ({ renderGrammarPoint, renderLessonLangToggle } = await import('../grammar/lesson-render.js'));
});
const point = { title: 'حال کامل', explanation: 'در "I have gone" ...', register: { level: 'neutral', note: 'خنثی', alternative: "I've gone" },
  examples: [{ source: 'She has left.', target: 'او رفته است.', highlight: 'has left' }], compareContrast: { sourceLanguage: 'a', targetLanguage: 'b' }, commonMistakes: ['c'] };
describe('lesson rendering', () => {
  it('sets direction per block', () => {
    const el = renderGrammarPoint(point, 1, { lessonLang: 'fa', uiLang: 'en' });
    expect(el.querySelector('h2').getAttribute('dir')).toBe('rtl');
    expect(el.querySelector('.explanation-text').getAttribute('lang')).toBe('fa');
    expect(el.querySelector('.example-source').getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('.example-target').getAttribute('lang')).toBe('fa');
    expect(el.querySelector('.register-alt-text').getAttribute('lang')).toBe('en');
    expect(el.querySelector('.register-alt-label').textContent).toBe('شکل دیگر');
    expect(el.querySelector('.register-alt-label').getAttribute('dir')).toBe('rtl');
    expect(el.querySelector('mark').textContent).toBe('has left');
  });
  it('the pill offers the other language and reports it', () => {
    const onToggle = vi.fn();
    const pill = renderLessonLangToggle('fa', onToggle);
    expect(pill.textContent).toBe('English'); expect(pill.getAttribute('lang')).toBe('en');
    pill.click(); expect(onToggle).toHaveBeenCalledWith('en');
    expect(renderLessonLangToggle('en', () => {}).textContent).toBe('فارسی');
  });
});
```

In `tests/grammar-direction.test.js`, the replaced case asserts `grammar.html` has `id="lesson-title"` on an `<h1>`, `grammar.js` sets `document.title`, and `lesson-render.js` contains no `innerHTML`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lesson-render.test.js tests/grammar-direction.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** per Files. Saved lessons render with `lessonData.lang` (Plan C's helper gives `'en'` for old ones); the toggle on a saved lesson fetches the other language once and does not overwrite the saved copy unless the user saves again.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lesson-render.test.js tests/grammar-direction.test.js tests/saved-lesson.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add grammar lib/i18n.js tests/lesson-render.test.js tests/grammar-direction.test.js
git commit -m "feat(grammar): render the lesson in its language with a per-lesson toggle"
```

---

### Task 4: Quiz as a radiogroup with live feedback

**Files:**
- Create: `grammar/quiz.js`
- Modify: `grammar/grammar.js` (delete `createQuizHTML` and `setupQuizInteractions` near lines 566-700), `grammar/lesson-render.js` (`renderGrammarPoint` appends `renderQuiz(point.quiz, number, opts)` when `point.quiz` is present), `grammar/grammar.css` (option buttons, `:focus-visible`, checked state; no `transition: all`)
- Modify: `lib/i18n.js` (`quizOptionsLabel`)
- Test: `tests/quiz.test.js` (create)

**Interfaces:**
- Consumes: `rovingIndex`, `applyRovingTabindex` (Plan E `lib/roving.js`), `blockAttrs` (Task 3).
- Produces: `export function renderQuiz(quiz, number: number, { lessonLang, uiLang }): HTMLElement`: question `<p id="quiz-q-<n>">` in `blockAttrs(lessonLang)`; `<div role="radiogroup" aria-labelledby="quiz-q-<n>">` of `<button type="button" role="radio" aria-checked="false" lang="en" dir="ltr">` options; arrow keys move focus and selection, Space and Enter select; Check answer and Try again buttons; feedback `<div role="status" aria-live="polite">` in `blockAttrs(lessonLang)` filled with `textContent` only. Accepts the old string-option format.

- [ ] **Step 1: Write the failing test**

```js
// tests/quiz.test.js
import { describe, it, expect, beforeAll } from 'vitest';
let renderQuiz, window;
beforeAll(async () => {
  const { Window } = await import('happy-dom'); window = new Window(); globalThis.document = window.document;
  ({ renderQuiz } = await import('../grammar/quiz.js'));
});
const quiz = { question: 'کدام درست است؟', correctIndex: 0, options: [
  { text: 'She has gone.', explanation: 'درست: ...' },
  { text: 'She have gone.', explanation: '<img src=x onerror=alert(1)>' },
  { text: 'She gone.', explanation: 'c' }, { text: 'She going.', explanation: 'd' }] };
const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
describe('quiz', () => {
  it('is a radiogroup with one tab stop and arrow keys', () => {
    const el = renderQuiz(quiz, 1, { lessonLang: 'fa', uiLang: 'en' }); document.body.append(el);
    const group = el.querySelector('[role="radiogroup"]');
    expect(group.getAttribute('aria-labelledby')).toBe('quiz-q-1');
    const radios = [...el.querySelectorAll('[role="radio"]')];
    expect(radios.map(r => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    radios[0].focus(); key(radios[0], 'ArrowDown');
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1].getAttribute('lang')).toBe('en');
  });
  it('announces feedback as text, never markup', () => {
    const el = renderQuiz(quiz, 2, { lessonLang: 'fa', uiLang: 'en' }); document.body.append(el);
    el.querySelectorAll('[role="radio"]')[1].click();
    el.querySelector('.check-answer-btn').click();
    const fb = el.querySelector('[role="status"]');
    expect(fb.getAttribute('aria-live')).toBe('polite');
    expect(fb.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(fb.querySelector('img')).toBeNull();
    expect(fb.getAttribute('dir')).toBe('rtl');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/quiz.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `renderQuiz`** per Interfaces; Try again clears state and focuses the first option.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/quiz.test.js tests/lesson-render.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add grammar lib/i18n.js tests/quiz.test.js
git commit -m "feat(grammar): quiz options as a keyboard radiogroup with escaped live feedback"
```

---

### Task 5: Analytics in local days with Intl formatting

**Files:**
- Create: `analytics/aggregate.js`
- Modify: `lib/format.js` (`formatDate(ts, lang, options = { dateStyle: 'medium' })`)
- Modify: `analytics/analytics.js` (delete `formatCost`, `formatNumber`, `formatDayLabel`, `aggregateByDay` near lines 104-114, 283-292, 320-351; use `lib/format.js`; English-only labels near 198-206, 264, 275-277 through `t()`; each day bar is a `<button type="button" class="time-bar-col" aria-label>` whose tooltip also shows on `:focus-visible`; range buttons get `aria-pressed` and the range lives in `?range=`; empty data shows `analyticsEmptyHint`)
- Modify: `analytics/analytics.html` (the back control near line 15 becomes a link to `../settings/settings.html#data`; the 5-column table sits in an `overflow-x: auto` wrapper), `analytics/analytics.css` (`transition: all` near line 400 goes; `tabular-nums` on numbers)
- Modify: `lib/i18n.js` (`analyticsToday`, `analyticsYesterday`, `analyticsBarLabel` = "{day}: {count} actions, {cost}", `analyticsEmptyHint` = "Translate something and your usage shows up here.", `analyticsTokens`)
- Test: `tests/analytics-aggregate.test.js` (create)

**Interfaces:**
- Consumes: `localDayKey`, `formatDate`, `formatNumber`, `formatCurrency` (Plan C); `PROVIDER_PRICING`.
- Produces in `analytics/aggregate.js`: `export function costOf(event): number`, `export function aggregateByDay(events, days: number | null, now = Date.now()): Record<string, { count, input, output, cost }>` keyed by `localDayKey` and pre-filled for `days` local days ending today, and `export function dayLabel(key: string, lang: string, now = Date.now()): string` (`analyticsToday`, `analyticsYesterday`, else `formatDate` with `{ month: 'short', day: 'numeric' }`; `formatDate` gains an optional options argument for this).

- [ ] **Step 1: Write the failing test**

```js
// tests/analytics-aggregate.test.js
process.env.TZ = 'America/Los_Angeles';
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { aggregateByDay, dayLabel } from '../analytics/aggregate.js';
const now = Date.parse('2026-10-24T18:00:00Z');
describe('analytics aggregation', () => {
  it('buckets by local day, not UTC', () => {
    const late = Date.parse('2026-10-21T06:30:00Z'); // 23:30 on Oct 20 in Los Angeles
    const days = aggregateByDay([{ t: late, a: 'translate', p: 'claude', i: 100, o: 50 }], 7, now);
    expect(days['2026-10-20'].count).toBe(1);
    expect(days['2026-10-21'].count).toBe(0);
    expect(Object.keys(days)).toHaveLength(7);
  });
  it('labels days through i18n and Intl', () => {
    expect(dayLabel('2026-10-24', 'en', now)).toBe('Today');
    expect(dayLabel('2026-10-23', 'en', now)).toBe('Yesterday');
    expect(dayLabel('2026-10-20', 'en', now)).toBe('Oct 20');
  });
  it('bars are reachable by keyboard and there is an empty hint', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../analytics/analytics.js'), 'utf8');
    expect(js).toMatch(/<button type="button" class="time-bar-col"/);
    expect(js).toMatch(/analyticsEmptyHint/);
    expect(js).not.toMatch(/'Yest\.'|toISOString\(\)\.slice\(0, 10\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics-aggregate.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** per Files and Interfaces.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analytics-aggregate.test.js tests/format.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add analytics lib/format.js lib/i18n.js tests/analytics-aggregate.test.js
git commit -m "feat(analytics): local-day buckets, Intl formatting and keyboard-reachable bars"
```

---

### Task 6: One theme hook and no `transition: all`

**Files:**
- Modify: `lib/theme.js` `applyThemeToRoot` (set only `data-theme`; remove any stale `dark` class once), `lib/theme-boot.js` (same), `tests/theme.test.js` (the "both conventions" cases become "data-theme only, and a stale .dark class is removed")
- Modify: every page stylesheet that uses `.dark` selectors (`settings/settings.css`, `welcome/welcome.css`, `grammar/grammar.css`, `popup/popup.css`, `analytics/analytics.css`, `library/library.css`, `practice/practice.css`): rewrite as `[data-theme="dark"]` or delete when the token already flips; every `transition: all` becomes a list of the properties that change, with `--motion-*` durations
- Modify: HTML pages carrying `dark:` utility classes (`grammar/grammar.html` body, any left in `welcome/welcome.html`)
- Test: `tests/theme-hook.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// tests/theme-hook.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const root = path.resolve(__dirname, '..');
const pages = ['popup', 'sidepanel', 'settings', 'welcome', 'grammar', 'analytics', 'library', 'practice'];
const files = (ext) => pages.flatMap(p => fs.readdirSync(path.join(root, p)).filter(f => f.endsWith(ext)).map(f => `${p}/${f}`));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
describe('one theme hook', () => {
  it('no stylesheet keys off a .dark class or transitions all', () => {
    for (const f of [...files('.css'), 'lib/components.css', 'lib/design-tokens.css']) {
      expect(read(f), f).not.toMatch(/(^|[\s,])\.dark[\s.:{]|html\.dark|body\.dark/);
      expect(read(f), f).not.toMatch(/transition:\s*all/);
    }
  });
  it('no page carries dark: utility classes', () => {
    for (const f of files('.html')) expect(read(f), f).not.toMatch(/class="[^"]*\bdark:/);
  });
  it('the boot script and the runtime set data-theme only', () => {
    expect(read('lib/theme-boot.js')).not.toMatch(/classList\.toggle\('dark'/);
    expect(read('lib/theme.js')).not.toMatch(/classList\.toggle\('dark'/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme-hook.test.js`
Expected: FAIL, listing the files still using `.dark` and `transition: all`.

- [ ] **Step 3: Implement** per Files. Check light and dark on every page after each stylesheet.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/theme-hook.test.js tests/theme.test.js tests/welcome-theme-toggle.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/theme.js lib/theme-boot.js popup sidepanel settings welcome grammar analytics library practice tests/theme-hook.test.js tests/theme.test.js
git commit -m "refactor(theme): one theme hook and no transition: all"
```

---

### Task 7: Page controls on the shared `pp-*` classes

**Files:**
- Modify: `lib/components.css` (add `.pp-chip` with `[aria-pressed="true"]`; `.pp-btn-icon` gets a 32px minimum and is the only icon-button style; `.pp-input` covers `type="search"` and `type="password"`)
- Modify: `settings/settings.html`, `welcome/welcome.html`, `grammar/grammar.html`, `analytics/analytics.html`, `library/library.html`, `practice/practice.html`, and the JS that renders buttons into them (`library/card.js`, `grammar/quiz.js`, `analytics/analytics.js`): `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full` become `pp-btn pp-btn-primary|pp-btn-secondary pp-btn-block`; `.icon-btn`, `.back-btn`, `.card-action-btn`, `.input-icon-btn`, `.about-link-icon` become `pp-btn-icon`; `.text-input` and `.search-input` become `pp-input`; library type chips and muted-site chips use `pp-chip`
- Modify: the matching page stylesheets (delete the now-unused page rules)
- Modify: `popup/popup.html` and `sidepanel/sidepanel.html` header icon buttons only (`pp-btn-icon`)
- Test: `tests/components-adoption.test.js` (create)

**Interfaces:**
- Consumes: `.pp-switch` (Plan D), `.pp-btn*`, `.pp-input`, `.pp-tab` (existing).
- Produces: `.pp-chip` and the single `.pp-btn-icon`.

- [ ] **Step 1: Write the failing test**

```js
// tests/components-adoption.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const pages = ['settings/settings', 'welcome/welcome', 'grammar/grammar', 'analytics/analytics', 'library/library', 'practice/practice'];
describe('shared components', () => {
  it('every button and text field on these pages uses a pp class', () => {
    for (const p of pages) {
      const html = read(`${p}.html`);
      for (const b of html.match(/<button[^>]*>/g) || []) expect(b, p).toMatch(/class="[^"]*\bpp-(btn|tab|chip)/);
      for (const i of html.match(/<input[^>]+type="(text|password|search|url)"[^>]*>/g) || []) expect(i, p).toMatch(/\bpp-input\b/);
    }
  });
  it('no page redefines the shared controls', () => {
    for (const p of pages) {
      const css = read(`${p}.css`);
      expect(css, p).not.toMatch(/(^|\n)\.(btn|btn-primary|btn-secondary|icon-btn|text-input|toggle-switch)\s*\{/);
    }
  });
  it('there is one icon-button style and a chip', () => {
    const c = read('lib/components.css');
    expect(c).toMatch(/\.pp-btn-icon\s*\{[^}]*min-width:\s*32px/);
    expect(c).toMatch(/\.pp-chip\[aria-pressed="true"\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components-adoption.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** page by page; after each page, load it in light and dark and keep `tests/spacing-rhythm.test.js` and `tests/popup-card-tokens.test.js` green.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/components.css settings welcome grammar analytics library practice popup sidepanel tests/components-adoption.test.js
git commit -m "refactor(ui): move page buttons, inputs and chips onto the shared pp classes"
```

---

### Task 8: Remaining 3.2.0 minors

**Files:**
- Modify: `settings/settings.html`, `popup/popup.html`, `sidepanel/sidepanel.html` (the Rate links keep `href="#"`-free markup: an `<a data-store-reviews target="_blank" rel="noopener">` with no URL), `settings/settings.js` and `popup/popup.js` (set `href = STORE_REVIEWS_URL` on `[data-store-reviews]`; the Settings Rate link's click calls `preventDefault()` and sends `{ action: 'REVIEW_PROMPT_RESPONSE', response: 'rated' }`, which records "rated" and opens the store from the worker)
- Modify: `lib/review-prompt.js` (`dayKey` near line 51 uses `localDayKey` from `lib/format.js`)
- Test: `tests/minors-3-2.test.js` (create), `tests/review-prompt.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

```js
// tests/minors-3-2.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
describe('3.2.0 minors', () => {
  it('the store URL lives in one constant', () => {
    for (const f of ['settings/settings.html', 'popup/popup.html', 'sidepanel/sidepanel.html']) {
      expect(read(f), f).not.toMatch(/chromewebstore\.google\.com/);
    }
    expect(read('settings/settings.js')).toMatch(/STORE_REVIEWS_URL/);
  });
  it('rating from Settings records the answer', () => {
    const js = read('settings/settings.js');
    expect(js).toMatch(/response: 'rated'/);
  });
});
```

Add to `tests/review-prompt.test.js` (with `process.env.TZ = 'America/Los_Angeles'` at the top of the file):

```js
it('counts active days in local time', () => {
  const late = Date.parse('2026-10-21T06:30:00Z'); // 23:30 on Oct 20 locally
  const s = recordSuccess(emptyReviewState(late), late);
  expect(s.activeDays).toEqual(['2026-10-20']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/minors-3-2.test.js tests/review-prompt.test.js`
Expected: FAIL

- [ ] **Step 3: Implement** per Files. `lib/review-prompt.js` runs in the worker; `lib/format.js` has no DOM dependency, so the import is safe there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/minors-3-2.test.js tests/review-prompt.test.js tests/review-storage.test.js tests/popup-review-banner.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add settings popup sidepanel lib/review-prompt.js tests/minors-3-2.test.js tests/review-prompt.test.js
git commit -m "fix(review): one store URL, Settings rating records the answer, local active days"
```

---

### Task 9: Release 3.7.0

**Files:**
- Modify: `store-assets/DESCRIPTION.txt` (grammar lessons explained in Persian with an English toggle; quiz by keyboard; Analytics in your language), `store-assets/STORE_LISTING.md`, `README.md` (grammar lesson section), `CHANGELOG.md`, `manifest.json`, `package.json`, `package-lock.json`

- [ ] **Step 1: Docs and changelog**

`CHANGELOG.md` under `## [Unreleased]`: `### Changed` (lessons explain in Persian by default with an English toggle; one look for buttons, fields and switches across pages; Analytics formatting), `### Added` (Cancel for a lesson; lesson title and tab title), `### Fixed` (quiz by keyboard and screen reader; unescaped quiz explanation; evening usage counted on the next day; Settings rating not remembered).

```bash
git add CHANGELOG.md README.md
git add -f store-assets/DESCRIPTION.txt store-assets/STORE_LISTING.md
git commit -m "docs(release): describe Persian lessons and the polish pass"
```

- [ ] **Step 2: Landing page**

`landing/index.html` describes grammar lessons; if it says lessons are in English, update it on disk and deploy per CLAUDE.md; never stage it. Otherwise record "landing: no change needed".

- [ ] **Step 3: Version bump**

`3.7.0` in `manifest.json`, `package.json`, both `package-lock.json` top-level fields; `## [3.7.0] - <today>` with a fresh `## [Unreleased]` above.

```bash
git add manifest.json package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): bump version to 3.7.0"
```

- [ ] **Step 4: Verify and package**

Run: `npm test && npm run lint && npm run build && (cd dist && zip -r ../store-assets/parsipad-v3.7.0.zip .)`
Expected: all pass; `manifest.json` at the zip root. Walk the five Review Focus cases on the unpacked build.

- [ ] **Step 5: Merge and push**

```bash
git checkout main
git merge --no-ff feat/lessons-polish -m "Merge feat/lessons-polish: ParsiPad 3.7.0"
git push origin main
```

Report which release chores were done, and say explicitly if any was skipped.
