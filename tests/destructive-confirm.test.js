// tests/destructive-confirm.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * Clearing a key, replacing data on import and resetting stats all used to
 * act on the first click. Each now asks first.
 */
const rootDir = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(rootDir, 'settings/settings.js'), 'utf8');
const popup = fs.readFileSync(path.join(rootDir, 'popup/popup.js'), 'utf8');

describe('destructive actions ask first', () => {
  it('clear API key confirms before removing', () => {
    const body = settings.slice(settings.indexOf('async function handleClearApiKey'));
    const askAt = body.indexOf("t('confirmClearApiKey'");
    expect(askAt).toBeGreaterThan(-1);
    expect(askAt).toBeLessThan(body.indexOf('removeProviderApiKey('));
  });

  it('replace import confirms before writing', () => {
    expect(settings).toMatch(/if \(isReplace && !confirm\(t\('confirmReplaceImport'/);
  });

  it('reset stats goes through the two-tap confirm', () => {
    expect(popup).toMatch(/attachTwoStageConfirm\(resetStatsBtn,/);
    expect(popup).not.toMatch(/resetStatsBtn\.addEventListener\('click'/);
  });

  it('the confirmation strings exist in both locales', () => {
    for (const key of ['confirmClearApiKey', 'confirmReplaceImport']) {
      expect(translations.en[key], `en.${key}`).toBeTruthy();
      expect(translations.fa[key], `fa.${key}`).toBeTruthy();
    }
    expect(translations.en.confirmClearApiKey).toMatch(/\{provider\}/);
  });
});
