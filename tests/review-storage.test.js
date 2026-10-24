// tests/review-storage.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getReviewState,
  recordTranslationSuccess,
  claimReviewPrompt,
  respondToReviewPrompt,
  logUsageEvent
} from '../lib/storage.js';
import { STORAGE_KEYS } from '../lib/constants.js';

/**
 * The service worker counts successes while the popup records answers, and
 * chrome.storage has no transactions: two read-modify-write cycles of one
 * key interleave and the later write drops the earlier one's change. Each
 * writer therefore owns its own key, so a success counted mid-click can no
 * longer erase a "Don't ask again".
 */
const DAY = 86400000;
let store;
let writes;

beforeEach(() => {
  store = new Map();
  writes = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter(k => store.has(k)).map(k => [k, store.get(k)]));
        }),
        set: vi.fn(async (obj) => {
          writes.push(Object.keys(obj));
          for (const [k, v] of Object.entries(obj)) store.set(k, v);
        })
      }
    }
  };
});

function seedEligible() {
  const now = Date.now();
  store.set(STORAGE_KEYS.reviewUsage, { installedAt: now - 10 * DAY, successes: 20, activeDays: ['2026-10-01', '2026-10-02'] });
  store.set(STORAGE_KEYS.reviewSchedule, { shownCount: 0, lastShownAt: null, snoozedUntil: null });
  store.set(STORAGE_KEYS.reviewAnswer, { rated: false, optedOut: false });
}

describe('review state storage', () => {
  it('a success writes only the usage key', async () => {
    seedEligible();
    writes = [];
    await recordTranslationSuccess();
    expect(writes).toEqual([[STORAGE_KEYS.reviewUsage]]);
  });

  it('a claimed show writes only the schedule key', async () => {
    seedEligible();
    writes = [];
    expect(await claimReviewPrompt()).toBe(true);
    expect(writes).toEqual([[STORAGE_KEYS.reviewSchedule]]);
  });

  it('rated and never write only the answer key; later writes only the schedule', async () => {
    seedEligible();
    writes = [];
    await respondToReviewPrompt('never');
    await respondToReviewPrompt('later');
    expect(writes).toEqual([[STORAGE_KEYS.reviewAnswer], [STORAGE_KEYS.reviewSchedule]]);
  });

  it('a success counted between reading and writing an answer keeps the answer', async () => {
    seedEligible();
    const pendingSuccess = recordTranslationSuccess();
    await respondToReviewPrompt('never');
    await pendingSuccess;
    expect((await getReviewState()).optedOut).toBe(true);
    expect((await getReviewState()).successes).toBe(21);
  });

  it('migrates the two legacy flags once', async () => {
    store.set(STORAGE_KEYS.reviewPromptClicked, true);
    expect((await getReviewState()).rated).toBe(true);
    expect(store.get(STORAGE_KEYS.reviewAnswer).rated).toBe(true);
  });

  it('a failure counting a success never fails the action that succeeded', async () => {
    chrome.storage.local.get.mockImplementation(async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      if (list.includes(STORAGE_KEYS.reviewUsage)) throw new Error('quota');
      return {};
    });
    await expect(logUsageEvent({ action: 'translate', provider: 'claude' })).resolves.toBeUndefined();
  });
});
