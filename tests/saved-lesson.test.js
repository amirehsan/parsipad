// tests/saved-lesson.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
import { lessonFromFavorite } from '../grammar/saved-lesson.js';
const fav = { id: 'grammar_abc', type: 'grammar', originalText: 'I have been waiting', savedText: 'من منتظر بوده‌ام', direction: 'en-to-fa',
  lesson: { title: 'Present perfect continuous', points: [{ title: 'x' }], relatedPatterns: ['y'] }, timestamp: 1 };
describe('saved lesson', () => {
  it('rebuilds the lesson the page renders', () => {
    expect(lessonFromFavorite(fav)).toEqual({ lessonTitle: 'Present perfect continuous', originalText: 'I have been waiting',
      translation: 'من منتظر بوده‌ام', direction: 'en-to-fa', grammarPoints: [{ title: 'x' }], relatedPatterns: ['y'], lang: 'en' });
    expect(lessonFromFavorite({ ...fav, type: 'translation' })).toBeNull();
    expect(lessonFromFavorite({ ...fav, lesson: undefined })).toBeNull();
  });
  it('renders a saved lesson before any lesson request', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../grammar/grammar.js'), 'utf8');
    const body = js.slice(js.indexOf('async function loadLesson'));
    expect(body.indexOf('lessonFromFavorite(')).toBeGreaterThan(-1);
    expect(body.indexOf('lessonFromFavorite(')).toBeLessThan(body.indexOf('ACTIONS.GET_GRAMMAR_LESSON'));
  });
  it('checks for a saved lesson before the empty-text guard', () => {
    const js = fs.readFileSync(path.resolve(__dirname, '../grammar/grammar.js'), 'utf8');
    const body = js.slice(js.indexOf('async function loadLesson'));
    expect(body.indexOf('lessonFromFavorite(')).toBeLessThan(body.indexOf('!originalText || !translation'));
  });
  it('keeps a lesson saved with no translation and carries the saved language', () => {
    expect(lessonFromFavorite({ ...fav, savedText: undefined })).toMatchObject({ translation: '', lang: 'en' });
    expect(lessonFromFavorite({ ...fav, lesson: { ...fav.lesson, lang: 'fa' } }).lang).toBe('fa');
  });
  it('tolerates a stored lesson with no points or patterns', () => {
    const lesson = lessonFromFavorite({ ...fav, lesson: { title: 'Past simple' } });
    expect(lesson.grammarPoints).toEqual([]);
    expect(lesson.relatedPatterns).toEqual([]);
  });
  it('has the missing-lesson copy in both locales', async () => {
    const { translations } = await import('../lib/i18n.js');
    for (const lang of ['en', 'fa']) {
      expect(translations[lang].savedLessonMissing, lang).toBeTruthy();
      expect(translations[lang].savedLessonBack, lang).toBeTruthy();
    }
    expect(translations.en.savedLessonMissing).toBe('This saved lesson is no longer in your Library.');
  });
});
