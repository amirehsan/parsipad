import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUndoQueue } from '../lib/undo-queue.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function makeQueue(options = {}) {
  const commit = vi.fn().mockResolvedValue(undefined);
  const restore = vi.fn().mockResolvedValue(undefined);
  const queue = createUndoQueue({ commit, restore, ...options });
  return { queue, commit, restore };
}

describe('undo queue', () => {
  it('commits the delete immediately and keeps it undoable for the delay', async () => {
    const { queue, commit, restore } = makeQueue({ delay: 5000 });
    queue.remove({ key: 'translation:1' });
    await queue.flushWrites();
    expect(commit).toHaveBeenCalledWith({ key: 'translation:1' });
    expect(queue.isPending('translation:1')).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(queue.isPending('translation:1')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(queue.isPending('translation:1')).toBe(false);
    expect(restore).not.toHaveBeenCalled();
  });

  it('undo restores the entry with what commit returned', async () => {
    const { queue, commit, restore } = makeQueue();
    commit.mockResolvedValue({ record: 'raw' });
    queue.remove({ key: 'a' });
    expect(queue.undo('a')).toBe(true);
    await queue.flushWrites();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith({ key: 'a' }, { record: 'raw' });
    expect(queue.isPending('a')).toBe(false);
    expect(queue.undo('a')).toBe(false);
  });

  it('does not restore after the delay has passed', async () => {
    const { queue, restore } = makeQueue();
    queue.remove({ key: 'a' });
    vi.advanceTimersByTime(5000);
    expect(queue.undo('a')).toBe(false);
    await queue.flushWrites();
    expect(restore).not.toHaveBeenCalled();
  });

  it('runs writes one at a time, in order', async () => {
    const log = [];
    let releaseFirst;
    const commit = vi.fn(entry => {
      log.push(`commit:${entry.key}:start`);
      if (entry.key === 'a') return new Promise(resolve => { releaseFirst = () => { log.push('commit:a:end'); resolve('ra'); }; });
      log.push(`commit:${entry.key}:end`);
      return Promise.resolve();
    });
    const restore = vi.fn(async entry => { log.push(`restore:${entry.key}`); });
    const queue = createUndoQueue({ commit, restore });
    queue.remove({ key: 'a' });
    queue.remove({ key: 'b' });
    queue.undo('a');
    await Promise.resolve();
    expect(log).toEqual(['commit:a:start']);
    releaseFirst();
    await queue.flushWrites();
    expect(log).toEqual(['commit:a:start', 'commit:a:end', 'commit:b:start', 'commit:b:end', 'restore:a']);
  });

  it('flush ends every undo window and resolves once the writes are done', async () => {
    const { queue, commit, restore } = makeQueue();
    queue.remove({ key: 'a' });
    queue.remove({ key: 'b' });
    await queue.flush();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(queue.isPending('a')).toBe(false);
    expect(queue.isPending('b')).toBe(false);
    expect(queue.undo('a')).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(restore).not.toHaveBeenCalled();
  });

  it('a failed commit is reported, closes the window and is never restored', async () => {
    const onError = vi.fn();
    const failure = new Error('quota');
    const { queue, commit, restore } = makeQueue({ onError });
    commit.mockRejectedValueOnce(failure);
    queue.remove({ key: 'a' });
    queue.remove({ key: 'b' });
    queue.undo('a');
    await queue.flushWrites();
    expect(onError).toHaveBeenCalledWith(failure, { key: 'a' });
    expect(restore).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(queue.isPending('a')).toBe(false);
    expect(queue.isPending('b')).toBe(true);
  });

  it('a failed commit closes the undo window at once, with no Undo called', async () => {
    const { queue, commit } = makeQueue({ onError: vi.fn() });
    commit.mockRejectedValueOnce(new Error('quota'));
    await queue.remove({ key: 'a' });
    expect(queue.isPending('a')).toBe(false);
    expect(queue.undo('a')).toBe(false);
  });

  it('a failed restore is reported and later writes still run', async () => {
    const onError = vi.fn();
    const failure = new Error('quota');
    const { queue, commit, restore } = makeQueue({ onError });
    restore.mockRejectedValueOnce(failure);
    queue.remove({ key: 'a' });
    queue.undo('a');
    queue.remove({ key: 'b' });
    await queue.flushWrites();
    expect(onError).toHaveBeenCalledWith(failure, { key: 'a' });
    expect(commit).toHaveBeenCalledWith({ key: 'b' });
  });

  it('ignores a second remove of a key that is already pending', async () => {
    const { queue, commit } = makeQueue();
    queue.remove({ key: 'a' });
    queue.remove({ key: 'a' });
    await queue.flushWrites();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('remove returns the write, which settles true on success and false on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { queue, commit } = makeQueue();
    await expect(queue.remove({ key: 'a' })).resolves.toBe(true);
    commit.mockRejectedValueOnce(new Error('quota'));
    await expect(queue.remove({ key: 'b' })).resolves.toBe(false);
  });

  it('undoAndWait settles true once restored, false when the window is closed or the restore fails', async () => {
    const { queue, restore } = makeQueue({ onError: vi.fn() });
    queue.remove({ key: 'a' });
    await expect(queue.undoAndWait('a')).resolves.toBe(true);
    await expect(queue.undoAndWait('a')).resolves.toBe(false);
    restore.mockRejectedValueOnce(new Error('quota'));
    queue.remove({ key: 'b' });
    await expect(queue.undoAndWait('b')).resolves.toBe(false);
  });

  it('reports every settled write through onSettled', async () => {
    const onSettled = vi.fn();
    const failure = new Error('quota');
    const { queue, commit, restore } = makeQueue({ onSettled, onError: vi.fn() });
    queue.remove({ key: 'a' });
    queue.undo('a');
    commit.mockImplementation(async entry => { if (entry.key === 'b') throw failure; });
    restore.mockImplementation(async entry => { if (entry.key === 'c') throw failure; });
    queue.remove({ key: 'b' });
    queue.remove({ key: 'c' });
    queue.undo('c');
    await queue.flushWrites();
    expect(onSettled.mock.calls.map(([event]) => event)).toEqual([
      { key: 'a', action: 'remove', ok: true },
      { key: 'a', action: 'restore', ok: true },
      { key: 'b', action: 'remove', ok: false, error: failure },
      { key: 'c', action: 'remove', ok: true },
      { key: 'c', action: 'restore', ok: false, error: failure }
    ]);
  });

  it('a failing commit leaves storage untouched (nothing is restored for it)', async () => {
    const onSettled = vi.fn();
    const { queue, commit, restore } = makeQueue({ onSettled, onError: vi.fn() });
    commit.mockRejectedValueOnce(new Error('quota'));
    queue.remove({ key: 'a' });
    queue.undo('a');
    await queue.flushWrites();
    expect(restore).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ key: 'a', action: 'remove', ok: false }));
  });

  it('a throwing onError or onSettled does not break the chain', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn(() => { throw new Error('onError bug'); });
    const onSettled = vi.fn(() => { throw new Error('onSettled bug'); });
    const { queue, commit, restore } = makeQueue({ onError, onSettled });
    commit.mockRejectedValueOnce(new Error('quota'));
    queue.remove({ key: 'a' });
    queue.remove({ key: 'b' });
    queue.undo('b');
    await expect(queue.flushWrites()).resolves.toBeUndefined();
    expect(commit).toHaveBeenCalledWith({ key: 'b' });
    expect(restore).toHaveBeenCalledWith({ key: 'b' }, undefined);
  });
});
