# Changelog

All notable changes to ParsiPad will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Changed
- Updated i18n translations for new features (English & Persian)

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
