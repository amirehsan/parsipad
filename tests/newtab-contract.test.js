import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as storage from '../lib/storage.js';
import { translations } from '../lib/i18n.js';

/**
 * The New Tab came back in 3.8.0 after 3.4.0 removed it. This pins what the
 * return promised: the override and the permissions it needs, Most visited
 * kept optional, a Settings card to turn it off, and the privacy line the page
 * has always held (site icons from the browser's own cache, no AI request).
 */
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const PAGE_FILES = ['newtab/newtab.html', 'newtab/newtab.js', 'newtab/newtab.css', 'newtab/glance.js', 'lib/top-sites.js'];

describe('the New Tab override', () => {
  it('is declared and served from the repo root, unbuilt', () => {
    expect(manifest.chrome_url_overrides).toEqual({ newtab: 'newtab/newtab.html' });
    for (const file of PAGE_FILES) expect(fs.existsSync(path.join(root, file)), file).toBe(true);
  });

  it('asks for bookmarks and favicon up front and topSites only when wanted', () => {
    expect(manifest.permissions).toContain('bookmarks');
    expect(manifest.permissions).toContain('favicon');
    expect(manifest.permissions).not.toContain('topSites');
    expect(manifest.optional_permissions).toEqual(['topSites']);
  });

  it('is built into dist', () => {
    const build = read('scripts/build.mjs');
    expect(build).toMatch(/in: 'newtab\/newtab\.js'/);
    expect(build).toMatch(/'newtab\/newtab\.html', 'newtab\/newtab\.css'/);
  });

  it('keeps its storage functions', () => {
    for (const name of ['getNewTabEnabled', 'setNewTabEnabled', 'getNewTabPanels', 'setNewTabPanels']) {
      expect(typeof storage[name], name).toBe('function');
    }
  });
});

describe('the Settings card', () => {
  const html = read('settings/settings.html');
  const flashcards = html.slice(html.indexOf('<section id="flashcards"'), html.indexOf('</section>', html.indexOf('<section id="flashcards"')));

  it('sits in the Flashcards section with a switch for the page and each panel', () => {
    for (const id of ['newtab-enabled-toggle', 'newtab-bookmarks-toggle', 'newtab-recents-toggle']) {
      expect(flashcards).toMatch(new RegExp(`<input type="checkbox" role="switch" class="pp-switch" id="${id}" aria-describedby="${id.replace('toggle', 'hint')}"`));
      expect(flashcards).toMatch(new RegExp(`<label for="${id}"`));
      expect(flashcards).toMatch(new RegExp(`<p id="${id.replace('toggle', 'hint')}" class="setting-hint"`));
    }
    expect(flashcards).toMatch(/id="newtab-enabled-toggle"[^>]*checked/);
  });

  it('lists the New Tab keys as their own shortcut group', () => {
    const shortcuts = html.slice(html.indexOf('<section id="shortcuts"'));
    expect(shortcuts).toMatch(/data-i18n="newTabShortcuts"/);
    const group = shortcuts.slice(shortcuts.indexOf('data-i18n="newTabShortcuts"'));
    const list = group.slice(0, group.indexOf('</div>\n            </div>'));
    expect(list).toMatch(/<kbd>\/<\/kbd>/);
    expect(list).toMatch(/<kbd>Space<\/kbd> <kbd>Enter<\/kbd>/);
    expect(list).toMatch(/<kbd>C<\/kbd>/);
    expect(list).not.toMatch(/<kbd>←<\/kbd>/);
  });
});

describe('what the page will not do', () => {
  const sources = PAGE_FILES.map(f => [f, read(f)]);

  it('uses the browser favicon cache, never a third-party icon service', () => {
    expect(read('lib/top-sites.js')).toMatch(/_favicon\//);
    for (const [file, src] of sources) {
      expect(src, file).not.toMatch(/google\.com\/s2\/favicons|icons\.duckduckgo|favicon\.(?:io|ico\.)|besticon|clearbit/i);
    }
  });

  it('never talks to an AI provider', () => {
    const hosts = (manifest.host_permissions || []).map(h => new URL(h.replace('/*', '/')).host);
    expect(hosts.length).toBeGreaterThan(0);
    for (const [file, src] of sources) {
      for (const host of hosts) expect(src, `${file} ${host}`).not.toContain(host);
      expect(src, file).not.toMatch(/lib\/api\.js|lib\/providers|lib\/translation/);
      expect(src, file).not.toMatch(/runtime\.sendMessage/);
    }
  });

  it('runs no inline script and builds no markup from strings', () => {
    const html = read('newtab/newtab.html');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).toMatch(/<script src="\.\.\/lib\/theme-boot\.js"><\/script>/);
    const js = read('newtab/newtab.js');
    expect(js).not.toMatch(/\.innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  });

  it('writes no em dash and no emoji in its copy', () => {
    const NEW_KEYS = Object.keys(translations.en).filter(k => /^(newTab|greeting)/.test(k));
    expect(NEW_KEYS.length).toBeGreaterThan(5);
    for (const lang of ['en', 'fa']) {
      for (const key of NEW_KEYS) {
        expect(translations[lang][key], `${lang}.${key}`).toBeTruthy();
        expect(translations[lang][key], `${lang}.${key}`).not.toMatch(/\u2014|\p{Extended_Pictographic}/u);
      }
    }
    for (const [file, src] of sources) expect(src, file).not.toMatch(/\u2014/);
  });
});
