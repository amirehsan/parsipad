/**
 * Bookkeeping for a whole-page translation run: which batches came back,
 * which failed and which never ran, so a stop keeps what finished and a
 * retry sends only what failed. Pure (no DOM, no chrome.* APIs), so tests
 * import it directly.
 */

/**
 * A run of `total` batches, all pending.
 * @param {number} total
 * @returns {{total: number, status: Array<'pending'|'ok'|'failed'>}}
 */
export function createPageRun(total) {
  return { total, status: new Array(total).fill('pending') };
}

/**
 * Record how one batch came back. A retry overwrites an earlier outcome.
 * @param {{status: string[]}} run
 * @param {number} index
 * @param {'ok'|'failed'} outcome
 */
export function markBatch(run, index, outcome) {
  run.status[index] = outcome;
}

/**
 * The indexes of the batches that failed, in page order.
 * @param {{status: string[]}} run
 * @returns {number[]}
 */
export function failedIndexes(run) {
  const indexes = [];
  run.status.forEach((outcome, index) => {
    if (outcome === 'failed') indexes.push(index);
  });
  return indexes;
}

/**
 * The indexes of the batches that did not come back yet: failed, or never
 * sent because the run stopped. What a resumed run sends.
 * @param {{status: string[]}} run
 * @returns {number[]}
 */
export function unfinishedIndexes(run) {
  const indexes = [];
  run.status.forEach((outcome, index) => {
    if (outcome !== 'ok') indexes.push(index);
  });
  return indexes;
}

/**
 * How many batches finished, failed and never ran.
 * @param {{total: number, status: string[]}} run
 * @returns {{done: number, failed: number, pending: number, total: number}}
 */
export function summarizeRun(run) {
  const count = (outcome) => run.status.filter((s) => s === outcome).length;
  return { done: count('ok'), failed: count('failed'), pending: count('pending'), total: run.total };
}

/**
 * The i18n key of the summary toast: Stopped when the user stopped the run,
 * Partial when a batch failed, Done otherwise.
 * @param {{failed: number}} summary
 * @param {boolean} cancelled - the user stopped the run
 * @returns {'pageTranslateDone'|'pageTranslatePartial'|'pageTranslateStopped'}
 */
export function summaryMessageKey(summary, cancelled) {
  if (cancelled) return 'pageTranslateStopped';
  if (summary.failed > 0) return 'pageTranslatePartial';
  return 'pageTranslateDone';
}
