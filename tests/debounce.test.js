import { describe, it, expect, vi, afterEach } from 'vitest';
import { debounce } from '../lib/debounce.js';

describe('debounce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once, after the delay, with the last arguments', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const search = debounce(fn, 200);
    search('a');
    vi.advanceTimersByTime(150);
    search('ab');
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('ab');
  });

  it('runs again for a later burst', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const search = debounce(fn, 100);
    search(1);
    vi.advanceTimersByTime(100);
    search(2);
    vi.advanceTimersByTime(100);
    expect(fn.mock.calls).toEqual([[1], [2]]);
  });

  it('cancel drops the pending call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const search = debounce(fn, 100);
    search('x');
    search.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});
