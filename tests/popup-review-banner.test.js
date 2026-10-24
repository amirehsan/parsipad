// tests/popup-review-banner.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The review banner's primary button once painted its label in the same
 * token as its background, so "Rate Now" rendered as an empty block. The
 * rule is read as text, as the other presentation tests in this suite do.
 */
const css = fs.readFileSync(path.resolve(__dirname, '../popup/popup.css'), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.:]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  return match ? match[1] : '';
}

describe('review banner buttons', () => {
  it('primary button label is not painted in its own background colour', () => {
    const body = rule('.review-btn-primary');
    expect(body).toMatch(/background:\s*var\(--color-warning-500\)/);
    expect(body).toMatch(/color:\s*#fff(fff)?\b/);
  });

  it('primary hover differs from rest', () => {
    expect(rule('.review-btn-primary:hover')).not.toMatch(/background:\s*var\(--color-warning-500\)\s*;/);
  });

  it('secondary hover changes something', () => {
    const body = rule('.review-btn-secondary:hover');
    expect(body).toMatch(/background:\s*var\(--color-warning-100\)/);
  });
});

describe('review banner timing and answers', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../popup/popup.html'), 'utf8');
  const js = fs.readFileSync(path.resolve(__dirname, '../popup/popup.js'), 'utf8');

  it('offers rate, later and never, with no emoji', () => {
    expect(html).toMatch(/id="review-rate-btn"/);
    expect(html).toMatch(/id="review-later-btn"/);
    expect(html).toMatch(/id="review-never-btn"[^>]*data-i18n="dontAskAgain"/);
    expect(html).not.toMatch(/review-prompt-icon">⭐/);
  });

  it('asks after a result renders, not when the popup opens', () => {
    const init = js.slice(js.indexOf('async function init()'), js.indexOf('\n}\n', js.indexOf('async function init()')));
    expect(init).not.toMatch(/checkReviewPrompt\(\)/);
    expect(js).toMatch(/cardSlot\.replaceChildren\(currentCardEl\);\s*\n\s*checkReviewPrompt\(\);/);
    expect(js).toMatch(/polishSection\.hidden = false;\s*\n\s*checkReviewPrompt\(\);/);
  });

  it('claims the prompt through storage so one show is counted once', () => {
    expect(js).toMatch(/await claimReviewPrompt\(\)/);
    expect(js).toMatch(/await respondToReviewPrompt\(response\)/);
    for (const answer of ['never', 'later', 'rated']) {
      expect(js, answer).toMatch(new RegExp(`answerReviewPrompt\\('${answer}'\\)`));
    }
  });
});

describe('review banner in dark mode', () => {
  const tokens = fs.readFileSync(path.resolve(__dirname, '../lib/design-tokens.css'), 'utf8');
  const darkBlock = tokens.slice(tokens.indexOf(":root[data-theme='dark'] {"));
  const darkHex = (name) => darkBlock.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))[1];

  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('never paints banner text in the banner background colour', () => {
    expect(css).not.toMatch(/\[data-theme="dark"\] \.review-prompt-content\s*\{[^}]*color:\s*var\(--color-warning-100\)/);
    expect(css).not.toMatch(/\[data-theme="dark"\] \.review-btn-secondary:hover\s*\{[^}]*color:\s*var\(--color-warning-100\)/);
  });

  it('message and secondary buttons read at 4.5:1 on the dark banner', () => {
    expect(contrast(darkHex('--color-warning-500'), darkHex('--color-warning-100'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the primary button uses a dark label on its light amber fill', () => {
    const body = (css.match(/\[data-theme="dark"\] \.review-btn-primary\s*\{([^}]*)\}/) || [, ''])[1];
    expect(body).toMatch(/color:\s*var\(--color-bg\)/);
    expect(contrast(darkHex('--color-bg'), darkHex('--color-warning-500'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('rating from the popup', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../popup/popup.js'), 'utf8');
  const body = js.slice(js.indexOf('function handleReviewRateClick'), js.indexOf('\n}\n', js.indexOf('function handleReviewRateClick')));

  it('records the answer before opening the store, so a closing popup cannot lose it', () => {
    expect(body).toMatch(/event\.preventDefault\(\)/);
    const recordAt = body.indexOf("await answerReviewPrompt('rated')");
    const openAt = body.indexOf('chrome.tabs.create({ url: STORE_REVIEWS_URL })');
    expect(recordAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(recordAt);
  });
});
