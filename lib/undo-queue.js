/**
 * Delete with Undo. A delete is written to storage straight away, so closing
 * the tab can never lose it, and the queue keeps the removed entry for a short
 * window in which Undo puts it back.
 *
 * Every write (delete or restore) made through one queue runs one at a time
 * through a single promise chain, because the storage helpers read a whole
 * list, change it and write it back, and two of those in flight on the same
 * list from this page would lose one of the changes. The chain does not reach
 * beyond this page: the service worker adding history, another Library tab or
 * the popup can still interleave their own read-modify-write.
 *
 * A write can fail (storage quota, a closed context). The caller finds out
 * through the promise remove() and undoAndWait() return, or through onSettled,
 * and reconciles the page with storage; onError is the diagnostic hook.
 */

const DEFAULT_DELAY = 5000;

/**
 * @template E, R
 * @param {object} options
 * @param {(entry: E) => Promise<R>} options.commit - Deletes the entry from storage.
 *   What it resolves with (the raw stored record and its index) is handed to restore.
 * @param {(entry: E, receipt: R) => Promise<void>} options.restore - Puts a deleted entry back.
 * @param {number} [options.delay] - How long Undo stays available, in ms.
 * @param {(error: unknown, entry: E) => void} [options.onError] - A delete or restore failed.
 * @param {(result: { key: string, action: 'remove'|'restore', ok: boolean, error?: unknown }) => void} [options.onSettled] -
 *   Called after every delete and restore, successful or not.
 * @returns {{
 *   remove: (entry: E) => Promise<boolean>,
 *   undo: (key: string) => boolean,
 *   undoAndWait: (key: string) => Promise<boolean>,
 *   isPending: (key: string) => boolean,
 *   flush: () => Promise<void>,
 *   flushWrites: () => Promise<void>
 * }}
 */
export function createUndoQueue({ commit, restore, delay = DEFAULT_DELAY, onError = reportError, onSettled }) {
  /** @type {Map<string, { entry: any, timer: ReturnType<typeof setTimeout>, committed: Promise<{ ok: boolean, receipt?: any }> }>} */
  const pending = new Map();
  let chain = Promise.resolve();

  function enqueue(task) {
    const run = chain.then(task);
    chain = run.then(() => {}, () => {});
    return run;
  }

  function closeWindow(key) {
    const item = pending.get(key);
    if (!item) return null;
    clearTimeout(item.timer);
    pending.delete(key);
    return item;
  }

  // A hook that throws must not break the write chain or the caller's promise.
  function notify(hook, ...args) {
    if (!hook) return;
    try {
      hook(...args);
    } catch (hookError) {
      console.error('ParsiPad: undo queue callback threw', hookError);
    }
  }

  function failed(action, entry, error) {
    notify(onError, error, entry);
    notify(onSettled, { key: entry.key, action, ok: false, error });
  }

  function remove(entry) {
    if (pending.has(entry.key)) return Promise.resolve(false);

    const committed = enqueue(async () => {
      try {
        const receipt = await commit(entry);
        notify(onSettled, { key: entry.key, action: 'remove', ok: true });
        return { ok: true, receipt };
      } catch (error) {
        closeWindow(entry.key);
        failed('remove', entry, error);
        return { ok: false };
      }
    });
    const timer = setTimeout(() => pending.delete(entry.key), delay);
    pending.set(entry.key, { entry, timer, committed });
    return committed.then(({ ok }) => ok);
  }

  function undoAndWait(key) {
    const item = closeWindow(key);
    if (!item) return Promise.resolve(false);

    return enqueue(async () => {
      const { ok, receipt } = await item.committed;
      if (!ok) return false;
      try {
        await restore(item.entry, receipt);
        notify(onSettled, { key, action: 'restore', ok: true });
        return true;
      } catch (error) {
        failed('restore', item.entry, error);
        return false;
      }
    });
  }

  return {
    /**
     * Delete now; Undo is possible until `delay` has passed.
     * @param {{ key: string }} entry
     * @returns {Promise<boolean>} Settles when the delete has been written: true if it was,
     *   false if it failed or the key was already pending. Never rejects.
     */
    remove,

    /**
     * Put a deleted entry back. Returns false when its window has closed;
     * the restore itself is written in the background (see undoAndWait).
     * @param {string} key
     * @returns {boolean}
     */
    undo(key) {
      const open = pending.has(key);
      undoAndWait(key);
      return open;
    },

    /**
     * Like undo, but resolves once the restore has been written.
     * @param {string} key
     * @returns {Promise<boolean>} true if the entry is back, false if the window had
     *   closed or the delete or restore failed. Never rejects.
     */
    undoAndWait,

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
