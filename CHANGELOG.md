# Changelog

All notable changes to ParsiPad will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **The ParsiPad New Tab is back, on the new design.** It was removed in 3.4.0, so a new tab showed Chrome's own page and your saved words appeared only in Practice. Every new tab shows one of your favorites again, in large Persian or English type, dealt the same way Practice deals them, under the time, the date and a greeting in both languages. Click the word, or press Space or Enter, to flip it, and C copies what is showing. Your bookmarks open in a searchable drawer with "/" or the Bookmarks button, and Escape closes it. Your most visited sites can appear as tiles, only if you switch them on; Chrome asks for that permission first, and switching it off gives the permission back. A New tab card in Settings > Flashcards turns the page and each panel on or off. With the page off, a new tab shows only the time and a button to Chrome's own New Tab. Because the page reads bookmarks again, Chrome may ask you to approve the bookmarks permission ("Read and change your bookmarks") when this version installs; ParsiPad only reads them.

### Changed
- **Doc & Image takes any file through one drop zone.** It had two upload cards, one for documents and one for images, each with its own Select File button, and neither accepted a dropped file. One drop zone now takes a file you drop, choose or paste, and its type decides where it goes: a .txt file to document translation, a JPG, PNG or WebP image to image translation, and anything else to a message naming what is supported. When the browser cannot tell a file's type, its extension decides. Focus moves on to Translate once a file is in, and back to the drop zone when you remove it.

### Fixed
- **Settings > Shortcuts lined up three different ways.** Short descriptions sat at the far end of their row, long ones wrapped beside the keys, and the note about fixed keys followed neither. Every row now has the keys in one column and the description beside them, the note starts where the descriptions start, and on a narrow window the keys sit above their description.
- **Key names read backwards on a Persian page.** Settings and the popup showed Option+T as "T⌥" in Persian, because the key name took the page's right-to-left direction. Key names now always read left to right.

## [3.7.0] - 2026-10-24

### Changed
- **The mute toast now points to where muted sites are managed.** Muting a site from the selection toolbar showed only Undo, so there was no hint that the list could be reviewed or edited later. The toast now also has a "Manage muted sites" button that opens Settings at Reading on web pages, where the Muted sites list is. Undo stays the main button.

## [3.6.0] - 2026-10-24

### Added
- **Translating a whole page asks first.** Translate page started sending the whole page to your provider the moment you chose it, with no hint of how big the page was or what it would cost. It now stops at a short question: how many paragraphs the page has, about what it will cost with your provider, and three choices, Translate page, Cancel and a "Don't ask again" box. The page behind is dimmed and cannot be clicked or tabbed into while the question is open, and Escape answers Cancel. The cost is an estimate from the page's text and your provider's price, shown as "<$0.01" when it is under a cent. "Don't ask again" takes effect when you press Translate page, not Cancel.
- **A Settings switch for that question.** Under Reading on web pages, "Ask before translating a whole page" turns the question on or off. Ticking "Don't ask again" in the question turns the switch off, and turning it back on brings the question back.
- **A page translation tells you how it went, and Retry failed sends only what failed.** When a section could not be translated, the page used to finish with that text left in the original language and nothing said so. A summary now reads "Translated 7 of 9 sections. 2 failed." with a Retry failed button that stays until you press it or dismiss it, and Retry failed sends only the sections that failed. A run you stopped says "Stopped. 7 of 9 sections translated.", and pressing Translate page again picks up the sections that were never sent, and those that failed once, instead of starting over. A section that fails again after a retry is left to Retry failed: Translate page then switches to the original, so a section that keeps failing does not turn every press into another paid request. If ParsiPad is updated while a page is being translated, the run stops at once, keeps what finished, and says "ParsiPad was updated. Reload the page to continue." with a Reload page button instead of counting every remaining section as failed.
- **Mute ParsiPad on this site, from the selection toolbar.** The toolbar has a fourth button that adds the site you are on to your Muted sites list, with a short message that has Undo. Undo only appears when this press added the site, so it can never remove a mute you set in Settings. The button is hidden on addresses the list cannot hold, such as localhost. The message pauses while the pointer or keyboard focus is on it and is read out by screen readers.
- **The selection toolbar works on touch and from the keyboard.** It appeared only after a mouse drag. It now appears after a touch long-press and follows the selection handles as you move them, and it appears for a selection made with the keyboard. Tab moves into the toolbar, the arrow keys move between its buttons, and Escape closes it and puts focus back where it was. It never takes focus on its own.
- **The keys that work on web pages are listed in Settings.** Settings > Shortcuts now has an On web pages group naming Alt+B (translate the paragraph at the pointer or keyboard focus) and Escape (close a box, or stop a page translation), and says they are fixed and not remappable.

### Changed
- **Cancel and Escape keep what is already translated.** Stopping a page translation used to throw away every section that had finished, because nothing was written to the page until the very end, and Escape did not stop it at all. Cancel and Escape (when you are not typing in a text field, where Escape stays with the field) now stop the run and write the sections that finished to the page, with the toggle to switch between original and translation. Escape closes the topmost thing first: with a translation box, the selection toolbar or the screenshot selection open, it closes that and the run goes on, and the next Escape stops it.
- **The toolbar is placed from its real size.** It is measured, then put above the selection, or below it when there is no room at the top of the window, and kept inside the window on every side. A selection longer than 2,000 characters, such as Ctrl+A on a long page, gets no toolbar, because Translate would have sent the whole page in one request.
- **In-page boxes are announced to screen readers.** The translation, polish and dictionary boxes are named ("ParsiPad translation", "ParsiPad polish", "ParsiPad dictionary"), a box says it is loading and then reads out the result or the error, regenerated polish text is read out, page translation progress is announced, and decorative icons are hidden from screen readers. The toolbar, the boxes, the page translation overlay and the toggle button skip their animations when your system is set to reduce motion.

