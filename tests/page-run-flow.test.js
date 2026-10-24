// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// What a whole-page translation keeps, in the real content script: a failed
// batch leaves the rest translated and can be retried on its own, a stop
// (Escape, the Cancel button, the popup) keeps what finished, a navigation
// discards a run without touching the new page, and a real route change
// puts the original text back.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { translations } from '../lib/i18n.js';
import { loadContentScript, translateLines } from './helpers/content-script.js';

const en = translations.en;
const fa = translations.fa;

let h;
// A stand-in for window.navigation, which happy-dom lacks; the content
// script must find it when it loads.
const navigation = new EventTarget();
// History.prototype.pushState is the browser's own; the content script
// patches only the history instance. Calling the original changes the URL
// as a page script in the main world would, unseen by the patch.
const unpatchedPushState = (url) => History.prototype.pushState.call(history, {}, '', url);

beforeAll(async () => {
  Object.defineProperty(window, 'navigation', { value: navigation, configurable: true });
  h = await loadContentScript();
});

// Batches hold up to 20 text nodes: 45 paragraphs make three, of 20, 20, 5.
function paragraphs(count) {
  return Array.from({ length: count }, (_, i) => `<p id="p${i + 1}">Paragraph ${i + 1}.</p>`).join('');
}

beforeEach(() => {
  document.body.innerHTML = paragraphs(45);
  h.reset();
  // Most cases are about the run, not the question before it.
  h.store.set('confirm_page_translate', false);
});

afterEach(() => {
  history.pushState({}, '', '/reset');
  history.pushState({}, '', '/article');
  document.getElementById('parsipad-toast')?.remove();
  document.getElementById('parsipad-page-toggle')?.remove();
});

const text = (n) => document.getElementById(`p${n}`).textContent;
const overlayHost = () => document.getElementById('parsipad-page-progress');
const overlay = () => (overlayHost() ? h.roots.get(overlayHost()) : null);
const toastHost = () => document.getElementById('parsipad-toast');
const toast = () => (toastHost() ? h.roots.get(toastHost()) : null);
const toastMessage = () => toast()?.querySelector('.message')?.textContent ?? '';
const toastAction = () => toast()?.querySelector('.action');
const toggleButton = () => {
  const host = document.getElementById('parsipad-page-toggle');
  return host ? h.roots.get(host).querySelector('button') : null;
};

function translatePage() {
  h.onMessage({ action: 'TRANSLATE_PAGE' });
}

function pageState() {
  return h.onMessage({ action: 'GET_PAGE_TRANSLATION_STATE' });
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Answer the batch at port index `held` only when the returned release()
// is called.
function holdBatch(held) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  h.answer = (msg, port) => (h.ports.indexOf(port) === held ? gate.then(() => translateLines(msg)) : translateLines(msg));
  return () => release();
}

const failure = { type: 'error', message: 'Rate limit exceeded', code: 'RATE_LIMIT' };
const firstLine = (port) => port.started.text.split('\n')[0];
const escapeFrom = (target) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));

const fill = (template, values) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template);

