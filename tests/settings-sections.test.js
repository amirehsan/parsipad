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

describe('settings page fit and finish', () => {
  /** Declarations of the first rule whose selector is exactly `selector`, outside media queries. */
  const rule = (selector) => {
    const escaped = selector.replace(/[.:()[\]"]/g, '\\$&');
    const match = css.match(new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}'));
    return match ? match[1] : '';
  };
  const SCALE = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'];
  const size = (selector) => SCALE.indexOf(rule(selector).match(/font-size:\s*var\(--text-(\w+)\)/)?.[1]);

  it('keeps the nav strip under the header, and headings clear of both bars', () => {
    expect(rule('.settings-nav')).toMatch(/position:\s*sticky/);
    expect(rule('.settings-nav')).toMatch(/top:\s*var\(--settings-header-height\)/);
    expect(rule('.settings-nav')).toMatch(/height:\s*var\(--settings-strip-height\)/);
    expect(rule('html')).toMatch(/scroll-padding-top:\s*calc\(var\(--settings-header-height\) \+ var\(--settings-strip-height\) \+ var\(--space-stack-group\)\)/);
  });

  it('gives the nav column room for its longest label', () => {
    expect(css).toMatch(/--settings-nav-width:\s*220px/);
  });

  it('shows a focus ring on the practice slider', () => {
    expect(rule('.slider-input:focus-visible')).toMatch(/outline:\s*var\(--ring-width\) solid var\(--ring-color\)/);
  });

  it('sizes section headings above the page title and the card titles', () => {
    expect(size('.settings-section-title')).toBeGreaterThan(size('.settings-title'));
    expect(size('.settings-section-title')).toBeGreaterThan(size('.card-title'));
    expect(size('.card-title')).toBeGreaterThanOrEqual(0);
  });

  it('writes card titles, group headings and legends in sentence case', async () => {
    const { translations } = await import('../lib/i18n.js');
    const keys = [...html.matchAll(/class="(?:card-title|section-label|shortcuts-title|settings-legend)" data-i18n="(\w+)"/g)].map(m => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      const later = translations.en[key].split(/\s+/).slice(1);
      expect(later.filter(word => /^[A-Z][a-z]/.test(word)), `${key}: ${translations.en[key]}`).toEqual([]);
    }
  });

  it('introduces Language & appearance with both of its subjects', async () => {
    const { translations } = await import('../lib/i18n.js');
    expect(html).toMatch(/<h2 id="appearance-title"[^>]*>[^<]*<\/h2>\s*<p class="settings-section-intro" data-i18n="appearanceIntro">/);
    expect(translations.en.appearanceIntro).toMatch(/language/i);
    expect(translations.en.appearanceIntro).toMatch(/look/i);
    expect(translations.fa.appearanceIntro).toBeTruthy();
  });
});
