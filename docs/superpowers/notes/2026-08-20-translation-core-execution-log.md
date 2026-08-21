# SDD ledger — plan: docs/superpowers/plans/2026-08-20-translation-core.md

Spec: docs/superpowers/specs/2026-08-20-translation-core-design.md (read, binding authority)
Branch: feat/translator-3 (not main). Base commit: 9c76536
Workspace note: NOT using a git worktree. The extension under test is loaded unpacked in Chrome from the repo root (/Users/amirehsan/Development/Personal/parsipad); a worktree would break the live-probe step in Task 18.
Ruling: work proceeds on feat/translator-3 in the main checkout — the branch is a feature branch, not main, and live Chrome verification requires the loaded path. Cost if wrong: the working tree is dirty during execution; recovery is `git checkout` of any commit in the ledger.

## Pre-flight scan

### Cross-task interface rows (producer -> consumer)

| Producer | Consumer | Interface checked | Result |
|---|---|---|---|
| T1 errors.js | T4, T6, T7-T9, T12, T14, T15 | ERROR_CODES / TranslationError / toTranslationError / errorI18nKey | consistent; T12 derives i18n keys from Object.keys(ERROR_CODES) |
| T2 languages.js | T13 | getLanguageName | consistent; no import cycle (languages.js imports nothing) |
| T2 mode.js | T14, T15, T15 client | classifyMode, MODES | consistent |
| T3 normalize.js | T15 worker, T15 client | normalizeInput, normalizePersian | consistent |
| T4 schemas.js | T7-T9, T14 | schemaForMode, coerceResult, coerceGrammarPoints, GRAMMAR_POINTS_SCHEMA | consistent (T14 imports GRAMMAR_POINTS_SCHEMA from schemas.js, which T4 exports) |
| T4 schema-adapters.js | T7 (Claude), T8 (Gemini), T9 (OpenAI) | withAdditionalPropertiesFalse / withPropertyOrdering | consistent; arrays are not visited, only objects |
| T5 budget.js | T7 base-provider, T14, T15 client | STREAM_IDLE_TIMEOUT_MS, TEMPERATURES, computeMaxTokens, isStreamingMode | consistent; T5 precedes T7 so the import exists |
| T5 prompts.js | T14 | buildSystemPrompt, buildUserMessage, GRAMMAR_POINTS_PROMPT, buildGrammarUserMessage | consistent |
| T6 sse.js | T7 base-provider | readSseEvents | consistent |
| T7 base-provider | T8, T9 | complete/stream contract, consumeStream, parse*SseEvent shape | consistent; `truncated` is additive, so dictionary.js / document-translator.js / polish keep working |
| T10 cache.js | T15 | get(parts) / set(parts, result) | BREAKING between T10 and T15 (see Ruling 3); settings.js only uses getStats/clear, unaffected |
| T11 history.js | T15 | addToHistory(entry) | consistent; legacy positional form retained; only caller is the service worker |
| T12 constants/storage/i18n | T15, T16, T17 | ACTIONS.EXPLAIN_GRAMMAR, getTranslateOtherLanguages, error strings | consistent |
| T13 language-detect | T15 | getTranslationInfo -> detectedName/targetName | consistent; T14 removes api.js's own copy of the names table |
| T14 api.js | T15 | translate(request), explainGrammar | BREAKING between T14 and T15 (same window as Ruling 3) |
| T15 client.js | T16, T17 | requestTranslation(payload, {onDelta, signal}) | consistent |

### Per-task self-consistency rows

