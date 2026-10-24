<p align="center">
  <img src="icons/icon-128.png" alt="ParsiPad Logo" width="128" height="128">
</p>

<h1 align="center">ParsiPad</h1>

<p align="center">
  <strong>AI-Powered Persian ↔ English Translator</strong>
</p>

<p align="center">
  A Chrome extension for seamless Persian-English translation powered by your choice of AI.
  <br>
  Supports Claude, Gemini, and ChatGPT. Featuring text polishing, keyboard shortcuts, right-click menu, and dark mode.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#license">License</a>
</p>

---

## Features

### Core Translation
- **Multi-AI Provider Support** - Choose between Claude, Gemini, or ChatGPT
- **AI-Powered Translation** - Accurate, context-aware translations using your preferred AI
- **Screenshot Region Translate** - Select any area on a webpage and translate text from images (NEW in v2.8)
- **Full Page Translation** - Translate entire webpages with one click; it asks first with the paragraph count and an estimated cost, and reports any sections that failed so you can retry just those
- **Image Translation** - Extract and translate text from images using OCR
- **Document Translation** - Upload and translate TXT files with progress tracking
- **Text Polishing** - Get 3 versions: Professional, Conversational, and Concise

### Grammar Learning (NEW in v2.7)
- **Grammar Explanations** - Learn grammar while translating with detailed explanations
- **Grammar Learning Page** - Dedicated page with comprehensive lessons
  - Explanations in target language (Persian for EN→FA, English for FA→EN)
  - Multiple examples per grammar point
  - Compare & Contrast between English and Persian
  - Common mistakes to avoid
  - Interactive quizzes to test understanding
  - Save lessons to Favorites for review

### Organization & Learning
- **Favorites System** - Star translations and polished text to save them
- **Library** - History, Favorites and saved grammar Lessons in one searchable page, with Undo for deletes
- **Practice** - Review your favorites as flashcards, from the side panel or the Library
- **Dictionary Lookup** - Look up definitions, phonetics, synonyms, and antonyms
- **Side Panel** - Keep ParsiPad open beside the page while you browse

### Quick Access
- **Selection Toolbar** - Translate, Polish, Dictionary and Mute buttons when you select text on a webpage, by mouse, touch or keyboard; never inside text fields
- **Keyboard Shortcuts** - `Alt+T` to translate, `Alt+D` for dictionary, `Alt+P` to translate page, `Alt+S` to screenshot translate
- **Right-Click Menu** - Translate, polish, look up, translate page, or screenshot translate from any webpage

### Settings & Data
- **Data Backup & Restore** - Export and import favorites, history, and cache
- **Settings** - One page with a section nav: AI provider & key, Reading on web pages, Language & appearance, Flashcards, Data & backup, Shortcuts, About. Each provider has its own key field with Save & test
- **Muted Sites** - Turn off the hover translate button and the selection toolbar on sites you choose, subdomains included; the toolbar's Mute button adds the current site for you
- **Welcome/Onboarding Page** - First-time setup that starts with your key, tests it, and ends on a first translation
- **Dark Mode** - Beautiful dark theme that syncs with system preferences
- **Bilingual Support** - Full English and Persian (فارسی) interface
- **Usage Analytics** - Track your translation and token usage on the Analytics page, opened from Settings > Data & backup
- **Offline Caching** - Previously translated text loads instantly

## Installation

### From Chrome Web Store (Recommended)

