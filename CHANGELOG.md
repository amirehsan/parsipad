# Changelog

All notable changes to ParsiPad will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Build pipeline** (`scripts/build.mjs`) using esbuild; emits ESM bundles for the service worker, popup, settings, new tab, welcome, grammar, history, favorites, and analytics pages, plus an IIFE bundle for the content script. Static assets and `_locales/` are copied alongside.
- **Unit tests with Vitest** covering `lib/json-utils`, `lib/language-detect`, and `lib/retry`. `npm test` and `npm run test:watch` available.
- **CI workflow** (`.github/workflows/ci.yml`) runs lint (`--max-warnings=0`), tests, build verification, and uploads the bundled extension as an artifact on every push and pull request.
- **`SECURITY.md`** with private disclosure address, supported versions, threat model, and known limitations.
- **`CODE_OF_CONDUCT.md`** based on Contributor Covenant 2.1.
- **`_locales/en/messages.json`** and **`_locales/fa/messages.json`** with extension name, description, command descriptions, and context-menu titles; manifest now uses `__MSG_*__` references and a `default_locale`.
- **DOMPurify-based sanitizer** (`lib/sanitize.js`) for defense-in-depth on LLM-generated HTML; applied at the grammar lesson and dictionary render paths. DOMPurify is vendored locally so the source folder loads natively in Chrome without bundling.
- **Local Inter and Vazirmatn fonts** under `fonts/` (woff2 only) plus `fonts/fonts.css`. Replaces the previous `@import` from `fonts.googleapis.com` to comply with Chrome Web Store's no-remote-code policy and avoid third-party requests at startup. The content-script-injected Persian font now loads via `chrome.runtime.getURL`.
- **Missing-API-key toast and CTA** in the floating box and as a standalone Shadow DOM toast (during page translation), with an "Open Settings" button wired through a new `OPEN_OPTIONS` action.
- **ARIA pass** on the floating translation box (role=dialog, aria-live content region, role=alert errors, role=status loading) and an auto-mirroring of `data-i18n-title` to `aria-label` in `applyTranslations`.

### Changed
- **Service-worker `ensureContentScript`** now polls a PING handshake (up to 2 s) instead of using a fixed 100 ms `setTimeout`, eliminating races against `document_idle` initialization.
- **`lib/retry.js`** rewritten to support per-attempt timeouts and external `AbortSignal` cancellation; all three provider implementations thread the signal into `fetch`.
- **Page translation cancel** now uses an `AbortController` plus `Promise.race` so the cancel button doesn't have to wait for the current batch's network round-trip. SPA navigation (`popstate` + patched `pushState`/`replaceState`) also resets the stale `pageTranslationState`.
- **Content script structure**: `content/content.js` is now a 15-line bootstrap that dynamically imports `content/main.js`. The full module entry lives in `content/main.js`, with shared helpers split into `content/utils/text.js` and `content/styles/index.js`. This works whether the user loads the source folder directly or the built `dist/` bundle.
- **ESLint config** ignores `lib/vendor/**`, `.history/**`, and `dist/**`; adds Node globals for `scripts/` and `tests/`; treats catch-error variables as intentionally unused.
- Manifest `web_accessible_resources` extended with fonts, content module files, and the i18n message catalog.

### Fixed
- **Content-script re-injection** no longer fails with `Identifier 'X' has already been declared` when `chrome.scripting.executeScript` runs on a tab that already has the manifest-injected script — `window.__parsipadBootstrapped` guard short-circuits the second load.
- **Sender validation**: the content-script `onMessage` handler now rejects messages whose `sender.id` doesn't match `chrome.runtime.id`.
- **Stale release zips** removed from version control; `store-assets/` is now ignored as intended.

## [2.10.0] - 2026-03-20

### Added
- **New Tab Bookmark Browser** — browse Chrome bookmarks in a collapsible file/folder tree directly from the new tab page
  - Search and filter bookmarks with debounced input and highlighted matches
  - Keyboard shortcuts: `/` to focus search, `Escape` to clear
  - Two-column layout: flashcards (left) and bookmarks (right)
  - Responsive: columns stack vertically on narrow screens
  - Dark mode and RTL support
  - Privacy-first: read-only access, no data leaves the device

