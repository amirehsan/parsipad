import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../lib/retry.js';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: init.headers });
}

describe('withRetry', () => {
  it('returns the response immediately on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const res = await withRetry(fetchFn);
    expect(res.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on non-retryable status codes', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, { status: 400 }));
    const res = await withRetry(fetchFn, { maxRetries: 3, baseDelay: 1, maxDelay: 5 });
    expect(res.status).toBe(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 then succeeds', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ rate: 'limited' }, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, { status: 200 }));
    const res = await withRetry(fetchFn, { maxRetries: 3, baseDelay: 1, maxDelay: 5 });
    expect(res.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('aborts immediately when the external signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await expect(
      withRetry(fetchFn, { signal: controller.signal, maxRetries: 3, baseDelay: 1, maxDelay: 5 })
    ).rejects.toBeDefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('passes a per-attempt signal into fetchFn', async () => {
    const fetchFn = vi.fn((signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    await withRetry(fetchFn, { timeoutMs: 1000 });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
