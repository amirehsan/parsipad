import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

const root = path.resolve(__dirname, '..');

describe('permission justification for the content script', () => {
  const text = fs.readFileSync(path.join(root, 'store-assets/PERMISSION-JUSTIFICATIONS.txt'), 'utf8');
  const start = text.indexOf('Content script on <all_urls>');
  const paragraph = text.slice(start, text.indexOf('=====', start));

  it('does not claim the content script reads no page content', () => {
    expect(start).toBeGreaterThan(-1);
    expect(paragraph).not.toMatch(/does\s+not\s+read,\s+collect\s+or\s+transmit\s+page\s+content/);
  });

  it('says what happens to a selection and where it stops', () => {
    expect(paragraph).toMatch(/selection/i);
    expect(paragraph).toMatch(/form\s+fields/);
    expect(paragraph).toMatch(/2000\s+characters/);
    expect(paragraph).toMatch(/side\s+panel/);
    expect(paragraph).toMatch(/never\s+leaves\s+the\s+browser/);
    expect(paragraph).toMatch(/AI\s+provider\s+only\s+when/);
  });
});

describe('Persian key help copy', () => {
  it('calls the Gemini free allowance a quota, not a tier', () => {
    expect(translations.fa.keyHelpGeminiCost).toContain('سهمیه رایگان');
    expect(translations.fa.keyHelpGeminiCost).not.toContain('سطح رایگان');
  });
});
