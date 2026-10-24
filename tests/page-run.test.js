// tests/page-run.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createPageRun, markBatch, failedIndexes, unfinishedIndexes, summarizeRun, summaryMessageKey } from '../content/utils/page-run.js';
import { functionBody } from './helpers/source.js';

const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
const fn = (name) => functionBody(js, name);

describe('page run', () => {
  it('tracks outcomes and picks the summary', () => {
    const run = createPageRun(4);
    expect(run).toEqual({ total: 4, status: ['pending', 'pending', 'pending', 'pending'] });
    markBatch(run, 0, 'ok'); markBatch(run, 1, 'failed'); markBatch(run, 2, 'ok');
    expect(failedIndexes(run)).toEqual([1]);
    expect(summarizeRun(run)).toEqual({ done: 2, failed: 1, pending: 1, total: 4 });
    expect(summaryMessageKey(summarizeRun(run), true)).toBe('pageTranslateStopped');
    markBatch(run, 3, 'ok');
    expect(summaryMessageKey(summarizeRun(run), false)).toBe('pageTranslatePartial');
    markBatch(run, 1, 'ok');
    expect(summaryMessageKey(summarizeRun(run), false)).toBe('pageTranslateDone');
  });

  it('a resume sends what failed and what was never sent', () => {
    const run = createPageRun(4);
    markBatch(run, 0, 'ok'); markBatch(run, 1, 'failed');
    expect(unfinishedIndexes(run)).toEqual([1, 2, 3]);
    expect(failedIndexes(run)).toEqual([1]);
    markBatch(run, 1, 'ok'); markBatch(run, 2, 'ok'); markBatch(run, 3, 'ok');
    expect(unfinishedIndexes(run)).toEqual([]);
  });

  it('keeps work on cancel and retries only failures', () => {
    expect(fn('handleTranslatePage')).toMatch(/markBatch\(/);
    expect(fn('handleTranslatePage')).not.toMatch(/console\.error\('Batch translation error:'[^\n]*\n\s*continue;/);
    expect(fn('retryFailedBatches')).toMatch(/failedIndexes\(/);
  });

  it('Escape cancels a running translation and a route change restores originals', () => {
    expect(fn('handleKeyDown')).toMatch(/pageTranslationState\?\.isTranslating/);
    expect(fn('handleKeyDown')).not.toMatch(/stopPropagation/);
    // An address change only schedules the look at the page; the reset
    // restores before it drops the state.
    expect(fn('installSpaNavigationListener')).toMatch(/setTimeout\(checkRouteChange, ROUTE_SETTLE_MS\)/);
    expect(fn('checkRouteChange')).toMatch(/hasLeftPage\(/);
    const reset = fn('resetPageTranslation');
    expect(reset.indexOf('restorePageOriginals()')).toBeGreaterThan(-1);
    expect(reset.indexOf('restorePageOriginals()')).toBeLessThan(reset.indexOf('pageTranslationState = null'));
    expect(fn('restorePageOriginals')).toMatch(/isConnected/);
  });

  it('every page-translation request names its signal abortSignal', () => {
    // tests/content-abort.test.js reads any request without abortSignal in
    // its text as a floating-box request.
    for (const name of ['handleTranslatePage', 'translatePageBatch']) {
      for (const call of fn(name).matchAll(/requestTranslation\(\{[\s\S]*?\}\s*,\s*\{([\s\S]*?)\}\s*\)/g)) {
        expect(call[1]).toMatch(/signal:\s*abortSignal/);
      }
    }
    expect(fn('translatePageBatch')).toMatch(/requestTranslation\(/);
  });
});
