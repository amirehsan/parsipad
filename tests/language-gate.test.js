import { describe, it, expect } from 'vitest';
import { isSupportedLanguage } from '../lib/language-detect.js';

describe('isSupportedLanguage (Persian/English gate)', () => {
  it('accepts pure English input', () => {
    expect(isSupportedLanguage('Hello world')).toEqual({ supported: true, detected: 'en' });
  });

  it('accepts pure Persian input', () => {
    expect(isSupportedLanguage('سلام دنیا')).toEqual({ supported: true, detected: 'fa' });
  });

  it('rejects Russian (Cyrillic)', () => {
    const result = isSupportedLanguage('Привет мир');
    expect(result.supported).toBe(false);
    expect(result.detected).toBe('ru');
  });

  it('rejects Chinese', () => {
    const result = isSupportedLanguage('你好世界');
    expect(result.supported).toBe(false);
    expect(result.detected).toBe('zh');
  });

  it('rejects Japanese (kana)', () => {
    const result = isSupportedLanguage('こんにちは 世界');
    expect(result.supported).toBe(false);
    expect(result.detected).toBe('ja');
  });

  it('rejects Hebrew', () => {
    const result = isSupportedLanguage('שלום עולם');
    expect(result.supported).toBe(false);
    expect(result.detected).toBe('he');
  });

  it('accepts mixed English/Persian (both are supported)', () => {
    // Detector flags this as Persian once Persian chars exceed ~20% of total,
    // which is fine because the gate accepts both Persian and English.
    const result = isSupportedLanguage('I love سلام');
    expect(result.supported).toBe(true);
    expect(['fa', 'en']).toContain(result.detected);
  });

  it('accepts empty / nullish input (caller validates separately)', () => {
    expect(isSupportedLanguage('').supported).toBe(true);
    expect(isSupportedLanguage(null).supported).toBe(true);
    expect(isSupportedLanguage(undefined).supported).toBe(true);
  });

  it('accepts numeric / punctuation-only strings', () => {
    expect(isSupportedLanguage('12345').supported).toBe(true);
    expect(isSupportedLanguage('!!!').supported).toBe(true);
  });
});
