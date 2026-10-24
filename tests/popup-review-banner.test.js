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
