# Plan B (3.3.0) rulings and deferred minors

Exported from the execution ledger before the workspace was deleted.

## Rulings
- Pre-flight: Ruling: T1 id extraction uses a regex capture (getElementById\('([^']+)'\)) instead of slice(17,-2) — the slice is off by one — cost if wrong: none
- Pre-flight: Ruling: keep sidepanel.html as a separate copy of the popup markup, guarded by the T1 test that every id popup.js queries exists in both files — the user loads the extension unpacked from the repo root, so a build-time generated panel page would not exist for them, and a query-string surface on one page is not documented for sidePanel paths — cost if wrong: markup edits must be made in two files; the id test catches the dangerous drift
- Pre-flight: Ruling: T6 keeps #open-sidepanel-btn (T2) and #provider-badge (T3) in the rebuilt header — they are produced earlier and the mockups show both — cost if wrong: none
- Pre-flight: Ruling: T3 records health for lookupWord inside lib/dictionary.js (where it lives) and for the rest in lib/api.js — the plan named the wrong file — cost if wrong: none
- Pre-flight: Ruling: T5 test mocks getProviderById from lib/providers/index.js, the function testApiKey should use with its provider argument — the plan named a function that does not exist — cost if wrong: none
- Pre-flight: Ruling: T6 deletes the reset-stats assertion from tests/destructive-confirm.test.js along with the stats section; Analytics keeps its own confirmed Clear — the section moves to Analytics per the spec — cost if wrong: none
- Pre-flight: Ruling: the mode pill on both surfaces is Translate, Polish, Doc & Image; "Doc & Image" shows the document upload and the image upload together; Dictionary leaves the popup because a single word already returns the full word card (senses, IPA, synonyms), while Alt+D and the right-click lookup on pages are unchanged; Library is the link in the Recent row on both surfaces, not a tab — the user renamed the panel tab to "Doc & Image" to keep it on one line, and a link inside a tablist is an accessibility defect — cost if wrong: the popup shows three modes instead of the spec's four, and the panel has no Library tab until the Library phase
- Roadmap ruling: Ruling: grammar lessons explain in Persian by default with English examples and a per-lesson English toggle — user asked for the best-practice choice; first-language explanations with target-language examples is the norm in language-learning products for this level — cost if wrong: one prompt change and a default flip
- Task 1: Ruling: popup.js window.close() after Translate Page and Screenshot (popup.js ~1886, ~2351) must not run in the side panel; Task 2 adds a surface check (document.body.dataset.surface === 'panel') and skips the close there — closing the panel after starting a page action defeats the point of a persistent panel — cost if wrong: one condition
- Task 3: Ruling: user-cancelled (ABORTED) calls are not recorded as health — a cancel says nothing about the provider — cost if wrong: none
- Task 3: Ruling: health wraps the provider call only, so a reply that arrives but fails parsing counts as ok — the badge reports reachability and key validity, not answer quality — cost if wrong: a green dot while answers fail to parse
- Task 3: Ruling: document translation records health once per chunk — each chunk is a real provider call — cost if wrong: none
- Task 4: Ruling: the chip stays when the selection is cleared and hides only on tab switch — the user often deselects by clicking toward the panel, and the chip is still the thing they want to press — cost if wrong: a stale chip until the next selection or tab switch
- Task 4: Ruling: the panel ignores SELECTION_CHANGED from background tabs (sender.tab.active), beyond the brief — a selection in a tab you are not looking at should not replace the chip — cost if wrong: none
- Task 4: Ruling: content/main.js sends the literal 'SELECTION_CHANGED' — lib/constants.js is not web accessible to content modules when loaded unpacked — cost if wrong: a renamed action would need two edits
- Task 4: Ruling: recover the chip with a pull (panel asks the active tab for its current selection on open and on tab switch via a GET_SELECTION message) plus resetting the dedupe on a cleared selection — the reviewer's scenarios A and B lose the chip under the push-only design the plan specified — cost if wrong: one extra message on panel open and tab switch
- Task 4: Ruling: cap reported selection text at 2000 characters and compute the report only after the debounce — a select-all on a long page would otherwise build and send megabytes on every selectionchange — cost if wrong: very long selections are truncated in the textarea
- Pre-flight: Ruling: Plan B's release task says 3.2.0 (written before Phase 1 took it); Plan B ships 3.3.0 — Phase 1 released 3.2.0 and the store rejects a repeated version — cost if wrong: none
- Task 5: Ruling: the how-to starts open in the popup/panel first-run section and collapsed in Settings — first run is when the steps are needed; Settings users mostly have a key — cost if wrong: one attribute
- Task 5: Ruling: first-run tests the typed key before storing and stores only on success; Settings keeps save-then-test — the brief's "Translate disabled until a test succeeds" is impossible with store-then-test, and Settings users may need to save a key while the provider is down — cost if wrong: a user whose first-run test fails because the provider is down must retry later or save from Settings
- Task 5: Ruling: a failed first-run test still records provider health, so the badge can go red before any key is stored — red is the honest state for the key the user just tried — cost if wrong: a red dot on a provider with no stored key
- Task 6: Ruling: the popup drops its Analytics link; Analytics stays reachable from Settings > More (existing View Analytics button) — the spec moves stats out of the popup — cost if wrong: one extra click to Analytics
- Task 6: Ruling: history Clear All lives only in the Library page now — the popup keeps a one-line Recent row per the spec — cost if wrong: none
- Task 6: Ruling: reopening a Recent item renders the stored full result (a word comes back as its full card) — better than the old plain text and costs no request — cost if wrong: none
- Task 6: Ruling: the History page's Clear All also clears dictionary history now; a dictionary view in the Library waits for Plan C — removing the popup Dictionary tab left stored lookups undeletable — cost if wrong: Clear All removes slightly more than its label suggested before
- Task 7: Ruling: Task 7 implementer writes the release docs only (changelog under Unreleased, README, store description, permission justification); the controller bumps to 3.3.0, zips, merges and pushes after the final whole-branch review and its fixes — the release then ships exactly what was reviewed — cost if wrong: none
- Task 7: Ruling: store-assets/PERMISSION-JUSTIFICATIONS.txt becomes tracked (it was untracked) — public justification text, belongs with the open-source repo like DESCRIPTION.txt — cost if wrong: one git rm --cached