### Fixed
- **A web page could press ParsiPad's keys.** ParsiPad's keys work on every page, and a script on the page could send its own Alt+B, which started a translation request with your key, or its own Tab, which pulled focus into the selection toolbar. Both now act only on keys you press yourself.
- **The selection toolbar appeared while you were typing.** In 3.5.0 it was offered for any selection made with the mouse, including text inside a search box, a comment field or a rich editor such as Gmail compose, where it covered what you were editing. It is skipped now for a selection inside a text field, an editable region or one of ParsiPad's own boxes.
- **A page translated before you moved on kept its translated text, and nothing could undo it.** On a site that changes pages without reloading, 3.5.0 dropped the toggle button when the address changed but left the translated text in place, so the original could not be brought back without a reload. The original text is now put back when the page changes, and Translate page asks again for the new page. A change of address, the part after # included, no longer decides that on its own: ParsiPad waits a quarter of a second for the site to draw, then treats it as a new page only if a third or more of the text it translated has gone or been replaced. A link to a heading on the same page, or a site rewriting its own address as you scroll, keeps the translation and the toggle, and an app that changes views only after the # (such as a mail inbox) is now seen as a new page. Putting the original back, or showing the translation again, never writes over text the page changed itself, such as a live counter or a title the site has already redrawn.
- **An update under an open page left every box failing in a way you could not read.** When ParsiPad was updated or reloaded while a page was open, the boxes showed Chrome's own "Extension context invalidated" text, which says nothing a reader can act on. Every box (translation, polish, dictionary and screenshot) now says "ParsiPad was updated. Reload the page to continue." with a Reload page button.
- **Persian errors in the boxes were the wrong colour, and internal error text could show.** The box chose its red or amber tone by looking for English words such as "network" in the message, so a Persian message always came out amber, even for a rejected key or a lost connection. The tone now follows the kind of error, in either language. When something failed inside the page script, the box showed JavaScript's own words or an English fallback such as "Translation failed"; it now says the error in your interface language.
- **The rating line could be used up without being seen.** It was added to the translation text itself, so the loading placeholder of a following request, such as Translate the sentence, wiped it after ParsiPad had already counted it as shown. It now has its own place under the box, stays through a loading placeholder, leaves when an error replaces the translation, and is not asked for at all while a placeholder is on screen.
- **Translate the sentence was missing from the box.** Opening the box cleared the sentence ParsiPad had read around a selected word, so the control that expands a word to its sentence was never offered. The sentence is kept now.

## [3.5.0] - 2026-10-24

### Added
- **Muted sites: quiet the hover button and selection toolbar on pages you choose.** The only way to stop the hover translate button and the selection toolbar was to switch them off everywhere, which is a poor trade for one noisy site. Settings now has a Muted sites list under Reading on web pages. Add a site and ParsiPad shows no hover translate button, no selection toolbar and no Alt+B block translation there, on its subdomains too. Only those three are silenced: translating the whole page, the screenshot and the right-click menu still work on a muted site. The change applies to open tabs at once with no reload, and removing the site brings all three back. The list is stored only in your browser.
- **Save & test for every provider in Settings.** Each provider now has its own card with its own key field, a show key button, Save & test and Clear. Save & test checks the key format first and sends nothing for a malformed key. Otherwise it tests the key you typed and stores it only when it works. If the test could not reach a verdict, for example because the network was down, the key is kept and the message says the test was inconclusive. A rejected key never replaces a key that already works, and the result is shown in your interface language.
- **The welcome page ends on a first translation.** After the key is saved and tested, a Try it step translates a sample sentence with your own key, so you see ParsiPad work before you leave setup instead of finding out on the first real page.

### Changed
- **Settings is one page with a section nav.** Settings used to be split across tabs, with the provider key on one and the options that decide what happens on a web page on another. It is now a single page with a left-hand list of sections: AI provider and key, Reading on web pages, Language and appearance, Flashcards, Data and backup, Shortcuts and About. On narrow windows the list becomes a strip that sticks to the top. Older links still land in the right place: the popup badge's provider link opens the provider section, and the old General and More links open the section that now holds those options. Analytics is opened from Data and backup, and the welcome guide from About. Theme is now Light, Dark or System.
- **Every on/off setting is a real switch with its own label and hint.** The options were checkboxes whose labels and hints ran together, and the keyboard focus was hard to see. Each is now a switch with a clear label, a one-line hint under it and a visible focus outline.
- **The welcome page starts with the key.** The order is now provider, key, Save & test, the "How do I get a key?" help and a short privacy note, then the first translation and the Done button, with the feature tour below. Save & test there runs the same checks as in Settings. If the first translation fails, the hint to check your key appears only when the key is the problem, not for a network error.
- **Welcome has one Done button.** It always finishes setup. When the page was opened from Settings it returns you to About in Settings; otherwise it closes as before.
- **The welcome guide opens inside Settings.** Opened from Settings, the guide used to open in a separate tab and close itself when you finished, leaving you wherever Chrome put you. It now opens in the Settings tab, and Done brings you back to About.

### Fixed
- **Some status messages were always in English.** Messages such as the result of testing a key or a failed save ignored the interface language and stayed in English even when ParsiPad was set to Persian. They are all translated now.
- **Save could store keys you had not tested.** Pressing Save wrote every key you had typed into any provider's field, not only the provider you were saving, and stored it without testing it. Each provider is saved on its own now, and only after its own test.

## [3.4.0] - 2026-10-24

