/**
 * When to ask for a Chrome Web Store rating.
 *
 * The rule is "after real use, at a good moment, and not forever": enough
 * successful translations, spread over more than one day, a few days after
 * install. "Later" snoozes and each snooze is longer than the last; after
 * three asks the prompt stops on its own. Rating or "Don't ask again" ends it
 * at once.
 *
 * Everything here is pure so the rules can be tested without chrome.*;
 * lib/storage.js keeps the state and the service worker applies it.
 */

const DAY_MS = 86400000;
const MAX_ACTIVE_DAYS = 30;

export const REVIEW_RULES = Object.freeze({
  minSuccesses: 15,
  minDaysSinceInstall: 3,
  minActiveDays: 2,
  snoozeDays: Object.freeze([14, 45]),
  maxShows: 3
});

/**
 * @typedef {object} ReviewState
 * @property {number} installedAt
 * @property {number} successes
 * @property {string[]} activeDays - 'YYYY-MM-DD', most recent last
 * @property {number} shownCount
 * @property {number | null} lastShownAt
 * @property {number | null} snoozedUntil
 * @property {boolean} rated
 * @property {boolean} optedOut
 */

/** @param {number} now @returns {ReviewState} */
export function emptyReviewState(now) {
  return {
    installedAt: now,
    successes: 0,
    activeDays: [],
    shownCount: 0,
    lastShownAt: null,
    snoozedUntil: null,
    rated: false,
    optedOut: false
  };
}

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/** @param {ReviewState} state @param {number} now @returns {ReviewState} */
export function recordSuccess(state, now) {
  const key = dayKey(now);
  const days = state.activeDays.includes(key) ? state.activeDays : [...state.activeDays, key];
  return {
    ...state,
    successes: state.successes + 1,
    activeDays: days.slice(-MAX_ACTIVE_DAYS)
  };
}

/** @param {ReviewState} state @param {number} now @returns {boolean} */
export function shouldShowReview(state, now) {
  if (!state || state.rated || state.optedOut) return false;
  if (state.shownCount >= REVIEW_RULES.maxShows) return false;
  if (state.snoozedUntil && now < state.snoozedUntil) return false;
  if (state.successes < REVIEW_RULES.minSuccesses) return false;
  if (now - state.installedAt < REVIEW_RULES.minDaysSinceInstall * DAY_MS) return false;
  return state.activeDays.length >= REVIEW_RULES.minActiveDays;
}

/** Snooze end after the latest show: 14 days after the first, 45 after later ones. */
function snoozeAfter(state, now) {
  const { snoozeDays } = REVIEW_RULES;
  const index = Math.min(Math.max(state.shownCount - 1, 0), snoozeDays.length - 1);
  return now + snoozeDays[index] * DAY_MS;
}

/**
 * @param {ReviewState} state
 * @param {'shown' | 'rated' | 'later' | 'never'} response
 * @param {number} now
 * @returns {ReviewState}
 */
export function applyResponse(state, response, now) {
  switch (response) {
    case 'shown': {
      // A show the user ignores counts as "later": without this the next
      // successful result would ask again straight away.
      const shown = { ...state, shownCount: state.shownCount + 1, lastShownAt: now };
      return { ...shown, snoozedUntil: snoozeAfter(shown, now) };
    }
    case 'later':
      return { ...state, snoozedUntil: snoozeAfter(state, now) };
    case 'rated':
      return { ...state, rated: true };
    case 'never':
      return { ...state, optedOut: true };
    default:
      return state;
  }
}

/**
 * Carry the two flags the old prompt stored into the new state. Someone who
 * once pressed "Maybe Later" meant later, not never, so it becomes a snooze.
 *
 * @param {{ dismissed?: boolean, clicked?: boolean }} legacy
 * @param {ReviewState} state
 * @param {number} now
 * @returns {ReviewState}
 */
export function migrateLegacyReviewState(legacy, state, now) {
  if (legacy?.clicked) return applyResponse(state, 'rated', now);
  if (legacy?.dismissed) return applyResponse(state, 'later', now);
  return state;
}
