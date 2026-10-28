import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isFirefox, openSidebar, storeReviewsUrl, openShortcutSettings, browserNewTabUrl
} from '../lib/platform.js';

/**
 * lib/platform.js is the one place that knows which browser it runs in. Each
 * stub mirrors what that browser really exposes: Chrome has chrome.sidePanel
 * and no `browser` global, Firefox has `browser.sidebarAction` and no
 * chrome.sidePanel.
 */

function stubChrome(base) {
  delete globalThis.browser;
  globalThis.chrome = {
    runtime: { getURL: (p = '') => base + p },
    sidePanel: { open: vi.fn(async () => {}) },
    tabs: { create: vi.fn(async () => ({})) },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) }
  };
}

function stubFirefox() {
  globalThis.chrome = {
    runtime: { getURL: (p = '') => 'moz-extension://abc/' + p },
    tabs: { create: vi.fn(async () => ({})) }
  };
  globalThis.browser = {
    sidebarAction: { open: vi.fn(async () => {}) },
    commands: { openShortcutSettings: vi.fn(async () => {}) }
  };
}

afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.browser;
});

describe('isFirefox', () => {
  it('is Firefox only when the extension URL is moz-extension', () => {
    stubChrome('chrome-extension://abc/');
    expect(isFirefox()).toBe(false);
    stubChrome('moz-extension://abc/');
    expect(isFirefox()).toBe(true);
  });

  it('is not Firefox, and does not throw, when the extension context is gone', () => {
    // An orphaned content script after an extension reload throws on getURL,
    // and i18n asks this on every lookup.
    globalThis.chrome = { runtime: { getURL: () => { throw new Error('Extension context invalidated.'); } } };
    expect(isFirefox()).toBe(false);
    delete globalThis.chrome;
    expect(isFirefox()).toBe(false);
  });
});

describe('openSidebar', () => {
  it("opens Chrome's panel for a tab, or else for a window", async () => {
    stubChrome('chrome-extension://abc/');
    expect(await openSidebar({ tabId: 7 })).toBe(true);
    expect(chrome.sidePanel.open).toHaveBeenLastCalledWith({ tabId: 7 });
    await openSidebar({ windowId: 3 });
    expect(chrome.sidePanel.open).toHaveBeenLastCalledWith({ windowId: 3 });
  });

  it("opens Firefox's sidebar synchronously, before the returned promise settles", async () => {
    stubFirefox();
    const opening = openSidebar({ windowId: 3 });
    // The call has to happen inside the click's user action, so it cannot
    // wait for anything first.
    expect(browser.sidebarAction.open).toHaveBeenCalledTimes(1);
    expect(await opening).toBe(true);
  });

  it('resolves false where there is no sidebar API at all', async () => {
    globalThis.chrome = { runtime: { getURL: (p = '') => 'chrome-extension://abc/' + p } };
    expect(await openSidebar({ tabId: 1 })).toBe(false);
  });
});

describe('links into the browser', () => {
  it("names each browser's own review page", () => {
    stubChrome('chrome-extension://abc/');
    expect(storeReviewsUrl()).toBe('https://chromewebstore.google.com/detail/parsipad/kmifhjlofnblfogkjjcmhlmcecghhfbp/reviews');
    stubFirefox();
    expect(storeReviewsUrl()).toBe('https://addons.mozilla.org/firefox/addon/parsipad/reviews/');
  });

  it('opens shortcut settings the way each browser allows', async () => {
    stubChrome('chrome-extension://abc/');
    await openShortcutSettings();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
    stubFirefox();
    await openShortcutSettings();
    expect(browser.commands.openShortcutSettings).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("names the browser's own New Tab", () => {
    stubChrome('chrome-extension://abc/');
    expect(browserNewTabUrl()).toBe('chrome://new-tab-page/');
    stubFirefox();
    expect(browserNewTabUrl()).toBe('about:home');
  });
});