1. Visit the [Chrome Web Store](https://chrome.google.com/webstore) (link coming soon)
2. Click "Add to Chrome"
3. Follow the setup instructions

### Manual Installation (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/amirehsan/parsipad.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the cloned folder

5. The extension icon will appear in your toolbar

## Usage

### Getting Started

1. **Get an API Key** from your preferred AI provider:
   - **Claude (Anthropic)**: Visit [console.anthropic.com](https://console.anthropic.com/) - Key starts with `sk-ant-`
   - **Gemini (Google)**: Visit [aistudio.google.com/apikey](https://aistudio.google.com/apikey) - Key starts with `AIza`
   - **ChatGPT (OpenAI)**: Visit [platform.openai.com/api-keys](https://platform.openai.com/api-keys) - Key starts with `sk-`

2. **Configure the Extension**
   - Click the ParsiPad icon in your toolbar
   - On first run, choose your AI provider and paste the key (the "How do I get a key?" guide has the link and key format for each provider)
   - Click "Save and test key": ParsiPad makes one tiny real request and stores the key only if it works
   - Later, change provider or key from Settings (gear icon): each provider card has its own "Save & test"

3. **Start Translating**
   - **Option 1:** Type or paste text in the popup and click Translate (or press `Ctrl+Enter`, `Cmd+Enter` on Mac)
   - **Option 2:** Select text on any webpage and press `Alt+T`
   - **Option 3:** Select text, right-click, and choose "Translate with ParsiPad"

### Side Panel

Click the sidebar button in the popup header, or right-click a page and choose "Open ParsiPad in side panel", to open ParsiPad in Chrome's side panel. It stays open while you switch tabs and scroll, and long jobs such as documents and whole-page translations keep running. Text you select on the page shows up as a "Selected on this page" chip with a one-click Translate button; it never reads inside text fields, and the text stays in your browser until you translate it. The provider name in the header has a dot showing how the last real request went (green working, amber rate-limited or slow, red key rejected or network error, grey no requests yet), and clicking it opens the provider settings.

### Selection Toolbar

Select text on a page and a small toolbar appears above it with Translate, Polish and Dictionary buttons, and a button to mute ParsiPad on that site (a message offers Undo, and the button is hidden on addresses such as localhost):
- It works after a mouse drag, after a touch long-press (and follows the selection handles), and for a selection made with the keyboard
- It never appears for a selection inside a text field, an editor such as Gmail compose, or one of ParsiPad's own boxes, and it skips very long selections such as Ctrl+A
- It never takes focus on its own. Press `Tab` to move into it, the arrow keys to move between its buttons and `Escape` to close it and return to where you were
- Turn it off, or mute sites, in Settings under Reading on web pages

### Translation Mode

Enter any text in English or Persian - the extension automatically detects the language and translates to the other.

#### Grammar Explanation Mode

Enable "Explain grammar" checkbox to receive grammar notes with your translation:
- Word order differences between Persian and English
- Verb conjugations and tense explanations
- Idiomatic expressions and their meanings
- Register and formality choices

#### Grammar Learning Page (NEW in v2.6)

Click "Learn More with Examples" on any grammar explanation to open the dedicated grammar learning page:
- **Detailed Explanations** - Comprehensive grammar lessons in your target language
- **Multiple Examples** - 3 examples per grammar point with highlighted patterns
- **Compare & Contrast** - Side-by-side comparison of how grammar works in both languages
- **Common Mistakes** - Learn what errors to avoid
- **Interactive Quizzes** - Test your understanding with challenging questions
- **Save to Favorites** - Save grammar lessons for later; they reopen from the Library's Lessons tab with no new request to your provider

### Polish Mode

Get three polished versions of your text:
- **Professional** - Formal, business-appropriate tone
- **Conversational** - Friendly, casual tone
- **Concise** - Brief, to-the-point version

Not happy with a variant? Click the regenerate button to get a fresh alternative while keeping the others.

### Dictionary Mode (NEW in v2.0)

Look up any word to see:
- **Definitions** - Multiple definitions with part of speech
- **Phonetics** - Pronunciation guide
- **Synonyms & Antonyms** - Related words
- **Translation** - Persian translation for English words (and vice versa)

Access via:
- Select a word and press `Alt+D`
- Right-click and choose "Look up in Dictionary"
- Type a single word in the popup's Translate box to get the full word card

### Document Mode (NEW in v2.0)

Translate entire documents:
1. Open the popup, choose "Doc & Image" and use the Document area
2. Upload a TXT file (max 100KB)
3. Watch the progress as chunks are translated
4. Download the translated file when complete

You can cancel long translations at any time.

### Image Mode (NEW in v2.2)

Translate text directly from images:
1. Open the popup, choose "Doc & Image" and use the Image area
2. Upload an image (JPG, PNG, WebP up to 5MB)
   - Or paste from clipboard with `Ctrl+V`
3. Click "Translate Image"
4. View extracted text and translation
5. Copy translation to clipboard

Useful for translating:
- Screenshots of foreign text
- Photos of signs, menus, or documents
- Images with embedded text

### Screenshot Region Translate (NEW in v2.8)

Translate text directly from any area on a webpage:
1. Press `Alt+S` or right-click and select "Screenshot & Translate"
   - Or click "Screenshot" in the popup's "This page" list
2. The page freezes with a crosshair cursor
3. Drag to select the region containing text you want to translate
4. Release to capture - AI extracts and translates the text
5. View results in the floating translation box
6. Press `Escape` to cancel selection

Perfect for translating:
- Text embedded in images or banners
- Non-selectable text on webpages
- Text in videos or interactive content

### Favorites

Save your best translations and polished text:
1. Click the star icon on any translation or polish result
2. Open the Favorites tab of the Library to see them all
3. Remove favorites by clicking the star again

### Library

Everything you translate, polish or look up is kept in the Library:
1. Open it from the Library link in the popup or the side panel
2. Switch between the History, Favorites and Lessons tabs
3. Search, filter by type (translation, dictionary, polish) and by direction; entries are grouped under Today, Yesterday, This week and Earlier
4. Star, copy, open in the side panel (a polished text opens in Polish) or delete any entry; Undo brings back a delete for five seconds
5. Reopen a saved grammar lesson from the Lessons tab with no new request to your provider

### Practice

Review your favorites as flashcards:
1. Open Practice from the side panel or the Library
2. Each card shows the saved translation. Click it, or press `Space` or `Enter`, to flip it and reveal the original text
3. Use keyboard shortcuts:
   - `←` / `→` - Navigate between cards
   - `Space` / `Enter` - Flip card
   - `C` - Copy text
4. Choose how many cards a session holds (5 to 30) in Settings

### Page Translation (NEW in v2.7)

Translate entire webpages:
1. Right-click on any webpage and select "Translate this page"
   - Or press `Alt+P`
2. ParsiPad asks first: the dialog shows how many paragraphs the page has and about what it will cost with your provider. Choose Translate page or Cancel. Tick "Don't ask again" to skip the question next time; the "Ask before translating a whole page" switch in Settings turns it back on
3. Watch the progress as text chunks are translated
4. Use the floating toggle button to switch between original and translated text
5. Persian content uses Vazirmatn font for optimal readability
6. Stop at any time with the Cancel button or `Escape` (not while typing in a text field). Sections that already finished stay translated
7. If some sections failed, a summary says how many were translated and how many failed, with a Retry failed button that sends only those. Pressing Translate page again also picks up sections that failed or were never sent
8. On a site that changes pages without reloading, the original text is put back when you move to another page

Two keys work on web pages and are fixed (they do not appear in `chrome://extensions/shortcuts`): `Alt+B` translates the paragraph at the pointer or keyboard focus, and `Escape` closes a box or stops a page translation. They are listed in Settings > Shortcuts > On web pages. If ParsiPad is updated while a page is open, its boxes say so and offer a Reload page button.

### Data Backup & Restore (NEW in v2.5)

Keep your data safe and portable:
1. Go to Settings → Data & backup section
2. **Export**: Select data types to export (favorites, history, cache)
3. Click "Export to JSON" to download a backup file
4. **Import**: Choose merge (add to existing) or replace strategy
5. Click "Import from JSON" and select your backup file

### Welcome Guide

First-time users see a welcome page that:
- Starts with API key setup: choose a provider, paste the key and press Save & test (the key is stored only if it works)
- Offers a "Try it" step that translates a sample sentence with your own key
- Has one Done button next to the sample, with the feature tour below it
- Can be reopened anytime from Settings → About → "View Welcome Guide"; Done then returns you to Settings

## Development

### Project Structure

```
parsipad/
├── manifest.json       # Chrome extension manifest (v3)
├── popup/              # Extension popup UI
├── settings/           # Settings page
├── library/            # Library page: History, Favorites and Lessons tabs
├── practice/           # Practice flashcards page
├── history/            # Redirects the old History page to the Library
├── favorites/          # Redirects the old Favorites page to the Library
├── welcome/            # Welcome/onboarding page
├── grammar/            # Grammar learning page (NEW in v2.6)
├── background/         # Service worker
├── content/            # Content script for webpage integration
├── lib/                # Shared utilities
│   ├── api.js          # AI provider API integration
│   ├── providers/      # Provider implementations (Claude, Gemini, ChatGPT)
│   ├── storage.js      # Chrome storage wrapper
│   ├── cache.js        # Translation caching
│   ├── dictionary.js   # Dictionary lookup API
│   ├── document-translator.js  # Document translation
│   ├── history.js      # History management
│   ├── i18n.js         # Internationalization
│   └── constants.js    # Prompts and constants
├── landing/            # Landing page website
└── icons/              # Extension icons
```

### Tech Stack

- **Pure JavaScript** - No frameworks, minimal dependencies
- **Chrome Extension Manifest V3** - Latest extension platform
- **Multi-AI Support** - Claude (Anthropic), Gemini (Google), ChatGPT (OpenAI)
- **Chrome Storage API** - Secure local data storage

### Building

No build step required! The extension runs directly from source.

To test changes:
1. Make your edits
2. Go to `chrome://extensions/`
3. Click the refresh icon on ParsiPad

## Privacy

ParsiPad is designed with privacy as a core principle:

- **No data collection** - We don't collect any personal information
- **No analytics** - No tracking or usage analytics
- **Local storage only** - All data stays on your device
- **Direct API calls** - Text is sent directly to Anthropic, never through our servers
- **Open source** - Verify our practices yourself

Your API key and translation history are stored locally using Chrome's secure storage API.

See our full [Privacy Policy](PRIVACY.md) for details.

## Browser Compatibility

ParsiPad works on all Chromium-based browsers:

- Google Chrome
- Brave
- Microsoft Edge
- Opera
- Vivaldi

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Powered by [Claude](https://www.anthropic.com/), [Gemini](https://ai.google.dev/), and [ChatGPT](https://openai.com/)
- Built for the Persian-speaking community worldwide

---

<p align="center">
  Made with ❤️ for seamless Persian-English conversations
</p>