### Added
- **A Library page with History, Favorites and Lessons in tabs.** History and Favorites were two separate pages that showed the same kind of card with different controls, and finding something old meant scrolling. The Library puts them side by side. Search matches the original, the result and the polished versions, type chips narrow the list to translations, dictionary lookups or polished text, a direction filter narrows it further, and results are grouped under Today, Yesterday, This week and Earlier. Each card can be starred, copied (one button per style on a polished text), opened in the side panel (a polished text opens in Polish, everything else in Translate) or deleted. The tab, search and filters are kept in the page address, so a reload lands you in the same place. The Library links in the popup and the side panel open it.
- **Deleting an entry can be undone for five seconds.** A delete used to be final the moment you clicked it. The Library now shows an Undo button for five seconds after each delete and puts the entry back. Clear all is scoped to the tab and the type chip you are looking at, so clearing translations no longer touches anything else. It asks first, and the question names exactly what goes, such as all translations in your history or all saved grammar lessons. The search and the direction filter do not narrow it, so when they hide part of what will be cleared, the question says that too.
- **Dictionary lookups are visible in the Library's history.** Lookups were stored in their own list that no page displayed, so a word you had looked up could not be found again. They now appear in History under the Dictionary chip, where they can be starred, copied, opened in the side panel and deleted like any other entry.
- **Saved grammar lessons reopen from the Lessons tab with no new request.** Opening a saved lesson used to ask your provider for it again, which cost a request and could return a different lesson from the one you saved. The Library now reopens the lesson exactly as it was saved, with nothing sent to the provider. If the lesson has since been deleted, the page says so and links back to the Library.
- **Practice, a flashcards page for your favorites, in the side panel and the Library.** It deals a short session from your favorites, including those saved by 2.x versions, one card at a time. Each card shows the saved translation, and flipping it reveals the original. Arrow keys move between cards, Space or Enter flips from anywhere on the page, and C copies the face that is showing, on a Persian keyboard layout too. Flipping is instant when your system is set to reduce motion. Grammar lessons are not dealt as cards, because they have no short answer to flip to; they reopen from the Library. A Practice link sits in the side panel's Recent row, and the Library header has one too. The session size, 5 to 30 cards with a default of 10, is a slider in Settings.

### Changed
- **History and Favorites became tabs of the Library.** The two pages are gone as separate destinations. Anything that still points at the old History or Favorites page, such as a bookmark or an old link, redirects to the matching Library tab.
- **The provider badge's "last used" time reads the same everywhere.** It now comes from the formatter the rest of the extension uses: relative within a week ("2 hours ago"), a date after that.

### Removed
- **The New Tab page.** ParsiPad no longer replaces Chrome's New Tab page, so opening a new tab shows Chrome's own again. The page showed one saved word, a clock and optional bookmark and most-visited panels, which were a second product inside the translator and the only reason it needed to read your bookmarks and browsing shortcuts. Your favorites are untouched and are now reviewed in Practice. The New Tab settings are cleared the first time the extension updates, so nothing is left behind.
- **The bookmarks, favicon and topSites permissions.** Only the New Tab page used them. With it gone ParsiPad no longer asks to read your bookmarks or your most visited sites, and Chrome stops listing them in the permissions it shows for the extension.

## [3.3.0] - 2026-10-24

### Added
- **A side panel that stays open while you browse.** The popup closes the moment focus leaves it, which cut long jobs short: a document or a whole-page translation stopped when you clicked back into the page. ParsiPad now has a Chrome side panel with the same controls as the popup, opened from a new button in the popup header or from the right-click item "Open ParsiPad in side panel". It stays put as you switch tabs and scroll, and a long job keeps running while you read.
- **Text selected on the page appears in the panel as a "Selected on this page" chip.** One click on Translate sends it, so there is no copying and pasting between the page and the box. The chip never reads what you type inside text fields, and the selected text stays inside the browser until you press Translate.
- **A provider badge in the popup and panel header.** It shows which provider is active and a dot for how its last real request went: green for working, amber for rate-limited or slow, red for a rejected key or a network failure, grey when nothing has been sent yet. Clicking it opens Settings on the provider tab. It only reflects requests you actually made and never sends one of its own.
- **First run is one panel, and the key is tested before it is kept.** Provider choice, the key field and a "How do I get a key?" guide now sit together. The guide gives the key page link, what the key starts with and a note on cost for each provider, with a Persian and English toggle for just those steps. "Save and test key" makes one tiny real request and stores the key only if it works, so a mistyped or rejected key is caught on the spot instead of on your first translation. Translate stays disabled until a key has passed. Settings has the same guide and a "Save & Test" button that shows the result inline.
- **Screenshot in the side panel says what to do when Chrome blocks it.** Chrome only lets an extension capture a page after a toolbar click, a keyboard shortcut or a context menu choice, and a click inside the side panel is none of those. The panel now shows a notice that names your screenshot shortcut and the right-click "Screenshot & Translate" item instead of doing nothing.

### Changed
- **The popup now leads with the text box.** Opening it focuses the textarea. A three-way switch at the top picks Translate, Polish or Doc & Image, where Doc & Image holds both the document and image uploads that used to be separate tabs. The Translate button shows its submit shortcut (Cmd+Enter, or Ctrl+Enter on Windows and Linux).
- **Page actions moved below the form.** Translate page and Screenshot sit in a quiet "This page" list, each with its real shortcut, instead of competing with the text box for attention.
- **The history sections in the popup became one line.** A Recent row shows the latest item and reopens it in one click, with a Library link to the full History page.
- **History's Clear All now clears dictionary lookups too.** Lookups are kept in their own list, so the button could leave them behind after the popup stopped offering a way to clear them.

### Removed
- **The Dictionary tab in the popup.** A single word typed into Translate already returns the full word card, so the tab repeated it. Alt+D and the right-click lookup on web pages are unchanged.
- **The usage stats section in the popup.** It lives on the Analytics page, reachable from Settings under More.

## [3.2.0] - 2026-10-23

