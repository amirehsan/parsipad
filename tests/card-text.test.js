// tests/card-text.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderTextCard } from '../shared/card/text-card.js';

const base = {
  translation: 'یک. دو. سه.',
  mode: 'text',
  direction: 'en-fa',
  sourceText: 'One. Two. Three.',
  truncated: false
};
const opts = () => ({ lang: 'en', doc: document });

describe('renderTextCard', () => {
  it('shows the translation and no source line', () => {
    const el = renderTextCard(base, opts());
    expect(el.querySelector('.pp-card-translation').textContent).toBe('یک. دو. سه.');
    expect(el.querySelector('.pp-card-source')).toBeNull();
  });

  it('shows the truncation notice only when truncated', () => {
    expect(renderTextCard(base, opts()).querySelector('.pp-card-truncated')).toBeNull();
    const cut = renderTextCard({ ...base, truncated: true }, opts());
    expect(cut.querySelector('.pp-card-truncated')).not.toBeNull();
  });

  it('offers Copy and Save but not Sentence or Explain', () => {
    const el = renderTextCard(base, {
      ...opts(),
      onCopy: vi.fn(), onSave: vi.fn(), onTranslateSentence: vi.fn(), onExplainGrammar: vi.fn()
    });
    const labels = [...el.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
    expect(labels).toContain('Copy');
    expect(labels).not.toContain('Translate the sentence');
    expect(labels).not.toContain('Explain grammar');
  });

  it('exposes the translation element so a host can stream into it', () => {
    const el = renderTextCard({ ...base, translation: '' }, opts());
    const target = el.querySelector('.pp-card-translation');
    expect(target).not.toBeNull();
    target.textContent = 'partial';
    expect(el.querySelector('.pp-card-translation').textContent).toBe('partial');
  });
});