### Changed
- New tab page redesigned from single-column centered layout to two-column grid
- Bookmarks panel visible even when flashcard feature is disabled

### Fixed
- HTML `hidden` attribute override by CSS `display` properties
- RTL arrow direction in flashcard navigation
- Button font-family consistency across the app

## [2.9.0] - 2026-03-20

### Added
- Analytics Dashboard: dedicated page to track API usage and estimated costs
  - Cost estimation per provider (Claude, Gemini, ChatGPT)
  - Per-action breakdown (translate, polish, dictionary, document, image, grammar)
  - Time-based usage trends (7 days, 30 days, all time)
  - Export analytics data as JSON
  - Clear analytics data while preserving cumulative stats
- Usage event logging for all API actions in the service worker
- Analytics accessible from popup stats section and settings page
- Full i18n support for analytics (English and Farsi)

### Technical
- New storage functions: logUsageEvent, getUsageEvents, clearUsageEvents
- Compact event schema (~120 bytes per event, capped at 5000)
- Provider pricing constants for cost calculation
- ACTION_TYPES enum for standardized action tracking

## [2.8.0] - 2026-03-18

### Added
- **Screenshot Region Translate** - macOS-style screenshot selection tool for translating text in images on any webpage
  - Press `Alt+S` or right-click "Screenshot & Translate" to activate
  - Screen freezes with crosshair cursor for precise region selection
  - Drag to select any area - dimmed overlay with cutout effect shows your selection
  - Selected region is cropped and sent to AI vision API for OCR + translation
  - Results displayed in floating translation box with extracted text and translation
  - Supports favorites - star screenshot translations for later review
  - DPR-aware cropping for pixel-perfect results on Retina displays
  - Cancel anytime with `Escape` key
  - "Screenshot" button added to Image tab in popup for quick access

### Changed
- **Settings: Save All API Keys** - Clicking any "Save" button now saves all changed API keys across all providers at once
  - No longer need to switch tabs and save each key individually
  - Shows combined success message (e.g., "Claude, Gemini API keys saved successfully")
- Image tab now shows two side-by-side buttons: "Select File" and "Screenshot"

### Technical
- New `CAPTURE_SCREENSHOT` action in constants.js
- `chrome.tabs.captureVisibleTab()` with "capture first, select second" pattern
- Screenshot overlay uses closed Shadow DOM with pointer capture for reliable drag tracking
- Canvas-based cropping with `devicePixelRatio` scaling for Retina displays
- New keyboard shortcut command `screenshot-translate` (Alt+S) in manifest
- New context menu item "Screenshot & Translate" for page context

## [2.7.0] - 2026-02-26

### Added
- **Full Page Translation** - Translate entire webpages with one click
  - Translates all visible text content on any webpage
  - Smart chunking with numbered batches for reliable translation
  - Progress overlay showing real-time translation status
  - Cancel button for long translations
  - Floating toggle button (FAB) to switch between original and translated text
  - Automatic RTL direction for Persian content
  - Vazirmatn font applied to all translated Persian text for better readability
  - Context menu: "Translate this page"
  - Keyboard shortcut: `Alt+P`

- **Keyboard Shortcuts Reference** - New section in Settings page
  - Lists all global shortcuts (Alt+T, Alt+D, Alt+P)
  - Popup shortcuts (Ctrl+Enter for translate)
  - Flashcard shortcuts (Space, Arrow keys, C, R)
  - Full i18n support (English & Persian)

- **Grammar Learning UX Improvements** - Enhanced grammar learning experience
  - **Skeleton UI Loader** - Beautiful shimmer animation during lesson generation instead of plain spinner
  - **Text-to-Speech (TTS)** - Listen to original text and translation with speaker buttons
    - Supports both English and Persian voices
    - Click to play/pause with visual feedback
    - Graceful fallback when TTS unavailable
  - **Transliteration (Pinglish)** - Phonetic romanization for Persian text in examples
    - Helps English speakers read Persian script
    - Consistent romanization system (aa, kh, gh, sh, zh, ch)
  - **Register/Formality Badges** - Visual indicators for language register
    - Formal (رسمی), Informal (محاوره‌ای), Neutral (معمولی) badges
    - Alternative register expressions when meaningfully different
  - **Collapsible Sections** - Reduce cognitive overload
    - Compare & Contrast and Common Mistakes sections are now expandable
    - Default open but can be collapsed for cleaner view
  - **Per-Option Quiz Explanations** - Educational feedback for each quiz answer
    - Wrong answers show why that specific option is incorrect
    - Explains common L1-interference mistakes
    - Correct answer shows additional context

