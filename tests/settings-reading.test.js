// tests/settings-reading.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs'; import path from 'path';
import * as storage from '../lib/storage.js';
const store = new Map();
beforeEach(() => { store.clear(); globalThis.chrome = { storage: { local: {
  get: async (k) => ({ [k]: store.get(k) }), set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); } } } }; });
const html = fs.readFileSync(path.resolve(__dirname, '../settings/settings.html'), 'utf8');
describe('reading section', () => {
  it('asks before a whole-page translation by default', async () => {
    expect(await storage.getConfirmPageTranslate()).toBe(true);
    await storage.setConfirmPageTranslate(false);
    expect(await storage.getConfirmPageTranslate()).toBe(false);
  });
  it('has the confirmation switch and a labelled muted-sites form', () => {
    const reading = html.slice(html.indexOf('<section id="reading"'), html.indexOf('</section>', html.indexOf('<section id="reading"')));
    expect(reading).toMatch(/id="confirm-page-translate-toggle"[^>]*role="switch"|role="switch"[^>]*id="confirm-page-translate-toggle"/);
    expect(reading).toMatch(/<label[^>]+for="muted-site-input"/);
    expect(reading).toMatch(/id="muted-sites-list"/);
    expect(reading).toMatch(/role="status"/);
  });
  it('ships the confirmation row hidden until Plan E reads the preference', () => {
    const reading = html.slice(html.indexOf('<section id="reading"'), html.indexOf('</section>', html.indexOf('<section id="reading"')));
    expect(reading.slice(1)).not.toMatch(/<section[\s>]/);
    const rowStart = reading.lastIndexOf('<div class="setting-row"', reading.indexOf('id="confirm-page-translate-toggle"'));
    expect(reading.slice(rowStart, reading.indexOf('>', rowStart) + 1)).toBe('<div class="setting-row" hidden>');
    expect(reading.slice(0, rowStart)).toMatch(/<!--[^>]*Plan E[^>]*-->\s*$/);
  });
  it('gives the add field a sample host, ltr direction and no spellcheck', () => {
    const input = html.match(/<input[^>]+id="muted-site-input"[^>]*>/)[0];
    for (const attr of ['type="text"', 'inputmode="url"', 'autocomplete="off"', 'spellcheck="false"', 'dir="ltr"', 'placeholder="example.com"']) {
      expect(input, attr).toContain(attr);
    }
    expect(html).toMatch(/<ul id="muted-sites-list" class="muted-chips"/);
  });
});
