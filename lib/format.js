/**
 * The one place that formats times, days, numbers and cost for the UI.
 * Persian words with Latin digits and the Gregorian calendar; a later RTL
 * phase changes only INTL_LOCALE.
 */
import { t } from './i18n.js';

export const INTL_LOCALE = Object.freeze({ en: 'en', fa: 'fa-u-ca-gregory-nu-latn' });

const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_LIMIT_DAYS = 7;

function intlLocale(lang) {
  return INTL_LOCALE[lang] || INTL_LOCALE.en;
}

/**
 * Local calendar day of a timestamp as YYYY-MM-DD.
 * @param {number} ts - Epoch milliseconds
 * @returns {string}
 */
export function localDayKey(ts) {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Whole local calendar days between two timestamps (DST safe).
 */
function calendarDaysBetween(ts, now) {
  const a = new Date(ts);
  const b = new Date(now);
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / DAY);
}

/**
 * Format a date, e.g. "Oct 24, 2026", or "Saturday, October 24, 2026" with
 * { dateStyle: 'full' }.
 * @param {number|Date} ts - Epoch milliseconds or a Date
 * @param {string} lang - 'en' or 'fa'
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDate(ts, lang, options = { dateStyle: 'medium' }) {
  return new Intl.DateTimeFormat(intlLocale(lang), options).format(ts);
}

/**
 * Format a clock time, hours and minutes, e.g. "9:41 AM".
 * @param {number|Date} ts - Epoch milliseconds or a Date
 * @param {string} lang - 'en' or 'fa'
 * @returns {string}
 */
export function formatTime(ts, lang) {
  return new Intl.DateTimeFormat(intlLocale(lang), { timeStyle: 'short' }).format(ts);
}

/**
 * Format a timestamp relative to now ("10 minutes ago"), falling back to a
 * date beyond 7 days.
 * @param {number} ts - Epoch milliseconds
 * @param {'en'|'fa'} lang
 * @param {number} [now]
 * @returns {string}
 */
export function formatRelativeTime(ts, lang, now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(lang), { numeric: 'auto' });
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return rtf.format(0, 'second');
  if (diff < HOUR) return rtf.format(-Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return rtf.format(-Math.floor(diff / HOUR), 'hour');
  const days = Math.floor(diff / DAY);
  if (days <= RELATIVE_LIMIT_DAYS) return rtf.format(-days, 'day');
  return formatDate(ts, lang);
}

/**
 * Group a timestamp by local calendar day.
 * @param {number} ts - Epoch milliseconds
 * @param {number} [now]
 * @returns {'today'|'yesterday'|'week'|'earlier'} week is 2 to 6 days back
 */
export function dayGroup(ts, now = Date.now()) {
  const days = calendarDaysBetween(ts, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 6) return 'week';
  return 'earlier';
}

/**
 * Localized heading for a dayGroup value.
 * @param {string} group
 * @param {string} lang
 * @returns {string}
 */
export function dayGroupLabel(group, lang) {
  const keys = {
    today: 'libraryToday',
    yesterday: 'libraryYesterday',
    week: 'libraryThisWeek',
    earlier: 'libraryEarlier'
  };
  return t(keys[group] || keys.earlier, lang);
}

/**
 * @param {number} n
 * @param {string} lang
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string}
 */
export function formatNumber(n, lang, options) {
  return new Intl.NumberFormat(intlLocale(lang), options).format(n);
}

/**
 * Format a USD amount: four fraction digits under 0.01, three under 1,
 * else two.
 * @param {number} usd
 * @param {string} lang
 * @returns {string}
 */
export function formatCurrency(usd, lang) {
  const digits = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return formatNumber(usd, lang, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}