### Changed
- **Context-Driven Grammar Analysis** - Lessons now reference specific words from user's input
  - Explanations dissect exact syntax used in the provided sentence
  - No more generic grammar rules - everything tied to actual text
- **Enhanced Quiz Feedback** - Shows targeted explanation for selected answer
  - On wrong answer: shows why it's wrong + why correct answer is right
- **Toggle Button Design** - Material Design FAB best practices
  - Circular 48px floating action button
  - Icon-only design with tooltip (Bootstrap translate icon)
  - Material-style elevation shadows
  - Smooth hover/active states

### Technical
- Updated `GRAMMAR_LEARNING_PROMPT` with transliteration, register, and per-option explanations
- New CSS styles for skeleton UI, TTS buttons, transliteration, register badges, collapsibles
- Added `createCollapsibleSection()`, `createRegisterBadge()`, TTS functions in grammar.js
- Extended i18n with `correctAnswer` translation key
- Page translation with Vazirmatn font via Google Fonts CDN injection
- Data attribute `data-parsipad-translated` for font styling
- New ACTIONS: `TRANSLATE_PAGE`, `CANCEL_PAGE_TRANSLATION`, `TOGGLE_PAGE_TRANSLATION`, `GET_PAGE_TRANSLATION_STATE`
- Keyboard shortcuts section with `kbd` styling in settings

## [2.6.0] - 2026-02-26

### Added
- **Grammar Learning Page** - Comprehensive interactive grammar lessons
  - Dedicated page with detailed grammar explanations in target language
  - Multiple examples per grammar point with highlighted patterns
  - Compare & Contrast section showing differences between English and Persian
  - Common mistakes section to avoid typical learner errors
  - Interactive quizzes with challenging, plausible wrong answers
  - Save grammar lessons to Favorites for later review
  - "Learn More" button on grammar explanations opens the learning page
  - Full RTL support with Persian font for Persian content
  - Dark mode support

### Changed
- **Landing Page Simplified** - Cleaner, less busy feature presentation
  - Reduced from 16 features to 9 core features
  - Focused 3×3 grid layout highlighting key differentiators
  - Removed: Dark Mode, Right-Click Menu, Keyboard Shortcut, Translation History, Regenerate Polish, Welcome Page, Data Backup (still available, just not featured)
  - Fixed CSS linter errors (canonical Tailwind class names)

- **Grammar Explanations Enhanced** - Language-aware explanations
  - EN→FA translations: Grammar explanations in Persian
  - FA→EN translations: Grammar explanations in English
  - Proper RTL alignment and Persian font in popup

### Technical
- New `grammar/` directory with grammar.html, grammar.js, grammar.css
- Updated `GRAMMAR_LEARNING_PROMPT` for detailed lessons with quiz requirements
- Extended favorites storage to support grammar lesson type
- Updated `popup/popup.js` with grammar page navigation
- Comprehensive RTL CSS support for Persian grammar content

## [2.5.0] - 2025-02-25

### Added
- **Welcome/Onboarding Page** - Beautiful first-time setup experience
  - Feature showcase with 8 feature cards displaying all ParsiPad capabilities
  - Integrated API key setup for any provider (Claude, Gemini, ChatGPT)
  - Auto-opens on fresh install to guide new users
  - Access anytime via "View Welcome Guide" button in Settings
  - Full i18n support (English & Persian)
  - Dark mode support

- **Data Backup & Restore** - Export and import your data
  - Export favorites, translation history, polish history, dictionary history, and cache
  - Selective export - choose which data types to include
  - Import with merge or replace strategy
  - JSON format for easy portability
  - Item counts displayed next to each export option

- **Clear Cache Confirmation** - Prevent accidental data loss
  - Confirmation dialog before clearing translation cache
  - Translated message in both English and Persian