## Deferred minors
- Task 1: minor (deferred): drift guard checks ids only, not data-i18n*/data-shortcut-for attributes between popup.html and sidepanel.html
- Task 1: minor (deferred): sidepanel.css .popup override is a no-op today
- Task 2: minor (deferred): popup sidebar button stays visible where chrome.sidePanel is missing and failures only log
- Task 2: minor (deferred): setPanelBehavior not awaited and has no catch
- Task 2: minor (deferred): close-guard test counts closes rather than locating the unguarded one
- Task 3: controller browser check: badge unknown -> ok after a translation, live switch Claude -> Gemini, no console errors; fits the 400px header with the sidebar, theme and settings buttons. minor (deferred): aria-label reads 'Last request now' instead of 'just now'
- Task 3: minor (deferred): no test that the nine provider call sites record health
- Task 3: minor (deferred): toTranslationError(error).code evaluated outside safeRecord's try/catch
- Task 3: minor (deferred): health write queue is per JS context, cross-context writes can still lose one update
- Task 3: minor (deferred): renderProviderBadge awaited in popup init before history loads
- Task 3: minor (deferred): badge dot uses literal 8px; window.close right after un-awaited tabs.create
- Task 4: minor (deferred): pullSelection can race a fast tab switch and show the previous tab's selection
- Task 4: minor (deferred): panel.js behaviour (pull, active-tab filter, mode switch order) is pinned only by source-text tests
- Task 4: minor (deferred): selection reporting runs on every page even when the panel was never opened, waking the worker
- Task 4: minor (deferred): 2000-char cap can split a surrogate pair; pull reads only the top frame
- Task 5: minor (deferred): status live regions are display:none when empty; spacing literals and primitive tokens in new CSS; prefix parsing splits on ' or '; health write error swallowed without warn; happy-dom tests leave globalThis.document set; fa keyTestOk prints Latin digits for {ms}; "سطح رایگان" reads as a calque, "سهمیه رایگان" is more natural
- Task 5: minor (deferred): key prefix code chip (sk-ant-) wraps across lines in the 400px popup; add white-space: nowrap
- Task 5: minor (deferred): switching provider within 1.5 s after a successful test lets the hide timer unlock Translate for the new provider without a key
- Task 5: minor (deferred): Settings empty-field guard also fires when a stored key exists but the field was cleared by hand
- Task 6: minor (deferred): aria-keyshortcuts carries Chrome's raw shortcut string rather than ARIA key names (predates); dead i18n keys tapToConfirm, enterWordToLookup, singleWordOnly; popup-structure tests are source-regex only; <nav> wraps buttons (plan-mandated); pill inset literal 2px (predates)
- Final: minor (deferred): selection reporting wakes the worker on every page even when the panel was never opened; gate it on an open panel in a later phase
- Final: minor (deferred): Tab order includes the grammar checkbox and Clear between textarea and Translate (plan wording omitted them)
- Final: minor (deferred): the screenshot guidance string uses straight quotes; live language switch can leave stale aria-labels on icon buttons (applyTranslations does not overwrite an existing aria-label)
- Final: minor (deferred): screenshot guidance says "from the side panel" even when shown in the toolbar popup on restricted pages; a plain element with a closed shadow root still reports a selection; the OPEN_SIDE_PANEL route has no sender yet
