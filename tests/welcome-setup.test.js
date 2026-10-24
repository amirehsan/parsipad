// tests/welcome-setup.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const html = read('welcome/welcome.html'); const js = read('welcome/welcome.js'); const css = read('welcome/welcome.css');
describe('welcome setup', () => {
  it('puts setup before features and keeps heading order', () => {
    expect(html.indexOf('id="setup"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="setup"')).toBeLessThan(html.indexOf('id="features"'));
    const headings = [...html.matchAll(/<h([1-6])/g)].map(m => Number(m[1]));
    for (let i = 1; i < headings.length; i++) expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(1);
  });
  it('tests the key and explains privacy and cost', () => {
    expect(js).toMatch(/ACTIONS\.TEST_API_KEY/);
    expect(js).toMatch(/describeKeyTest\(/);
    expect(js).toMatch(/renderKeyHelp\(/);
    expect(html).toMatch(/data-i18n="welcomePrivacyNote"/);
    expect(html).toMatch(/<label[^>]+for="api-key"/);
    expect(html).not.toMatch(/href="#"/);
  });
  it('has no hardcoded copy or transition: all', () => {
    expect(html).not.toMatch(/<h3 class="feature-title">[A-Z]/);
    expect(css).not.toMatch(/transition:\s*all/);
  });
});