- **Review Prompt Banner** - Encourage users to rate the extension
  - Non-intrusive banner appears after adding 3+ favorites
  - Shows in popup footer with "Rate Now" and "Maybe Later" options
  - Remembers user's choice to not show again
  - Full i18n support (English & Persian)

### Changed
- Settings page now includes Data Backup section with export/import functionality
- Added "View Welcome Guide" button in Settings About section
- Welcome page opens automatically on first install via service worker

### Technical
- New `welcome/` directory with welcome.html, welcome.js, welcome.css
- Extended `lib/storage.js` with `hasCompletedOnboarding()` and `setOnboardingComplete()`
- Extended `lib/constants.js` with `onboardingComplete` storage key
- New backup/restore functions in `settings/settings.js`
- Updated `background/service-worker.js` to open welcome page on install
- Extended `lib/storage.js` with review prompt state functions
- Extended `lib/constants.js` with `reviewPromptDismissed` and `reviewPromptClicked` storage keys

## [2.4.1] - 2025-02-22

### Fixed
- **Claude API Model Update** - Updated Claude model from deprecated `claude-3-5-haiku` to `claude-haiku-4-5-20251001`
  - Fixes "model not found" errors when using Claude provider
  - Uses the latest Claude Haiku 4.5 model for faster, more capable translations

## [2.4.0] - 2025-02-18

### Added
- **Favorites System** - Save your best translations and polished text
  - Star icon on translations and each polish variant
  - Dedicated favorites page to view and manage saved items
  - Favorites include original text, saved text, type, and timestamp
  - Quick toggle favorite status from any result

- **New Tab Flashcards** - Learn vocabulary on every new tab
  - Interactive flashcard interface with flip animation
  - Click or press Space to reveal original text
  - Navigate with arrow keys or click progress dots
  - Keyboard shortcuts: ← → (navigate), Space (flip), C (copy), R (refresh)
  - Customizable phrase count (1-10 items)
  - Enable/disable in Settings
  - Beautiful design matching the extension theme
  - Dark mode support

- **Regenerate Polish Variant** - Get fresh alternatives for any polish version
  - Refresh button on each polish card (Professional, Conversational, Concise)
  - Regenerate individual variants without affecting others
  - Loading spinner on the specific card during regeneration
  - Updates history with the new variant

### Changed
- Settings page now includes New Tab Flashcards toggle and phrase count selector
- Updated manifest with new tab override for flashcard feature
- Added favorites link in popup footer
- Full i18n support for Favorites page and New Tab page (English & Persian)
- Persian font (Vazirmatn) support for RTL content in flashcards

### Technical
- New `favorites/` directory with favorites.html, favorites.js, favorites.css
- New `newtab/` directory with newtab.html, newtab.js, newtab.css
- Extended `lib/storage.js` with favorites and new tab functions
- New `REGENERATE_POLISH_VARIANT` action in background service worker
- Added `POLISH_VARIANT_SYSTEM_PROMPT` for single-variant regeneration

## [2.3.1] - 2025-02-12

### Improved
- **Selection Popup UX** - Enhanced floating toolbar for text selection
  - Centered positioning on selected text
  - Smart flip: appears above selection, flips below when near top edge
  - Spring animation with proper direction based on position
  - Custom styled tooltips with dark background and arrow
  - 200ms debounce to prevent flickering during selection
  - ARIA accessibility attributes for screen readers

- **Popup UI Spacing** - Better visual hierarchy in main popup
  - Improved spacing between character count and grammar checkbox
  - Better separation between grammar checkbox and Translate button
  - More breathing room in input area

- **Floating Translation Box** - Smart positioning improvements
  - Now flips above selection when near bottom of viewport
  - Consistent viewport padding (12px)

## [2.3.0] - 2025-02-12

### Added
- **Multi-AI Provider Support** - Choose your preferred AI provider
  - Support for Claude (Anthropic), Gemini (Google), and ChatGPT (OpenAI)
  - Global provider selection in Settings page
  - Separate API key configuration for each provider
  - Provider badge shows which AI generated the result

- **Provider Abstraction Layer** - Clean architecture for AI providers
  - Base provider interface with `complete()`, `vision()`, and `validateApiKey()` methods
  - Separate implementations for each provider
  - Easy to add more providers in the future