### Fixed
- **The popup's "Rate Now" button had no visible label, and in dark mode the whole rating banner was blank.** In light mode the button's text and background were the same colour; in dark mode the banner's message was painted in the banner's own background colour. Both read clearly in both themes now, and every button in the banner has a hover state that actually changes something.
- **Scrollbars, checkboxes and other native controls stayed light in dark mode.** No page declared `color-scheme`, so the browser drew its own controls for a light page. The token file now declares it for both themes, which every extension page imports.
- **Two dictionary settings showed the same sentence twice.** The label and the hint under it shared one translation key, so the hint overwrote itself with the label. Each hint has its own text now, in both languages.
- **The welcome page's theme button was a grey dot in dark mode.** Its icons used class names from a utility framework the extension does not ship, so neither icon was ever styled. They use real classes now, one icon per theme.
- **Direction badges showed storage values like "EN-TO-FA".** Four pages formatted the direction four different ways and two printed the stored value as is. One formatter handles every stored shape now, including other languages translated into Persian (for example RU → FA), and badges are marked left-to-right so they do not reverse in Persian text.
- **English grammar lessons were laid out right-to-left.** The lesson is written in English, but the page flipped the whole lesson for English to Persian translations, and the Persian interface flipped it again for everyone, so every sentence ran with its full stop at the wrong end. The lesson is marked as English and stays left-to-right in either interface language, in the Latin font, and only the Persian text in it is marked as Persian.
- **A failed copy, favorite or regenerate wiped the translation off the popup.** Those failures went through the same error box as a failed translation, which clears the result. They now appear in a status line under the form that leaves the result alone, with a next step in the message.
- **Closing the floating box did not stop the translation.** The stream kept running, and kept being billed to your key, after the box was gone. Closing it now cancels the request.
- **Removing an API key, replacing data on import and resetting stats happened on the first click.** Each asks first now.
- **The interface was cramped.** Cards, list items and buttons were packed 4 to 6 pixels apart. A shared spacing scale now sets the distance between sections, items and buttons, and the popup, the translation card, Settings, History and Favorites all use it.

### Changed
- **The rating prompt now appears for people who use ParsiPad, and backs off.** It used to need three saved favorites, appeared only in the popup, and one "Maybe Later" ended it for good, so in practice nobody saw it. It now asks after 15 successful translations, polishes or lookups spread over at least two days and three days after install, right under a result, in the popup or as one line in the floating box. "Later", or simply ignoring it, waits 14 days and then 45; after the third ask it stops. "Rate ParsiPad" and "Don't ask again" end it at once. Anyone who pressed "Maybe Later" under the old prompt is treated as having asked for later, not never.

## [3.1.2] - 2026-10-22

### Fixed
- **Gemini translations became slow and then failed outright, where they used to be close to instant.** 3.1.1 moved Gemini to `gemini-3.5-flash-lite`, and no Gemini 3.x model can turn thinking off the way `thinkingBudget: 0` did on 2.5. `maxOutputTokens` is a hard cutoff that counts thought tokens as well as the answer, so the tight budget a translation is given, 700 tokens for a word and 900 for a sentence, was being spent on reasoning. The model generated a thousand-odd tokens of thought, the infrastructure cut it off mid-thought, and the reply came back truncated or empty, which the extension reported as a failed translation. The long wait and the failure were the same thing: the whole request was spent thinking and then thrown away. The thinking allowance on top of the caller's budget was 512 tokens, which a `minimal` pass does not fit in; it is now 3072. The cap is a ceiling rather than a target and billing follows the tokens actually generated, so the extra room costs nothing when it goes unused.
- **A Gemini reasoning summary could have been shown as the translation.** Thought parts are flagged `thought` and are not the answer, but every part's text was concatenated regardless. This could not happen while thinking was off, and became possible the moment it was turned on. Thought parts are now dropped from both one-shot and streamed replies, and from image results, which previously read only the first part and would have returned the reasoning instead of the text.

## [3.1.1] - 2026-10-21

### Fixed
- **A newly created Gemini API key could not translate anything.** Two separate problems stacked on top of each other. Google AI Studio now hands out keys beginning `AQ.` instead of `AIza`, and the key screen turned those away as malformed before any request was made, so the key was never actually tried. Underneath that, the pinned `models/gemini-2.5-flash` has been closed to new users, which means even an older `AIza` key came back with "this model is no longer available". Both key formats are now accepted and the model has moved on, so either kind of key works.
- **A slow provider could hold one translation for about two minutes before giving up.** Each attempt was capped at 30 seconds but the call as a whole was not, so three retries and the waits between them stacked on top of one another, which reads as a frozen button rather than a slow service. The retry loop now has an overall deadline: once the budget is spent it stops starting attempts and stops waiting out backoff, and it reports whatever the provider last said instead of a generic timeout. Requests that deliberately ask for one long attempt, as image and grammar lessons do, still get it in full.
- **After the extension updated, open pages showed Chrome's own "Extension context invalidated" wording beside a Retry button that could never work.** Chrome destroys the extension's context whenever it updates or is reloaded, but leaves the content script already injected into open tabs running, and from that moment every call it makes into the extension fails. Retrying called the same dead context and raised the same error forever. ParsiPad now recognises that state, says it was updated, and offers to reload the page, which is the only thing that clears it. This surfaces most right after an update lands, so the readers most likely to meet it are the ones who keep a tab open.
- **A key pasted with its surrounding quotes was refused.** Keys copied out of a `.env` file or a code sample arrive wrapped in `"` or `'`, which the format check counted as part of the key. The wrapping is now removed, along with stray whitespace, before the key is checked and stored.
- **The cost estimate was wrong for all three providers.** Claude was being priced at Sonnet's rate rather than the Haiku rate it actually billed, and the Gemini and ChatGPT figures predated their current models. All three now match what the models charge.

### Changed
- **Each provider moved to its current model, and to the request shape that model requires.** Gemini runs `gemini-3.5-flash-lite`, ChatGPT runs `gpt-6-luna` (`gpt-4o-mini` is deprecated and leaves the API on 14 January 2027), and Claude runs `claude-haiku-5-5`, which costs a tenth of Haiku 4.5 for the same work. None of the three accepts the old request unchanged: Gemini replaced `thinkingConfig.thinkingBudget` with `thinkingLevel`, Claude rejects any non-default `temperature` outright, and ChatGPT deprecated `max_tokens` in favour of `max_completion_tokens`.
- **Thinking is held down on every provider, because its tokens come out of the same budget as the answer.** A translation is given a tight output budget - 700 tokens for a word, 900 for a sentence - and a model that reasons first spends that budget on reasoning and returns an empty translation. Claude and ChatGPT can still turn reasoning off and now do. Gemini cannot turn it off at all any more, so it runs at `minimal`, the lowest level its model accepts, and its cap carries a little headroom beyond what the caller asked for so thought tokens cannot crowd out the answer.
- **Gemini is the Flash-Lite model rather than Flash, chosen for its free allowance.** Readers bring their own Google AI Studio key, and Google has moved its free tier down-market: the free allowance on 3.8 Flash is reported at around 20 requests a day, which a translation extension exhausts in one sitting, while Flash-Lite is in the hundreds. Google recommends either for new projects; this is the one a free key can actually use.
- **Gemini is no longer the cheapest of the three providers.** 2.5 Flash billed $0.075 per million input tokens and 3.5 Flash-Lite bills $0.30, against $0.10 for both Claude Haiku 5.5 and GPT-6 Luna. On paid keys Gemini now costs around three times either one per translation.

