// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://www.example.com/article"}
// tests/content-a11y.test.js
// The in-page UI for a screen reader and for a reader who asked for less
// motion: the boxes announce their result once, not each skeleton line; the
// page progress is a progressbar with a status line; icons are decorative;
// the box chrome speaks the reader's language; nothing moves outside the
// no-preference guard; and Settings lists the two fixed in-page keys.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { functionBody } from './helpers/source.js';
import { loadContentScript } from './helpers/content-script.js';

const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const js = read('content/main.js');
const css = read('content/styles/index.js');
const outsideNoPreference = (s) => s.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

const en = translations.en;
const fa = translations.fa;

describe('in-page accessibility', () => {
  it('announces polish, dictionary and progress', () => {
    expect(js).toMatch(/class="parsipad-polish-content"[^>]*aria-live="polite"/);
    expect(js).toMatch(/class="parsipad-dictionary-content"[^>]*aria-live="polite"/);
    expect(js).toMatch(/role="progressbar"/);
    expect(js).toMatch(/aria-valuenow/);
    // A progressbar is not a live region; the line under it is.
    expect(js).toMatch(/class="parsipad-progress-text"[^>]*role="status"/);
  });

  it('hides decorative SVGs from assistive tech', () => {
    const svgs = js.match(/<svg[^>]*>/g) || [];
    expect(svgs.length).toBeGreaterThanOrEqual(5);
    for (const svg of svgs) {
      expect(svg).toMatch(/aria-hidden="true"|role="img"/);
      expect(svg).toMatch(/focusable="false"/);
    }
    for (const svg of read('content/reload-state.js').match(/<svg[^>]*>/g)) {
      expect(svg).toMatch(/aria-hidden="true"[^>]*focusable="false"/);
    }
    const toolbar = functionBody(js, 'createSelectionPopup');
    expect(toolbar).toMatch(/createElementNS\(ns, 'svg'\)/);
    expect(toolbar).toMatch(/svg\.setAttribute\('aria-hidden', 'true'\)/);
    expect(toolbar).toMatch(/svg\.setAttribute\('focusable', 'false'\)/);
  });

  it('runs no animation outside the motion guard', () => {
    const rest = outsideNoPreference(css);
    expect(rest).not.toMatch(/animation:\s*[a-z-]+\s+\d/);
    expect(rest).not.toMatch(/:hover[^{]*\{[^}]*transform:/);
    expect(rest).not.toMatch(/:active[^{]*\{[^}]*transform:/);
    expect(css).not.toMatch(/transition:\s*width/);
  });

  it('keeps every keyframe outside the guard, where the animations find it', () => {
    const rest = outsideNoPreference(css);
    const names = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(rest, name).toMatch(new RegExp(`@keyframes ${name}\\s*\\{`));
  });

  it('fills the progress bar with a transform, moved only inside the guard', () => {
    const update = functionBody(js, 'updatePageProgress');
    expect(update).toMatch(/scaleX\(/);
    expect(update).not.toMatch(/style\.width/);
    expect(update).toMatch(/aria-valuenow/);
    expect(update).toMatch(/aria-valuetext/);
    const progress = css.slice(css.indexOf('export function getPageProgressStyles'), css.indexOf('export function getPageConfirmStyles'));
    expect(progress).toMatch(/transition:\s*transform/);
    expect(outsideNoPreference(progress)).not.toMatch(/transition:[^;]*transform/);
  });

  it('lists Alt+B in the shortcuts section', () => {
    const html = read('settings/settings.html');
    const section = html.slice(html.indexOf('<section id="shortcuts"'));
    expect(section.slice(0, section.indexOf('</section>'))).toMatch(/data-i18n="shortcutBlockTranslate"/);
  });

  it('documents both in-page keys in their own group, as fixed keys', () => {
    const html = read('settings/settings.html');
    const start = html.indexOf('<section id="shortcuts"');
    const section = html.slice(start, html.indexOf('</section>', start));
    expect(section).toMatch(/class="shortcuts-title" data-i18n="pageShortcuts"/);
    expect(section).toMatch(/<kbd>Alt<\/kbd> \+ <kbd>B<\/kbd>[\s\S]*?data-i18n="shortcutBlockTranslate"/);
    expect(section).toMatch(/<kbd>Esc<\/kbd>[\s\S]*?data-i18n="shortcutEscape"/);
    expect(section).toMatch(/data-i18n="shortcutsFixedNote"/);
    for (const key of ['pageShortcuts', 'shortcutBlockTranslate', 'shortcutEscape', 'shortcutsFixedNote']) {
      expect(en[key], `en.${key}`).toMatch(/\S/);
      expect(fa[key], `fa.${key}`).toMatch(/\S/);
      expect(fa[key], `fa.${key} is translated`).not.toBe(en[key]);
      expect(`${en[key]} ${fa[key]}`, key).not.toMatch(/\u2014/);
    }
    expect(en.shortcutBlockTranslate).toContain(en.hoverTranslateLabel);
    expect(fa.shortcutBlockTranslate).toContain(fa.hoverTranslateLabel);
    expect(en.shortcutsFixedNote).toMatch(/chrome:\/\/extensions\/shortcuts/);
    expect(en.shortcutsFixedNote).toMatch(/Option/);
    expect(en.customizeShortcuts).toBe('Customize shortcuts');
    expect(en.shortcutNotSetHint).toContain(en.customizeShortcuts);
  });

  it('leaves no English chrome and no dead fallback in the box shells', () => {
    for (const literal of [
      "'ParsiPad translation'", "'ParsiPad polish'", "'ParsiPad dictionary'",
      'aria-label="Close', 'title="Close"', '>Polish<', '>Dictionary<',
      'aria-label="Translating"', '"Add to favorites"', 'aria-label="Copy', 'Copied!',
      "|| 'Loading...'"
    ]) {
      expect(js, literal).not.toContain(literal);
    }
    expect(js).not.toMatch(/^\s*Copy\s*$/m);
    expect(en.loadingLesson.endsWith('…')).toBe(true);
    expect(fa.loadingLesson.endsWith('…')).toBe(true);
  });
});

// One content script for the file: it registers its listeners once.
let h;
beforeAll(async () => {
  // A stand-in for window.navigation, which happy-dom lacks; the page
  // translation looks for it when the content script loads.
  Object.defineProperty(window, 'navigation', { value: new EventTarget(), configurable: true });
  h = await loadContentScript();
});

describe('the boxes, in the real content script', () => {

  beforeEach(() => {
    h.reset();
    h.setUiLanguage('fa');
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
  // Hold the worker's answer to `action` until the returned function is
  // called with it.
  const hold = (action) => {
    let finish;
    h.respond = (message) => (message.action === action
      ? new Promise((resolve) => { finish = resolve; })
      : undefined);
    return (reply) => finish(reply);
  };

  function expectQuietIcons(root) {
    const svgs = [...root.querySelectorAll('svg')];
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    }
  }

  it('translation box: names itself in Persian and reads the result once, not the skeleton', async () => {
    const finish = hold('TRANSLATE');
    h.onMessage({ action: 'SHOW_TRANSLATION', text: 'The cat sat on the mat.' });
    await settle();
    const dialog = box().querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-label')).toBe(fa.boxTranslationLabel);
    expect(box().querySelector('.parsipad-close').getAttribute('aria-label')).toBe(fa.cardClose);
    expect(box().querySelector('.parsipad-close').title).toBe(fa.cardClose);
    expect(box().querySelector('.parsipad-copy').getAttribute('aria-label')).toBe(fa.copyTranslation);
    expect(box().querySelector('.parsipad-copy').textContent.trim()).toBe(fa.copy);
    expect(box().querySelector('.parsipad-favorite').getAttribute('aria-label')).toBe(fa.addToFavorites);
    const content = box().querySelector('.parsipad-content');
    expect(content.getAttribute('aria-live')).toBe('polite');
    expect(content.getAttribute('aria-busy')).toBe('true');
    expect(content.querySelector('.parsipad-loading').getAttribute('aria-label')).toBe(fa.translating);
    expectQuietIcons(box());

    finish({ translation: 'گربه روی حصیر نشست.', direction: 'en-fa', mode: 'sentence', sourceText: 'The cat sat on the mat.', provider: 'claude' });
    await settle();
    expect(content.querySelector('.parsipad-loading')).toBeNull();
    expect(content.hasAttribute('aria-busy')).toBe(false);
    expect(content.getAttribute('aria-live')).toBe('polite');
  });

  it('polish box: localized chrome, a polite region that is busy while it loads', async () => {
    const finish = hold('POLISH');
    h.onMessage({ action: 'SHOW_POLISH', text: 'make this better' });
    await settle();
    expect(box().querySelector('[role="dialog"]').getAttribute('aria-label')).toBe(fa.boxPolishLabel);
    expect(box().querySelector('.parsipad-close').getAttribute('aria-label')).toBe(fa.cardClose);
    expect(box().querySelector('.parsipad-badge-polish').textContent).toBe(fa.polish);
    expect(box().querySelector('.parsipad-logo-icon')?.getAttribute('alt') ?? '').toBe('');
    const content = box().querySelector('.parsipad-polish-content');
    expect(content.getAttribute('aria-live')).toBe('polite');
    expect(content.getAttribute('aria-busy')).toBe('true');
    expect([...content.querySelectorAll('.parsipad-polish-title')].map((e) => e.textContent))
      .toEqual([fa.professional, fa.conversational, fa.concise]);

    finish({ professional: 'Please improve this.', conversational: 'Make it better.', concise: 'Improve.', provider: 'claude' });
    await settle();
    expect(content.hasAttribute('aria-busy')).toBe(false);
    expect([...content.querySelectorAll('.parsipad-polish-copy')].map((b) => b.getAttribute('aria-label')))
      .toEqual([fa.copy, fa.copy, fa.copy]);
    expect(content.querySelector('.parsipad-polish-favorite').getAttribute('aria-label')).toBe(fa.addToFavorites);
    expect(content.querySelector('.parsipad-polish-regenerate').getAttribute('aria-label')).toBe(fa.regenerate);
    expectQuietIcons(box());
  });

  it('dictionary box: localized chrome, a polite region that is busy while it loads', async () => {
    const finish = hold('DICTIONARY_LOOKUP');
    h.onMessage({ action: 'SHOW_DICTIONARY', word: 'serendipity' });
    await settle();
    expect(box().querySelector('[role="dialog"]').getAttribute('aria-label')).toBe(fa.boxDictionaryLabel);
    expect(box().querySelector('.parsipad-close').getAttribute('aria-label')).toBe(fa.cardClose);
    expect(box().querySelector('.parsipad-badge-dictionary').textContent).toBe(fa.dictionary);
    expect(box().querySelector('.parsipad-logo-icon')?.getAttribute('alt') ?? '').toBe('');
    const content = box().querySelector('.parsipad-dictionary-content');
    expect(content.getAttribute('aria-live')).toBe('polite');
    expect(content.getAttribute('aria-busy')).toBe('true');

    finish({
      word: 'serendipity',
      definitions: [{ meaning: 'a happy accident' }],
      synonyms: ['chance'],
      translation: 'خوش‌اقبالی',
      targetLang: 'fa',
      provider: 'claude'
    });
    await settle();
    expect(content.hasAttribute('aria-busy')).toBe(false);
    expect(content.querySelector('.parsipad-dict-copy-translation').getAttribute('aria-label')).toBe(fa.copyTranslation);
    expect(content.querySelector('.parsipad-dict-favorite-translation').getAttribute('aria-label')).toBe(fa.addToFavorites);
    expectQuietIcons(box());
  });

  it('an error is read once: by the polite region, with no alert role of its own', async () => {
    h.respond = (message) => (message.action === 'POLISH' ? { error: 'cut off', errorCode: 'TRUNCATED' } : undefined);
    h.onMessage({ action: 'SHOW_POLISH', text: 'make this better' });
    await settle();
    const content = box().querySelector('.parsipad-polish-content');
    expect(content.querySelector('.parsipad-error')).not.toBeNull();
    expect(content.querySelector('[role="alert"]')).toBeNull();
    expect(content.getAttribute('aria-live')).toBe('polite');
    expect(content.hasAttribute('aria-busy')).toBe(false);
  });

  it('the reload state is read once: the polite region stands aside for its alert', async () => {
    // The worker relays Chrome's words when the extension was reloaded
    // under the page.
    h.respond = (message) => (['TRANSLATE', 'POLISH', 'DICTIONARY_LOOKUP'].includes(message.action)
      ? { error: 'Error: Extension context invalidated.', errorCode: 'UNKNOWN' }
      : undefined);
    for (const [message, selector] of [
      [{ action: 'SHOW_TRANSLATION', text: 'The cat sat on the mat.' }, '.parsipad-content'],
      [{ action: 'SHOW_POLISH', text: 'make this better' }, '.parsipad-polish-content'],
      [{ action: 'SHOW_DICTIONARY', word: 'serendipity' }, '.parsipad-dictionary-content']
    ]) {
      h.onMessage(message);
      await settle();
      const content = box().querySelector(selector);
      expect(content.querySelector('[role="alert"]'), message.action).not.toBeNull();
      expect(content.getAttribute('aria-live'), message.action).toBe('off');
      expect(content.hasAttribute('aria-busy'), message.action).toBe(false);
    }
  });
});

describe('the page progress, in the real content script', () => {
  beforeEach(() => {
    h.reset();
    h.setUiLanguage('fa');
    h.store.set('confirm_page_translate', false);
    document.body.innerHTML = Array.from({ length: 45 }, (_, i) => `<p>Paragraph ${i + 1}.</p>`).join('');
  });

  afterEach(() => {
    document.getElementById('parsipad-page-toggle')?.remove();
  });

  it('is a named progressbar with a status line, kept in step', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const answer = h.answer;
    h.answer = (msg, port) => (h.ports.indexOf(port) === 1 ? gate.then(() => answer(msg)) : answer(msg));
    h.onMessage({ action: 'TRANSLATE_PAGE' });
    await vi.waitFor(() => expect(h.ports).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const root = h.roots.get(document.getElementById('parsipad-page-progress'));
    const bar = root.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('33');
    const status = root.querySelector('.parsipad-progress-text');
    expect(status.getAttribute('role')).toBe('status');
    expect(bar.getAttribute('aria-valuetext')).toBe(status.textContent);
    const labelledBy = bar.getAttribute('aria-labelledby');
    expect(root.querySelector(`#${labelledBy}`).textContent).toBe(fa.translatingPage);
    expect(root.querySelector('.parsipad-progress-bar').style.transform).toBe('scaleX(0.33)');
    expect(root.querySelector('.parsipad-progress-logo')?.getAttribute('alt') ?? '').toBe('');
    expect(root.querySelector('.parsipad-progress-cancel').textContent).toBe(fa.cancel);
    release();
    await vi.waitFor(() => expect(document.getElementById('parsipad-page-progress')).toBeNull());

    const toggle = h.roots.get(document.getElementById('parsipad-page-toggle')).querySelector('button');
    expect(toggle.getAttribute('aria-label')).toBe(fa.showOriginal);
    expectQuiet(toggle);
  });

  function expectQuiet(el) {
    const svg = el.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  }
});
