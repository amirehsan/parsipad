import { describe, it, expect } from 'vitest';
import { getTranslationInfo } from '../lib/language-detect.js';

describe('getTranslationInfo', () => {
  it('adds English names for prompts', () => {
    expect(getTranslationInfo('hello world')).toMatchObject({ from: 'en', to: 'fa', direction: 'en-fa', detectedName: 'English', targetName: 'Persian' });
    expect(getTranslationInfo('سلام دنیا')).toMatchObject({ from: 'fa', to: 'en', detectedName: 'Persian', targetName: 'English' });
    expect(getTranslationInfo('Привет мир')).toMatchObject({ from: 'ru', to: 'fa', detectedName: 'Russian', targetName: 'Persian' });
  });
  it('honors a manual source language', () => {
    expect(getTranslationInfo('chetori', 'fa')).toMatchObject({ from: 'fa', to: 'en', detectedName: 'Persian' });
  });
});