describe('a batch that fails', () => {
  it('keeps the rest, says how many failed, and Retry failed sends only that batch, without asking', async () => {
    h.store.delete('confirm_page_translate');
    h.answer = (msg, port) => (h.ports.indexOf(port) === 1 ? failure : translateLines(msg));
    translatePage();
    const go = () => overlay()?.querySelector('[role="dialog"] [data-action="go"]');
    await vi.waitFor(() => expect(go()).toBeTruthy());
    go().click();

    await vi.waitFor(() => expect(toastMessage()).toBe(fill(en.pageTranslatePartial, { done: 2, total: 3, failed: 1 })));
    expect(h.ports).toHaveLength(3);
    expect(text(1)).toBe('FA:Paragraph 1.');
    expect(text(21)).toBe('Paragraph 21.');
    expect(text(45)).toBe('FA:Paragraph 45.');
    expect(pageState()).toEqual({ isTranslated: true, isTranslating: false, isShowingTranslated: true });
    expect(toggleButton()).not.toBeNull();
    expect(toast().querySelector('.message').getAttribute('role')).toBe('status');
    expect(toastAction().hidden).toBe(false);
    expect(toastAction().textContent).toBe(en.pageTranslateRetryFailed);

    const keyChecks = () => h.sent.filter((m) => m.action === 'CHECK_API_KEY').length;
    const checksBefore = keyChecks();
    toastAction().click();
    await vi.waitFor(() => expect(toastMessage()).toBe(en.pageTranslateDone));
    // One more request, for the failed batch only, and no question first.
    expect(h.ports).toHaveLength(4);
    expect(h.ports[3].started.text.split('\n')[0]).toBe('[1] Paragraph 21.');
    expect(h.ports[3].started.text.split('\n')).toHaveLength(20);
    expect(overlay()?.querySelector('[role="dialog"]') ?? null).toBeNull();
    expect(keyChecks()).toBe(checksBefore + 1);
    expect(text(1)).toBe('FA:Paragraph 1.');
    expect(text(21)).toBe('FA:Paragraph 21.');
    expect(toastAction().hidden).toBe(true);
  });

  it('when every batch fails, nothing reads as translated until a retry works', async () => {
    document.body.innerHTML = paragraphs(3);
    h.answer = () => failure;
    translatePage();
    await vi.waitFor(() => expect(toastMessage()).toBe(fill(en.pageTranslatePartial, { done: 0, total: 1, failed: 1 })));
    expect(pageState().isTranslated).toBe(false);
    expect(toggleButton()).toBeNull();

    h.answer = translateLines;
    toastAction().click();
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    expect(text(2)).toBe('FA:Paragraph 2.');
    expect(toggleButton()).not.toBeNull();
  });

  it('a dropped port without a stop counts as a failed batch', async () => {
    h.answer = (msg, port) => {
      if (h.ports.indexOf(port) !== 1) return translateLines(msg);
      // The service worker went away: the client reads that as ABORTED.
      return { type: 'error', message: 'Translation cancelled.', code: 'ABORTED' };
    };
    translatePage();
    await vi.waitFor(() => expect(toastMessage()).toBe(fill(en.pageTranslatePartial, { done: 2, total: 3, failed: 1 })));
  });

  it('a missing key keeps what finished and shows only the missing-key alert', async () => {
    h.answer = (msg, port) => (h.ports.indexOf(port) === 1
      ? { type: 'error', message: 'API key not configured', code: 'API_KEY_NOT_SET' }
      : translateLines(msg));
    translatePage();
    await vi.waitFor(() => expect(toastMessage()).toBe(en.apiKeyNotConfigured));
    expect(toast().querySelector('.message').getAttribute('role')).toBe('alert');
    expect(h.ports).toHaveLength(2);
    expect(text(1)).toBe('FA:Paragraph 1.');
    expect(text(21)).toBe('Paragraph 21.');
    expect(pageState().isTranslated).toBe(true);
    // No summary replaces it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(toastMessage()).toBe(en.apiKeyNotConfigured);
  });

  it('says the summary in Persian with Latin digits', async () => {
    h.setUiLanguage('fa');
    try {
      h.answer = (msg, port) => (h.ports.indexOf(port) === 1 ? failure : translateLines(msg));
      translatePage();
      await vi.waitFor(() => expect(toastMessage()).toBe(fill(fa.pageTranslatePartial, { done: 2, total: 3, failed: 1 })));
      expect(toastMessage()).toMatch(/2.*3.*1/);
      expect(toastAction().textContent).toBe(fa.pageTranslateRetryFailed);
    } finally {
      h.setUiLanguage('en');
    }
  });
});

