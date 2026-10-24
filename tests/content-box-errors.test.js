// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// What the translation, polish and dictionary boxes say when a request
// fails, in the real content script: a page whose extension was reloaded
// under it offers to reload the page, every known failure is said in the
// reader's language with a tone chosen by its code, and the rating line is
// asked for only once a translation is on screen.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { translations } from '../lib/i18n.js';
import { loadContentScript } from './helpers/content-script.js';

const en = translations.en;
const fa = translations.fa;

let h;

beforeAll(async () => {
  h = await loadContentScript();
});

beforeEach(() => {
  h.reset();
  h.setUiLanguage('en');
});

afterEach(() => {
  document.getElementById('parsipad-host')?.remove();
});

const settle = async (rounds = 5) => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const box = () => {
  const host = document.getElementById('parsipad-host');
  return host ? h.roots.get(host) : null;
};
const reloadButton = () => box()?.querySelector('.parsipad-reload-page');
const alertText = () => box()?.querySelector('[role="alert"]')?.textContent ?? '';
const errorEl = () => box()?.querySelector('.parsipad-error');

const SENTENCE = 'The cat sat on the mat.';

describe('a page whose extension was reloaded under it', () => {
  // What the page logs as uncaught: a throw that escapes a click handler or
  // an async entry point.
  const uncaught = [];
  const onRejection = (reason) => uncaught.push(reason);
  const onError = (event) => uncaught.push(event.error ?? event.message);

  beforeAll(() => {
    process.on('unhandledRejection', onRejection);
    window.addEventListener('error', onError);
  });

  afterAll(() => {
    process.off('unhandledRejection', onRejection);
    window.removeEventListener('error', onError);
  });

  beforeEach(() => {
    uncaught.length = 0;
    h.enableToolbar();
    // A fresh page has not loaded the Persian faces yet, so the first box
    // asks for their URLs.
    document.getElementById('parsipad-persian-font')?.remove();
    document.body.innerHTML = '<p id="text">serendipity is a happy accident</p><p id="passage">First line.<br>Second line.</p>';
  });

  afterEach(() => {
    document.getElementById('parsipad-selection-popup')?.remove();
    document.getSelection().removeAllRanges();
  });

  // Select text, wait for the toolbar, then lose the extension under the
  // page and press one of the toolbar's buttons.
  async function pressAfterReload(action, { id = 'text', length } = {}) {
    const node = document.getElementById(id);
    const range = document.createRange();
    range.setStart(node.firstChild, 0);
    if (length) range.setEnd(node.firstChild, length);
    else range.setEnd(node.lastChild, node.lastChild.textContent.length);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 350));

    const toolbar = document.getElementById('parsipad-selection-popup');
    expect(toolbar, 'toolbar').not.toBeNull();
    const button = h.roots.get(toolbar).querySelector(`[data-action="${action}"]`);
    expect(button, action).not.toBeNull();

    h.invalidated = true;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
    await settle();
  }

  it('offers to reload the page from the translation box', async () => {
    await pressAfterReload('translate', { length: 11 + 9 });
    expect(alertText()).toBe(en.errorContextInvalidated);
    expect(reloadButton().textContent).toBe(en.blockTranslateReload);
    expect(box().querySelector('.parsipad-content .parsipad-loading')).toBeNull();
    expect(uncaught).toEqual([]);
  });

  it('offers it for a selection that spans lines', async () => {
    await pressAfterReload('translate', { id: 'passage' });
    expect(alertText()).toBe(en.errorContextInvalidated);
    expect(reloadButton()).not.toBeNull();
    expect(uncaught).toEqual([]);
  });

  it('offers it from the polish box', async () => {
    await pressAfterReload('polish', { length: 11 + 9 });
    expect(box().querySelector('.parsipad-polish-content [role="alert"]').textContent).toBe(en.errorContextInvalidated);
    expect(reloadButton()).not.toBeNull();
    expect(uncaught).toEqual([]);
  });

  it('offers it from the dictionary box', async () => {
    await pressAfterReload('dictionary', { length: 11 });
    expect(box().querySelector('.parsipad-dictionary-content [role="alert"]').textContent).toBe(en.errorContextInvalidated);
    expect(reloadButton()).not.toBeNull();
    expect(uncaught).toEqual([]);
  });

  it('says it in Persian in a Persian box', async () => {
    h.setUiLanguage('fa');
    await pressAfterReload('dictionary', { length: 11 });
    expect(alertText()).toBe(fa.errorContextInvalidated);
    expect(reloadButton().textContent).toBe(fa.blockTranslateReload);
    expect(uncaught).toEqual([]);
  });

  it('asks the worker nothing once the connection is gone', async () => {
    await pressAfterReload('translate', { length: 11 + 9 });
    expect(h.sent.filter((m) => ['TRANSLATE', 'POLISH', 'DICTIONARY_LOOKUP'].includes(m.action))).toEqual([]);
    expect(h.ports).toHaveLength(0);
  });

  it('recognizes the message when it arrives with no code of its own', async () => {
    h.respond = (message) => (message.action === 'TRANSLATE'
      ? { error: 'Error: Extension context invalidated.', errorCode: 'UNKNOWN' }
      : undefined);
    h.onMessage({ action: 'SHOW_TRANSLATION', text: SENTENCE });
    await settle();
    expect(reloadButton()).not.toBeNull();
  });
});

