// tests/settings-shortcuts-css.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(__dirname, '..', 'settings/settings.css'), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[2] : '';
}

describe('Settings shortcut rows', () => {
  it('lay every row out on one grid with a fixed keys column', () => {
    const item = rule('.shortcut-item');
    expect(item).toMatch(/display:\s*grid/);
    expect(item).toMatch(/grid-template-columns:\s*var\(--shortcut-keys-width\)\s+minmax\(0,\s*1fr\)/);
    // space-between pushed short descriptions to the far edge, away from their keys.
    expect(item).not.toMatch(/space-between/);
  });

  it('start the note where the descriptions start', () => {
    const note = rule('.shortcuts-note');
    expect(note).toMatch(/padding-inline-start:\s*calc\([^;]*var\(--shortcut-keys-width\)/);
  });

  it('keep each key name left to right on a Persian page', () => {
    const kbd = rule('.shortcut-keys kbd');
    expect(kbd).toMatch(/direction:\s*ltr/);
    expect(kbd).toMatch(/unicode-bidi:\s*isolate/);
  });

  it('use the spacing tokens for row padding and gaps', () => {
    expect(rule('.shortcut-item')).toMatch(/padding:\s*var\(--space-2\)\s+var\(--space-stack-item\)/);
    expect(rule('.shortcuts-list')).toMatch(/gap:\s*var\(--space-2\)/);
  });
});