describe('stopping a run', () => {
  it('Escape keeps the finished sections, says Stopped, and the page still gets its Escape', async () => {
    const release = holdBatch(1);
    let pageSawEscape = 0;
    const onPageEscape = (event) => { if (event.key === 'Escape') pageSawEscape++; };
    window.addEventListener('keydown', onPageEscape);
    try {
      translatePage();
      await vi.waitFor(() => expect(h.ports).toHaveLength(2));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await vi.waitFor(() => expect(toastMessage()).toBe(fill(en.pageTranslateStopped, { done: 1, total: 3 })));
      expect(pageSawEscape).toBe(1);
    } finally {
      window.removeEventListener('keydown', onPageEscape);
      release();
    }
    await settle();
    expect(h.ports).toHaveLength(2);
    expect(text(1)).toBe('FA:Paragraph 1.');
    expect(text(21)).toBe('Paragraph 21.');
    expect(pageState()).toEqual({ isTranslated: true, isTranslating: false, isShowingTranslated: true });
    expect(overlayHost()).toBeNull();
    expect(toggleButton()).not.toBeNull();
    // A stop is the user's choice: no Retry failed.
    expect(toastAction().hidden).toBe(true);
  });

  it('the Cancel button keeps the finished sections too', async () => {
    const release = holdBatch(1);
    try {
      translatePage();
      await vi.waitFor(() => expect(h.ports).toHaveLength(2));
      const cancel = overlay().querySelector('.parsipad-progress-cancel');
      expect(cancel.textContent).toBe(en.cancel);
      cancel.click();
      await vi.waitFor(() => expect(toastMessage()).toBe(fill(en.pageTranslateStopped, { done: 1, total: 3 })));
    } finally {
      release();
    }
    expect(text(1)).toBe('FA:Paragraph 1.');
  });

  it('Cancel from the popup keeps the finished sections too', async () => {
    const release = holdBatch(1);
    try {
      translatePage();
      await vi.waitFor(() => expect(h.ports).toHaveLength(2));
      h.onMessage({ action: 'CANCEL_PAGE_TRANSLATION' });
      await vi.waitFor(() => expect(toastMessage()).toBe(fill(en.pageTranslateStopped, { done: 1, total: 3 })));
    } finally {
      release();
    }
    expect(text(1)).toBe('FA:Paragraph 1.');
    expect(pageState().isTranslated).toBe(true);
  });

  it('Escape with no run going does nothing to page translation', async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(toastHost()).toBeNull();
    expect(pageState()).toEqual({ isTranslated: false, isTranslating: false, isShowingTranslated: false });
  });
});

describe('progress and the toggle', () => {
  it('counts sections and names the toggle in the interface language', async () => {
    const release = holdBatch(1);
    try {
      translatePage();
      await vi.waitFor(() => expect(h.ports).toHaveLength(2));
      expect(overlay().querySelector('.parsipad-progress-title').textContent).toBe(en.translatingPage);
      expect(en.translatingPage.endsWith('…')).toBe(true);
      expect(fa.translatingPage.endsWith('…')).toBe(true);
      expect(overlay().querySelector('.parsipad-progress-text').textContent)
        .toBe(fill(en.pageTranslateProgress, { n: 2, total: 3 }));
    } finally {
      release();
    }
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    const button = toggleButton();
    expect(button.getAttribute('aria-label')).toBe(en.showOriginal);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.title).toBe(en.showOriginal);
    button.click();
    expect(text(1)).toBe('Paragraph 1.');
    expect(button.getAttribute('aria-label')).toBe(en.showOriginal);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.title).toBe(en.showTranslated);
  });

  it('with confirmation off, goes straight to the progress card with no scrim', async () => {
    let open;
    h.keyCheckGate = new Promise((resolve) => { open = resolve; });
    translatePage();
    await settle();
    expect(overlay().querySelector('.parsipad-scrim')).toBeNull();
    expect(overlayHost().style.bottom).toBe('24px');
    expect(overlayHost().style.top).toBe('');
    expect(overlay().querySelector('[role="status"]').textContent).toBe(en.pagePreparing);
    open();
    await vi.waitFor(() => expect(h.ports.length).toBeGreaterThan(0));
    expect(overlay().querySelector('.parsipad-scrim')).toBeNull();
  });
});

