import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Static guards on the New Tab stylesheet.
 *
 * These are the invariants that were expensive to discover and are cheap to
 * break again: a contrast pairing that reads fine in one theme and fails in
 * the other, a page that starts scrolling because one rule moved, a drawer
 * that stops animating because someone reached for the hidden attribute.
 * None of them are visible in a diff, so they are asserted here rather than
 * left to the next person to rediscover in a browser.
 */

const css = fs.readFileSync(
  path.resolve(__dirname, '..', 'newtab', 'newtab.css'), 'utf8');
const html = fs.readFileSync(
  path.resolve(__dirname, '..', 'newtab', 'newtab.html'), 'utf8');

/**
 * The declarations inside the first rule whose selector matches.
 *
 * Anchored to the start of a line, or `body {` would be found inside
 * `html, body {` and silently return the wrong rule.
 */
function block(selector) {
  const i = css.indexOf('\n' + selector);
  if (i === -1) throw new Error(`no rule for ${selector}`);
  const open = css.indexOf('{', i);
  return css.slice(open + 1, css.indexOf('}', open));
}

describe('the page cannot scroll', () => {
  it('clips the document itself', () => {
    expect(block('html, body')).toMatch(/overflow:\s*hidden/);
  });

  it('sizes the shell to the viewport and clips it', () => {
    const shell = block('.shell {');
    expect(shell).toMatch(/height:\s*100dvh/);
    expect(shell).toMatch(/overflow:\s*hidden/);
  });

  it('lets the stage shrink below its content', () => {
    // A flex child defaults to min-height: auto and refuses to shrink, which
    // is how a long favourite pushes the shell past the viewport no matter
    // what overflow says.
    expect(block('.stage {')).toMatch(/min-height:\s*0/);
  });

  it('gives the overflow somewhere to go inside a panel', () => {
    expect(block('.tile-grid {')).toMatch(/overflow-x:\s*auto/);
    expect(css).toMatch(/\.bookmark-tree\s*\{[^}]*overflow-y:\s*auto/);
  });
});

describe('contrast pairings', () => {
  it('fills the pressed and expanded chips with the button token', () => {
    // --color-primary is the 400 step in dark mode, a light indigo, and a
    // near-white label on it measures 2.92:1. --button-primary-bg holds the
    // 600 step in both themes precisely so its label keeps working.
    const on = block(".chip[aria-pressed='true'],");
    expect(on).toMatch(/background:\s*var\(--button-primary-bg\)/);
    expect(on).not.toMatch(/background:\s*var\(--color-primary\)/);
  });

  it('never uses --color-primary as a fill under the primary label', () => {
    // Catches the same mistake anywhere else in the file: the two must not
    // appear as background and color in one declaration block.
    const blocks = css.split('}');
    const offenders = blocks.filter(b =>
      /background:\s*var\(--color-primary\)\s*;/.test(b) &&
      /color:\s*var\(--button-primary-text\)/.test(b));
    expect(offenders).toEqual([]);
  });

  it('keeps secondary text off the ladder decoration step', () => {
    // gray-500 measures 3.06 on this page's background. 600 is the lightest
    // step that reaches AA.
    expect(block(':root {')).toMatch(/--color-text-secondary:\s*var\(--color-gray-600\)/);
  });
});

describe('the gradient the design keeps', () => {
  it('is present in both themes', () => {
    const light = block('body {');
    expect(light.match(/radial-gradient/g)).toHaveLength(3);
    const dark = block('[data-theme="dark"] body');
    expect(dark.match(/radial-gradient/g)).toHaveLength(3);
  });
});

describe('the drawer', () => {
  it('hides itself with a transform, not the hidden attribute', () => {
    // The shared [hidden] rule is display: none !important, which would
    // remove the element outright and take the slide with it.
    const drawer = block('.drawer {');
    expect(drawer).toMatch(/transform:\s*translateX\(100%\)/);
    expect(html).toMatch(/id="bookmarks-drawer"[^>]*inert/);
    expect(html).not.toMatch(/id="bookmarks-drawer"[^>]*\shidden/);
  });

  it('enters from the correct side in RTL', () => {
    expect(block("[dir='rtl'] .drawer")).toMatch(/translateX\(-100%\)/);
  });

  it('is opened by a control that says so', () => {
    expect(html).toMatch(/id="chip-bookmarks"[\s\S]{0,120}aria-expanded="false"/);
    expect(html).toMatch(/id="chip-bookmarks"[\s\S]{0,160}aria-controls="bookmarks-drawer"/);
  });
});

describe('motion', () => {
  it('has a reduced-motion block', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('keeps the hover-revealed controls visible when motion is reduced', () => {
    // The arrows and copy button fade in on hover. If that fade is disabled
    // without also pinning them visible, the controls become unreachable.
    const i = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const scope = css.slice(i, i + 900);
    expect(scope).toMatch(/\.hero-nav,[\s\S]{0,80}opacity:\s*1/);
  });
});

describe('the hero', () => {
  it('defines every size step the script can set', () => {
    for (const step of ['xl', 'lg', 'md', 'sm']) {
      expect(css).toContain(`.hero-text[data-size='${step}']`);
    }
  });

  it('bounds the display size by height as well as width', () => {
    // clamp() alone tracks width, so on a short wide window a single word
    // grows past the viewport and takes the dock off screen with it.
    const root = block(':root {');
    for (const step of ['xl', 'lg', 'md']) {
      expect(root).toMatch(new RegExp(`--display-${step}:\\s*min\\(clamp\\([^)]*\\),\\s*\\d+dvh\\)`));
    }
  });

  it('clamps the smallest step so a long favourite cannot force scroll', () => {
    expect(block(".hero-text[data-size='sm']")).toMatch(/-webkit-line-clamp:\s*\d+/);
  });
});

describe('the theme button', () => {
  it('shows exactly one icon per theme', () => {
    // These rules were dropped in the rewrite, which drew the sun and the
    // moon on top of each other and made the button look inert.
    expect(block('#theme-icon-dark')).toMatch(/display:\s*none/);
    expect(block('#theme-icon-light')).toMatch(/display:\s*block/);
    expect(css).toMatch(/#theme-icon-light,[\s\S]{0,60}display:\s*none/);
    expect(css).toMatch(/#theme-icon-dark,[\s\S]{0,60}display:\s*block/);
  });

  it('answers to both dark conventions', () => {
    // theme-boot sets data-theme and .dark; the icon must not depend on one.
    const i = css.indexOf('#theme-icon-dark {');
    const scope = css.slice(i, i + 500);
    expect(scope).toContain('[data-theme="dark"] #theme-icon-light');
    expect(scope).toContain('.dark #theme-icon-light');
  });
});

describe('the progress dots', () => {
  it('paints a small dot inside a real click target', () => {
    // A 7px target is nowhere near the 24px minimum, and the scaled active
    // dot was being sheared by the stage's overflow clip.
    const dot = block('.progress-dot {');
    expect(dot).toMatch(/padding:\s*9px/);
    expect(dot).toMatch(/background-clip:\s*content-box/);
    expect(dot).toMatch(/box-sizing:\s*content-box/);
  });

  it('sets dot state colours with the longhand', () => {
    // The `background` shorthand resets background-clip to border-box, which
    // paints the whole target instead of the dot inside it.
    for (const sel of ['.progress-dot:hover', '.progress-dot.active']) {
      const b = block(sel);
      expect(b).toMatch(/background-color:/);
      expect(b).not.toMatch(/\bbackground:\s*var/);
    }
  });
});
