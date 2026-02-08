<p align="center">
  <img src="icons/icon-128.png" alt="ParsiPad Logo" width="128" height="128">
</p>

<h1 align="center">ParsiPad</h1>

<p align="center">
  <strong>AI-Powered Persian ↔ English Translator</strong>
</p>

<p align="center">
  A Chrome extension for seamless Persian-English translation powered by Claude AI.
  <br>
  Featuring text polishing, keyboard shortcuts, right-click menu, and dark mode.
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

- **AI-Powered Translation** - Accurate, context-aware translations using Claude AI
- **Grammar Explanations** - Learn grammar while translating with detailed explanations (NEW in v2.2)
- **Image Translation** - Extract and translate text from images using OCR (NEW in v2.2)
- **Text Polishing** - Get 3 versions: Professional, Conversational, and Concise
- **Dictionary Lookup** - Look up definitions, phonetics, synonyms, and antonyms
- **Document Translation** - Upload and translate TXT files with progress tracking
- **Selection Popup** - Quick action icons when selecting text on webpages
- **Right-Click Menu** - Select text on any webpage, right-click to translate, polish, or look up
- **Keyboard Shortcuts** - `Alt+T` to translate, `Alt+D` for dictionary lookup
- **Dark Mode** - Beautiful dark theme that syncs with system preferences
- **Translation History** - Access and manage your past translations
- **Usage Statistics** - Track your translation and token usage
- **Offline Caching** - Previously translated text loads instantly
- **Bilingual Support** - Full English and Persian (فارسی) interface

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

1. **Get a Claude API Key**
   - Visit [console.anthropic.com](https://console.anthropic.com/)
   - Create an account and generate an API key
   - The key should start with `sk-ant-`

2. **Configure the Extension**
   - Click the ParsiPad icon in your toolbar
   - Go to Settings (gear icon)
   - Paste your API key and save

3. **Start Translating**
   - **Option 1:** Type or paste text in the popup and click Translate
   - **Option 2:** Select text on any webpage and press `Alt+T`
   - **Option 3:** Select text, right-click, and choose "Translate with ParsiPad"

### Translation Mode

Enter any text in English or Persian - the extension automatically detects the language and translates to the other.

#### Grammar Explanation Mode (NEW in v2.2)

Enable "Explain grammar" checkbox to receive grammar notes with your translation:
- Word order differences between Persian and English
- Verb conjugations and tense explanations
- Idiomatic expressions and their meanings
- Register and formality choices

### Polish Mode

Get three polished versions of your text:
- **Professional** - Formal, business-appropriate tone
- **Conversational** - Friendly, casual tone
- **Concise** - Brief, to-the-point version

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

## Development

### Project Structure

```
parsipad/
├── manifest.json       # Chrome extension manifest (v3)
├── popup/              # Extension popup UI
├── settings/           # Settings page
├── history/            # Translation history page
├── background/         # Service worker
├── content/            # Content script for webpage integration
├── lib/                # Shared utilities
│   ├── api.js          # Claude API integration
│   ├── storage.js      # Chrome storage wrapper
│   ├── cache.js        # Translation caching
│   ├── dictionary.js   # Dictionary lookup API
│   ├── document-translator.js  # Document translation
│   ├── history.js      # History management
│   ├── i18n.js         # Internationalization
│   └── ...
└── icons/              # Extension icons
```

### Tech Stack

- **Pure JavaScript** - No frameworks, minimal dependencies
- **Chrome Extension Manifest V3** - Latest extension platform
- **Claude AI API** - Anthropic's language model
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

- Powered by [Claude AI](https://www.anthropic.com/) from Anthropic
- Built for the Persian-speaking community worldwide

---

<p align="center">
  Made with ❤️ for seamless Persian-English conversations
</p>