describe('navigation', () => {
  it('a navigation mid-run applies nothing and says nothing', async () => {
    const release = holdBatch(1);
    translatePage();
    await vi.waitFor(() => expect(h.ports).toHaveLength(2));
    history.pushState({}, '', '/elsewhere');
    release();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(h.ports).toHaveLength(2);
    expect(text(1)).toBe('Paragraph 1.');
    expect(toastHost()).toBeNull();
    expect(toggleButton()).toBeNull();
    expect(overlayHost()).toBeNull();
    expect(pageState()).toEqual({ isTranslated: false, isTranslating: false, isShowingTranslated: false });
  });

  it('a route change while translated restores what is still on the page, and a detached node does not throw', async () => {
    document.body.innerHTML = paragraphs(3);
    translatePage();
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    const gone = document.getElementById('p2');
    gone.remove();
    const errors = [];
    const onError = (event) => errors.push(event.error ?? event.message);
    window.addEventListener('error', onError);
    try {
      history.pushState({}, '', '/next');
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
    expect(text(1)).toBe('Paragraph 1.');
    expect(document.getElementById('p1').hasAttribute('dir')).toBe(false);
    expect(document.getElementById('p1').hasAttribute('data-parsipad-translated')).toBe(false);
    // The SPA took it away; it is left alone.
    expect(gone.textContent).toBe('FA:Paragraph 2.');
    expect(toggleButton()).toBeNull();
    expect(pageState().isTranslated).toBe(false);
  });

  it('a hash change or a same-URL replaceState keeps the translation', async () => {
    document.body.innerHTML = paragraphs(3);
    translatePage();
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    history.pushState({}, '', '#section-2');
    history.replaceState({ scrolled: 1 }, '', location.href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await settle();
    expect(text(1)).toBe('FA:Paragraph 1.');
    expect(toggleButton()).not.toBeNull();
    expect(pageState().isTranslated).toBe(true);
  });

  it('a navigation closes a summary whose Retry would act on the old page', async () => {
    h.answer = (msg, port) => (h.ports.indexOf(port) === 1 ? failure : translateLines(msg));
    translatePage();
    await vi.waitFor(() => expect(toastAction()?.hidden).toBe(false));
    history.pushState({}, '', '/elsewhere');
    expect(toastHost()).toBeNull();
  });
});

describe('nothing finished is lost', () => {
  it('Retry failed stays on screen until the user acts on it or closes it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      h.answer = (msg, port) => (h.ports.indexOf(port) === 1 ? failure : translateLines(msg));
      translatePage();
      await vi.waitFor(() => expect(toastAction()?.hidden).toBe(false));
      // Well past the 10 s a toast normally stays.
      await vi.advanceTimersByTimeAsync(30000);
      expect(toastHost()).not.toBeNull();
      expect(toastAction().hidden).toBe(false);
      toast().querySelector('.close').click();
      expect(toastHost()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a summary with nothing to act on still closes itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      document.body.innerHTML = paragraphs(3);
      translatePage();
      await vi.waitFor(() => expect(toastMessage()).toBe(en.pageTranslateDone));
      await vi.advanceTimersByTimeAsync(11000);
      expect(toastHost()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Translate Page resumes the failed batch without asking, then toggles once all is done', async () => {
    h.store.delete('confirm_page_translate');
    h.answer = (msg, port) => (h.ports.indexOf(port) === 1 ? failure : translateLines(msg));
    translatePage();
    const go = () => overlay()?.querySelector('[role="dialog"] [data-action="go"]');
    await vi.waitFor(() => expect(go()).toBeTruthy());
    go().click();
    await vi.waitFor(() => expect(toastAction()?.hidden).toBe(false));
    const keyChecks = () => h.sent.filter((m) => m.action === 'CHECK_API_KEY').length;
    const checksBefore = keyChecks();

    // As the popup, the side panel, the shortcut and the context menu send it.
    translatePage();
    // The summary whose Retry this replaces goes at once.
    expect(toastHost()).toBeNull();
    await vi.waitFor(() => expect(toastMessage()).toBe(en.pageTranslateDone));
    expect(h.ports).toHaveLength(4);
    expect(firstLine(h.ports[3])).toBe('[1] Paragraph 21.');
    expect(overlay()?.querySelector('[role="dialog"]') ?? null).toBeNull();
    expect(keyChecks()).toBe(checksBefore + 1);
    expect(text(21)).toBe('FA:Paragraph 21.');

    // Complete now: Translate Page toggles to the original, with no request.
    translatePage();
    await settle();
    expect(h.ports).toHaveLength(4);
    expect(text(1)).toBe('Paragraph 1.');
    expect(pageState().isShowingTranslated).toBe(false);
  });

  it('Translate Page after a Stop sends only the sections that never finished', async () => {
    const release = holdBatch(1);
    try {
      translatePage();
      await vi.waitFor(() => expect(h.ports).toHaveLength(2));
      escapeFrom(document.body);
      await vi.waitFor(() => expect(toastMessage()).toBe(fill(en.pageTranslateStopped, { done: 1, total: 3 })));
    } finally {
      release();
    }
    translatePage();
    await vi.waitFor(() => expect(toastMessage()).toBe(en.pageTranslateDone));
    expect(h.ports).toHaveLength(4);
    expect(firstLine(h.ports[2])).toBe('[1] Paragraph 21.');
    expect(firstLine(h.ports[3])).toBe('[1] Paragraph 41.');
    expect(text(1)).toBe('FA:Paragraph 1.');
    expect(text(45)).toBe('FA:Paragraph 45.');
  });
});

describe('Escape and text fields', () => {
  it('Escape in a text field is left to the field; the run goes on', async () => {
    document.body.insertAdjacentHTML('afterbegin', '<input id="search" type="search">');
    const release = holdBatch(1);
    const search = document.getElementById('search');
    search.focus();
    translatePage();
    await vi.waitFor(() => expect(h.ports).toHaveLength(2));
    escapeFrom(search);
    await settle();
    expect(pageState().isTranslating).toBe(true);
    release();
    await vi.waitFor(() => expect(toastMessage()).toBe(en.pageTranslateDone));
    expect(h.ports).toHaveLength(3);
  });
});

describe('restoring after a route change', () => {
  it('a text node the SPA replaced inside a kept element still gets its element cleaned up', async () => {
    document.body.innerHTML = paragraphs(3);
    translatePage();
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    const kept = document.getElementById('p2');
    expect(kept.getAttribute('dir')).toBe('rtl');
    kept.firstChild.remove();
    kept.append('Fresh content.');
    history.pushState({}, '', '/next');
    expect(kept.textContent).toBe('Fresh content.');
    expect(kept.hasAttribute('dir')).toBe(false);
    expect(kept.hasAttribute('data-parsipad-translated')).toBe(false);
    expect(text(1)).toBe('Paragraph 1.');
  });

  it('a route change the page made in its own world is seen through window.navigation', async () => {
    document.body.innerHTML = paragraphs(3);
    translatePage();
    await vi.waitFor(() => expect(pageState().isTranslated).toBe(true));
    unpatchedPushState('/from-the-page');
    navigation.dispatchEvent(new Event('currententrychange'));
    expect(text(1)).toBe('Paragraph 1.');
    expect(toggleButton()).toBeNull();
    expect(pageState().isTranslated).toBe(false);
  });
});
