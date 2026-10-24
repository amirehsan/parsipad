# ParsiPad Roadmap

Where ParsiPad is today and where it is heading. Plans change, so treat everything beyond "Next" as a direction rather than a promise. For what has already shipped, release by release, see the [changelog](CHANGELOG.md). Contributions are welcome!

## Shipped

As of 3.8.1, ParsiPad has:

- [x] Persian ↔ English translation with automatic direction detection, and other languages into Persian
- [x] A choice of AI provider: Claude (Anthropic), Gemini (Google) and ChatGPT (OpenAI), with your own key
- [x] Point to translate: the translation of a paragraph or section appears under the original (`Alt+B` from the keyboard)
- [x] Selection toolbar for mouse, touch and keyboard, plus the right-click menu and keyboard shortcuts
- [x] Whole-page translation with a cost estimate, progress, a toggle back to the original and Retry for failed sections
- [x] Screenshot region, image (OCR) and `.txt` document translation
- [x] Dictionary with definitions, IPA, examples, synonyms and antonyms
- [x] Polish in Professional, Conversational and Concise registers
- [x] Grammar explanations and full lessons with examples, common mistakes and quizzes, plus English pronunciation
- [x] Library with History, Favorites and Lessons, and Practice flashcards
- [x] New Tab with a saved word, bookmarks and optional Most visited tiles
- [x] Side panel that stays open while you browse
- [x] Settings on one page, muted sites, light and dark themes, an English and Persian interface
- [x] Local cache, JSON backup and restore, and a cost Analytics page

## Next

The next minor release is planned around lessons and polish. The task list lives in [docs/remaining-work.md](docs/remaining-work.md).

- **Lessons in your language.** Persian explanations with English examples by default, with an English toggle per lesson
- **Better lesson requests.** Cancel a lesson while it loads, and errors that say what to do next
- **Accessible quizzes.** Quiz answers as a keyboard-friendly radio group with live feedback
- **Analytics in local days.** Dates and currency formatted for your locale
- **Interface consistency.** Shared page controls and one theme mechanism across every page
- **Practice and Library fixes.** A "Deal again" button at the end of a session, and the smaller fixes listed in the remaining-work file

## Later

- **Persian interface layout.** A right-to-left pass using CSS logical properties, so the Persian interface lays out natively rather than by mirroring
- **More document types.** PDF and DOCX translation, and larger files
- **Personal glossary.** Remember preferred translations of terms and reuse them
- **Spaced repetition.** Schedule Practice cards by how well you know them
- **Video subtitles.** Translate captions on sites such as YouTube

## Ideas under consideration

These are not planned yet. Comment on an issue if one of them matters to you.

- More providers, such as DeepL, or local models through Ollama
- Voice input
- Translation inside built-in PDF viewers

## How to contribute

1. Check [open issues](https://github.com/amirehsan/parsipad/issues) for work in progress
2. Comment on an issue to claim it before you start
3. Follow the [contributing guide](CONTRIBUTING.md)
4. Open a pull request with your changes

## Feature requests

Have an idea? [Open an issue](https://github.com/amirehsan/parsipad/issues/new/choose) with the Feature request template.

Last updated: October 2026 (v3.8.1)
