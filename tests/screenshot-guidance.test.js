import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { screenshotGuidance, screenshotCaptureFailed } from '../popup/screenshot-guidance.js';

/**
 * A click inside the side panel does not grant activeTab, so captureVisibleTab
 * fails on most tabs and the worker replies { error }. The panel must say what
 * to do instead of silently doing nothing.
 */
const root = path.resolve(__dirname, '..');
const popupJs = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');

describe('screenshotCaptureFailed', () => {
  it('treats an error reply, an empty reply and a missing data URL as failures', () => {
    expect(screenshotCaptureFailed({ error: 'Either the activeTab permission' })).toBe(true);
    expect(screenshotCaptureFailed(undefined)).toBe(true);
    expect(screenshotCaptureFailed({})).toBe(true);
    expect(screenshotCaptureFailed({ screenshotDataUrl: '' })).toBe(true);
  });

  it('accepts a reply that carries the capture', () => {
    expect(screenshotCaptureFailed({ screenshotDataUrl: 'data:image/png;base64,AAAA' })).toBe(false);
  });
});

describe('screenshotGuidance', () => {
  it('names the bound shortcut and the context menu item', () => {
    const text = screenshotGuidance('en', 'Alt+S');
    expect(text).toContain('Alt+S');
    expect(text).toContain('Screenshot & Translate');
  });

  it('falls back to the shortcut-free wording when nothing is bound', () => {
    const text = screenshotGuidance('en', '');
    expect(text).not.toContain('{shortcut}');
    expect(text).toContain('Screenshot & Translate');
    expect(screenshotGuidance('en', undefined)).toBe(text);
  });

  it('is localized in Persian with and without a shortcut', () => {
    expect(screenshotGuidance('fa', 'Alt+S')).toContain('Alt+S');
    expect(screenshotGuidance('fa', 'Alt+S')).not.toBe(screenshotGuidance('en', 'Alt+S'));
    expect(screenshotGuidance('fa', '')).not.toBe(screenshotGuidance('en', ''));
    for (const key of ['screenshotNeedsAccess', 'screenshotNeedsAccessShortcut']) {
      expect(translations.en[key], `en.${key}`).toBeTruthy();
      expect(translations.fa[key], `fa.${key}`).toBeTruthy();
    }
  });
});

describe('popup screenshot handler', () => {
  const start = popupJs.indexOf('async function handleScreenshotTranslate');
  const body = popupJs.slice(start, popupJs.indexOf('\nasync function handleImageTranslate', start));

  it('shows the guidance instead of silently ignoring a failed capture', () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toMatch(/screenshotCaptureFailed\(response\)/);
    expect(body).toMatch(/screenshotGuidance\(currentLang, /);
    expect(body).toMatch(/getBoundShortcuts\(\)/);
    expect(body).toMatch(/'screenshot-translate'/);
  });

  it('keeps the page-side path for a successful capture', () => {
    expect(body).toMatch(/action: 'START_SCREENSHOT_SELECT'/);
    expect(body).toMatch(/if \(!isPanel\) window\.close\(\);/);
  });
});