## [3.1.0] - 2026-08-27

### Added
- **Block translate: hover a paragraph or heading to read it in Persian underneath.** Resting the pointer on a paragraph, post, or heading for about half a second surfaces a small icon at its corner; clicking it inserts the Persian translation directly beneath the block, leaving the original in place so both can be read together. The icon appears only once the pointer rests, not while it is merely passing through, so ordinary browsing stays quiet, and it is never offered on text already in the reader's own language. Hovering a heading translates the section beneath it, interleaving each paragraph's Persian under that paragraph rather than gathering it into one block at the end. The translation takes its colours from the background behind it, so it stays legible on dark pages and light ones alike, and it works on any site with no setup.
- **Alt+B translates the block at the keyboard focus**, for anyone not using a pointer. It is handled in the content script rather than registered as a browser command, because Chrome allows only four suggested-key commands and all four (translate, dictionary, page, screenshot) were already assigned.
- **A Settings toggle for block translate, on by default.** Anyone who would rather not see the hover icon while reading can switch it off in one place.

### Changed
- **The translation's colours are solved against the background actually behind it, not read off a fixed palette.** Earlier builds made one light-or-dark call for the whole page and painted every block with a palette tuned for that single guess, so a block sitting on a card of a different shade could get the wrong palette outright, and a border tuned for near-black could still fail against a medium grey page. Each block now measures its own ancestor background and solves its border and text colours against it, stepping an alpha overlay until the composited result clears WCAG's 3:1 bar for non-text elements and 4.5:1 for text, since contrast does not move linearly with alpha and a value safe on one background is not safe on all of them.

## [3.0.0] - 2026-08-22

### Added
- **The New Tab page is built around one word.** The saved favourite sits directly on the gradient in Vazirmatn or Inter at up to 84px, with the time and a greeting in both languages above it, and still flips to reveal the original. Because a favourite can be a word or a whole sentence, the text length picks one of four display sizes, each bounded so a long one cannot push the page off screen.
- **Most visited sites**, as plates on the background. Favicons are read from the browser's own cache rather than a remote favicon service, which would otherwise be sent a list of your most visited sites every time you open a tab. Uses the optional `topSites` permission, requested only when you switch the panel on.
- **Panel switches**: three independent toggles for Cards, Bookmarks and Most visited, covering every combination rather than a fixed set of layouts.
- Bookmarks moved into a drawer that opens from its chip or `/` and closes on Esc, the scrim, or the chip again. The tree is built on first open instead of on every new tab.

### Changed
- The New Tab page never scrolls, at any window size. The bookmark tree scrolls inside its drawer and the tile row inside its own strip.
- Every extension surface moved onto one measured token system, in both themes, with the neutral palette tinted toward the indigo accent so a surface that appears in both the extension and the marketing site matches rather than merely coordinating.

### Fixed
- **Image translation could return the source text back to you as its own translation.** The image path was the only one calling its provider without a response schema, without a pinned temperature, and without reading the truncation flag its provider already reported. It now runs at the same temperature as text translation, is constrained by a schema, raises a clear error when a reply is cut off instead of returning half a translation, and acts on the "not Persian or English" signal that the prompt has always asked for and that this path alone ignored.
- **Light mode was unreachable on eight pages once a page had opened in dark.** Dark is styled two ways across the extension, by class and by attribute, and the pre-paint boot script sets both. Each page then cleared only the one it used, leaving the other behind, so the palette stayed dark while the page's own rules went light. All eight now apply themes through one place.
- The New Tab theme button drew both its icons at once, and the progress dots were being clipped by the page's own overflow.
- Contrast: every text tone on every surface now meets WCAG AA in both themes, measured on the rendered page rather than read off the palette.


### Changed
- **Translation core rebuilt around modes and context.** Selections are classified as word, phrase, sentence or text. Words and phrases are translated using the sentence around them and return senses by part of speech, synonyms, antonyms, IPA and register; sentences return labelled alternatives in the target language; long text streams into the card progressively.
- Providers use native structured output (Claude `output_config.format`, Gemini `responseSchema`, OpenAI strict `json_schema`), temperature 0.2 for translation, token budgets scaled to the input, and report truncation instead of showing cut-off JSON.
- Grammar explanations no longer re-translate the text; "Explain grammar" explains the translation already on screen (`EXPLAIN_GRAMMAR`) and is cached per pair.
- Persian output is normalized (Persian ی and ک, spacing before punctuation) before display, caching, history and copy.
- History keeps the full translation (up to 4000 characters) and the structured result.
- New setting: "Translate other languages into Persian" (default on). When off, non-Persian, non-English text is rejected as before.
- **One translation card, shared by the floating box and the popup.** The same result now looks the same wherever it appears. A word shows the source with its IPA and part of speech, the meaning that fits the sentence it came from, a short note explaining why that sense fits, and the remaining senses collapsed behind "Other meanings (N)"; opening it shows each sense with its part of speech and an example in both languages, plus synonyms and antonyms. A sentence shows its alternatives under "Also (N)", each labelled with its register.
- **The card shows which direction it translated**, resolved from the result rather than from the guess made before the request, so a Persian word typed in Latin letters reads FA to EN rather than the other way round. A swap control next to it re-translates with the opposite source. The correction is remembered for the rest of the session, but only for text the detector reads the same way, so correcting one Persian-in-Latin word does not send the next English one back in the wrong direction. If the model still reads the text as the language that was overridden, the card says so instead of leaving an unchanged translation unexplained.
- **Listen reads English aloud** from the card, on both surfaces. It appears only when there is English to read, so a Persian result simply does not offer it. The grammar lesson page and the card now share one implementation instead of two.
- **Translate the sentence** turns a word lookup into the sentence it came from, recovered from the text around the selection, and marks the original word in the result.
- Explain grammar is a card action now, and renders inside the card. As before, it never disturbs the translation already on screen, including when it fails.
- The provider name moved from a badge in the header to the card footer, where it stays a shortcut into settings.
- The floating box is measured before it is placed, so a tall result decides correctly whether to sit above or below the selection instead of being positioned from an estimate and nudged afterwards.
- Keyboard and screen-reader fixes: focus moves into the floating box when it opens and returns where it came from when it closes, the polish and dictionary boxes are proper dialogs, every icon-only control has a name, Persian text is marked as Persian, and the loading shimmer respects "reduce motion". Page translation reports "no translatable text" without a blocking alert.

