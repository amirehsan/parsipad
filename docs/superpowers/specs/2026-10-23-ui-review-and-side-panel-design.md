# UI review outcomes and side panel design

Date: 2026-10-23. Source: a guideline audit of every surface of ParsiPad 3.1.2,
live screenshots of the built extension in Chromium with the API mocked, and
the mockups on the "ParsiPad UI Proposals" canvas. This document records the
decisions those produced. Two plans implement it:
`docs/superpowers/plans/2026-10-23-ui-phase-1-fixes.md` and
`docs/superpowers/plans/2026-10-23-side-panel-and-popup.md`.

## Who the product is for

Mostly Iranians reading non-Persian pages. The in-page flows (hover icon,
selection toolbar, page translate) are therefore the primary experience and
stay on by default. The popup becomes a quick launcher. A new side panel is
the home for deliberate work: pasting text, polishing, documents, images,
and later the Library.

## Confirmed defects (Phase 1)

1. Popup review banner: `.review-btn-primary` sets `color` and `background`
   to the same token, so "Rate Now" is an empty block (`popup/popup.css:1740`).
2. Settings dictionary card: label and hint share one i18n key, so both
   render the same sentence (`settings/settings.html:108-119`).
3. Welcome page, dark mode: the theme toggle's icons use Tailwind class
   names that no stylesheet defines, so the control is a grey dot.
4. Raw storage enums leak into the UI: badges read `EN-TO-FA` on History,
   Favorites and the New Tab eyebrow. There are four separate formatters.
5. Grammar page: `lessonContent` is set `dir="rtl"` for every EN to FA
   lesson although the lesson prompt writes all explanation text in English,
   so English runs right-to-left with leading periods. Also
   `[dir="rtl"] *` forces the Persian font on English text.
6. Popup `showError()` calls `hideAllOutputs()`, so a failed copy, favorite
   or regenerate destroys the translation on screen.
7. Closing the floating box does not abort the streaming port, so tokens
   keep billing after the box is gone.
8. Clear API key, Replace import and Reset Stats act immediately with no
   confirmation.
9. No `color-scheme` on `html`, so native controls and scrollbars render
   light in dark mode.

## Side panel

- Manifest V3 Side Panel API (`sidePanel` permission, `side_panel.default_path`).
  Chrome 114 and later; `manifest.json` already targets Chrome 120.
- The panel page reuses the popup's script and markup wholesale: same element
  ids, same `popup.js`, a `sidepanel.css` that makes the layout fluid. This is
  deliberate: the popup script is 2,300 lines and forking it would double the
  bug surface. The panel adds only what the popup cannot have.
- Opens from: a button in the popup header, a context-menu item
  "Open ParsiPad in the sidebar", and a message action `OPEN_SIDE_PANEL`.
  The toolbar icon keeps opening the popup (`openPanelOnActionClick: false`).
- Selection chip: the content script reports the current page selection
  (debounced, at least 2 characters, never inside editable elements). The
  panel shows the first 120 characters in a chip with a Translate button that
  fills the textarea and submits. The chip clears when the active tab changes.
- Provider badge in the popup and panel header: provider display name plus a
  dot. Dot colour reflects the last real request: green ok, amber rate
  limited or timeout, red invalid key or network, grey never tested. Clicking
  the badge opens Settings on the Providers tab (`#providers`). No polling.
- First run: when the selected provider has no key, the popup and panel show
  one panel with provider radios, a key field and "Save and test key". The
  test sends one minimal request through the real provider and reports
  success with the model name and round-trip time. Translate is disabled
  until a key works.
- Key help: under the key field, a collapsed "How do I get a key?" opens
  three numbered steps for the selected provider, with the direct link, the
  key prefix to expect, and a cost note. Same block in Settings > Providers.
  Claude: console.anthropic.com/settings/keys, prefix `sk-ant-`, needs a
  card or credits. Gemini: aistudio.google.com/apikey, prefix `AIza` or
  `AQ.`, has a free tier. ChatGPT: platform.openai.com/api-keys, prefix
  `sk-`, needs credits.

## Popup rework

Order after the header: mode pill (Translate, Polish, Document, Image),
textarea (focused on open), primary Translate with `⌘↵`, a status line
(`role="status"`), then a quiet "This page" list with Translate page and
Screenshot and their real shortcuts from `shared/shortcuts.js`, then a
one-line Recent with a Library link. The stats section leaves the popup; it
lives on the Analytics page.

## Parked

Persian UI RTL rework (Phase 3), Library merge and New Tab decision
(Phase 4), component consolidation (Phase 5), Firefox. Grammar lesson
language (English vs Persian explanations) is a prompt decision still open.
