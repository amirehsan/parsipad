# ParsiPad user guide

A walkthrough of everything ParsiPad does. For installation and setup, see the [README](../README.md#quick-start).

## Contents

- [Point to translate](#point-to-translate)
- [Selection toolbar](#selection-toolbar)
- [Popup and side panel](#popup-and-side-panel)
- [Translate](#translate)
- [Grammar](#grammar)
- [Dictionary](#dictionary)
- [Polish](#polish)
- [Documents and images](#documents-and-images)
- [Screenshot region](#screenshot-region)
- [Whole-page translation](#whole-page-translation)
- [Favorites and Library](#favorites-and-library)
- [Practice](#practice)
- [New Tab](#new-tab)
- [Settings](#settings)
- [Analytics](#analytics)
- [Backup and restore](#backup-and-restore)
- [Welcome guide](#welcome-guide)
- [Keyboard reference](#keyboard-reference)

## Point to translate

Rest the pointer on a paragraph, a post or a heading and a small ParsiPad icon appears at its corner. Click it and the translation appears directly underneath, with the original left in place.

- The icon waits until you stop on something, so ordinary browsing stays quiet, and it never offers to translate text already in your own language
- Point at a heading and the whole section translates, each paragraph's translation sitting under its own paragraph
- The translation takes its colours from the page, so it stays readable on dark and light sites
- Press `Alt+B` to translate the paragraph at the pointer or keyboard focus without the mouse
- Switch the icon off in Settings > Reading on web pages, or mute it on specific sites

## Selection toolbar

Select text on a page and a small toolbar appears above it with Translate, Polish and Dictionary buttons, and a button that mutes ParsiPad on that site (a message offers Undo, and the button is hidden on addresses such as localhost).

- It works after a mouse drag, after a touch long-press (and follows the selection handles), and for a selection made with the keyboard
- It never appears for a selection inside a text field, an editor such as Gmail compose, or one of ParsiPad's own boxes, and it skips very long selections such as `Ctrl+A`
- It never takes focus on its own. Press `Tab` to move into it, the arrow keys to move between its buttons and `Escape` to close it and return to where you were
- Turn it off, or manage muted sites, in Settings > Reading on web pages

## Popup and side panel

Click the ParsiPad icon in the toolbar to open the popup. It has three tabs, Translate, Polish and Doc & Image, and a "This page" list for whole-page translation and screenshots.

Click the sidebar button in the popup header, or right-click a page and choose "Open ParsiPad in side panel", to dock ParsiPad in Chrome's side panel. It stays open while you switch tabs and scroll, and long jobs such as documents and whole-page translations keep running. Text you select on the page shows up as a "Selected on this page" chip with a one-click Translate button; it never reads inside text fields, and the text stays in your browser until you translate it.

The provider name in the header has a dot showing how the last real request went: green working, amber rate-limited or slow, red key rejected or network error, grey no requests yet. Clicking it opens the provider settings. It reflects only requests you made and never sends one of its own.

## Translate

Enter text in English or Persian and ParsiPad detects the language and translates to the other. Press `Ctrl+Enter` (`Cmd+Enter` on macOS) or click Translate.

- A single word gives a full word card: senses by part of speech, the one that fits first, with pronunciation and examples
- A sentence gives labelled alternatives
- Longer passages stream in as they arrive
- Text in other languages can be translated into Persian too, if you turn that on in Settings

You can also select text on any page and press `Alt+T`, or right-click it and choose "Translate with ParsiPad".

## Grammar

Tick "Explain grammar" in the popup, or use the grammar button on a translation, to see the grammar points behind it: word order, verb forms and tense, idioms, and register.

Click "Learn More with Examples" to open the full lesson page:

- **Explanations** written in English, so you study in the language you are learning
- **Examples** for each grammar point with the pattern highlighted
- **Compare and contrast** showing where Persian and English handle the same idea differently
- **Common mistakes** worth catching early
- **Quizzes** built around the mistakes Persian speakers actually make in English, such as word order, missing articles, wrong prepositions and phrases translated too literally
- **Pronunciation** for any English text
- **Save** a lesson to reopen it later from the Library's Lessons tab, with no new request to your provider

## Dictionary

Look up any word for definitions with example sentences, IPA pronunciation, synonyms and antonyms, and the Persian or English equivalent.

- Select a word and press `Alt+D`
- Right-click and choose "Look up in Dictionary"
- Type a single word in the popup's Translate box

You choose which directions the dictionary works in, in Settings.

## Polish

Paste your own text in the Polish tab to get three rewrites:

- **Professional:** formal, for email and work
- **Conversational:** friendly, for everyday messages
- **Concise:** brief and to the point

Not happy with one? Click its regenerate button for a fresh alternative while keeping the others. Star, copy or regenerate any version.

## Documents and images

Open the popup and choose Doc & Image. One drop zone takes either kind of file: drop it, click to choose one, or paste an image with `Ctrl+V`. A text file goes to document translation and an image to image translation.

### Documents

1. Add a `.txt` file up to 100 KB
2. Watch the progress as it is translated in chunks; Cancel stops it at any time
3. Download the translated file when it finishes

### Images

1. Add a JPG, PNG or WebP image up to 5 MB
2. Click "Translate Image"
3. Read the extracted text and its translation, and copy the translation

Useful for screenshots of text, photos of signs and menus, and images with embedded text.

## Screenshot region

Translate the text inside any area of a page, including images, banners and text you cannot select.

1. Press `Alt+S`, right-click and choose "Screenshot & Translate", or click "Screenshot" in the popup's "This page" list
2. The page freezes with a crosshair cursor
3. Drag around the text you want and release
4. The result appears in a floating box

Press `Escape` to cancel the selection.

## Whole-page translation

1. Right-click a page and choose "Translate this page", or press `Alt+P`
2. ParsiPad asks first, showing how many paragraphs the page has and roughly what it will cost with your provider. Choose Translate page or Cancel. "Don't ask again" skips the question next time; the "Ask before translating a whole page" switch in Settings turns it back on
3. Progress shows as sections are translated
4. A floating toggle switches between the original and the translation
5. Stop at any time with Cancel or `Escape` (not while typing in a text field; if a box, the selection toolbar or a screenshot selection is open, `Escape` closes that first). Finished sections stay translated
6. If some sections failed, a summary says how many were translated and how many failed, with a Retry failed button that sends only those. Pressing Translate page again picks up sections that were never sent and sections that failed once; a section that failed again after a retry is left to Retry failed
7. If ParsiPad is updated while the page is open, the translation stops, keeps what finished and asks you to reload the page
8. On a site that changes pages without reloading, the original text is put back when you move to another page

Persian text is set in the bundled Vazirmatn font.

## Favorites and Library

Click the star on any translation, polished text or grammar lesson to save it to Favorites. Click it again to remove it.

Everything you translate, polish or look up is kept in the Library:

1. Open it from the Library link in the popup or the side panel
2. Switch between the History, Favorites and Lessons tabs
3. Search, filter by type (translation, dictionary, polish) and by direction; entries are grouped under Today, Yesterday, This week and Earlier
4. Star, copy, open in the side panel (polished text opens in Polish) or delete any entry; Undo brings back a delete for five seconds
5. Reopen a saved grammar lesson from the Lessons tab with no new request to your provider

"Clear all" empties only the tab and type you are looking at, and asks first.

## Practice

Review your favorites as flashcards.

1. Open Practice from the side panel or the Library
2. Each card shows the saved translation. Click it, or press `Space` or `Enter`, to flip it and reveal the original
3. `←` and `→` move between cards, and `C` copies what is showing
4. Choose how many cards a session holds, from 5 to 30, in Settings > Flashcards

## New Tab

ParsiPad shows one of your saved words on every new tab.

1. The word sits under the time, the date and a greeting in both languages. Click it, or press `Space` or `Enter`, to flip it; `C` copies what is showing
2. Press `/` or the Bookmarks button to open your bookmarks in a searchable drawer
3. Turn on Most visited in Settings > Flashcards to show your most used sites as tiles. Chrome asks for permission the first time, and switching it off gives the permission back
4. Turn the whole page off in Settings > Flashcards. The page then offers a button back to Chrome's own New Tab

## Settings

Settings is one page with a section list: AI provider and key, Reading on web pages, Language and appearance, Flashcards, Data and backup, Shortcuts, and About.

- **AI provider and key:** each provider has its own card with a key field, a show-key button, Save & test and Clear. Save & test checks the key's format, makes one tiny real request and keeps the key only if it works. A rejected key never replaces one that already works
- **Reading on web pages:** the point-to-translate icon, the selection toolbar, the whole-page question, and Muted sites. Muted sites silences the icon, `Alt+B` and the toolbar on the sites you list, subdomains included, without a reload
- **Language and appearance:** English or Persian interface, and Light, Dark or System theme
- **Shortcuts:** every keyboard shortcut, including the fixed ones on web pages

## Analytics

Open Analytics from Settings > Data and backup to see estimated cost per provider, broken down by translations, polishes, dictionary lookups, documents, images and grammar lessons. View the last week, the last month or everything, and export it as JSON. It is computed from local data only.

## Backup and restore

1. Go to Settings > Data and backup
2. **Export:** choose what to include (favorites, history, cache) and click "Export to JSON"
3. **Import:** choose to merge with what is there or replace it, then click "Import from JSON" and pick a backup file

## Welcome guide

The welcome page opens on first install. It starts with API key setup (choose a provider, paste the key, Save & test), then translates a sample sentence with your own key, with a feature tour below. Reopen it any time from Settings > About > "View Welcome Guide".

## Keyboard reference

| Keys | Where | Action |
| --- | --- | --- |
| `Alt+T` | Any page | Translate the selection |
| `Alt+D` | Any page | Look up the selection in the dictionary |
| `Alt+P` | Any page | Translate the whole page |
| `Alt+S` | Any page | Translate a screenshot region |
| `Alt+B` | Any page | Translate the paragraph at the pointer or keyboard focus |
| `Escape` | Any page | Close a ParsiPad box or stop a page translation |
| `Ctrl+Enter` / `Cmd+Enter` | Popup, side panel | Translate or polish |
| `Tab`, arrow keys | Selection toolbar | Move into and between its buttons |
| `Space` / `Enter`, `←` `→`, `C` | Practice, New Tab | Flip, move between cards, copy |
| `/` | New Tab | Open the bookmarks drawer |

The first four can be remapped at `chrome://extensions/shortcuts`. `Alt+B` and `Escape` are fixed.
