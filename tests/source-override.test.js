// tests/source-override.test.js
import { describe, it, expect } from 'vitest';
import { applySourceOverride } from '../shared/source-override.js';

describe('applySourceOverride', () => {
  it('detects automatically when the user has never corrected anything', () => {
    expect(applySourceOverride({ detected: 'en', override: null }))
      .toEqual({ sourceLang: 'auto', override: null });
  });

  it('records what the correction was made against, not just what was chosen', () => {
    const out = applySourceOverride({ detected: 'en', chosen: 'fa', override: null });
    expect(out.sourceLang).toBe('fa');
    expect(out.override).toEqual({ from: 'en', to: 'fa' });
  });

  it('reapplies the correction to text the detector reads the same way', () => {
    // The whole point: Finglish keeps being read as English, and the user
    // should not have to swap on every word.
    const override = { from: 'en', to: 'fa' };
    expect(applySourceOverride({ detected: 'en', override }).sourceLang).toBe('fa');
  });

  it('leaves text the detector reads differently alone', () => {
    // After correcting a Finglish word, selecting actual Persian must not be
    // forced through the same override. This page is as likely to hold one
    // language as the other.
    const override = { from: 'en', to: 'fa' };
    expect(applySourceOverride({ detected: 'fa', override }).sourceLang).toBe('auto');
  });

  it('keeps the override intact when it does not apply, so it still works later', () => {
    const override = { from: 'en', to: 'fa' };
    expect(applySourceOverride({ detected: 'fa', override }).override).toEqual(override);
  });

  it('replaces an earlier correction when the user makes a new one', () => {
    const override = { from: 'en', to: 'fa' };
    const out = applySourceOverride({ detected: 'fa', chosen: 'en', override });
    expect(out.override).toEqual({ from: 'fa', to: 'en' });
    expect(out.sourceLang).toBe('en');
  });
});