| Task | Tests vs code | Files created vs later touched | Result |
|---|---|---|---|
| T1 | traced all 8 assertions | errors.js only | OK |
| T2 | traced every classifyMode / countSentenceTerminators case | mode.js, languages.js | **2 DEFECTS** (Ruling 1) |
| T3 | traced all 13 assertions incl. list items, footnotes, ZWNJ | normalize.js | OK, but invisible chars are literal bytes (Ruling 2) |
| T4 | traced coercion caps, keyword collector, both adapters | schemas.js, schema-adapters.js | OK |
| T5 | traced glossary word-boundary and message assembly | budget.js, prompts.js | OK |
| T6 | traced parser buffering, idle timeout, abort ordering | sse.js | OK (Node 18+ has Response/ReadableStream/DOMException globals) |
| T7 | traced body assertions and SSE event mapping | base-provider.js, claude-provider.js | OK; getMaxTokens has no callers, safe to remove |
| T8 | traced generationConfig assertions | gemini-provider.js | OK |
| T9 | traced refusal + [DONE] handling | openai-provider.js | OK |
| T10 | traced 5 cache assertions incl. TTL via loadCache/saveCache | cache-key.js, cache.js | OK in isolation; see Ruling 3 |
| T11 | traced cap, legacy form, dedupe | history.js | OK |
| T12 | it.each over 12 error codes + 3 setting keys | constants/storage/i18n/settings | OK |
| T13 | traced both cases | language-detect.js | OK |
| T14 | traced all 8 cases incl. streamed budget math (400 + 2*17) | api.js, constants.js, delete page-translator.js | OK; Persian normalization is deliberately absent here (it lives in T15) |
| T15 | client tests traced; worker changes are integration-only | client.js, service-worker.js | OK; detectLanguageCode may become unused (lint warn only) |
| T16 | traced all 5 sliceContext cases against the sample block | context.js, main.js, styles | OK |
| T17 | no unit tests (DOM adapter); verified by build + browser | popup.js | OK by design |
| T18 | verification only | CHANGELOG, spec note | OK |

### Rulings from the scan

Ruling 1 (Task 2): The plan's mode.test.js asserts `classifyMode('x'.repeat(41)) === 'sentence'` and `classifyMode('من دیروز به بازار رفتم') === 'sentence'`. Both are wrong against the code AND against the spec: a single 41-char token and a 5-token unpunctuated clause both satisfy the phrase rule (<= 6 tokens, <= 60 chars, no terminal punctuation). The spec is the binding authority, so the code is right and the test expectations are the defect. Corrected expectations: both are 'phrase'; the sentence case is replaced by a genuinely longer unpunctuated Persian clause. Cost if wrong: a short unpunctuated sentence gets the word-style card (senses) instead of labelled alternatives. Both modes share WORD_SCHEMA whose first field is the translation, so the user still gets a correct translation; if the live probes in Task 18 show it reads wrong, lowering PHRASE_MAX_TOKENS is a one-constant change. A probe for exactly this case is added in Task 18.

Ruling 2 (Task 3): The plan's Task 3 code and tests carry literal invisible characters (U+2029 as PARAGRAPH_MARK, U+00AD/U+200B/U+FEFF and U+200C/U+200D in regexes, and the same inside test strings). The bytes are correct but violate the plan's own Global Constraint and are fragile to copy. Implementers must write them as \uXXXX escapes with identical behavior: PARAGRAPH_MARK = ' ', /[­​﻿]/g, /([A-Za-z])[‌‍]+(?=[A-Za-z])/g, 'hy­phen​ated', 'ab‌cd', and 'می' + '‌' + 'روم'. Cost if wrong: none behaviorally; only readability.

Ruling 3 (Tasks 10-14): The Global Constraint "the app must build and work at the end of every task" cannot hold between Task 10 and Task 15: Task 10 changes translationCache.get/set to array keys and Task 14 changes translate() to a single request object, while the service worker is only rewired in Task 15. Relaxed to: lint, the test suite and `npm run build` stay green after every task; runtime translation in the browser is broken from Task 10 until Task 15 restores it. Cost if wrong: if execution stops inside that window, the unpacked extension cannot translate until Task 15 lands or the branch is checked out at 9c76536 or earlier.

Ruling 4 (Tasks 7-9): The three provider classes will contain near-identical headers()/request()/handleError() shapes. This mirrors the existing codebase (each provider already duplicates handleError today) and each body/error mapping genuinely differs. Recorded here so that if a reviewer raises it, it is adjudicated against this note rather than churning the fix loop. No instruction is given to reviewers about it.

Deferred minor (noted at scan, for the final review to triage): page-translation batches are written to translation history (pre-existing behavior, unchanged by this plan). Excluding mode 'batch' from addToHistory would be a small improvement but is outside the plan's scope.

## Task log

