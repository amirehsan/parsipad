// tests/card-sentence.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderSentenceCard } from '../shared/card/sentence-card.js';

const base = {
  translation: 'جریمه می\u200cشوید',
  mode: 'sentence',
  direction: 'en-fa',
  sourceText: 'They will charge you a fee for late returns.',
  register: 'neutral',
  alternatives: [
    { text: 'مبلغی از شما دریافت می\u200cشود', label: 'more formal' },
    { text: 'ازت پول می\u200cگیرن', label: 'colloquial' }
  ],
  note: 'Persian prefers the passive here.',
  correction: '',
  truncated: false
};
const opts = () => ({ lang: 'en', doc: document });

describe('renderSentenceCard', () => {
  it('shows the source sentence and the translation', () => {
    const el = renderSentenceCard(base, opts());
    expect(el.querySelector('.pp-card-source-text').textContent).toContain('charge you a fee');
    expect(el.querySelector('.pp-card-translation').textContent).toBe('جریمه می\u200cشوید');
  });

  it('labels alternatives under Also with a count', () => {
    const el = renderSentenceCard(base, opts());
    expect(el.querySelector('.pp-card-disclosure').textContent).toContain('Also (2)');
  });

  it('renders each alternative with its label tag and its own direction', () => {
    const el = renderSentenceCard(base, { ...opts(), sensesExpanded: true });
    const items = el.querySelectorAll('.pp-card-alternatives > li');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.pp-card-alternative-label').textContent).toContain('more formal');
    expect(items[0].querySelector('.pp-card-alternative-text').getAttribute('dir')).toBe('rtl');
  });

  it('renders the note under the Note lead', () => {
    const el = renderSentenceCard(base, opts());
    expect(el.querySelector('.pp-card-note').textContent).toContain('Note');
    expect(el.querySelector('.pp-card-note').textContent).toContain('passive');
  });

  it('never offers the Sentence action, because this already is one', () => {
    const el = renderSentenceCard(base, { ...opts(), onTranslateSentence: vi.fn() });
    expect([...el.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Translate the sentence')).toBe(false);
  });

  it('offers Explain when a handler is supplied', () => {
    const el = renderSentenceCard(base, { ...opts(), onExplainGrammar: vi.fn() });
    expect([...el.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === 'Explain grammar')).toBe(true);
  });

  it('omits the disclosure when there are no alternatives', () => {
    const el = renderSentenceCard({ ...base, alternatives: [] }, opts());
    expect(el.querySelector('.pp-card-disclosure')).toBeNull();
  });
});