- **Keyboard shortcuts now show the key that actually works.** Settings listed them from the manifest's suggestions, but Chrome drops a suggested key another extension already claimed, and the shortcuts are user-rebindable, so the list could name a key that does nothing. It is read from the browser now, and a command Chrome did not assign says "Not set" and explains why, next to the button that fixes it. The popup's Translate Page and Screenshot buttons name their own shortcut, so it is learned while doing the slow version of the same thing.

### Removed
- `lib/page-translator.js` (unused).
- Numbered-batch detection on user selections; page translation now passes the batch mode explicitly.

## [2.11.6] - 2026-06-02

### Fixed
- **Gemini provider no longer fails with "model is no longer available".** Google retired `gemini-2.0-flash`, so selecting Gemini returned `This model models/gemini-2.0-flash is no longer available`. Updated the text and vision models to `gemini-2.5-flash`.
- Disabled thinking (`thinkingConfig.thinkingBudget: 0`) on Gemini text and vision requests. Unlike 2.0, `gemini-2.5-flash` enables thinking by default, which can consume the entire `maxOutputTokens` budget on internal reasoning and return empty translations. Turning it off preserves the fast, non-reasoning behavior the extension relies on.

## [2.11.5] - 2026-05-15

### Changed
- **Removed Persian speech playback from the grammar lesson page.** Browser Persian voices are inconsistent across platforms (most desktop OSes don't ship one at all) and the lesson is designed for Persian-native speakers studying English, so listening to Persian wasn't the goal. The "Listen" button next to the Persian text is now hidden — only the English text shows the playback button. Applies to both directions (EN→FA hides translation TTS; FA→EN hides original TTS). A defensive guard inside `speakText()` rejects `lang === 'fa'` even if a future code path tries to invoke it.

## [2.11.4] - 2026-05-15

### Changed
- **Grammar content is now ALWAYS in English** regardless of translation direction. The feature's audience is Persian-native speakers studying English, so:
  - Grammar lesson titles, explanations, examples (source field), commonMistakes, quiz questions, quiz options, and quiz explanations are all in English
  - Examples use English source sentences with Persian translations in the "target" field for reference
  - Quiz options are minimal near-miss ENGLISH sentences testing the lesson's English grammar feature
  - Wrong options are framed as the kind of mistakes a Persian-native English learner actually makes (L1 interference: wrong word order, missing articles, wrong preposition, calque)
- The lighter floating-box grammar prompt (`GRAMMAR_SYSTEM_PROMPT`) now also writes all grammar points/explanations in English; the popup's "Explain grammar" checkbox + the new inline grammar in the floating box both produce English content
- Floating-box grammar list now always renders LTR (was inheriting RTL from the translation direction; same principle as the alternatives list since the content is English regardless of direction)

## [2.11.3] - 2026-05-15

### Added
- **Grammar in the floating translation box.** After any translation appears on a webpage, an "Explain grammar" button now shows up below the result. Clicking it lazy-fetches grammar points (using the same `withGrammar:true` API path the popup uses) and renders them inline with the target-language RTL/LTR direction. A "Learn More with Examples" button below the points launches the full lesson page (`grammar/grammar.html`) pre-filled with the original/translation/direction. Light + dark themes both supported via `--pp-*` tokens. Skips itself for single-word selections (no meaningful grammar to surface there).
- New `OPEN_GRAMMAR_PAGE` action so content scripts can ask the service worker to open `grammar/grammar.html` in a new tab with URL params (content scripts can't call `chrome.tabs.create` directly).
- i18n: new `noGrammarPoints` string in en + fa.

## [2.11.2] - 2026-05-15

### Grammar lesson improvements
- **Live progress indicator** on the grammar lesson loading screen: an indeterminate progress bar plus rotating status text ("Analyzing your sentence..." → "Identifying grammar patterns..." → "Building examples..." → "Creating quiz..." → "Polishing the lesson...") and an elapsed-time counter that appears after 3 seconds. `prefers-reduced-motion` swaps the animated bar for a static one. Persian + English strings added.
- **Faster lesson generation** — tightened `GRAMMAR_LEARNING_PROMPT` to request 1 grammar point (only 2 if the sentence has two genuinely distinct teachable features), exactly 2 examples per point (was 3), and 2-3 sentence explanations (was 3-4). Smaller responses = less wall-clock time at the model.
- **Significantly stronger quiz + examples**. The prompt now requires:
  - examples to use realistic everyday contexts (people, places, work, food, travel), not generic placeholders
  - examples to share the SAME structural pattern as the lesson, only varying vocabulary
  - quiz questions to test the SPECIFIC grammar point from the lesson (not vocabulary or an unrelated feature)
  - quiz options to be minimal near-misses of the correct answer, differing only by the grammar feature being taught — never random gibberish
  - every option's explanation to reference the specific feature ("uses past 'رفت' instead of present 'می‌رود'"), with a consistent "Correct"/"صحیح" prefix on the right answer
  - wrong options to be sentences a real learner might genuinely produce (L1 interference, conjugation slip, calque) rather than nonsense

## [2.11.1] - 2026-05-14

Patch release with two fixes on top of the 2.11.0 submission that's currently in Chrome Web Store review.

### Fixed
- **Grammar lesson "Request timed out" error.** The previous fix bumped `maxTokens` 3x → 8x to prevent mid-JSON truncation, which made the request routinely exceed the default 30 s `withRetry` timeout. All three provider `complete()` methods now accept and forward an optional `timeoutMs` to `withRetry`; `getGrammarLesson` passes `timeoutMs: 120000` (2 minutes) so heavy grammar responses can complete. If a request still times out, the user sees a friendly i18n'd message ("The grammar lesson took too long to generate. Try a shorter sentence or hit Try Again." / "تولید درس گرامر بیش از حد طول کشید. متن کوتاه‌تری امتحان کنید یا دوباره تلاش کنید.") instead of a raw "Request timed out".
- **Removed broken Paste image button.** The button called `navigator.clipboard.read()` which requires the `clipboardRead` permission in the manifest. Adding that on update would force a permission-change warning for every existing user — not worth it for one button. The button is gone; the document-level Ctrl+V paste handler still works, and the inline tip ("Tip: copy any image and paste it here with Ctrl+V (or ⌘V on Mac).") remains so users know paste is supported.

## [2.11.0] - 2026-05-14

### Highlights
- Typo-aware translation (auto-corrected with a "Did you mean: X → Y" hint).
- Richer translation results: alternative English expressions, examples, and nuance notes for short queries.
- Persian/English-only language gate that catches Cyrillic/CJK/Hebrew/Greek/etc. before burning tokens.
- Brand-new design system, density rebuild, host-aware dark mode in the floating UI.
- Settings reorganized into 4 tabs; image clipboard paste button; polish and dictionary boxes are now draggable.
- Engineering hardening: esbuild build pipeline, Vitest tests, CI, DOMPurify sanitization, AbortController + timeout in all provider fetches.

### UX iteration round 2 (typo tolerance, English alternatives, drag, paste, settings)

- **Typo-friendly prompts**: rewrote SYSTEM/DICTIONARY/POLISH prompts to ALWAYS attempt translation of Latin-letter input (e.g. "adde" -> "added") and Persian-script input. The model now only returns `{unsupported: true}` when the primary script is clearly Cyrillic, CJK, Hebrew, Greek, Thai, or Devanagari. Misspelled fragments are corrected silently and surfaced in `corrections`.
- **Service-worker gate relaxed**: `isSupportedLanguage()` now defers to the LLM when the input contains any Latin or Persian/Arabic characters. Only inputs that are >50% non-fa/non-en script get pre-rejected before hitting the API.
- **Alternatives are now ENGLISH**: prompt clarified that `alternatives` always contain English words/expressions (regardless of translation direction), since the audience is Persian native speakers who already know the Persian alternatives. Improved popup + floating-box spacing for the alternatives list (line-height 1.7, 4px between list items).
- **Softer error UI**: replaced the alarming red error style with an informational amber notice as the default. Real failures (network / invalid API key / server / rate-limit) opt into the destructive red via a `.is-destructive` class. Pattern matching done in both `showError` paths (popup + floating box).
- **Polish + dictionary floating boxes now draggable**: previously only the translation box supported drag. `enableDrag(host, headerEl)` is now applied to all three floating UIs from the same header element.
- **Image paste UX**: added a dedicated "Paste" button next to "Select File" and "Screenshot" that uses the async Clipboard API (`navigator.clipboard.read`) so users don't have to remember Ctrl+V. The hint copy now reads "Tip: copy any image and paste it here with Ctrl+V (or ⌘V on Mac)." Document-level Ctrl+V paste handler retained as fallback. New i18n strings: `pasteImage`, `pasteFromClipboardHint`, `pasteNotSupported`, `clipboardNoImage`, `clipboardReadFailed`.
- **Settings page restructure**: 11 cards grouped into 4 tabs (General / AI Providers / Data / More) with a sticky tab bar below the top nav. Arrow-key navigation between tabs. Drastically reduces vertical scrolling - the General tab now shows 4 cards instead of 11. New i18n strings: `settingsTabGeneral`, `settingsTabProviders`, `settingsTabData`, `settingsTabMore`.

### Prompts, language gate, typo correction, richer translation, cache hygiene

- **All LLM prompts rewritten** for clarity, anti-hallucination, and token efficiency. `SYSTEM_PROMPT`, `POLISH_SYSTEM_PROMPT`, `DICTIONARY_SYSTEM_PROMPT`, `DOCUMENT_SYSTEM_PROMPT`, `IMAGE_SYSTEM_PROMPT`, and `POLISH_VARIANT_SYSTEM_PROMPT` (plus the dictionary module's local prompts) now explicitly restrict to Persian and English, instruct the model to return `{"unsupported": true}` on any unsupported / unintelligible input, and require valid JSON output with no surrounding prose or markdown fences.
- **Persian/English language gate**: new `isSupportedLanguage()` helper in `lib/language-detect.js`. The service-worker `handleTranslate` / `handlePolish` / `handleDictionaryLookup` entry points now reject Cyrillic, CJK, Hebrew, Greek, Thai, Devanagari, etc. before burning tokens, surfacing `ERROR_MESSAGES.UNSUPPORTED_LANGUAGE` ("ParsiPad only supports Persian and English"). Page-translation numbered batches are exempted from the gate.
- **Typo correction**: prompts now ask the model to silently correct misspellings and surface the fix in a `corrections: [{original, corrected}]` array. The popup renders this as a small inline "Did you mean: X" hint above the translation; the floating translation box renders the same hint inside the Shadow DOM. The dictionary lookup uses the corrected word as the canonical entry.
- **Richer translation context** for short queries (~80 characters or fewer): the model returns optional `alternatives`, `examples`, and `nuance` fields. The popup renders these in a collapsible "Linguistic context" `<details>` section under the translation; the floating box renders a compact alternatives list + italic nuance note. Long inputs omit these fields to keep token usage in check.
- **Cache hygiene**: the legacy `translation_cache` storage namespace had v1 entries from before the SHA-256 keying fix landed. New `runCacheMigrations()` in `lib/storage.js` drops the legacy blob on first run after this update (idempotent, gated by `STORAGE_KEYS.cacheMigrationVersion`). Wired into both `chrome.runtime.onInstalled` and `chrome.runtime.onStartup`. Going forward the cache writes under `translation_cache_v2`. Fixes the "different inputs returning each other's translation" symptom.
- **Tests**: new `tests/language-gate.test.js` covering the Persian/English supported-languages contract across English, Persian, Russian, Chinese, Japanese, Hebrew, mixed scripts, and empty/numeric inputs (9 cases). Existing 28 tests still pass. Total: 37 tests.
- **i18n**: new strings `didYouMean`, `moreContext`, `nuance`, `alternatives`, `unsupportedLanguage`, `unintelligibleInput` in `en` and `fa`.

### UI/UX density rebuild (industry best practices)
- **Popup vertical rhythm rebuilt** with semantic `--section-gap` (24px), `--item-gap` (12px), and `--content-pad` (20px) tokens. Replaces the uniform 16px-everywhere spacing that flattened all visual hierarchy. Header → tabs → content now read as three distinct zones.
- **Density bumps inside the popup**: textarea padding 8/16 → 12/16; output section inset 16 → 20; output text line-height 1.6 → 1.7; polish cards 8/16 → 16/20 with 12px header margin and 12px gap between cards; history items now 44px min-height (WCAG 2.5.5) with 12/16 padding; action button now 40px min-height (Apple HIG).
- **Translate Page button demoted** from a full-width indigo gradient CTA to a quiet ghost row with `--color-border`, so the textarea action button below is the unambiguous primary action ("one filled button per context").
- **Floating UI density bumps**: header padding 10/12 → 12/16; content padding 12 → 16 with max-height 200 → 280; footer 8/12 → 12/16; polish content 8 / 8 gap → 16 / 12 gap with max-height 350 → 380; dict header 12/10 → 16/14; polish and dict text line-height 1.5 → 1.65.
- **Selection-popup tooltip bug fix**: replaced the CSS `::before` pseudo-element tooltips (which used `background: #1f2937` hardcoded — invisible on dark hosts) with real `<span class="pp-tooltip" role="tooltip">` DOM nodes. Now uses `background: var(--pp-text)` / `color: var(--pp-bg)` — the inverse of the surface — so the tooltip stays legible in both light and dark themes. Built via `document.createElement` + `textContent` for safe interpolation.

### UI/UX visual refresh
- **New shared design system**: `lib/design-tokens.css` and `lib/components.css` are now the single source of truth for colors, typography, spacing, radius, shadows, motion, focus rings, and dark-mode overrides. The token set mirrors the landing's Tailwind theme so the extension and landing stay visually aligned, and a `prefers-reduced-motion` media query zeroes all transition durations.
- **Popup refresh**: imports the canonical tokens, normalizes header logo to 32px, retires the full-width Translate/Polish segmented control in favor of a quieter pill above the textarea, upgrades the top tabs to a proper ARIA tablist with `aria-selected`/`aria-controls`/keyboard arrow + Home/End navigation, replaces unguarded "Clear All" buttons with a two-stage confirm pattern, adds a global `:focus-visible` ring, and fixes the `.dict-pos` purple-on-purple WCAG AA contrast failure.
- **Floating UI consolidation**: deleted the dead `content/content.css` (rules never reached the Shadow DOM), made `content/styles/index.js` the single source of truth, and replaced 56 hardcoded neutral hexes with `var(--pp-*)` tokens. A new `themeVars()` helper is prepended to every Shadow DOM `<style>` block.
- **Host-page-aware dark mode**: the floating box, polish box, dictionary box, selection popup, page progress overlay, page toggle button, and screenshot overlay now detect the host page's effective background luminance and apply `data-theme="dark"` to their hosts. A single `MutationObserver` on `<html>` / `<body>` propagates runtime theme switches (Twitter, YouTube, GitHub, etc.) to every known host.
- **Cross-surface token unification**: `settings/`, `welcome/`, `newtab/`, `grammar/`, `history/`, `favorites/`, and `analytics/` now import the canonical token files. Hardcoded `#8b5cf6` polish badge color replaced with `var(--accent-polish)` so the violet accent stays consistent everywhere.
- **i18n**: new `tapToConfirm` string in en/fa for the two-stage confirm.

### Fixed (review follow-up)
- **Cache key collisions** in `lib/cache.js`: replaced the 32-char base64 truncation with SHA-256 of `provider|sourceLang|text`. Two long inputs sharing a prefix no longer return each other's translation, and switching providers no longer surfaces the previous provider's cached output. Added `tests/cache.test.js` covering both cases.
- **Document translation progress** is now streamed end-to-end. Background exposes a `translate-document` Port; the popup connects to it, sends `{action: 'start', content}`, receives `{type: 'progress', current, total, percent}` per chunk, and gets `{type: 'done', ...}` or `{type: 'error', error}` at the end. Cancel is also delivered through the port so an in-flight chunk no longer has to finish before the user's cancel takes effect.
- **Gemini auth** moved from `?key=` in the URL to the documented `x-goog-api-key` header (text + vision + key validation), keeping the secret out of URL logs and matches Google's current REST pattern.
- **Theme storage unified**: `settings/settings.js`, `welcome/welcome.js`, and `grammar/grammar.js` now read/write through `chrome.storage.local` via `getTheme()`/`setTheme()`, the same source the popup and new-tab page already use. Toggling theme in one surface now stays consistent across all of them.

### Known limitations (called out in review)
- **Full-page translation still operates on raw DOM text nodes.** Inline markup that splits a sentence across nodes can still produce grammatically broken output. Fixing this requires reworking the batching to group by block-level ancestors and re-distribute translations across the original nodes; tracked as a separate effort.
- **`<all_urls>` content-script host permission** is retained because the selection-popup feature depends on the script being live before the user clicks anything. Narrowing this would require a UX decision on selection popup behavior.

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
