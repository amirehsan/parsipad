import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Static guards on the New Tab stylesheet: the invariants that are invisible
 * in a diff and cheap to break again. The drawer that stops sliding because
 * someone reached for the hidden attribute, motion that ignores the reduced
 * motion setting, a control with no focus ring, a spacing value off the scale.
 */
const css = fs.readFileSync(path.resolve(__dirname, '..', 'newtab', 'newtab.css'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'newtab', 'newtab.html'), 'utf8');

/** The declarations of the first top-level rule whose selector matches. */
function block(selector) {
  const i = css.indexOf('\n' + selector);
  if (i === -1) throw new Error(`no rule for ${selector}`);
  const open = css.indexOf('{', i);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** The body of an @media block, braces balanced. */
function mediaBody(query) {
  const i = css.indexOf(`@media ${query}`);
  if (i === -1) throw new Error(`no @media ${query}`);
  let depth = 0;
  const start = css.indexOf('{', i);
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++;
    if (css[j] === '}' && --depth === 0) return css.slice(start + 1, j);
  }
  throw new Error('unbalanced');
}

describe('the drawer', () => {
  it('hides itself with a transform, not the hidden attribute', () => {
    // The shared [hidden] rule is display: none !important, which would
    // remove the element outright and take the slide with it.
    expect(block('.nt-drawer {')).toMatch(/transform:\s*translateX\(100%\)/);
    expect(html).toMatch(/id="nt-drawer"[^>]*\sinert/);
    expect(html).not.toMatch(/id="nt-drawer"[^>]*\shidden/);
  });

  it('enters from the reading end in RTL', () => {
    expect(block("[dir='rtl'] .nt-drawer")).toMatch(/translateX\(-100%\)/);
  });

  it('is opened by a control that says so', () => {
    expect(html).toMatch(/id="nt-bookmarks-btn"[\s\S]{0,160}aria-expanded="false"/);
    expect(html).toMatch(/id="nt-bookmarks-btn"[\s\S]{0,200}aria-controls="nt-drawer"/);
    expect(html).toMatch(/id="nt-bookmarks-btn"[\s\S]{0,240}aria-keyshortcuts="\/"/);
  });

  it('scrolls its own list rather than the page', () => {
    expect(block('.nt-bookmark-tree {')).toMatch(/overflow-y:\s*auto/);
    expect(block('.nt-bookmark-tree {')).toMatch(/min-height:\s*0/);
  });
});

describe('motion', () => {
  const outside = css.replace(mediaBody('(prefers-reduced-motion: no-preference)'), '');

  it('moves only for those who have not asked for less', () => {
    expect(outside).not.toMatch(/\btransition\s*:/);
    expect(outside).not.toMatch(/\banimation\s*:/);
  });

  it('never transitions everything', () => {
    expect(css).not.toMatch(/transition:\s*all/);
  });

  it('takes its durations from the motion tokens', () => {
    const transitions = [...mediaBody('(prefers-reduced-motion: no-preference)').matchAll(/transition:\s*([^;]+);/g)].map(m => m[1]);
    expect(transitions.length).toBeGreaterThan(0);
    // 0s is the one literal: a visibility switch that waits for nothing.
    for (const value of transitions) expect(value.replace(/\b0s\b/g, '')).not.toMatch(/\d+m?s\b/);
    for (const value of transitions) expect(value).toMatch(/var\(--motion-/);
  });

  it('swaps the faces without a turn when motion is reduced', () => {
    const reduced = mediaBody('(prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/\.nt-card\[aria-pressed="true"\] \.nt-face-back\s*\{[^}]*visibility:\s*visible/);
  });
});

describe('focus', () => {
  it.each(['.nt-card', '.nt-tile', '.nt-bookmark', '.nt-folder-title'])('%s has a visible focus ring', (selector) => {
    expect(block(`${selector}:focus-visible`)).toMatch(/outline:\s*var\(--ring-width\) solid var\(--ring-color\)/);
  });
});

describe('spacing', () => {
  const ALLOWED = /^(0|auto|var\(--space-(inset-card|stack-section|stack-group|stack-item|inline-actions|1|2|12|16)\))$/;

  it('uses the spacing tokens and nothing else', () => {
    const decls = [...css.matchAll(/(?:^|[;{\s])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?):\s*([^;]+);/g)];
    expect(decls.length).toBeGreaterThan(10);
    for (const [, prop, value] of decls) {
      for (const part of value.trim().split(/\s+/)) expect(part, `${prop}: ${value}`).toMatch(ALLOWED);
    }
  });
});

describe('the word', () => {
  it('defines every size step lib/text-size.js can set', () => {
    for (const step of ['xl', 'lg', 'md', 'sm']) {
      expect(css).toContain(`.nt-text[data-size="${step}"]`);
    }
  });

  it('bounds the display size by height as well as width', () => {
    // clamp() alone tracks width, so on a short wide window a single word
    // grows past the viewport and takes the tiles off screen with it.
    const word = block('.nt-word {');
    for (const step of ['xl', 'lg', 'md']) {
      expect(word).toMatch(new RegExp(`--display-${step}:\\s*min\\(clamp\\([^)]*\\),\\s*\\d+dvh\\)`));
    }
  });

  it('clamps the smallest step so a long favourite cannot take over the page', () => {
    expect(block('.nt-text[data-size="sm"]')).toMatch(/-webkit-line-clamp:\s*\d+/);
  });

  it('sets Persian faces in the Persian font', () => {
    expect(block('.nt-face[lang="fa"] .nt-text')).toMatch(/font-family:\s*var\(--font-persian\)/);
  });
});

describe('the theme button', () => {
  it('shows exactly one icon per theme', () => {
    expect(block('#theme-icon-dark {')).toMatch(/display:\s*none/);
    expect(block('[data-theme="dark"] #theme-icon-light')).toMatch(/display:\s*none/);
    expect(block('[data-theme="dark"] #theme-icon-dark')).toMatch(/display:\s*block/);
  });
});

describe('new tab: the search match', () => {
  it('is tinted from the theme accent, so it reads in dark mode too', () => {
    // --color-primary-100 has no dark value: light text on pale lavender.
    expect(block('.nt-bookmark mark {')).toMatch(/background:\s*color-mix\(in srgb, var\(--color-primary\)/);
  });
});
