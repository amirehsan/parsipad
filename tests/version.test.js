import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The version used to live in four places: manifest.json, package.json,
 * an EXTENSION_VERSION constant in settings.js, and a literal typed into the
 * About card in settings.html. Three of them had to be remembered by hand on
 * every release, and the one users actually read was the easiest to forget.
 *
 * The manifest is the source of truth now. These assert that nothing has
 * quietly started restating it again.
 */

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

describe('version', () => {
  it('is a plain semver triple', () => {
    // Chrome accepts up to four dot-separated integers; anything with a
    // pre-release suffix is rejected at upload, after the zip is built.
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches package.json', () => {
    expect(JSON.parse(read('package.json')).version).toBe(manifest.version);
  });

  it('is read from the manifest in settings, not restated', () => {
    const src = read('settings/settings.js');
    expect(src).toContain('getManifest().version');
    // A literal here is the drift this guards against.
    expect(src).not.toMatch(/const EXTENSION_VERSION\s*=\s*['"]\d/);
  });

  it('leaves the About row for the page to fill in', () => {
    const html = read('settings/settings.html');
    expect(html).toContain('id="about-version"');
    expect(html).not.toMatch(/about-value">\d+\.\d+\.\d+</);
  });

  it('has a changelog entry', () => {
    // Releasing with everything still under [Unreleased] is how a changelog
    // stops being one.
    expect(read('CHANGELOG.md')).toContain(`## [${manifest.version}]`);
  });
});
