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

  // Each attempt was capped but the call as a whole was not, so a provider
  // that is both slow and failing could hold one translation for minutes.
  it('stops retrying once the overall deadline is spent', async () => {
    const fetchFn = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 30));
      return jsonResponse({ e: 1 }, { status: 503 });
    });
    const startedAt = Date.now();
    const res = await withRetry(fetchFn, { maxRetries: 5, baseDelay: 1, maxDelay: 1, timeoutMs: 50, deadlineMs: 70 });
    // The provider's own error, not our abort, so the caller still maps it to
    // "service unavailable" rather than a timeout.
    expect(res.status).toBe(503);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(3);
    expect(Date.now() - startedAt).toBeLessThan(140);
  });

  it('does not wait out a backoff that would outlast the deadline', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ e: 1 }, { status: 429 }));
    const startedAt = Date.now();
    const res = await withRetry(fetchFn, { maxRetries: 5, baseDelay: 400, maxDelay: 400, timeoutMs: 50, deadlineMs: 60 });
    expect(res.status).toBe(429);
    expect(Date.now() - startedAt).toBeLessThan(200);
  });

  // Vision and grammar lessons ask for a long single attempt on purpose; the
  // budget must not quietly cut one of those short.
  it('never shortens a single attempt below the caller timeout', async () => {
    const fetchFn = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 40));
      return jsonResponse({ ok: true });
    });
    const res = await withRetry(fetchFn, { timeoutMs: 120, deadlineMs: 10 });
    expect(res.ok).toBe(true);
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
