// tests/settings-switches.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { translations } from '../lib/i18n.js';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const html = read('settings/settings.html');
const rows = html.split('<div class="setting-row">').slice(1).map(r => r.split('</section>')[0]);
describe('settings switches', () => {
  it('every checkbox is a labelled, described switch', () => {
    const boxes = [...html.matchAll(/<input[^>]+type="checkbox"[^>]*>/g)].map(m => m[0]).filter(b => !/export-/.test(b));
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    for (const box of boxes) {
      expect(box).toMatch(/role="switch"/);
      expect(box).toMatch(/class="pp-switch"/);
      const id = box.match(/id="([^"]+)"/)[1];
      const hint = box.match(/aria-describedby="([^"]+)"/)[1];
      expect(html, id).toMatch(new RegExp(`<label[^>]+for="${id}"`));
      expect(html, hint).toMatch(new RegExp(`id="${hint}"`));
    }
  });
  it('label and hint never share a key, and both exist in en and fa', () => {
    for (const row of rows) {
      const keys = [...row.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
      expect(new Set(keys).size, keys.join()).toBe(keys.length);
      for (const k of keys) { expect(translations.en[k], k).toBeTruthy(); expect(translations.fa[k], k).toBeTruthy(); }
    }
  });
  it('switches and radio cards show focus', () => {
    const components = read('lib/components.css'); const css = read('settings/settings.css');
    expect(components).toMatch(/\.pp-switch:focus-visible\s*\{[^}]*outline:\s*(?!none)/);
    expect(css).toMatch(/:has\(input:focus-visible\)/);
    expect(css).not.toMatch(/toggle-slider/);
  });
});
