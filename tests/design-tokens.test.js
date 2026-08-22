// tests/design-tokens.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Contrast guard for lib/design-tokens.css.
 *
 * The palette is warm and low-key by design, which puts several of its steps
 * close to the line. Two of the values the design system shipped were already
 * over it: its `mute` measured 1.66:1 on a card and its `body-mid` 2.92:1, and
 * both were specified as text colours.
 *
 * Reading a hex value tells you nothing about whether it is legible, so this
 * resolves the real var() chains out of the real stylesheet and measures them,
 * in both themes, against both grounds text actually lands on: the page canvas
 * and the card surface. A token that stops passing fails the suite rather than
 * shipping and being noticed later by someone who cannot read it.
 */

const rootDir = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(rootDir, 'lib/design-tokens.css'), 'utf8');

/** Declarations inside the first block matching `selector {`. */
function block(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`no block for ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  const body = css.slice(open + 1, close);

  const out = new Map();
  const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m = decl.exec(body);
  while (m !== null) {
    out.set(m[1], m[2].trim());
    m = decl.exec(body);
  }
  return out;
}

const light = block(':root {');
const dark = new Map([...light, ...block('.dark,')]);

/** Follow var() chains to a literal value. */
function resolve(tokens, name, depth = 0) {
  if (depth > 10) throw new Error(`cycle resolving ${name}`);
  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`undefined token ${name}`);
  const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return ref ? resolve(tokens, ref[1], depth + 1) : raw;
}

function lin(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const AA = 4.5;
const UI_BOUNDARY = 3.0;

/**
 * Contrast shortfalls accepted deliberately, with the value measured when
 * they were accepted.
 *
 * Empty, and that is the point. The previous palette needed one: its
 * Signal Orange primary measured 3.27:1 under its own label, below AA for
 * text. The indigo primary reaches 6.29 in light and 6.24 in dark, so the
 * button passes on its own merits and nothing here is being waived.
 *
 * An entry is not a way to silence the guard: it still has to clear 3:1,
 * and it fails if it drifts below the value recorded.
 */
const ACCEPTED_BELOW_AA = {};// Every tone that carries text, and so has to be legible on both grounds.
const TEXT_TOKENS = [
  '--color-text',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-link',
  '--color-success-500',
  '--color-error-500',
  '--color-warning-500'
];

describe.each([['light', light], ['dark', dark]])('%s theme', (themeName, tokens) => {
  const canvas = resolve(tokens, '--color-bg');
  const card = resolve(tokens, '--color-bg-elevated');

  it.each(TEXT_TOKENS)('%s is legible on both the canvas and a card', (token) => {
    const value = resolve(tokens, token);
    const onCanvas = contrast(value, canvas);
    const onCard = contrast(value, card);

    expect(
      Math.min(onCanvas, onCard),
      `${token} (${value}) in ${themeName}: ${onCanvas.toFixed(2)} on canvas ${canvas}, ${onCard.toFixed(2)} on card ${card}`
    ).toBeGreaterThanOrEqual(AA);
  });

  it('the primary button carries its own label', () => {
    const fill = resolve(tokens, '--button-primary-bg');
    const label = resolve(tokens, '--button-primary-text');
    const measured = contrast(label, fill);
    const allowed = ACCEPTED_BELOW_AA[`${themeName}:button-primary`];

    if (allowed === undefined) {
      expect(measured, `${label} on ${fill} in ${themeName}`).toBeGreaterThanOrEqual(AA);
      return;
    }

    // A recorded exception. It still has to clear the 3:1 bar for a UI
    // component boundary, and it must not drift further than what was
    // signed off, so this fails if the value gets worse rather than
    // quietly absorbing the next regression too.
    expect(measured, `${label} on ${fill} in ${themeName} is a recorded exception`)
      .toBeGreaterThanOrEqual(UI_BOUNDARY);
    expect(measured, `recorded at ${allowed}, now ${measured.toFixed(2)}`)
      .toBeGreaterThanOrEqual(allowed - 0.01);
  });

  it('the two surfaces are distinguishable from each other', () => {
    // Elevation is carried by surface contrast rather than shadow, so the card
    // has to actually read as a different surface from the page.
    expect(canvas).not.toBe(card);
  });
});

describe('the warm neutral ladder', () => {
  // Steps 50-500 are surfaces, hairlines and decoration. Pointing a text token
  // at one is the specific mistake that shipped in the source design system.
  const SURFACE_STEPS = [50, 100, 200, 300, 400, 500].map(n => `--color-gray-${n}`);

  it.each([['light', light], ['dark', dark]])('no %s text token points at a surface step', (_name, tokens) => {
    const offenders = TEXT_TOKENS.filter(token => {
      const raw = tokens.get(token);
      const ref = raw && raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
      return ref ? SURFACE_STEPS.includes(ref[1]) : false;
    });
    expect(offenders).toEqual([]);
  });

  it('runs light to dark without a step going backwards', () => {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const lums = steps.map(n => luminance(resolve(light, `--color-gray-${n}`)));
    const descending = lums.every((l, i) => i === 0 || l <= lums[i - 1]);
    expect(descending, `luminances: ${lums.map(l => l.toFixed(3)).join(' ')}`).toBe(true);
  });

  it('keeps every neutral in the accent hue band, with no stray greys', () => {
    // The ladder is tinted toward the accent rather than being a generic
    // grey; that is what makes the palette read as one colour rather than as
    // an accent sitting on neutral chrome. The check is a hue band rather
    // than "is it cool", because a generic 220deg blue-grey would pass the
    // looser test while still looking like a different system.
    //
    // Steps 50 and 900 are excluded: at very low and very high lightness the
    // hue of a near-white or near-black is numerically unstable and says
    // nothing useful about how it reads.
    const strays = [100, 200, 300, 400, 500, 600, 700, 800]
      .map(n => [n, resolve(light, `--color-gray-${n}`)])
      .filter(([, hex]) => {
        const h = hex.replace('#', '');
        const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max === min) return true;                       // a true grey
        const d = max - min;
        let hue = max === r ? ((g - b) / d + (g < b ? 6 : 0))
          : max === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
        hue *= 60;
        return hue < 235 || hue > 275;                      // outside the band
      })
      .map(([n]) => n);
    expect(strays).toEqual([]);
  });
});
