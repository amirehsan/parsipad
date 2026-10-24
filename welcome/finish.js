/**
 * Where the Welcome page goes when the user is done, and the sentence its
 * try-it step translates.
 */

/**
 * The English sentence the try-it step sends through the user's own key. It
 * is content to translate, not UI copy, so it stays English in both UI
 * languages.
 */
export const WELCOME_SAMPLE = 'The meeting was moved to Thursday afternoon.';

/**
 * What Done does. Settings opens the guide in its own tab with
 * `?from=settings`, so Done takes the user back there, to About; opened any
 * other way (on install), the page is a tab of its own and closes.
 * @param {string} search - location.search
 * @returns {{type: 'navigate', url: string} | {type: 'close'}}
 */
export function finishTarget(search) {
  const from = new URLSearchParams(search || '').get('from');
  return from === 'settings'
    ? { type: 'navigate', url: '../settings/settings.html#about' }
    : { type: 'close' };
}
