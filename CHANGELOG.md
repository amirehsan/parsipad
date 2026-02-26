# Changelog

All notable changes to ParsiPad will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
