import { describe, it, expect } from 'vitest';
import {
  detectLanguageCode,
  getTranslationInfo,
  getTextDirection,
  containsPersian
} from '../lib/language-detect.js';

describe('detectLanguageCode', () => {
  it('defaults to en for empty input', () => {
    expect(detectLanguageCode('')).toBe('en');
    expect(detectLanguageCode(null)).toBe('en');
    expect(detectLanguageCode(undefined)).toBe('en');
    expect(detectLanguageCode('   ')).toBe('en');
  });

  it('detects Persian text', () => {
    expect(detectLanguageCode('سلام دنیا')).toBe('fa');
  });

  it('detects English text', () => {
    expect(detectLanguageCode('Hello world')).toBe('en');
  });

  it('disambiguates Japanese from Chinese when kana is present', () => {
    expect(detectLanguageCode('こんにちは 世界')).toBe('ja');
  });
});

describe('getTranslationInfo', () => {
  it('routes Persian to English', () => {
    const info = getTranslationInfo('سلام');
    expect(info.from).toBe('fa');
    expect(info.to).toBe('en');
    expect(info.direction).toBe('fa-en');
  });

  it('routes English to Persian', () => {
    const info = getTranslationInfo('Hello');
    expect(info.from).toBe('en');
    expect(info.to).toBe('fa');
  });

  it('respects an explicit sourceLang override', () => {
    const info = getTranslationInfo('Hello', 'fa');
    expect(info.from).toBe('fa');
    expect(info.to).toBe('en');
  });
});

describe('getTextDirection', () => {
  it('returns rtl for Persian', () => {
    expect(getTextDirection('سلام دنیا')).toBe('rtl');
  });

  it('returns ltr for English', () => {
    expect(getTextDirection('Hello')).toBe('ltr');
  });

  it('returns rtl for Arabic and Hebrew', () => {
    expect(getTextDirection('مرحبا')).toBe('rtl');
    expect(getTextDirection('שלום')).toBe('rtl');
  });
});

describe('containsPersian', () => {
  it('returns true when the string contains Persian characters', () => {
    expect(containsPersian('Hello سلام')).toBe(true);
  });

  it('returns false for pure English', () => {
    expect(containsPersian('Hello world')).toBe(false);
  });
});
