process.env.TZ = 'America/Los_Angeles';
import { describe, it, expect } from 'vitest';
import { INTL_LOCALE, localDayKey, formatTime, formatDate, formatRelativeTime, dayGroup, dayGroupLabel, formatNumber, formatCurrency } from '../lib/format.js';
const now = Date.parse('2026-10-24T18:00:00Z'); // 11:00 in Los Angeles
const min = 60e3, day = 864e5;
describe('format', () => {
  it('keys days in local time, not UTC', () => {
    expect(localDayKey(Date.parse('2026-10-21T05:30:00Z'))).toBe('2026-10-20');
  });
  it('formats relative time per language', () => {
    expect(formatRelativeTime(now - 10 * min, 'en', now)).toBe('10 minutes ago');
    expect(formatRelativeTime(now - 20e3, 'en', now)).toBe('now');
    const fa = formatRelativeTime(now - 10 * min, 'fa', now);
    expect(fa).toMatch(/10/);
    expect(fa).toMatch(/[؀-ۿ]/);
    expect(fa).not.toMatch(/[۰-۹]/);
  });
  it('groups by local calendar day', () => {
    expect(dayGroup(now - 2 * 3600e3, now)).toBe('today');
    expect(dayGroup(now - day, now)).toBe('yesterday');
    expect(dayGroup(now - 3 * day, now)).toBe('week');
    expect(dayGroup(now - 10 * day, now)).toBe('earlier');
    expect(dayGroupLabel('today', 'en')).toBe('Today');
  });
  it('formats numbers and currency', () => {
    expect(formatNumber(12345, 'en')).toBe('12,345');
    expect(formatNumber(12345, 'fa').replace(/\D/g, '')).toBe('12345');
    expect(formatCurrency(0.00042, 'en')).toBe('$0.0004');
    expect(formatCurrency(1.5, 'en')).toBe('$1.50');
    expect(INTL_LOCALE.fa).toBe('fa-u-ca-gregory-nu-latn');
  });
  it('formats a clock time with Latin digits in both languages', () => {
    const ts = Date.parse('2026-10-24T16:41:00Z'); // 09:41 in Los Angeles
    expect(formatTime(ts, 'en')).toMatch(/9:41/);
    const fa = formatTime(ts, 'fa');
    expect(fa).toMatch(/9:41|09:41/);
    expect(fa).not.toMatch(/[۰-۹]/);
    expect(formatTime(new Date(ts), 'en')).toBe(formatTime(ts, 'en'));
  });
  it('formats a long date on request, keeping the medium date as the default', () => {
    expect(formatDate(now, 'en')).toBe('Oct 24, 2026');
    expect(formatDate(now, 'en', { dateStyle: 'full' })).toBe('Saturday, October 24, 2026');
    expect(formatDate(now, 'fa', { dateStyle: 'full' })).not.toMatch(/[۰-۹]/);
  });
});
