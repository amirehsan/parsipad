// tests/card-parts.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { directionPill, sourceLine, translationLine, note, disclosure, wordList, truncationNotice, providerButton, actionsRow } from '../shared/card/parts.js';

const doc = () => document;

describe('directionPill', () => {
  it('shows the resolved direction and swaps on activation', () => {
    const onSwap = vi.fn();
    const el = directionPill({ direction: 'en-fa', onSwap, lang: 'en', doc: doc() });
    expect(el.textContent).toContain('EN');
    expect(el.textContent).toContain('FA');
    const swap = el.querySelector('button');
    expect(swap.getAttribute('aria-label')).toBe('Swap direction');
    swap.click();
    expect(onSwap).toHaveBeenCalledWith('fa');
  });

  it('swaps the other way from a Persian source', () => {
    const onSwap = vi.fn();
    const el = directionPill({ direction: 'fa-en', onSwap, lang: 'en', doc: doc() });
    el.querySelector('button').click();
    expect(onSwap).toHaveBeenCalledWith('en');
  });

  it('omits the swap control when no handler is given', () => {
    const el = directionPill({ direction: 'en-fa', lang: 'en', doc: doc() });
    expect(el.querySelector('button')).toBeNull();
  });
});

describe('sourceLine', () => {
  it('renders text, pronunciation and part of speech, each present only when supplied', () => {
    const full = sourceLine({ text: 'charge', pronunciation: '/tʃɑːrdʒ/', pos: 'verb', lang: 'en', doc: doc() });
    expect(full.querySelector('.pp-card-source-text').textContent).toBe('charge');
    expect(full.querySelector('.pp-card-source-ipa').textContent).toContain('rd');
    expect(full.querySelector('.pp-card-source-pos').textContent).toBe('verb');

    const bare = sourceLine({ text: 'charge', pronunciation: '', pos: '', lang: 'en', doc: doc() });
    expect(bare.querySelector('.pp-card-source-ipa')).toBeNull();
    expect(bare.querySelector('.pp-card-source-pos')).toBeNull();
  });

  it('takes its direction from the source text', () => {
    const fa = sourceLine({ text: 'کتاب', pronunciation: '', pos: '', lang: 'en', doc: doc() });
    expect(fa.getAttribute('dir')).toBe('rtl');
    expect(fa.getAttribute('lang')).toBe('fa');
  });

  it('offers an expand control only when a handler is given', () => {
    const onExpand = vi.fn();
    const long = sourceLine({ text: 'a '.repeat(60), pronunciation: '', pos: '', onExpand, lang: 'en', doc: doc() });
    const btn = long.querySelector('.pp-card-source-expand');
    expect(btn.textContent).toBe('Show full text');
    btn.click();
    expect(onExpand).toHaveBeenCalled();
    const short = sourceLine({ text: 'charge', pronunciation: '', pos: '', lang: 'en', doc: doc() });
    expect(short.querySelector('.pp-card-source-expand')).toBeNull();
  });
});

describe('translationLine', () => {
  it('renders the text with no lead, direction taken from the text itself', () => {
    const fa = translationLine({ text: 'جریمه کردن', doc: doc() });
    expect(fa.className).toBe('pp-card-translation');
    expect(fa.textContent).toBe('جریمه کردن');
    expect(fa.getAttribute('dir')).toBe('rtl');
    expect(fa.getAttribute('lang')).toBe('fa');

    const en = translationLine({ text: 'charge', doc: doc() });
    expect(en.getAttribute('dir')).toBe('ltr');
    expect(en.getAttribute('lang')).toBeNull();
  });
});

