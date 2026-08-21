// tests/card-word.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderWordCard } from '../shared/card/word-card.js';

const base = {
  translation: 'جریمه کردن',
  mode: 'word',
  direction: 'en-fa',
  sourceText: 'charge',
  pronunciation: '/tʃɑːrdʒ/',
  pos: 'verb',
  register: 'neutral',
  inContext: 'Here it means to demand money as a penalty.',
  senses: [
    { pos: 'verb', meaning: 'جریمه کردن', example: { src: 'they charged a fee', tgt: 'هزینه گرفتند' } },
    { pos: 'noun', meaning: 'اتهام', example: { src: 'a charge of fraud', tgt: 'اتهام کلاهبرداری' } },
    { pos: 'verb', meaning: 'شارژ کردن', example: { src: 'charge the phone', tgt: 'گوشی را شارژ کن' } }
  ],
  synonyms: ['bill', 'levy'],
  antonyms: ['refund'],
  correction: '',
  truncated: false
};
const opts = () => ({ lang: 'en', doc: document });

describe('renderWordCard', () => {
  it('leads with the contextual translation', () => {
    const el = renderWordCard(base, opts());
    const t = el.querySelector('.pp-card-translation');
    expect(t.textContent).toBe('جریمه کردن');
    expect(t.getAttribute('dir')).toBe('rtl');
    expect(t.getAttribute('lang')).toBe('fa');
  });

  it('shows the source word with its pronunciation and part of speech', () => {
    const el = renderWordCard(base, opts());
    expect(el.querySelector('.pp-card-source-text').textContent).toBe('charge');
    expect(el.querySelector('.pp-card-source-ipa')).not.toBeNull();
    expect(el.querySelector('.pp-card-source-pos').textContent).toBe('verb');
  });

  it('renders the in-context note under the Here lead', () => {
    const el = renderWordCard(base, opts());
    expect(el.querySelector('.pp-card-note').textContent).toContain('Here');
    expect(el.querySelector('.pp-card-note').textContent).toContain('demand money');
  });

  it('counts other meanings excluding the one already shown', () => {
    const el = renderWordCard(base, opts());
    expect(el.querySelector('.pp-card-disclosure').textContent).toContain('Other meanings (2)');
  });

  it('renders each remaining sense with its part of speech and both example sides', () => {
    const el = renderWordCard(base, { ...opts(), sensesExpanded: true });
    const senses = el.querySelectorAll('.pp-card-senses > li');
    expect(senses).toHaveLength(2);
    expect(senses[0].textContent).toContain('noun');
    expect(senses[0].textContent).toContain('اتهام');
    expect(senses[0].textContent).toContain('a charge of fraud');
    expect(senses[0].textContent).toContain('اتهام کلاهبرداری');
  });

  it('gives each sense meaning its own direction', () => {
    const el = renderWordCard(base, { ...opts(), sensesExpanded: true });
    const meaning = el.querySelector('.pp-card-sense-meaning');
    expect(meaning.getAttribute('dir')).toBe('rtl');
  });

  it('lists synonyms and antonyms only when present', () => {
    const withLists = renderWordCard(base, { ...opts(), sensesExpanded: true });
    expect(withLists.textContent).toContain('bill');
    expect(withLists.textContent).toContain('refund');
    const without = renderWordCard({ ...base, synonyms: [], antonyms: [] }, { ...opts(), sensesExpanded: true });
    expect(without.querySelector('.pp-card-wordlist')).toBeNull();
  });

  it('omits the disclosure entirely when there is no other sense', () => {
    const single = renderWordCard({ ...base, senses: [base.senses[0]] }, opts());
    expect(single.querySelector('.pp-card-disclosure')).toBeNull();
  });

  it('omits the note when the model returned none', () => {
    const el = renderWordCard({ ...base, inContext: '' }, opts());
    expect(el.querySelector('.pp-card-note')).toBeNull();
  });

  it('offers Listen for an English source and never for a Persian one', () => {
    const onListen = vi.fn();
    const en = renderWordCard(base, { ...opts(), onListen });
    expect([...en.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Listen')).toBe(true);

    const faSource = { ...base, direction: 'fa-en', sourceText: 'کتاب', translation: 'book', senses: [] };
    const fa = renderWordCard(faSource, { ...opts(), onListen });
    const listen = [...fa.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Listen');
    expect(listen).toBeDefined();
    listen.click();
    expect(onListen).toHaveBeenCalledWith('book');
  });

  it('shows a correction when the source was wrong', () => {
    const el = renderWordCard({ ...base, correction: 'charge' }, opts());
    expect(el.querySelector('.pp-card-correction')).not.toBeNull();
  });

  it('renders the provider in the footer and opens settings', () => {
    const onOpenSettings = vi.fn();
    const el = renderWordCard(base, { ...opts(), provider: 'Gemini', onOpenSettings });
    const p = el.querySelector('.pp-card-provider');
    expect(p.textContent).toBe('Gemini');
    p.click();
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
