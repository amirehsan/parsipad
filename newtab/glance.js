/**
 * The greeting and the clock's timing on the New Tab page.
 *
 * Pure: no DOM, no chrome.* and no clock of its own. The caller passes the
 * hour or the Date in, which is what makes the boundaries testable without a
 * browser. The time itself is written by lib/format.js, like every other
 * time in the interface.
 */

/** Greeting bands by local hour, in the order they are checked. */
const BANDS = Object.freeze([
  { until: 5, key: 'greetingNight' },      // 00:00-04:59
  { until: 12, key: 'greetingMorning' },   // 05:00-11:59
  { until: 17, key: 'greetingAfternoon' }, // 12:00-16:59
  { until: 21, key: 'greetingEvening' }    // 17:00-20:59
]);

/**
 * The i18n key for the greeting at a given hour.
 *
 * Anything outside 0-23, including a non-number, lands on the night greeting
 * rather than throwing: this runs on every new tab, and a page that fails to
 * render because a clock was strange is worse than one that says good
 * evening at the wrong time.
 *
 * @param {number} hour - Local hour, 0-23.
 * @returns {string}
 */
export function greetingKeyForHour(hour) {
  if (!Number.isFinite(hour)) return 'greetingNight';
  const h = Math.floor(hour);
  const band = BANDS.find(b => h >= 0 && h < b.until);
  return band ? band.key : 'greetingNight';
}

/**
 * Milliseconds until the top of the next minute.
 *
 * The clock is redrawn on the boundary rather than on a plain 60s interval,
 * so a tab opened at :59 does not sit a whole minute behind.
 *
 * @param {Date} date
 * @returns {number}
 */
export function msUntilNextMinute(date) {
  return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds());
}