describe('a failed request', () => {
  const failWith = (response) => {
    h.respond = (message) => (['TRANSLATE', 'POLISH', 'DICTIONARY_LOOKUP'].includes(message.action) ? response : undefined);
  };

  it('is said in Persian in a Persian box, red for a lost connection', async () => {
    h.setUiLanguage('fa');
    failWith({ error: 'Check your internet connection.', errorCode: 'NETWORK' });
    h.onMessage({ action: 'SHOW_TRANSLATION', text: SENTENCE });
    await settle();
    expect(errorEl().textContent.trim()).toBe(fa.errorNetwork);
    expect(errorEl().classList.contains('is-destructive')).toBe(true);
    expect(errorEl().querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('stays amber for a reply that was cut off, in every box', async () => {
    h.setUiLanguage('fa');
    failWith({ error: 'The translation was cut off.', errorCode: 'TRUNCATED' });
    for (const message of [
      { action: 'SHOW_TRANSLATION', text: SENTENCE },
      { action: 'SHOW_POLISH', text: 'make this better' },
      { action: 'SHOW_DICTIONARY', word: 'serendipity' }
    ]) {
      h.onMessage(message);
      await settle();
      expect(errorEl().textContent.trim(), message.action).toBe(fa.errorTruncated);
      expect(errorEl().classList.contains('is-destructive'), message.action).toBe(false);
    }
  });

  it('is red in the polish and dictionary boxes too when the key is rejected', async () => {
    failWith({ error: 'Invalid API key. Please check settings.', errorCode: 'INVALID_API_KEY' });
    for (const message of [
      { action: 'SHOW_POLISH', text: 'make this better' },
      { action: 'SHOW_DICTIONARY', word: 'serendipity' }
    ]) {
      h.onMessage(message);
      await settle();
      expect(errorEl().textContent.trim(), message.action).toBe(en.errorInvalidApiKey);
      expect(errorEl().classList.contains('is-destructive'), message.action).toBe(true);
    }
  });

  it('offers Settings, in the reader\'s language, when no key is set', async () => {
    h.setUiLanguage('fa');
    failWith({ error: 'API key not set.', errorCode: 'API_KEY_NOT_SET' });
    h.onMessage({ action: 'SHOW_POLISH', text: 'make this better' });
    await settle();
    const button = box().querySelector('.parsipad-open-settings');
    expect(button.textContent).toBe(fa.openSettings);
    expect(errorEl().classList.contains('is-destructive')).toBe(true);
    button.click();
    expect(h.sent.some((m) => m.action === 'OPEN_OPTIONS')).toBe(true);
  });

  it('shows an unrecognized message as it came, in its own direction, as text', async () => {
    h.setUiLanguage('fa');
    failWith({ error: 'Provider said <img src=x onerror=alert(1)> no', errorCode: 'UNKNOWN' });
    h.onMessage({ action: 'SHOW_TRANSLATION', text: SENTENCE });
    await settle();
    const message = errorEl().querySelector('[dir="auto"]');
    expect(message.textContent).toBe('Provider said <img src=x onerror=alert(1)> no');
    expect(errorEl().querySelector('img')).toBeNull();
    expect(errorEl().classList.contains('is-destructive')).toBe(false);
  });

  it('says a thrown error by its code, not its English message', async () => {
    h.setUiLanguage('fa');
    h.respond = (message) => {
      if (message.action === 'DICTIONARY_LOOKUP') return Promise.reject(new Error('Failed to fetch'));
      return undefined;
    };
    h.onMessage({ action: 'SHOW_DICTIONARY', word: 'serendipity' });
    await settle();
    expect(errorEl().textContent.trim()).toBe(fa.errorNetwork);
    expect(errorEl().classList.contains('is-destructive')).toBe(true);
  });
});

describe('the rating line', () => {
  const result = { translation: 'گربه روی حصیر نشست.', direction: 'en-fa', mode: 'sentence', sourceText: SENTENCE, provider: 'claude' };

  it('is asked for only once the translation is on screen, and sits outside the live region', async () => {
    let finish;
    h.respond = (message) => {
      if (message.action === 'TRANSLATE') return new Promise((resolve) => { finish = resolve; });
      if (message.action === 'REVIEW_PROMPT_STATE') return { show: true };
      return undefined;
    };
    h.onMessage({ action: 'SHOW_TRANSLATION', text: SENTENCE });
    await settle();
    expect(box().querySelector('.parsipad-content .parsipad-loading')).not.toBeNull();
    expect(h.sent.filter((m) => m.action === 'REVIEW_PROMPT_STATE')).toHaveLength(0);

    finish(result);
    await settle();
    expect(h.sent.filter((m) => m.action === 'REVIEW_PROMPT_STATE')).toHaveLength(1);
    const line = box().querySelector('.parsipad-review-slot .parsipad-review-line');
    expect(line).not.toBeNull();
    expect(box().querySelector('.parsipad-content .parsipad-review-line')).toBeNull();
  });

  // A word picked out of a sentence on the page, translated from the context
  // menu: the box keeps the sentence around it for the Sentence control.
  function translateWordInSentence() {
    document.body.innerHTML = `<p id="cat">${SENTENCE}</p>`;
    const node = document.getElementById('cat').firstChild;
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 7);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    h.onMessage({ action: 'SHOW_TRANSLATION', text: 'cat' });
  }
  const wordResult = { translation: 'گربه', direction: 'en-fa', mode: 'word', sourceText: 'cat', provider: 'claude' };
  const sentenceAction = () => box().querySelector('[data-action="cardSentence"]');

  it('offers the sentence around a word picked out of it', async () => {
    h.respond = (message) => (message.action === 'TRANSLATE' ? wordResult : undefined);
    translateWordInSentence();
    await settle();
    expect(sentenceAction()).not.toBeNull();
    sentenceAction().click();
    await settle();
    const asked = h.sent.filter((m) => m.action === 'TRANSLATE');
    expect(asked.at(-1)).toMatchObject({ text: SENTENCE, mode: 'sentence' });
  });

  it('stays under a later skeleton but leaves with an error', async () => {
    let finishSentence;
    h.respond = (message) => {
      if (message.action === 'TRANSLATE' && message.mode === 'word') return wordResult;
      if (message.action === 'TRANSLATE') return new Promise((resolve) => { finishSentence = resolve; });
      if (message.action === 'REVIEW_PROMPT_STATE') return { show: true };
      return undefined;
    };
    translateWordInSentence();
    await settle();
    expect(box().querySelector('.parsipad-review-slot .parsipad-review-line')).not.toBeNull();

    sentenceAction().click();
    await settle();
    expect(box().querySelector('.parsipad-content .parsipad-loading')).not.toBeNull();
    expect(box().querySelector('.parsipad-review-slot .parsipad-review-line')).not.toBeNull();

    finishSentence({ error: 'Check your internet connection.', errorCode: 'NETWORK' });
    await settle();
    expect(errorEl()).not.toBeNull();
    expect(box().querySelector('.parsipad-review-slot .parsipad-review-line')).toBeNull();
  });

  it('closes quietly when Later is pressed after the extension was reloaded', async () => {
    h.respond = (message) => {
      if (message.action === 'TRANSLATE') return result;
      if (message.action === 'REVIEW_PROMPT_STATE') return { show: true };
      return undefined;
    };
    h.onMessage({ action: 'SHOW_TRANSLATION', text: SENTENCE });
    await settle();
    const later = box().querySelector('.parsipad-review-later');
    h.invalidated = true;
    const errors = [];
    const onError = (event) => errors.push(event.error ?? event.message);
    window.addEventListener('error', onError);
    try {
      expect(() => later.click()).not.toThrow();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
    expect(box().querySelector('.parsipad-review-line')).toBeNull();
  });

  it('is not shown in a box that closed while the worker was asked', async () => {
    let answerReview;
    h.respond = (message) => {
      if (message.action === 'TRANSLATE') return result;
      if (message.action === 'REVIEW_PROMPT_STATE') return new Promise((resolve) => { answerReview = resolve; });
      return undefined;
    };
    h.onMessage({ action: 'SHOW_TRANSLATION', text: SENTENCE });
    await settle();
    const firstBox = box();
    document.getElementById('parsipad-host').remove();
    answerReview({ show: true });
    await settle();
    expect(firstBox.querySelector('.parsipad-review-line')).toBeNull();
  });
});
