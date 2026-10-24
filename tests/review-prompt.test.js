// tests/review-prompt.test.js
import { describe, it, expect } from 'vitest';
import {
  REVIEW_RULES,
  emptyReviewState,
  recordSuccess,
  shouldShowReview,
  applyResponse,
  migrateLegacyReviewState
} from '../lib/review-prompt.js';

/**
 * The old prompt needed three saved favorites, lived only in the popup, and
 * one "Maybe Later" ended it for good, so in practice nobody saw it. These
 * rules ask after real use, on more than one day, and back off instead of
 * either nagging or giving up after a single dismissal.
 */
const DAY = 86400000;
const t0 = Date.UTC(2026, 9, 1, 12);

function eligible() {
  let state = emptyReviewState(t0);
  for (let day = 0; day < 3; day++) {
    for (let i = 0; i < 5; i++) state = recordSuccess(state, t0 + day * DAY);
  }
  return state;
}

describe('shouldShowReview', () => {
  it('is false on a fresh install', () => {
    expect(shouldShowReview(emptyReviewState(t0), t0)).toBe(false);
  });

  it('is true after enough successes on enough days, a few days after install', () => {
    expect(shouldShowReview(eligible(), t0 + 3 * DAY)).toBe(true);
  });

  it('is false when every success came on a single day', () => {
    let state = emptyReviewState(t0);
    for (let i = 0; i < 20; i++) state = recordSuccess(state, t0);
    expect(shouldShowReview(state, t0 + 5 * DAY)).toBe(false);
  });

  it('is false before the install has aged', () => {
    expect(shouldShowReview(eligible(), t0 + 2 * DAY)).toBe(false);
  });

  it('is false below the success threshold', () => {
    let state = emptyReviewState(t0);
    for (let day = 0; day < 5; day++) state = recordSuccess(state, t0 + day * DAY);
    expect(state.successes).toBeLessThan(REVIEW_RULES.minSuccesses);
    expect(shouldShowReview(state, t0 + 10 * DAY)).toBe(false);
  });

  it('never shows again after rated or never', () => {
    const at = t0 + 3 * DAY;
    expect(shouldShowReview(applyResponse(eligible(), 'rated', at), t0 + 400 * DAY)).toBe(false);
    expect(shouldShowReview(applyResponse(eligible(), 'never', at), t0 + 400 * DAY)).toBe(false);
  });

  it('a show the user ignores snoozes like later, so the next result does not ask again', () => {
    const show = t0 + 3 * DAY;
    const state = applyResponse(eligible(), 'shown', show);
    expect(shouldShowReview(state, show + 1000)).toBe(false);
    expect(shouldShowReview(state, show + 14 * DAY)).toBe(true);
  });

  it('later snoozes 14 days, then 45, then stops after the third show', () => {
    let state = eligible();
    const show1 = t0 + 3 * DAY;
    state = applyResponse(applyResponse(state, 'shown', show1), 'later', show1);
    expect(shouldShowReview(state, show1 + 13 * DAY)).toBe(false);
    expect(shouldShowReview(state, show1 + 14 * DAY)).toBe(true);

    const show2 = show1 + 14 * DAY;
    state = applyResponse(applyResponse(state, 'shown', show2), 'later', show2);
    expect(shouldShowReview(state, show2 + 44 * DAY)).toBe(false);
    expect(shouldShowReview(state, show2 + 45 * DAY)).toBe(true);

    const show3 = show2 + 45 * DAY;
    state = applyResponse(applyResponse(state, 'shown', show3), 'later', show3);
    expect(state.shownCount).toBe(REVIEW_RULES.maxShows);
    expect(shouldShowReview(state, show3 + 400 * DAY)).toBe(false);
  });
});

describe('recordSuccess', () => {
  it('counts each success and each distinct day once', () => {
    let state = emptyReviewState(t0);
    state = recordSuccess(state, t0);
    state = recordSuccess(state, t0 + 1000);
    state = recordSuccess(state, t0 + DAY);
    expect(state.successes).toBe(3);
    expect(state.activeDays).toHaveLength(2);
  });

  it('keeps at most 30 active days', () => {
    let state = emptyReviewState(t0);
    for (let day = 0; day < 40; day++) state = recordSuccess(state, t0 + day * DAY);
    expect(state.activeDays).toHaveLength(30);
  });

  it('does not mutate its input', () => {
    const state = emptyReviewState(t0);
    recordSuccess(state, t0);
    expect(state.successes).toBe(0);
  });
});

describe('migrateLegacyReviewState', () => {
  it('maps clicked to rated and dismissed to a snooze, not an opt-out', () => {
    expect(migrateLegacyReviewState({ clicked: true }, eligible(), t0).rated).toBe(true);
    const migrated = migrateLegacyReviewState({ dismissed: true }, eligible(), t0);
    expect(migrated.optedOut).toBe(false);
    expect(migrated.shownCount).toBe(0);
    expect(migrated.snoozedUntil).toBe(t0 + REVIEW_RULES.snoozeDays[0] * DAY);
  });
});
