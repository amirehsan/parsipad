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
- **Full Page Translation** - Translate entire webpages with one click (NEW in v2.7)
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
- **New Tab Flashcards** - Learn vocabulary on every new tab with interactive flashcards
- **Dictionary Lookup** - Look up definitions, phonetics, synonyms, and antonyms

### Quick Access
- **Selection Popup** - Quick action icons when selecting text on webpages
- **Keyboard Shortcuts** - `Alt+T` to translate, `Alt+D` for dictionary, `Alt+P` to translate page, `Alt+S` to screenshot translate
- **Right-Click Menu** - Translate, polish, look up, translate page, or screenshot translate from any webpage

### Settings & Data
- **Data Backup & Restore** - Export and import favorites, history, and cache
- **Welcome/Onboarding Page** - Beautiful first-time setup with feature showcase
- **Dark Mode** - Beautiful dark theme that syncs with system preferences
- **Bilingual Support** - Full English and Persian (فارسی) interface
- **Usage Statistics** - Track your translation and token usage
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
   - Go to Settings (gear icon)
   - Select your preferred AI provider
   - Enter the API key for that provider and save

3. **Start Translating**
   - **Option 1:** Type or paste text in the popup and click Translate
   - **Option 2:** Select text on any webpage and press `Alt+T`
   - **Option 3:** Select text, right-click, and choose "Translate with ParsiPad"

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
- **Save to Favorites** - Save grammar lessons for later review on New Tab flashcards

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
- Use the Dictionary tab in the popup

### Document Mode (NEW in v2.0)

Translate entire documents:
1. Click the "Document" tab in the popup
2. Upload a TXT file (max 100KB)
3. Watch the progress as chunks are translated
4. Download the translated file when complete

You can cancel long translations at any time.

### Image Mode (NEW in v2.2)

Translate text directly from images:
1. Click the "Image" tab in the popup
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
   - Or click the "Screenshot" button in the Image tab
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
2. Access all favorites from the dedicated favorites page
3. Remove favorites by clicking the star again

### New Tab Flashcards

Learn vocabulary every time you open a new tab:
1. Enable "Show favorites on new tab" in Settings
2. Choose how many items to show (1-10)
3. Open a new tab to see your favorites as flashcards
4. Click cards to flip and reveal the original text
5. Use keyboard shortcuts:
   - `←` / `→` - Navigate between cards
   - `Space` - Flip card
   - `C` - Copy text
   - `R` - Refresh with different favorites

### Page Translation (NEW in v2.7)

Translate entire webpages:
1. Right-click on any webpage and select "Translate this page"
   - Or press `Alt+P`
2. Watch the progress as text chunks are translated
3. Use the floating toggle button to switch between original and translated text
4. Persian content uses Vazirmatn font for optimal readability
5. Cancel at any time with the cancel button

### Data Backup & Restore (NEW in v2.5)

Keep your data safe and portable:
1. Go to Settings → Data Backup section
2. **Export**: Select data types to export (favorites, history, cache)
3. Click "Export to JSON" to download a backup file
4. **Import**: Choose merge (add to existing) or replace strategy
5. Click "Import from JSON" and select your backup file

### Welcome Guide (NEW in v2.5)

First-time users see a beautiful welcome page with:
- Feature showcase with all ParsiPad capabilities
- Integrated API key setup
- Access anytime via Settings → "View Welcome Guide"

## Development

### Project Structure

```
parsipad/
├── manifest.json       # Chrome extension manifest (v3)
├── popup/              # Extension popup UI
├── settings/           # Settings page
├── history/            # Translation history page
├── favorites/          # Favorites page
├── newtab/             # New tab flashcards page
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
