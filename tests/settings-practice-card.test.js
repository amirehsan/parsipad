import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The Practice card holds a slider row and a button. Rows that open a card
 * drop their top padding (the card content already insets them), and a row
 * that sits above a button hands the gap to the button, as the Cache card does,
 * so the card keeps the rhythm of its neighbours.
 */
const css = fs.readFileSync(path.resolve(__dirname, '../settings/settings.css'), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.+():]/g, '\\$&');
  const match = css.match(new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}'));
  return match ? match[1] : '';
}

describe('settings Practice card spacing', () => {
  it('a slider row that opens the card has no extra top padding, like a setting row', () => {
    expect(rule('.setting-row:first-child')).toMatch(/padding-top:\s*0/);
    expect(rule('.slider-row:first-child')).toMatch(/padding-top:\s*0/);
  });

  it('a slider row above a button has no divider or bottom padding', () => {
    const body = rule('.slider-row:has(+ .btn)');
    expect(body).toMatch(/border-bottom:\s*none/);
    expect(body).toMatch(/padding-bottom:\s*0/);
  });

  it('the button follows a slider row at the group gap', () => {
    expect(rule('.slider-row + .btn')).toMatch(/margin-top:\s*var\(--space-stack-group\)/);
  });
});
