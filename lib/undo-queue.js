/**
 * Delete with Undo. A delete is written to storage straight away, so closing
 * the tab can never lose it, and the queue keeps the removed entry for a short
 * window in which Undo puts it back. Every write (delete or restore) runs one
 * at a time through a single promise chain, because the storage helpers read a
 * whole list, change it and write it back, and two of those in flight on the
 * same list would lose one of the changes.
 */

const DEFAULT_DELAY = 5000;

/**
 * @template E, R
 * @param {object} options
 * @param {(entry: E) => Promise<R>} options.commit - Deletes the entry from storage.
 *   What it resolves with (for example the raw stored record) is handed to restore.
 * @param {(entry: E, receipt: R) => Promise<void>} options.restore - Puts a deleted entry back.
 * @param {number} [options.delay] - How long Undo stays available, in ms.
 * @param {(error: unknown, entry: E) => void} [options.onError] - A delete or restore failed.
 * @returns {{
 *   remove: (entry: E) => void,
 *   undo: (key: string) => boolean,
 *   isPending: (key: string) => boolean,
 *   flush: () => Promise<void>,
 *   flushWrites: () => Promise<void>
 * }}
 */
export function createUndoQueue({ commit, restore, delay = DEFAULT_DELAY, onError = reportError }) {
  /** @type {Map<string, { entry: any, timer: ReturnType<typeof setTimeout>, committed: Promise<{ ok: boolean, receipt?: any }> }>} */
  const pending = new Map();
  let chain = Promise.resolve();

  function enqueue(task) {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  }

  function closeWindow(key) {
    const item = pending.get(key);
    if (!item) return null;
    clearTimeout(item.timer);
    pending.delete(key);
    return item;
  }

  return {
    /**
     * Delete now; Undo is possible until `delay` has passed.
     * @param {{ key: string }} entry
     */
    remove(entry) {
      if (pending.has(entry.key)) return;

      const committed = enqueue(async () => {
        try {
          return { ok: true, receipt: await commit(entry) };
        } catch (error) {
          closeWindow(entry.key);
          onError(error, entry);
          return { ok: false };
        }
      });
      const timer = setTimeout(() => pending.delete(entry.key), delay);
      pending.set(entry.key, { entry, timer, committed });
    },

    /**
     * Put a deleted entry back. Returns false when its window has closed.
     * @param {string} key
     * @returns {boolean}
     */
    undo(key) {
      const item = closeWindow(key);
      if (!item) return false;

      enqueue(async () => {
        const { ok, receipt } = await item.committed;
        if (!ok) return;
        try {
          await restore(item.entry, receipt);
        } catch (error) {
          onError(error, item.entry);
        }
      });
      return true;
    },

    /** @param {string} key */
    isPending(key) {
      return pending.has(key);
    },

    /** Close every undo window and wait for the writes to finish. */
    flush() {
      for (const key of [...pending.keys()]) closeWindow(key);
      return chain;
    },

    /** Wait for the writes queued so far, leaving the undo windows open. */
    flushWrites() {
      return chain;
    }
  };
}

function reportError(error) {
  console.error('ParsiPad: library delete or undo failed', error);
}
