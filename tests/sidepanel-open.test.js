import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const popupJs = read('popup/popup.js');
const popupHtml = read('popup/popup.html');
const panelHtml = read('sidepanel/sidepanel.html');

describe('opening the side panel from the popup', () => {
  it('has the header button in both pages with a translated label', () => {
    for (const html of [popupHtml, panelHtml]) {
      expect(html).toMatch(/id="open-sidepanel-btn"[^>]*data-i18n-title="openInSidebar"/);
    }
    expect(translations.en.openInSidebar).toBeTruthy();
    expect(translations.fa.openInSidebar).toBeTruthy();
  });

  it('has the context menu title in both locales', () => {
    for (const locale of ['en', 'fa']) {
      const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
      expect(messages.ctxOpenSidePanel?.message, locale).toBeTruthy();
    }
  });

  it('opens the panel before any other await in the click handler', () => {
    const start = popupJs.indexOf("openSidePanelBtn.addEventListener('click'");
    expect(start).toBeGreaterThan(-1);
    const body = popupJs.slice(start, popupJs.indexOf('\n  });', start));
    expect(body.indexOf('chrome.windows.getCurrent')).toBeGreaterThan(-1);
    expect(body.indexOf('chrome.windows.getCurrent')).toBeLessThan(body.indexOf('chrome.sidePanel.open'));
    const beforeOpen = body.slice(0, body.indexOf('await chrome.sidePanel.open'));
    expect(beforeOpen.match(/await /g)).toHaveLength(1);
  });
});

describe('closing the popup', () => {
  // The popup script also runs inside the side panel, where closing the window
  // would dismiss the panel the user is working in.
  it('never closes the side panel', () => {
    const all = popupJs.match(/window\.close\(\)/g) || [];
    const guarded = popupJs.match(/if \(!isPanel\) window\.close\(\);/g) || [];
    expect(all.length).toBeGreaterThan(0);
    // The one unguarded close belongs to the "Open in sidebar" handler: the
    // popup should go away once the panel is up. That button is hidden in the panel.
    expect(guarded).toHaveLength(all.length - 1);
  });
});