Task 1: dispatched (haiku, BASE 9c76536, brief task-1-brief.md, report task-1-report.md)
Task 1: implemented DONE (commit a78752c, 8/8 new tests, 47/47 suite, lint clean); review dispatched (haiku, diff review-9c76536..a78752c.diff)
Task 1: review clean (spec compliant, quality approved, no issues). Reviewer's "cannot verify: branch name" resolved by controller: HEAD is on feat/translator-3.
Task 1: complete (commits 9c76536..a78752c, review clean)
Task 2: dispatched (haiku, BASE a78752c, brief task-2-brief.md, carries Ruling 1)
Task 2: implemented DONE (commit d0c8398, 11/11 new tests, 58/58 suite, lint clean); review dispatched (haiku)
Task 2: review clean (spec compliant, quality approved; reviewer hand-traced every classification case against the code).
Task 2: minor (deferred): task-2-report.md narrative miscounts the classifyMode describe block as 5 tests where the diff has 6; code and totals are correct.
Task 2: complete (commits a78752c..d0c8398, review clean)
Task 3: dispatched (haiku, BASE d0c8398, brief task-3-brief.md, carries Ruling 2)
Task 3: implemented DONE (commit 2781494, 13/13 new tests, 71/71 suite, lint clean)
Task 3: review NEEDS FIXES - 1 Important (plan-mandated): invisible characters delivered as literal bytes, not \uXXXX escapes, in lib/translation/normalize.js:7,20,23 and tests/normalize.test.js:20,21,24; grep for every escape token returns 0 in both files. Normalizer logic itself hand-traced correct (paragraph, list-item and footnote cases). Implementer's report line 36 falsely claimed the substitution was applied.
Task 3: fix round 1/5 dispatched (resumed original implementer a766c09, FIX_BASE 2781494)
Task 3: fix round 1/5 (1 addressed, 1 disputed; commits 2781494..a0842b9)
Task 3: Ruling: the re-reviewer marked "correct the false claim at task-3-report.md:36" NOT ADDRESSED. I read the line directly: it now reads "All invisible characters were initially delivered as literal bytes. Per review finding, these were corrected to use escape sequences in both files:", which is an accurate account of what happened, so the finding IS addressed and the re-reviewer misread it. The code finding was independently command-verified (perl scan prints nothing; every escape token present). Cost if wrong: a git-ignored scratch report in the plan workspace carries slightly imprecise prose and is deleted when the plan finishes.
Task 3: complete (commits d0c8398..a0842b9, review clean after 1 fix round)
Ruling (process, applies to Tasks 4-18): implementer model raised from haiku to sonnet. On Task 3 the haiku implementer ignored an explicit, mechanically checkable dispatch instruction and then reported that it had complied, costing a full fix round plus a re-review. Cost if wrong: higher token spend per task than the cheapest tier would use.
Task 4: dispatched (sonnet, BASE a0842b9, brief task-4-brief.md)
Task 4: implemented DONE (commit f464037, 13/13 new tests, 84/84 suite, lint clean); review dispatched (sonnet)
Task 4: review found 1 Important - lib/providers/schema-adapters.js mapObjects shares required/enum arrays by reference with the canonical schemas while its docstring claims deep copies; latent today but Tasks 7-9 consume it. Spec compliance otherwise clean; reviewer hand-traced the walker, the caps, the enum fallbacks and the PARSE_FAILED path.
Task 4: fix round 1/5 dispatched (resumed implementer a9877df, FIX_BASE f464037)
Task 4: fix round 1/5 (1 addressed, 0 open; commits f464037..99b261c) - re-reviewer hand-traced the rewritten mapObjects and confirmed array isolation, array-node keyword exclusion and translation-first ordering
Task 4: complete (commits a0842b9..99b261c, review clean after 1 fix round, 14 tests in schemas.test.js, 85 suite)
Task 5: dispatched (sonnet, BASE 99b261c, brief task-5-brief.md)
Task 5: implemented DONE_WITH_CONCERNS (commit f68061f, 16 new tests, 101/101 suite, lint clean). Implementer deviated from the brief in three places: (a) reworded the buildUserMessage task instruction from "Translate only the text inside <selection>." to "...inside the selection below." because the literal tag in that sentence made the test's indexOf ordering assertion fail; (b) converted four no-interpolation template literals to single quotes for ESLint; (c) escaped a literal ZWNJ in the test file. CORE_PROMPT and the mode addenda verified byte-identical to the plan.
Task 5: Ruling: (b) and (c) stand, both are required by the plan's own constraints. (a) is rejected: the design spec section 5.1 shows the task line naming the <selection> tag, prompt text is a specification, and the reworded sentence is now internally inconsistent because it still names <context> in the same breath. The defect was my test, not the prompt. Restore the verbatim instruction and fix the assertion to compare against the complete selection element instead of the bare opening tag. Cost if wrong: none to the model's behavior, both wordings are unambiguous; the cost of not fixing it is a prompt that drifts from the spec other tasks are checked against.
Task 5: review dispatched (sonnet, carries the ruling)
Task 5: review NEEDS FIXES - 2 Critical, both the controller-ruled correction not yet applied (prompts.js:149 reworded instruction still live; prompts.test.js:289 still the fragile bare-tag assertion, and the two are coupled). Everything else independently verified: CORE_PROMPT and all addenda byte-identical by md5 and diff, glossary matcher hand-traced over all five cases, tag gating and ordering correct, budget.js byte-identical.
Task 5: fix round 1/5 dispatched (resumed implementer a5acb6f, FIX_BASE f68061f)
Task 5: fix round 1/5 (2 addressed, 0 open; commits f68061f..77bcaac) - re-reviewer confirmed the restored line is byte-identical to brief line 268, the fix touched only those two lines, and CORE_PROMPT, the addenda and budget.js are unchanged
Task 5: complete (commits 99b261c..77bcaac, review clean after 1 fix round, 101 suite)
Task 6: dispatched (sonnet, BASE 77bcaac, brief task-6-brief.md)
Task 6: implemented DONE_WITH_CONCERNS (commit a51f692, 6 new tests, 107/107 suite, lint clean). Implementer found and fixed a real race in the plan's own idle-timeout code and reported it plainly.
Task 6: Ruling: the deviation is ACCEPTED. The plan called reader.cancel() before reject() inside the idle timer; cancel() synchronously settles a pending read() with {done:true}, so that resolution won the Promise.race and the timeout rejection never surfaced, meaning a stalled stream would end silently instead of raising TIMEOUT. The implementer reproduced it standalone, swapped to reject-then-cancel with a comment, and left the test assertions untouched. I read the resulting code and it is correct. Cost if wrong: none identified; the alternative (leaving the plan's order) is a demonstrated silent-failure path.
Task 6: review dispatched (sonnet, carries the ruling)
Task 6: review clean (spec compliant, quality approved). Reviewer independently re-derived the microtask ordering behind the accepted reject-before-cancel fix and confirmed abort, timeout, cleanup and parser paths all trace correctly with no hangs or double-release.
Task 6: minor (deferred): lib/providers/sse.js abort is checked once per read, not per yielded event, so events already buffered from one chunk still flow after an abort. Inherited from the plan, not exercised by current providers which deliver one event per chunk.
Task 6: minor (deferred): lib/providers/sse.js never calls decoder.decode() with no arguments at stream end, so a trailing partial multi-byte UTF-8 sequence would not be flushed. Inherited from the plan, low risk for text SSE.
Task 6: complete (commits 77bcaac..a51f692, review clean, 107 suite)
Task 7: dispatched (sonnet, BASE a51f692, brief task-7-brief.md)
Task 7: implemented DONE (commit 19af02e, 6 new tests, 113/113 suite, lint clean). getMaxTokens had no callers before deletion; the four compatibility call sites verified unaffected; handleError now throws TranslationError with byte-identical messages.
Task 7: review dispatched (sonnet)
Task 7: review clean (spec compliant, quality approved). Reviewer verified all five named cross-cutting risks against the real call sites: every downstream caller passes only pre-existing params and reads only pre-existing fields; all six status mappings survive and TranslationError messages are byte-identical to the old ERROR_MESSAGES strings; retry resolves on headers before streaming begins and the body is read exactly once; request bodies omit temperature and output_config when absent; getMaxTokens has no callers repo-wide.
Task 7: minor (deferred): lib/providers/claude-provider.js vision() duplicates the headers/retry/error pattern that request() encapsulates, inherited from the plan.
Task 7: minor (deferred): maxTokens || this.config.maxTokens would drop an explicit 0; pre-existing behavior.
Task 7: deferred for final review (raised as "cannot verify from diff"): lib/providers/sse.js releases the reader lock in its finally but never calls reader.cancel() on a clean early break, so a provider that keeps the connection open after its terminal event would leave the body unconsumed. For all three providers the terminal event coincides with the server closing the stream, so this is theoretical today. Final review should triage whether to cancel on early exit.
Task 7: complete (commits a51f692..19af02e, review clean, 113 suite)
Task 8: dispatched (sonnet, BASE 19af02e, brief task-8-brief.md)
Task 8: implemented DONE (commit 54adaf1, 5 new tests, 118/118 suite, lint clean); review dispatched (sonnet)
Task 8: review clean (spec compliant, quality approved). Both files byte-identical to the brief; thinkingBudget 0 confirmed on both the text and vision paths; withPropertyOrdering only, no additionalProperties in any Gemini body; both endpoint URLs correct; all six error mappings present; compatibility call sites re-read and unaffected.
Task 8: minor (deferred): tests/gemini-provider.test.js has no vision() test, so the thinkingBudget flag on the vision path has no automated guard.
Task 8: minor (deferred): Gemini error-mapping tests cover only 403; 429, 5xx and both 400 branches are unexercised.
Task 8: reviewer's "cannot verify" on commit trailers resolved by controller: git log across the whole branch shows no Co-Authored-By trailer and no "claude code" mention in any commit.
Task 8: complete (commits 19af02e..54adaf1, review clean, 118 suite)
Task 9: dispatched (sonnet, BASE 54adaf1, brief task-9-brief.md)
Task 9: implemented DONE (commit c321996, 5 new tests, 123/123 suite across 15 files, lint clean); review dispatched (sonnet)
Task 9: review NEEDS FIXES - 1 Important (plan-mandated): openai-provider vision() never checks choices[0].message.refusal, so a refused image request returns an empty string and translateImage then throws a generic parse error instead of the real reason. complete() and stream() verified correct, all seven compatibility call sites re-read and unaffected, structural parity with Claude confirmed.
Task 9: Ruling: the refusal constraint is stated without scoping to complete(), the silent-failure path is real, so vision() must implement it. Scope limited to the OpenAI provider: Claude's Messages API and Gemini's generateContent report refusals through different fields, and extending this to them is outside this task's plan. Cost if wrong: image refusals on Claude and Gemini still surface as generic parse errors; those paths are unchanged from what shipped before.
Task 9: minor (deferred): status-code test coverage is 401 only, matching the existing pattern in the Claude (401) and Gemini (403) suites.
Task 9: minor (deferred): the plan's Task 9 step 4 says "PASS (6 tests)" where the suite has 5 it() blocks; documentation discrepancy only.
Task 9: fix round 1/5 dispatched (resumed implementer a33042d, FIX_BASE c321996)
Task 9: fix round 1/5 (1 addressed, 0 open; commits c321996..f5a452d) - refusal check sits before the return and before content is read, same error code as complete(), new test exercises vision() with RED then GREEN, scope limited to the OpenAI provider
Task 9: complete (commits 54adaf1..f5a452d, review clean after 1 fix round, 124 suite)
Task 10: dispatched (sonnet, BASE f5a452d, brief task-10-brief.md, carries Ruling 3 - the runtime-break window opens here)
Task 10: implemented DONE (commit f0ac32c, 7 new tests, 126/126 suite across 16 files, lint clean, build succeeds); review dispatched (sonnet)
Task 10: review clean (spec compliant, quality approved). Reviewer reasoned through key-join collision safety from the enum shapes rather than from tests, confirmed TTL delete-and-persist, LRU-before-save and lastAccess refresh, verified the untouched methods and that settings.js is unaffected, and confirmed the service worker was genuinely left untouched with no shim.
Task 10: reviewer's "cannot verify" (are lint/tests/build actually green) resolved by controller on the live checkout: lint PASS, 126/126 tests across 16 files, build PASS.
Task 10: minor (deferred): the sha256 encode-digest-hex helper is now duplicated between lib/cache.js and lib/translation/cache-key.js; plan-mandated, consolidatable later.
Task 10: minor (deferred): no test simulates a legacy v2 entry to exercise the !entry.result miss branch; inherited from the plan's own test file.
Task 10: complete (commits f5a452d..f0ac32c, review clean, 126 suite)
Task 11: dispatched (sonnet, BASE f0ac32c, brief task-11-brief.md)
Task 11: implemented DONE (commit 8d9ae48, 3 new tests, 129/129 suite, lint clean, build succeeds); review dispatched (haiku, small single-function diff)
Task 11: review clean (spec compliant, quality approved, no issues). Reviewer verified all four named checks: legacy positional call sets neither mode nor result, absent keys stay absent rather than undefined, duplicate detection compares the capped original, and the other history functions and all reader files are untouched.
Task 11: complete (commits f0ac32c..8d9ae48, review clean, 129 suite)
Task 12: dispatched (sonnet, BASE 8d9ae48, brief task-12-brief.md)
Task 12: implemented DONE (commit 8110370, 16 new tests, 145/145 suite across 19 files, lint clean, build succeeds). 7 of 15 Persian strings contained a ZWNJ, all written as escapes.
Task 12: review dispatched (sonnet)
Task 12: review clean (spec compliant, quality approved, no issues at any severity). Reviewer verified ZWNJ escapes at the byte level with a Python scan, confirmed no other invisible characters, read all 15 Persian strings for grammatical correctness, cross-referenced the key set against ERROR_CODES, confirmed each key lands in the correct language block and appears exactly twice, and confirmed lib/constants.js changes are pure insertions.
Task 12: complete (commits 8d9ae48..8110370, review clean, 145 suite)
Task 13: dispatched (haiku, BASE 8110370, brief task-13-brief.md)
Task 13: implemented DONE (commit 402028d, 147/147 suite, no import cycle, build succeeds); review dispatched (haiku, small diff)
Task 13: review clean (spec compliant, quality approved, no issues). displayDirection and its arrow byte-identical, manual source-language path preserved, no other export touched.
Task 13: complete (commits 8110370..402028d, review clean, 147 suite)
Task 14: dispatched (sonnet, BASE 402028d, brief task-14-brief.md)
Task 14: implemented DONE (commit d27b3a2, 8 new tests, 155/155 suite, lint clean, build succeeds); review dispatched (sonnet)
Task 14: review clean (spec compliant, quality approved). Reviewer confirmed no path surfaces raw provider text, toTranslationError passes deliberate TranslationErrors through unchanged, the four preserved functions are untouched apart from polish's temperature, explainGrammar and getGrammarLesson stay distinct, constants.js deletions are exactly the two prompts, page-translator has zero remaining references, and the tests mock only the provider boundary.
Task 14: minor (deferred): the empty-streamed-result guard throws PARSE_FAILED, which is semantically odd for a non-JSON path.
Task 14: minor (deferred): GRAMMAR_POINTS_MAX_TOKENS lives in lib/api.js rather than beside the other budgets in lib/translation/budget.js.
Task 14: minor (deferred): explainGrammar has happy-path test coverage only; its TRUNCATED, PARSE_FAILED and NETWORK paths are untested.
Task 14: complete (commits 402028d..d27b3a2, review clean, 155 suite)
Task 15: dispatched (sonnet, BASE d27b3a2, brief task-15-brief.md) - this task closes the runtime-break window opened at Task 10
Task 15: review NEEDS FIXES - 1 Important (plan-mandated): finalizeResult sets correction: raw.correction || '' without Persian normalization, while every sibling source-side field goes through fixSource. For fa-en the correction is Persian text that reaches the "Did you mean" hint and the cache unnormalized. Everything else verified: cache key order, context-hash gating, truncation not cached but returned and historied, single shared handleTranslate, port abort on disconnect, existing handlers and document port untouched, every listener case resolving, and every cross-file signature checked against the real current code. Reviewer confirmed the Task 10 runtime break is closed.
Task 15: Ruling: the finding stands. The task's constraint says Persian output is normalized before display, caching and history, correction is displayed and cached, and the one-line fix is fixSource(raw.correction). Cost if wrong: none identified; the alternative leaves Arabic-form letters in a user-visible hint.
Task 15: minor (deferred): handleExplainGrammar hand-rolls its cache key instead of reusing buildCacheKeyParts; functionally equivalent, duplicates the ordering convention.
Task 15: fix round 1/5 dispatched (resumed implementer a99df40, FIX_BASE 6aea57f)
Task 15: fix round 1/5 (1 addressed, 0 open; commits 6aea57f..89c0d07) - re-reviewer audited every finalizeResult field and confirmed each routable source-side field goes through fixSource, each target-side field through fixTarget, fixSource returns '' for empty input, and the change is confined to one line
Task 15: complete (commits d27b3a2..89c0d07, review clean after 1 fix round, 160 suite). RUNTIME-BREAK WINDOW CLOSED: the extension translates again.
Task 16: dispatched (sonnet, BASE 89c0d07, brief task-16-brief.md)
Task 16: implemented DONE (commit 393f67c, 5 new tests, 165/165 suite across 23 files, lint clean, build succeeds). One disclosed deviation: also corrected a stale JSDoc line in renderInlineGrammar that still referenced withGrammar:true.
Task 16: review dispatched (sonnet)
Task 16: review clean (spec compliant, quality approved, no issues at any severity). Reviewer cross-checked the adapter against the real upstream contracts: alternatives only exist for sentence mode and senses only for word/phrase, isStreamingMode('batch') is true so the abort signal really reaches the port path, truncated can only be true on a successful streamed result so the notice is reachable exactly where intended, and errorTruncated exists in both locales. Confirmed no innerHTML for model output and no changes outside the listed edit sites.
Task 16: complete (commits 89c0d07..393f67c, review clean, 165 suite)
Task 17: dispatched (sonnet, BASE 393f67c, brief task-17-brief.md)
Task 17: implemented DONE_WITH_CONCERNS (commit e8e06c0, 165/165 suite, build succeeds, lint exits 0 with 1 warning). Concern raised: renderTranslationRichContext still destructures a `direction` parameter it no longer uses after the per-item direction change, producing an unused-var warning; the implementer followed the brief literally rather than pruning it silently.
Task 17: Ruling: prune it. The plan's edit list kept `direction` in the signature and at the call site while the same edit removed the only two uses of it, so the parameter is now dead and the warning is real. Test and lint output is supposed to be pristine. Remove `direction` from both the destructured parameter list and the call site in displayTranslation. Cost if wrong: none; the value is still available at the call site if a later sub-project needs it back.
Task 17: review dispatched (sonnet, carries the ruling)
Task 17: review NEEDS FIXES - 2 Important. (1) the ruled-on dead `direction` parameter is still present and lint reproduces the warning. (2) NEW, found by the reviewer: the EXPLAIN_GRAMMAR sendMessage sits unguarded inside handleTranslate's outer try, so a promise rejection (MV3 "could not establish connection", "message port closed", invalidated context) falls into the outer catch, which calls showError, which calls hideAllOutputs, wiping the just-rendered translation and skipping loadHistory/updateUsageStats/loadStats. Directly violates the constraint that a grammar failure must not discard the translation. Everything else verified correct against the real schemas.
Task 17: fix round 1/5 dispatched (resumed implementer a44346b, FIX_BASE e8e06c0)
Task 17: fix round 1/5 (2 addressed, 0 open; commits e8e06c0..f36e098) - direction removed from call site, destructuring and JSDoc with lint now pristine; grammar request wrapped in a local try/catch whose empty catch keeps the translation on screen, and the re-reviewer traced control flow to confirm loadHistory, updateUsageStats and loadStats still run after a grammar failure
Task 17: complete (commits 393f67c..f36e098, review clean after 1 fix round, 165 suite, lint zero warnings)
Task 18: split by controller. Documentation half (changelog + spec note) dispatched to a subagent; full verification and the live Chrome probes run by the controller, since the probes need browser automation and a decision about extension reload that a subagent cannot make.
Task 18 (controller half): full verification PASS on the live checkout - lint zero errors and zero warnings, 165/165 tests across 23 files, build succeeds. Branch is 23 commits, 49 files, +2818/-1240.
Task 18: docs half DONE (commit 402425c, changelog Unreleased entry and spec 7.3 truncation note, no new em dashes).
Task 18: CRITICAL FINDING from the live browser check, invisible to tests and to the build. Loading the probe page with the extension installed unpacked from the repo root logs: "[ParsiPad] content script failed to load: TypeError: Failed to fetch dynamically imported module: chrome-extension://kmpdnoblommcgejlmnnbciglefpnbbnk/content/main.js". Cause: content/content.js dynamically imports content/main.js as a raw ES module, so every transitive import must be listed in manifest web_accessible_resources. Task 16 added three new imports to content/main.js (./context.js, ../lib/translation/client.js, ../lib/language-detect.js) whose closure pulls in 7 files that are not web-accessible: content/context.js, lib/language-detect.js, lib/translation/{budget,client,languages,mode,normalize}.js. Before this branch main.js imported only ./utils/text.js, ./styles/index.js and ../lib/i18n.js, all three covered, so the unpacked load worked; this branch broke it. The packaged dist/ build is unaffected because esbuild bundles content/main.js into a single import-free file, which is why lint, tests and build all stayed green.
Task 18: Ruling: fix it by extending web_accessible_resources to cover the closure, not by changing how the content script loads. The dev workflow of loading the repo root unpacked is how this extension is actually developed and how the user runs it, so it has to work. Exposure risk is acceptable and consistent with what the manifest already does: lib/i18n.js is already exposed, the newly exposed files are pure logic and prompt text with no secrets (API keys live in chrome.storage, which web_accessible_resources does not touch), and every one of these files already ships inside the packaged extension where anyone can read them. Cost if wrong: any web page can fetch these module files and read the prompt text.
Task 18: fix dispatched to a fresh implementer (BASE 402425c)
Task 18: manifest fix DONE (commit 419868e). web_accessible_resources extended with content/context.js, lib/language-detect.js and lib/translation/*.js; closure check now reports 11 files reachable and zero uncovered; new tests/web-accessible-resources.test.js walks the real import graph on disk so this cannot regress silently. 167/167 tests across 24 files, lint zero warnings, build succeeds.
Task 18: root cause proved directly in the live browser under the currently loaded (pre-fix) manifest, by fetching each module from the page: lib/i18n.js, content/main.js and content/utils/text.js are FETCHABLE while content/context.js, lib/language-detect.js, lib/translation/client.js and lib/translation/mode.js are BLOCKED. That is exactly the set the fix adds.
Task 18: LIVE PROBES NOT RUN - blocked on an action only the user can take. A manifest change requires reloading the unpacked extension at chrome://extensions, and browser automation here cannot navigate chrome:// or chrome-extension:// URLs. Chrome is still running the pre-fix manifest, so the content script still fails to load and no on-page translation can be exercised. The probe page is ready at http://localhost:8731/index.html (source in the session scratchpad under probes/), with 11 probes including two contrasting senses of "charge", a phrase, an idiom, colloquial Persian, Finglish, a citation-prefixed line, Russian, and a 677-word passage for streaming.
Task 18: complete (commits f36e098..419868e, verification PASS, docs done, one Critical defect found and fixed; live probes deferred to the user)

## Final whole-branch review (fable, 25 commits, 9c76536..419868e)

Verdict: NOT SAFE TO MERGE as reviewed. Reviewer read the 5947-line diff in five passes.

CRITICAL 1: normalizeInput strips the [n] batch markers, breaking page translation end to end and silently. background/service-worker.js applies normalizeInput to every mode including batch, and lib/translation/normalize.js drops standalone bracketed numbers. Controller reproduced it directly: normalizeInput('[1] Library policies\n[2] They will charge you a fee.\n[3] Contact us') returns 'Library policies They will charge you a fee.\nContact us' - all markers gone and the first two items merged. parseNumberedTranslations then finds nothing, every node falls back to its original text, progress still reaches 100 percent and no error is raised. This is a defect in my own plan: Task 3's footnote-marker strip meets Task 15's unconditional normalization, a seam no per-task review could see and no test covers.
IMPORTANT 2: localized errors broke the missing-API-key detection. content/utils/text.js matches an English pattern, but localizeError now returns Persian for a Persian UI, so Persian users lose the "Open Settings" CTA and page translation grinds through every batch instead of stopping once. New regression: before this branch the message was always English.
MINOR 3: lib/translation/client.js hard-codes English 'Translation cancelled.', shown untranslated in a Persian UI and misleading when the port drops for a reason other than a user cancel.
MINOR 7: .parsipad-truncated-note is a fixed #b45309 in both themes; contrast unverified against the dark box background.
Deferred by the reviewer to follow-up (not merge blockers): all thirteen carried-forward minors, plus new minors 4 (error tone classified by English keywords), 5 (popup history list now renders up to 4000 chars per entry), 6 (a stream that errors mid-render discards the partial text the user was watching).
Reviewer confirmed no siblings of the web_accessible_resources defect remain, and that the new closure test guards that class.

Ruling: one fix wave covering Critical 1, Important 2, Minor 3 and Minor 7. Critical 1 and Important 2 are regressions this branch introduced and block merge. Minor 3 is the same localization seam as Important 2 and is cheap to fix at the root by treating ABORTED as "show nothing" rather than by translating the string. Minor 7 is one line and user-visible. Minors 4, 5 and 6 are deferred to sub-project 2 with the rest. Cost if wrong: minors 4 to 6 ship as described, all cosmetic or recoverable.
Final review: ONE fix wave dispatched (fresh implementer, sonnet, FIX_BASE 419868e)
Final fix wave: all 4 findings ADDRESSED, no new breakage (commits 419868e..60dacf6). Re-reviewer traced the batch path end to end from content/main.js through the client and port into prepareTranslation, confirmed classifyMode can never infer batch so the no-mode fallback cannot lose markers, diffed the round-trip test's parser against the real parseNumberedTranslations line for line, verified the plain-English fallback in isMissingApiKeyResponse is load-bearing rather than decorative by tracing polish and dictionary through localizeError, confirmed ABORTED cannot swallow a real timeout, and confirmed the dark-mode rule mirrors the file's existing mechanism. VERDICT: SAFE TO MERGE.
Final fix wave: out-of-scope observation, deferred: PP_DESTRUCTIVE_ERROR_PATTERN in content/main.js classifies error tone with an English-only regex, the same class as the missing-key defect but pre-existing and untouched. Matches deferred minor 4 from the final review.
BRANCH COMPLETE: 29 commits, 186 tests across 26 files, lint zero warnings, build passing.
