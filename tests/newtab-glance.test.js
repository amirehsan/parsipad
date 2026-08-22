import { describe, it, expect } from 'vitest';
import { greetingKeyForHour, formatClock, msUntilNextMinute } from '../newtab/glance.js';

describe('greetingKeyForHour', () => {
  it.each([
    [0, 'greetingNight'],
    [4, 'greetingNight'],
    [5, 'greetingMorning'],
    [11, 'greetingMorning'],
    [12, 'greetingAfternoon'],
    [16, 'greetingAfternoon'],
    [17, 'greetingEvening'],
    [20, 'greetingEvening'],
    [21, 'greetingNight'],
    [23, 'greetingNight']
  ])('hour %i greets with %s', (hour, key) => {
    expect(greetingKeyForHour(hour)).toBe(key);
  });

  it('covers all 24 hours with a real key', () => {
    // A gap would render an empty greeting for an hour a day, which is the
    // kind of defect that only shows up for the person browsing at 4am.
    for (let h = 0; h < 24; h++) {
      expect(greetingKeyForHour(h)).toMatch(/^greeting(Morning|Afternoon|Evening|Night)$/);
    }
  });

  it('falls back rather than throwing on a nonsense hour', () => {
    // This runs on every new tab. A page that fails to render because a clock
    // was strange is worse than one that greets you wrongly.
    expect(greetingKeyForHour(-1)).toBe('greetingNight');
    expect(greetingKeyForHour(99)).toBe('greetingNight');
    expect(greetingKeyForHour(NaN)).toBe('greetingNight');
    expect(greetingKeyForHour(undefined)).toBe('greetingNight');
  });
});

describe('formatClock', () => {
  // Fixed local time so the assertions do not depend on when the suite runs.
  const at = (h, m) => new Date(2026, 0, 15, h, m, 0);

  it('writes Persian numerals for the Persian UI', () => {
    // Requested by locale rather than transliterated after the fact, so the
    // numerals, separator and ordering all come from one place.
    // Assumes full-icu, which Node 18+ bundles.
    expect(formatClock(at(9, 41), 'fa')).toMatch(/[۰-۹]/);
    expect(formatClock(at(9, 41), 'fa')).not.toMatch(/[0-9]/);
  });

  it('writes ASCII digits for the English UI', () => {
    const out = formatClock(at(9, 41), 'en');
    expect(out).toMatch(/9/);
    expect(out).toMatch(/41/);
    expect(out).not.toMatch(/[۰-۹]/);
  });

  it('treats any non-Persian language as English rather than guessing', () => {
    expect(formatClock(at(9, 41), undefined)).not.toMatch(/[۰-۹]/);
  });
});

describe('msUntilNextMinute', () => {
  it('waits the remainder of the current minute', () => {
    expect(msUntilNextMinute(new Date(2026, 0, 15, 9, 41, 0, 0))).toBe(60000);
    expect(msUntilNextMinute(new Date(2026, 0, 15, 9, 41, 30, 0))).toBe(30000);
    expect(msUntilNextMinute(new Date(2026, 0, 15, 9, 41, 59, 500))).toBe(500);
  });

  it('never returns zero or less, which would spin the timer', () => {
    for (let s = 0; s < 60; s++) {
      expect(msUntilNextMinute(new Date(2026, 0, 15, 9, 41, s, 999))).toBeGreaterThan(0);
    }
  });
});
