// tests/popup-structure.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { submitShortcut } from '../shared/shortcuts.js';
import { FILE_INPUT_ACCEPT } from '../popup/file-kind.js';

/**
 * The popup used to open on a full-width Translate Page button, two rows of
 * tabs and three collapsible history lists before a usage stats block. It now
 * leads with the textarea: one mode pill, the input, the primary button, then
 * a quiet "This page" list and a one-line Recent row. The side panel runs the
 * same script against a copy of the markup, so both pages are held to it.
 */
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('popup/popup.html');
const panelHtml = read('sidepanel/sidepanel.html');
const js = read('popup/popup.js');
const pages = [['popup', html], ['panel', panelHtml]];

const order = (source, ids) => ids.map(id => source.indexOf(`id="${id}"`));

describe('popup order', () => {
  it('puts the textarea before any page-level action and has no stats section', () => {
    const [textarea, actionBtn, pageActions] = order(html, ['input-text', 'action-btn', 'translate-page-btn']);
    expect(textarea).toBeGreaterThan(0);
    expect(textarea).toBeLessThan(actionBtn);
    expect(actionBtn).toBeLessThan(pageActions);
    expect(html).not.toMatch(/id="stats-section"/);
    expect(js).not.toMatch(/getElementById\('stats-toggle'\)/);
  });

  it.each(pages)('%s: header, first run, pill, form, status, this page, recent', (_, source) => {
    const ids = ['provider-badge', 'first-run', 'mode-translate', 'input-text', 'grammar-checkbox', 'char-count', 'action-btn', 'status-line', 'page-actions', 'translate-page-btn', 'screenshot-translate-btn', 'recent-row', 'library-link'];
    const at = order(source, ids);
    at.forEach((index, i) => expect(index, ids[i]).toBeGreaterThan(-1));
    for (let i = 1; i < at.length; i++) expect(at[i], `${ids[i - 1]} before ${ids[i]}`).toBeGreaterThan(at[i - 1]);
  });

  it('focuses the textarea on open and shows the submit shortcut', () => {
    expect(js).toMatch(/inputText\.focus\(\)/);
    expect(html).toMatch(/<kbd[^>]*>⌘↵<\/kbd>|<kbd[^>]*>Ctrl\+Enter<\/kbd>/);
  });
});

describe('mode pill', () => {
  it.each(pages)('%s: exactly Translate, Polish, Doc & Image', (_, source) => {
    const pill = source.match(/<div class="mode-switcher"[\s\S]*?<\/div>/)[0];
    const modes = [...pill.matchAll(/<button id="(mode-[a-z-]+)"/g)].map(m => m[1]);
    expect(modes).toEqual(['mode-translate', 'mode-polish', 'mode-doc-image']);
    expect(pill).toMatch(/data-i18n="docAndImage"/);
    expect(pill).toMatch(/role="tablist"/);
  });

  it.each(pages)('%s: no Dictionary tab, no separate Document and Image tabs', (_, source) => {
    for (const id of ['tab-text', 'tab-dictionary', 'tab-document', 'tab-image', 'dictionary-section', 'dictionary-history-section']) {
      expect(source, id).not.toMatch(new RegExp(`id="${id}"`));
    }
  });

  it.each(pages)('%s: Doc & Image takes every file through one drop zone', (_, source) => {
    const panel = source.slice(source.indexOf('id="doc-image-section"'));
    expect(source).toMatch(/id="doc-image-section"[^>]*role="tabpanel"[^>]*hidden/);
    expect(panel).toMatch(/<button type="button" id="drop-zone"[^>]*aria-labelledby="drop-zone-title"[^>]*aria-describedby="drop-zone-hint"/);
    expect(panel.match(/type="file"/g)).toHaveLength(1);
    expect(panel).toMatch(new RegExp(`id="file-input" accept="${FILE_INPUT_ACCEPT}"`));
    for (const id of ['upload-area', 'image-upload-area', 'image-input', 'select-file-btn', 'select-image-btn']) {
      expect(panel, id).not.toMatch(new RegExp(`id="${id}"`));
    }
    // The document and image parts wait, hidden, for a file of their kind.
    expect(panel).toMatch(/class="doc-image-part document-section" role="group" hidden/);
    expect(panel).toMatch(/class="doc-image-part image-section" role="group" hidden/);
  });

  it('moves between the three modes with the arrow keys', () => {
    expect(js).toMatch(/'ArrowLeft'/);
    expect(js).toMatch(/'ArrowRight'/);
    expect(js).toMatch(/updateMode\('docImage'\)|name: 'docImage'/);
  });

  it('has no dictionary code path left in the popup', () => {
    for (const name of ['handleDictionary', 'displayDictionaryResult', 'loadDictionaryHistory', 'handleDictCopy', 'DICTIONARY_LOOKUP']) {
      expect(js, name).not.toMatch(new RegExp(name));
    }
  });
});

