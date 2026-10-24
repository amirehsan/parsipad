// tests/saved-lesson-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/grammar/grammar.html"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * The grammar page opened from the Library with ?saved=<id>: it renders the
 * stored lesson and never asks the service worker for a new one.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'grammar/grammar.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body'), html.indexOf('<script type="module"'))
  .replace(/^<body[^>]*>/, '');

// The page derives a lesson's favorite id from its texts; reopening must
// reproduce the same id so the Save toggle finds the stored record.
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

const GRAMMAR_ID = `grammar_${hashText('I went home' + 'من به خانه رفتم')}`;
const grammarFav = {
  id: GRAMMAR_ID, type: 'grammar', originalText: 'I went home', savedText: 'من به خانه رفتم', direction: 'en-to-fa',
  lesson: { title: 'Past simple', points: [{ title: 'Regular and irregular verbs', explanation: 'Went is irregular.' }], relatedPatterns: ['Past continuous'] },
  timestamp: 1
};

let store;
let sendMessage;
let initListeners;

async function openGrammar(search, favorites) {
  store = { favorites };
  sendMessage = vi.fn().mockResolvedValue({ error: 'GRAMMAR_TIMEOUT' });
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          const keys = Array.isArray(key) ? key : [key];
          const out = {};
          for (const k of keys) if (k in store) out[k] = structuredClone(store[k]);
          return out;
        }),
        set: vi.fn(async (items) => { Object.assign(store, structuredClone(items)); })
      }
    },
    runtime: { sendMessage }
  };
  // Each import registers its own DOMContentLoaded handler; keep them so
  // afterEach can drop them and one test never runs another's page.
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
    if (type === 'DOMContentLoaded') initListeners.push(handler);
    return add(type, handler, options);
  });
  history.replaceState(null, '', `/grammar/grammar.html${search}`);
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../grammar/grammar.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => {
    expect($('#lesson-content').hidden && $('#error-section').hidden).toBe(false);
  });
}

const $ = (selector) => document.querySelector(selector);

beforeEach(() => {
  initListeners = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const handler of initListeners) document.removeEventListener('DOMContentLoaded', handler);
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('grammar page: a saved lesson', () => {
  it('renders the stored lesson and sends no runtime message', async () => {
    await openGrammar(`?saved=${GRAMMAR_ID}`, [grammarFav]);
    expect($('#lesson-content').hidden).toBe(false);
    expect($('#error-section').hidden).toBe(true);
    expect($('#original-text').textContent).toBe('I went home');
    expect($('#translation-text').textContent).toBe('من به خانه رفتم');
    expect(document.body.textContent).toContain('Regular and irregular verbs');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows the lesson as saved, and the Save toggle still removes it', async () => {
    await openGrammar(`?saved=${GRAMMAR_ID}`, [grammarFav]);
    expect($('#save-btn .star-filled').style.display).toBe('block');
    $('#save-btn').click();
    await vi.waitFor(() => expect($('#save-btn .star-outline').style.display).toBe('block'));
    expect(store.favorites).toEqual([]);
  });

  it('renders a lesson saved with no translation without an error', async () => {
    await openGrammar(`?saved=${GRAMMAR_ID}`, [{ ...grammarFav, savedText: '' }]);
    expect($('#lesson-content').hidden).toBe(false);
    expect($('#original-text').textContent).toBe('I went home');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('says so, links back to the Lessons tab and hides retry when the lesson is gone', async () => {
    await openGrammar('?saved=grammar_gone', [grammarFav]);
    expect($('#error-section').hidden).toBe(false);
    expect($('#error-message').textContent).toBe(translations.en.savedLessonMissing);
    expect($('#error-library-link').hidden).toBe(false);
    expect($('#error-library-link').getAttribute('href')).toBe('../library/library.html?tab=lessons');
    expect($('#retry-btn').hidden).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('treats a saved id that is not a grammar lesson as missing', async () => {
    const translation = { id: 'fav_1', type: 'translation', originalText: 'Hello', savedText: 'سلام', direction: 'en-fa', timestamp: 1 };
    await openGrammar('?saved=fav_1', [translation]);
    expect($('#error-message').textContent).toBe(translations.en.savedLessonMissing);
    expect($('#retry-btn').hidden).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps retry for an ordinary failure', async () => {
    await openGrammar('?original=Hello&translation=Salam&direction=en-to-fa', []);
    expect($('#error-section').hidden).toBe(false);
    expect($('#retry-btn').hidden).toBe(false);
    expect($('#error-library-link').hidden).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
