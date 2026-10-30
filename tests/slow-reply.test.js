import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { watchSlowReply, slowReplyMessage } from '../lib/slow-reply.js';
import { SLOW_REPLY_NOTICE_MS } from '../lib/translation/budget.js';
import { translations } from '../lib/i18n.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('watchSlowReply', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the message once the delay has passed with no reply', async () => {
    const render = vi.fn();
    watchSlowReply({ message: async () => 'slow', render });
    await vi.advanceTimersByTimeAsync(SLOW_REPLY_NOTICE_MS - 1);
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith('slow');
  });

  it('renders nothing when stopped before the delay', async () => {
    const render = vi.fn();
    const stop = watchSlowReply({ message: async () => 'slow', render });
    await vi.advanceTimersByTimeAsync(SLOW_REPLY_NOTICE_MS - 1);
    stop();
    await vi.advanceTimersByTimeAsync(SLOW_REPLY_NOTICE_MS);
    expect(render).not.toHaveBeenCalled();
  });

  // The message is built from storage, so the reply can land while it is
  // still being read; a notice must never appear over a result.
  it('renders nothing when stopped while the message was still being built', async () => {
    const render = vi.fn();
    const text = deferred();
    const stop = watchSlowReply({ message: () => text.promise, render });
    await vi.advanceTimersByTimeAsync(SLOW_REPLY_NOTICE_MS);
    stop();
    text.resolve('slow');
    await vi.advanceTimersByTimeAsync(0);
    expect(render).not.toHaveBeenCalled();
  });

  it('stays quiet when the message cannot be built', async () => {
    const render = vi.fn();
    watchSlowReply({ message: async () => { throw new Error('storage gone'); }, render });
    await vi.advanceTimersByTimeAsync(SLOW_REPLY_NOTICE_MS);
    expect(render).not.toHaveBeenCalled();
  });

  it('takes its own delay', async () => {
    const render = vi.fn();
    watchSlowReply({ message: async () => 'slow', render, delayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(render).toHaveBeenCalledWith('slow');
  });
});

describe('slowReplyMessage', () => {
  it('names the provider in the interface language', () => {
    expect(slowReplyMessage('Gemini', 'en')).toBe('Gemini is taking longer than usual. Still waiting, this can take up to a minute.');
    expect(slowReplyMessage('Gemini', 'fa')).toBe(translations.fa.slowReply.replace('{provider}', 'Gemini'));
    expect(slowReplyMessage('Gemini', 'fa')).toContain('Gemini');
    expect(slowReplyMessage('Gemini', 'fa')).not.toContain('{provider}');
  });
});
