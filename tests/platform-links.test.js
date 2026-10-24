import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The links into a browser's own pages, and the store a rating goes to,
 * differ between Chrome and Firefox. lib/platform.js decides each one; these
 * pin that every caller asks it instead of hardcoding Chrome's answer.
 */
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function functionBody(src, signature) {
  const start = src.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('\n}\n', start));
}

describe('rating links', () => {
  it("point the popup's Rate link at this browser's store, so middle-click lands there too", () => {
    const init = functionBody(read('popup/popup.js'), 'async function init()');
    expect(init).toMatch(/reviewRateBtn\.href = storeReviewsUrl\(\)/);
  });

  it("point the Settings About link at this browser's store", () => {
    expect(read('settings/settings.html')).toMatch(/<a [^>]*id="about-rate-link"/);
    const init = functionBody(read('settings/settings.js'), 'async function init()');
    expect(init).toMatch(/about-rate-link[\s\S]*storeReviewsUrl\(\)|storeReviewsUrl\(\)[\s\S]*about-rate-link/);
  });

  it('open the right store from the floating box', () => {
    expect(read('background/service-worker.js')).toMatch(/chrome\.tabs\.create\(\{ url: storeReviewsUrl\(\) \}\)/);
  });
});

describe("the browser's own pages", () => {
  it('opens shortcut settings through the platform module', () => {
    const settings = read('settings/settings.js');
    expect(settings).toMatch(/openShortcutSettings\(\)/);
    expect(settings).not.toContain('chrome://extensions/shortcuts');
  });

  it('names chrome:// pages nowhere but in the platform module', () => {
    const files = ['background/service-worker.js', 'popup/popup.js', 'settings/settings.js', 'newtab/newtab.js',
      'sidepanel/panel.js', 'library/library.js'];
    for (const file of files) {
      const src = read(file);
      expect(src, file).not.toContain('chrome://new-tab-page');
      expect(src, file).not.toContain('chrome://extensions/shortcuts');
    }
  });
});