describe('note', () => {
  it('renders a lead word and the text, with direction from the text', () => {
    const el = note({ lead: 'Here', text: 'a fee for late returns', lang: 'en', doc: doc() });
    expect(el.querySelector('.pp-card-note-lead').textContent).toContain('Here');
    expect(el.textContent).toContain('a fee for late returns');
    expect(el.getAttribute('dir')).toBe('ltr');

    const fa = note({ lead: 'نکته', text: 'این یک نکته است', lang: 'fa', doc: doc() });
    expect(fa.getAttribute('dir')).toBe('rtl');
    expect(fa.getAttribute('lang')).toBe('fa');
  });
});

describe('disclosure', () => {
  it('is a button wired to aria-expanded and toggles its content', () => {
    const content = document.createElement('div');
    content.textContent = 'senses';
    const el = disclosure({ label: 'Other meanings (3)', expanded: false, content, lang: 'en', doc: doc(), idSuffix: 'x' });
    const btn = el.querySelector('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBeTruthy();
    expect(el.querySelector('#' + btn.getAttribute('aria-controls')).hidden).toBe(true);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#' + btn.getAttribute('aria-controls')).hidden).toBe(false);
  });

  it('reports toggles so a host can remember the state', () => {
    const onToggle = vi.fn();
    const el = disclosure({ label: 'Other meanings (2)', expanded: true, onToggle, content: document.createElement('div'), lang: 'en', doc: doc(), idSuffix: 'y' });
    const btn = el.querySelector('button');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('gives two disclosures rendered together distinct ids, so aria-controls resolves to the right content, even without an idSuffix', () => {
    const contentA = document.createElement('div');
    contentA.textContent = 'first';
    const contentB = document.createElement('div');
    contentB.textContent = 'second';
    const a = disclosure({ label: 'A', expanded: false, content: contentA, lang: 'en', doc: doc() });
    const b = disclosure({ label: 'B', expanded: false, content: contentB, lang: 'en', doc: doc() });
    document.body.append(a, b);

    const idA = a.querySelector('button').getAttribute('aria-controls');
    const idB = b.querySelector('button').getAttribute('aria-controls');
    expect(idA).not.toBe(idB);
    expect(document.getElementById(idA).textContent).toBe('first');
    expect(document.getElementById(idB).textContent).toBe('second');

    document.body.removeChild(a);
    document.body.removeChild(b);
  });
});

describe('wordList', () => {
  it('renders only when there are words', () => {
    const el = wordList({ label: 'Similar', words: ['هزینه', 'مبلغ'], doc: doc() });
    expect(el.textContent).toContain('Similar');
    expect(el.textContent).toContain('هزینه');
    expect(wordList({ label: 'Similar', words: [], doc: doc() })).toBeNull();
  });
});

describe('truncationNotice', () => {
  it('carries its own direction', () => {
    const el = truncationNotice({ text: 'ترجمه ناقص ماند.', doc: doc() });
    expect(el.getAttribute('dir')).toBe('rtl');
  });
});

describe('providerButton', () => {
  it('names the provider and opens settings', () => {
    const onOpenSettings = vi.fn();
    const el = providerButton({ provider: 'Gemini', onOpenSettings, lang: 'en', doc: doc() });
    expect(el.textContent).toBe('Gemini');
    expect(el.getAttribute('aria-label')).toContain('Gemini');
    el.click();
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('renders nothing without a provider', () => {
    expect(providerButton({ provider: '', lang: 'en', doc: doc() })).toBeNull();
  });
});

describe('actionsRow', () => {
  it('renders one labelled control per supplied action and skips the rest', () => {
    const onCopy = vi.fn();
    const el = actionsRow({ actions: [
      { key: 'cardCopy', onActivate: onCopy },
      { key: 'cardListen', onActivate: null }
    ], lang: 'en', doc: doc() });
    const buttons = el.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Copy');
    buttons[0].click();
    expect(onCopy).toHaveBeenCalled();
  });

  it('returns null when nothing is actionable', () => {
    expect(actionsRow({ actions: [{ key: 'cardCopy', onActivate: null }], lang: 'en', doc: doc() })).toBeNull();
  });
});
