import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as storage from '../lib/storage.js';

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

describe('New Tab is gone', () => {
  it('no override and no permission that only served it', () => {
    expect(manifest.chrome_url_overrides).toBeUndefined();
    expect(manifest.permissions).not.toContain('bookmarks');
    expect(manifest.permissions).not.toContain('favicon');
    expect(manifest.optional_permissions ?? []).not.toContain('topSites');
  });

  it('no code left behind', () => {
    expect(fs.existsSync(path.join(root, 'newtab'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'lib/top-sites.js'))).toBe(false);
    expect(read('scripts/build.mjs')).not.toMatch(/newtab\//);
    expect(storage.getNewTabEnabled).toBeUndefined();
    expect(storage.getNewTabPanels).toBeUndefined();
  });

  it('Settings offers the practice size instead', () => {
    const html = read('settings/settings.html');
    expect(html).not.toMatch(/id="newtab-toggle"/);
    expect(html).toMatch(/<label[^>]+for="practice-size-slider"/);
    expect(read('welcome/welcome.html')).not.toMatch(/featureNewTab/);
  });
});
