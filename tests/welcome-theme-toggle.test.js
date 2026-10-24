// tests/welcome-theme-toggle.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The welcome page's theme toggle used Tailwind class names (`hidden
 * dark:block`) that no stylesheet in the extension defines, so both icons
 * rendered at once in light mode and the button read as a grey dot in dark.
 */
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'welcome/welcome.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'welcome/welcome.css'), 'utf8');

describe('welcome theme toggle', () => {
  it('uses stylesheet-defined icon classes, not Tailwind names', () => {
    expect(html).not.toMatch(/dark:block|dark:hidden/);
    expect(html).toMatch(/<button id="theme-toggle"[^>]*aria-label="Toggle theme"/);
    expect(html).toMatch(/class="theme-icon theme-icon-sun"/);
    expect(html).toMatch(/class="theme-icon theme-icon-moon"/);
  });

  it('shows exactly one icon per theme', () => {
    expect(css).toMatch(/\.theme-icon\s*\{[^}]*width:\s*20px/);
    expect(css).toMatch(/\.theme-icon-sun\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.dark \.theme-icon-sun\s*\{[^}]*display:\s*block/);
    expect(css).toMatch(/\.dark \.theme-icon-moon\s*\{[^}]*display:\s*none/);
  });
});
