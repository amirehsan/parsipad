// tests/card-render.test.js
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderCard } from '../shared/card/index.js';

const opts = () => ({ lang: 'en', doc: document });
const of = (mode, extra = {}) => ({
  translation: 'ترجمه', direction: 'en-fa', sourceText: 'source', mode,
  senses: [], alternatives: [], truncated: false, correction: '', ...extra
});

describe('renderCard', () => {
  it('routes each mode to its card', () => {
    expect(renderCard(of('word', { pronunciation: '/x/', pos: 'noun' }), opts()).querySelector('.pp-card-source')).not.toBeNull();
    expect(renderCard(of('phrase'), opts()).querySelector('.pp-card-source')).not.toBeNull();
    expect(renderCard(of('sentence'), opts()).querySelector('.pp-card-source')).not.toBeNull();
    expect(renderCard(of('text'), opts()).querySelector('.pp-card-source')).toBeNull();
    expect(renderCard(of('batch'), opts()).querySelector('.pp-card-source')).toBeNull();
  });

  it('falls back to the text card for an unknown or missing mode', () => {
    expect(renderCard(of(undefined), opts()).querySelector('.pp-card-translation')).not.toBeNull();
    expect(renderCard(of('nonsense'), opts()).querySelector('.pp-card-translation')).not.toBeNull();
  });

  it('always produces a container carrying the card class', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      expect(renderCard(of(mode), opts()).classList.contains('pp-card')).toBe(true);
    }
  });

  it('never throws on a minimal result', () => {
    expect(() => renderCard({ translation: 'x', mode: 'word' }, opts())).not.toThrow();
    expect(() => renderCard({ translation: 'x' }, opts())).not.toThrow();
  });
});
