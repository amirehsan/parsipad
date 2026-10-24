// tests/direction-label.test.js
import { describe, it, expect } from 'vitest';
import { directionLabel } from '../lib/direction-label.js';

/**
 * Four pages formatted the stored direction four ways, and two of them
 * printed the raw value, so badges read "EN-TO-FA". Stored values come in
 * several shapes: 'en-fa' from language detection, 'en-to-fa' from the
 * grammar flow, and an already formatted 'EN → FA' in old favorites.
 */
describe('directionLabel', () => {
  it.each([
    ['en-to-fa', 'EN → FA'],
    ['en-fa', 'EN → FA'],
    ['EN → FA', 'EN → FA'],
    ['en→fa', 'EN → FA'],
    ['fa-to-en', 'FA → EN'],
    ['FA-EN', 'FA → EN'],
    [' fa-to-en ', 'FA → EN'],
    ['ru-fa', 'RU → FA'],
    ['de-to-fa', 'DE → FA']
  ])('%s -> %s', (input, expected) => {
    expect(directionLabel(input)).toBe(expected);
  });

  it('returns empty for missing or malformed input', () => {
    expect(directionLabel(undefined)).toBe('');
    expect(directionLabel('')).toBe('');
    expect(directionLabel('english')).toBe('');
    expect(directionLabel('en-en')).toBe('');
  });
});