- **New Settings UI** - Enhanced provider management
  - Radio button cards for provider selection with company names
  - Tabbed interface for managing API keys
  - Green status indicator for configured providers
  - Links to each provider's API console

### Changed
- Settings page redesigned with AI Provider and API Keys sections
- Provider badge displayed in all result views (popup, floating window)
- Updated manifest with host permissions for Gemini and OpenAI APIs
- Updated i18n translations for new provider-related UI elements

### Technical
- New `lib/providers/` directory with modular provider implementations
- Updated `lib/storage.js` with provider selection and multi-key functions
- Refactored `lib/api.js`, `lib/dictionary.js`, and `lib/document-translator.js` to use provider abstraction

## [2.2.0] - 2025-02-08

### Added
- **Grammar Explanation Mode** - Learn while you translate
  - Checkbox option in Translate tab: "Explain grammar"
  - When enabled, shows grammar notes below translation
  - Explains word order differences, verb conjugations, idiomatic expressions
  - 2-4 grammar points per translation
  - Grammar translations are not cached (fresh explanations each time)

- **Image Translation** - Translate text from images
  - New "Image" tab in popup
  - Upload images via file picker or paste from clipboard (Ctrl+V)
  - Supports JPG, PNG, WebP formats (max 5MB)
  - Extracts text using Claude's vision capabilities
  - Shows extracted text and translation side-by-side
  - Copy translation to clipboard

- **Tab Redesign** - Cleaner 4-tab layout
  - Reduced from 5 tabs to 4: Text, Dictionary, Document, Image
  - Segmented control for Translate/Polish toggle inside Text tab
  - More space-efficient design

### Changed
- Updated i18n translations for new features (English & Persian)
- **Vazirmatn Font Consistency** - Persian text now uses Vazirmatn font throughout the entire extension
- Enhanced RTL support with proper font inheritance for all UI elements
- Added Google Fonts import to history page CSS

## [2.1.0] - 2025-01-28

### Added
- **Selection Popup** - Floating action icons when selecting text on any webpage
  - Quick access to Translate, Polish, and Dictionary lookup
  - Enable/disable toggle in Settings
  - Dictionary button auto-disabled for multi-word selections
  - Escape key or click outside to dismiss

### Changed
- Replaced emoji flags with SVG flag images in Language Settings
  - US flag for English
  - Iran flag for Persian (فارسی)
  - Larger, cleaner appearance

## [2.0.0] - 2025-01-23

### Added
- **Dictionary Lookup** - Look up word definitions with phonetics, synonyms, and antonyms
  - Right-click context menu: "Look up in Dictionary"
  - Keyboard shortcut: `Alt+D`
  - Popup Dictionary tab for manual lookup
  - Dictionary history tracking
- **Document Translation** - Upload and translate TXT files
  - Progress tracking with chunk indicator
  - Cancel button for long translations
  - Download translated file
  - Smart chunking for API limits (max 100KB)
- **Dictionary Settings** - Control translation direction independently
  - Enable/disable English to Persian translation
  - Enable/disable Persian to English translation
- **Translation Cancel** - Cancel in-progress document translations gracefully

### Changed
- Updated UI styling to match landing page (Inter + Vazirmatn fonts)
- Logo now uses actual icon image instead of text placeholder
- Improved floating UI with larger border radius and purple-tinted shadows
- Enhanced shadow DOM styling for content scripts

### Fixed
- Content script icon accessibility via web_accessible_resources

## [1.0.0] - 2025-01-20

### Added
- Initial release
- **AI-Powered Translation** - Persian to English and English to Persian using Claude AI
- **Text Polishing** - Three styles: Professional, Conversational, and Concise
- **Right-Click Context Menu** - Translate or polish selected text from any webpage
- **Keyboard Shortcut** - `Alt+T` for quick translation
- **Dark Mode** - Beautiful dark theme that syncs with system preferences
- **Translation History** - View and manage past translations with search and filters
- **Polish History** - Separate history for polishing operations
- **Usage Statistics** - Track translation count and token usage
- **Offline Caching** - Previously translated text loads instantly
- **Bilingual UI** - Full English and Persian (فارسی) interface support
- **Settings Page** - Configure API key, theme, and language preferences
- **Floating Translation Box** - Shows results near selected text on webpages