describe('this page', () => {
  it.each(pages)('%s: page actions carry their command and an empty kbd for the real binding', (_, source) => {
    expect(source).toMatch(/<nav id="page-actions" class="page-actions" aria-labelledby="page-actions-title">/);
    for (const [id, command] of [['translate-page-btn', 'translate-page'], ['screenshot-translate-btn', 'screenshot-translate']]) {
      const button = source.match(new RegExp(`<button id="${id}"[\\s\\S]*?</button>`))[0];
      expect(button, id).toMatch(new RegExp(`data-shortcut-for="${command}"`));
      expect(button, id).toMatch(/<kbd class="page-action-kbd" aria-hidden="true" hidden><\/kbd>/);
    }
  });

  it('fills the kbd from the bound shortcuts and shows none for an unbound command', () => {
    const body = js.slice(js.indexOf('async function annotateShortcuts'));
    expect(body).toMatch(/await getBoundShortcuts\(\)/);
    expect(body).toMatch(/if \(!shortcut\) return;/);
    expect(body).toMatch(/kbd\.hidden = false/);
  });
});

describe('recent row', () => {
  it.each(pages)('%s: Library is a real link to the Library page', (_, source) => {
    expect(source).toMatch(/<a id="library-link" class="recent-library" href="\.\.\/library\/library\.html" target="_blank" rel="noopener" data-i18n="library">/);
  });

  it.each(pages)('%s: the collapsible history lists are gone', (_, source) => {
    for (const id of ['history-section', 'polish-history-section', 'history-toggle', 'clear-history-btn']) {
      expect(source, id).not.toMatch(new RegExp(`id="${id}"`));
    }
  });

  it('reopening a polish clears what was on screen first', () => {
    const body = js.slice(js.indexOf('function reopenRecent'), js.indexOf('\n}\n', js.indexOf('function reopenRecent')));
    const polish = body.slice(body.indexOf('if (polish) {'), body.indexOf('displayPolishResults('));
    expect(polish).toMatch(/hideAllOutputs\(\);/);
    expect(polish).toMatch(/hideError\(\);/);
  });

  it.each(pages)('%s: ends with a newline', (_, source) => {
    expect(source.endsWith('</html>\n')).toBe(true);
  });

  it('marks Persian runs in the recent item', () => {
    expect(js).toMatch(/lang = 'fa'|setAttribute\('lang', 'fa'\)/);
  });
});

describe('submit shortcut', () => {
  it('reads as the Mac glyphs on a Mac and Ctrl+Enter elsewhere', () => {
    expect(submitShortcut({ userAgentData: { platform: 'macOS' } })).toEqual({ label: '⌘↵', aria: 'Meta+Enter' });
    expect(submitShortcut({ platform: 'MacIntel' })).toEqual({ label: '⌘↵', aria: 'Meta+Enter' });
    expect(submitShortcut({ platform: 'Win32' })).toEqual({ label: 'Ctrl+Enter', aria: 'Control+Enter' });
    expect(submitShortcut({ userAgentData: { platform: 'Linux' }, platform: 'Linux x86_64' })).toEqual({ label: 'Ctrl+Enter', aria: 'Control+Enter' });
    expect(submitShortcut({})).toEqual({ label: 'Ctrl+Enter', aria: 'Control+Enter' });
  });

  it('still submits on Meta or Ctrl plus Enter', () => {
    expect(js).toMatch(/\(e\.ctrlKey \|\| e\.metaKey\) && e\.key === 'Enter'/);
  });
});

describe('new strings', () => {
  it('exist in both locales', () => {
    for (const key of ['modeLabel', 'docAndImage', 'thisPage', 'recent', 'library', 'screenshot']) {
      expect(translations.en[key], `en.${key}`).toBeTruthy();
      expect(translations.fa[key], `fa.${key}`).toBeTruthy();
    }
    expect(translations.en.docAndImage).toBe('Doc & Image');
  });
});

describe('popup spacing', () => {
  it('styles the new blocks with spacing tokens only', () => {
    const css = read('popup/popup.css');
    const start = css.indexOf('/* Popup rework');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('/* End popup rework */'));
    expect(block).toMatch(/var\(--space-stack-group\)/);
    expect(block).not.toMatch(/(padding|margin|gap)(-[a-z-]+)?:\s*[^;]*\d+(px|rem)/);
    expect(block).toMatch(/\.page-action\s*\{[^}]*min-height:\s*40px/);
  });
});

describe('popup dates and links', () => {
  it('formats the provider badge time through the shared formatter', () => {
    expect(js).toMatch(/import \{[^}]*\bformatRelativeTime\b[^}]*\} from '\.\.\/lib\/format\.js'/);
    expect(js).toMatch(/formatRelativeTime\(record\.at, currentLang\)/);
    expect(js).not.toMatch(/function formatAgo|new Intl\.RelativeTimeFormat/);
  });

  it('opens favorites on the Library page', () => {
    expect(js).toMatch(/chrome\.runtime\.getURL\('library\/library\.html\?tab=favorites'\)/);
  });
});

describe('popup key hints', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'popup/popup.css'), 'utf8');
  it.each(['.action-kbd', '.page-action-kbd'])('%s keeps a key name left to right on a Persian page', (selector) => {
    const body = css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)));
    expect(body).toMatch(/direction:\s*ltr/);
    expect(body).toMatch(/unicode-bidi:\s*isolate/);
  });
});
