// tests/card-render.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
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
      expect(renderCard(of(mode), opts()).classList.contains('pp-card-root')).toBe(true);
    }
  });

  it('shows the resolved direction on every mode', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      const pill = renderCard(of(mode), opts()).querySelector('.pp-card-pill');
      expect(pill, mode).not.toBeNull();
      expect(pill.textContent, mode).toContain('EN');
      expect(pill.textContent, mode).toContain('FA');
    }
  });

  it('shows the direction the result came back with, not the one that was guessed', () => {
    // The service worker resolves fa-latn to a Persian source; the card must
    // render what came back rather than the en-fa the request assumed.
    const pill = renderCard(of('word', { direction: 'fa-en' }), opts()).querySelector('.pp-card-pill');
    expect(pill.textContent.indexOf('FA')).toBeLessThan(pill.textContent.indexOf('EN'));
  });

  it('swaps to the opposite source on every mode', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      const onSwapDirection = vi.fn();
      const el = renderCard(of(mode), { ...opts(), onSwapDirection });
      el.querySelector('.pp-card-pill-swap').click();
      expect(onSwapDirection, mode).toHaveBeenCalledWith('fa');
    }
  });

  it('omits the swap control when the host supplies no handler', () => {
    for (const mode of ['word', 'sentence', 'text']) {
      const el = renderCard(of(mode), opts());
      expect(el.querySelector('.pp-card-pill-swap'), mode).toBeNull();
      expect(el.querySelector('.pp-card-pill'), mode).not.toBeNull();
    }
  });

  it('omits the pill entirely while a result is still streaming, rather than showing a bare arrow', () => {
    // The popup renders a text card on the first delta, before any direction
    // is known. A pill built from that would read as " -> " with nothing
    // either side of it.
    const streaming = renderCard({ mode: 'text', translation: '' }, opts());
    expect(streaming.querySelector('.pp-card-pill')).toBeNull();
    expect(streaming.querySelector('.pp-card-translation')).not.toBeNull();
  });

  it('reports a contradicted source on every mode', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      const el = renderCard(of(mode, { direction: 'fa-en', detectedSource: 'en' }), opts());
      expect(el.querySelector('.pp-card-detected'), mode).not.toBeNull();
    }
  });

  it('says nothing about detection on an ordinary result', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      const el = renderCard(of(mode, { detectedSource: 'en' }), opts());
      expect(el.querySelector('.pp-card-detected'), mode).toBeNull();
    }
  });

  it('starts the save control in the state the host reports, on every mode', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      const saved = renderCard(of(mode), { ...opts(), onSave: () => {}, isSaved: true });
      expect(saved.querySelector('[data-action="cardSave"]').getAttribute('aria-pressed'), mode).toBe('true');

      const unsaved = renderCard(of(mode), { ...opts(), onSave: () => {} });
      expect(unsaved.querySelector('[data-action="cardSave"]').getAttribute('aria-pressed'), mode).toBe('false');
    }
  });

  it('never throws on a minimal result', () => {
    expect(() => renderCard({ translation: 'x', mode: 'word' }, opts())).not.toThrow();
    expect(() => renderCard({ translation: 'x' }, opts())).not.toThrow();
  });
});
