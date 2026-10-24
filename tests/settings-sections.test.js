// tests/settings-sections.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { SETTINGS_SECTIONS, resolveSectionHash } from '../settings/sections.js';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const html = read('settings/settings.html'); const css = read('settings/settings.css');
describe('settings sections', () => {
  it('resolves hashes, old ones included', () => {
    expect(resolveSectionHash('#providers')).toBe('providers');
    expect(resolveSectionHash('#general')).toBe('reading');
    expect(resolveSectionHash('#more')).toBe('about');
    expect(resolveSectionHash('')).toBe('providers');
    expect(resolveSectionHash('#nope')).toBe('providers');
  });
  it('has a nav link and a section per id, providers first', () => {
    for (const id of SETTINGS_SECTIONS) {
      expect(html, id).toMatch(new RegExp(`<a[^>]+href="#${id}"`));
      expect(html, id).toMatch(new RegExp(`<section[^>]+id="${id}"`));
    }
    const firstSection = html.match(/<section[^>]+id="([a-z]+)"/)[1];
    expect(firstSection).toBe('providers');
  });
  it('carries no dead utility classes', () => {
    const classes = [...html.matchAll(/class="([^"]+)"/g)].map(m => m[1]).join(' ');
    expect(classes).not.toMatch(/\b(dark:\S+|bg-gray-\d+|text-gray-\d+|p[xy]-\d|m[xy]-auto|max-w-\S+|backdrop-blur\S*|w-5|h-5|rounded-lg|sticky|top-0|z-50)\b/);
    expect(css).not.toMatch(/\.dark\\:/);
  });
  it('scrolls under the header and respects reduced motion', () => {
    expect(css).toMatch(/scroll-padding-top/);
    expect(css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\}\s*\}/g, '')).not.toMatch(/scroll-behavior:\s*smooth/);
  });
});
