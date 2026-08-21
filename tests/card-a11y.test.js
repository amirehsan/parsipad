// tests/card-a11y.test.js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderCard } from '../shared/card/index.js';

const result = {
  translation: 'جریمه کردن', mode: 'word', direction: 'en-fa', sourceText: 'charge',
  pronunciation: '/x/', pos: 'verb', inContext: 'note', correction: '', truncated: false,
  senses: [
    { pos: 'verb', meaning: 'جریمه کردن', example: { src: 'a', tgt: 'ب' } },
    { pos: 'noun', meaning: 'اتهام', example: { src: 'c', tgt: 'د' } }
  ],
  synonyms: [], antonyms: []
};

describe('card accessibility', () => {
  const opts = { lang: 'en', doc: document, provider: 'Gemini', onCopy: vi.fn(), onSave: vi.fn(), onOpenSettings: vi.fn(), onSwapDirection: vi.fn() };

  it('gives every button an accessible name', () => {
    const el = renderCard(result, opts);
    for (const btn of el.querySelectorAll('button')) {
      const name = btn.getAttribute('aria-label') || btn.textContent.trim();
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('never relies on title alone for a control with no text', () => {
    const el = renderCard(result, opts);
    for (const btn of el.querySelectorAll('button')) {
      if (!btn.textContent.trim()) {
        expect(btn.getAttribute('aria-label')).toBeTruthy();
      }
    }
  });

  it('marks Persian text with lang so a screen reader picks the right voice', () => {
    const el = renderCard(result, opts);
    const rtl = el.querySelectorAll('[dir="rtl"]');
    expect(rtl.length).toBeGreaterThan(0);
    for (const node of rtl) {
      expect(node.getAttribute('lang')).toBe('fa');
    }
  });

  it('wires the disclosure to aria-expanded and aria-controls', () => {
    const el = renderCard(result, opts);
    const btn = el.querySelector('.pp-card-disclosure');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const target = el.querySelector('#' + btn.getAttribute('aria-controls'));
    expect(target).not.toBeNull();
  });
});
