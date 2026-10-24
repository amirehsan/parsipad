// tests/welcome-finish.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { finishTarget, WELCOME_SAMPLE } from '../welcome/finish.js';
const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
describe('welcome finish', () => {
  it('returns to Settings when opened from Settings', () => {
    expect(finishTarget('?from=settings')).toEqual({ type: 'navigate', url: '../settings/settings.html#about' });
    expect(finishTarget('')).toEqual({ type: 'close' });
  });
  it('Settings opens the guide in the same tab', () => {
    const js = read('settings/settings.js');
    expect(js).toMatch(/welcome\/welcome\.html\?from=settings/);
  });
  it('the sample is a real translation through the worker, marked as English', () => {
    const js = read('welcome/welcome.js'); const html = read('welcome/welcome.html');
    expect(WELCOME_SAMPLE).toMatch(/^[A-Za-z ,.]+$/);
    expect(js).toMatch(/action: ACTIONS\.TRANSLATE/);
    expect(html).toMatch(/id="try-it-source"[^>]*lang="en"/);
    expect(html).toMatch(/id="try-it-result"[^>]*aria-live="polite"/);
    expect(js).toMatch(/errorI18nKey\(/);
  });
});
