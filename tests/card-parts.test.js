// tests/card-parts.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { directionPill, detectionNote, sourceLine, translationLine, note, disclosure, wordList, truncationNotice, providerButton, actionsRow, correctionLine, footer } from '../shared/card/parts.js';

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

describe('correctionLine', () => {
  it('shows what was selected and what it was corrected to, each with its own direction', () => {
    const el = correctionLine({ original: 'charge', corrected: 'change', lang: 'en', doc: doc() });
    expect(el.getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('.pp-card-correction-original').textContent).toBe('charge');
    expect(el.querySelector('.pp-card-correction-corrected').textContent).toBe('change');
  });
});

describe('footer', () => {
  it('composes the actions row and the provider button, omitting either side when empty', () => {
    const onCopy = vi.fn();
    const onOpenSettings = vi.fn();
    const el = footer({
      actions: [{ key: 'cardCopy', onActivate: onCopy }],
      provider: 'Gemini',
      onOpenSettings,
      lang: 'en',
      doc: doc()
    });
    expect(el.querySelector('.pp-card-actions')).not.toBeNull();
    expect(el.querySelector('.pp-card-provider').textContent).toBe('Gemini');
  });

  it('is omitted entirely when both sides are empty', () => {
    expect(footer({ actions: [{ key: 'cardCopy', onActivate: null }], lang: 'en', doc: doc() })).toBeNull();
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

  it('tags each control with its action key so a host can find it again', () => {
    const el = actionsRow({ actions: [
      { key: 'cardCopy', onActivate: vi.fn() },
      { key: 'cardSave', onActivate: vi.fn() }
    ], lang: 'fa', doc: doc() });
    expect(el.querySelector('[data-action="cardSave"]')).not.toBeNull();
    expect(el.querySelector('[data-action="cardCopy"]')).not.toBeNull();
  });

  it('exposes toggle state on an action that has one, and leaves plain actions alone', () => {
    const el = actionsRow({ actions: [
      { key: 'cardSave', onActivate: vi.fn(), pressed: true },
      { key: 'cardCopy', onActivate: vi.fn() }
    ], lang: 'en', doc: doc() });
    expect(el.querySelector('[data-action="cardSave"]').getAttribute('aria-pressed')).toBe('true');
    // Copy is not a toggle; claiming a pressed state for it would be a lie.
    expect(el.querySelector('[data-action="cardCopy"]').hasAttribute('aria-pressed')).toBe(false);
  });

  it('says a toggle is off rather than saying nothing, so its state is never unknown', () => {
    const el = actionsRow({ actions: [{ key: 'cardSave', onActivate: vi.fn(), pressed: false }], lang: 'en', doc: doc() });
    expect(el.querySelector('[data-action="cardSave"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('returns null when nothing is actionable', () => {
    expect(actionsRow({ actions: [{ key: 'cardCopy', onActivate: null }], lang: 'en', doc: doc() })).toBeNull();
  });
});

describe('sourceLine separators', () => {
  it('separates each part it shows with a middle dot', () => {
    const el = sourceLine({ text: 'charge', pronunciation: '/x/', pos: 'noun', lang: 'en', doc: doc() });
    expect(el.querySelectorAll('.pp-card-source-sep')).toHaveLength(2);
  });

  it('uses one fewer separator than parts, whichever parts are present', () => {
    const noIpa = sourceLine({ text: 'charge', pos: 'noun', lang: 'en', doc: doc() });
    expect(noIpa.querySelectorAll('.pp-card-source-sep')).toHaveLength(1);

    const alone = sourceLine({ text: 'charge', lang: 'en', doc: doc() });
    expect(alone.querySelectorAll('.pp-card-source-sep')).toHaveLength(0);
  });

  it('does not separate the expand control, which is a control and not a part', () => {
    const el = sourceLine({ text: 'a long sentence', onExpand: vi.fn(), lang: 'en', doc: doc() });
    expect(el.querySelectorAll('.pp-card-source-sep')).toHaveLength(0);
    expect(el.querySelector('.pp-card-source-expand')).not.toBeNull();
  });

  it('hides the dots from assistive technology, which should not read punctuation as content', () => {
    const el = sourceLine({ text: 'charge', pronunciation: '/x/', pos: 'noun', lang: 'en', doc: doc() });
    el.querySelectorAll('.pp-card-source-sep').forEach(sep => {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

describe('detectionNote', () => {
  it('says so when the model read the source as the other language', () => {
    // The user forced a Persian source with the swap control; the model
    // looked at the text and reported English. The direction stays as the
    // user set it, but saying nothing would leave the card asserting
    // something the model had explicitly contradicted.
    const el = detectionNote({ detectedSource: 'en', direction: 'fa-en', lang: 'en', doc: doc() });
    expect(el).not.toBeNull();
    expect(el.textContent).toMatch(/English/i);
  });

  it('names Persian the same way in the other direction', () => {
    const el = detectionNote({ detectedSource: 'fa', direction: 'en-fa', lang: 'en', doc: doc() });
    expect(el.textContent).toMatch(/Persian/i);
  });

  it('stays silent when the model agrees with the direction', () => {
    expect(detectionNote({ detectedSource: 'en', direction: 'en-fa', lang: 'en', doc: doc() })).toBeNull();
    expect(detectionNote({ detectedSource: 'fa', direction: 'fa-en', lang: 'en', doc: doc() })).toBeNull();
  });

  it('treats Finglish as Persian, so an auto-corrected result says nothing', () => {
    expect(detectionNote({ detectedSource: 'fa-latn', direction: 'fa-en', lang: 'en', doc: doc() })).toBeNull();
  });

  it('stays silent for a language the swap control cannot express', () => {
    // Swap only moves between English and Persian. Announcing that a stray
    // Russian selection was read as Russian would be noise the user cannot
    // act on.
    expect(detectionNote({ detectedSource: 'ru', direction: 'ru-fa', lang: 'en', doc: doc() })).toBeNull();
    expect(detectionNote({ detectedSource: 'de', direction: 'en-fa', lang: 'en', doc: doc() })).toBeNull();
  });

  it('stays silent when there is nothing to compare', () => {
    expect(detectionNote({ detectedSource: '', direction: 'en-fa', lang: 'en', doc: doc() })).toBeNull();
    expect(detectionNote({ detectedSource: 'en', direction: '', lang: 'en', doc: doc() })).toBeNull();
  });

  it('is announced, since it appears without the user having moved focus', () => {
    const el = detectionNote({ detectedSource: 'en', direction: 'fa-en', lang: 'en', doc: doc() });
    expect(el.getAttribute('role')).toBe('status');
  });
});
