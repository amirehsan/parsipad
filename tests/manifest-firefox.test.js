import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { firefoxManifest, FIREFOX_ADDON_ID, FIREFOX_MIN_VERSION } from '../scripts/manifest-targets.mjs';

/**
 * manifest.json is written for Chrome and stays the single source. The
 * Firefox build derives its manifest from it; these pin every difference and
 * that nothing else changes.
 */
const root = path.resolve(__dirname, '..');
const chromeManifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const fx = firefoxManifest(chromeManifest);

describe('the Firefox manifest', () => {
  it('runs the worker file as a module background script', () => {
    // Firefox runs no extension service workers.
    expect(fx.background).toEqual({ scripts: ['background/service-worker.js'], type: 'module' });
  });

  it('swaps the side panel for a sidebar that does not open at install', () => {
    expect(fx.side_panel).toBeUndefined();
    expect(fx.sidebar_action).toEqual({
      default_panel: 'sidepanel/sidepanel.html',
      default_title: '__MSG_extensionName__',
      default_icon: chromeManifest.icons,
      open_at_install: false
    });
  });

  it('drops the Chrome-only permissions and keeps the rest', () => {
    expect(fx.permissions).toEqual(chromeManifest.permissions.filter(p => p !== 'sidePanel' && p !== 'favicon'));
    expect(fx.permissions).toContain('bookmarks');
  });

  it('declares the ID, the minimum version and the data it sends', () => {
    expect(FIREFOX_ADDON_ID).toBe('parsipad@parsipad.com');
    expect(FIREFOX_MIN_VERSION).toBe('140.0');
    expect(fx.browser_specific_settings).toEqual({
      gecko: {
        id: 'parsipad@parsipad.com',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['websiteContent'] }
      }
    });
  });

  it('keeps everything else as Chrome has it', () => {
    for (const key of ['manifest_version', 'name', 'version', 'description', 'default_locale', 'commands',
      'chrome_url_overrides', 'web_accessible_resources', 'optional_permissions', 'options_page',
      'content_scripts', 'host_permissions', 'action', 'icons']) {
      expect(fx[key], key).toEqual(chromeManifest[key]);
    }
    const handled = new Set(['background', 'side_panel', 'sidebar_action', 'permissions', 'browser_specific_settings']);
    const rest = (m) => Object.keys(m).filter(k => !handled.has(k)).sort();
    expect(rest(fx)).toEqual(rest(chromeManifest));
  });

  it('leaves the Chrome manifest untouched', () => {
    const before = structuredClone(chromeManifest);
    firefoxManifest(chromeManifest);
    expect(chromeManifest).toEqual(before);
  });
});
