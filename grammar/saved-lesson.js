/**
 * Rebuild the lesson the grammar page renders from a saved grammar favorite,
 * so a lesson opened from the Library needs no new request. Returns null for
 * anything that is not a stored grammar lesson.
 *
 * `lang` is the language the lesson was written in. Lessons saved before it
 * was stored are English.
 *
 * @param {Object|null} favorite - A record from the favorites list
 * @returns {Object|null}
 */
export function lessonFromFavorite(favorite) {
  if (!favorite || favorite.type !== 'grammar' || !favorite.lesson) return null;

  const { lesson } = favorite;
  return {
    lessonTitle: lesson.title,
    originalText: favorite.originalText,
    translation: favorite.savedText || '',
    direction: favorite.direction || 'en-to-fa',
    grammarPoints: Array.isArray(lesson.points)
      ? lesson.points.filter(point => point && typeof point === 'object')
      : [],
    relatedPatterns: Array.isArray(lesson.relatedPatterns) ? lesson.relatedPatterns : [],
    lang: lesson.lang ?? 'en'
  };
}
