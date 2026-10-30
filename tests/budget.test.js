import { describe, it, expect } from 'vitest';
import { TEMPERATURES, STREAM_IDLE_TIMEOUT_MS, POLISH_TIMEOUT_MS, SLOW_REPLY_NOTICE_MS, computeMaxTokens, isStreamingMode } from '../lib/translation/budget.js';

describe('budget', () => {
  it('exposes the agreed temperatures and idle timeout', () => {
    expect(TEMPERATURES).toEqual({ translate: 0.2, grammar: 0.3, polish: 0.5, polishVariant: 0.7, image: 0.2 });
    expect(STREAM_IDLE_TIMEOUT_MS).toBe(20000);
    expect(POLISH_TIMEOUT_MS).toBe(60000);
  });
  // Healthy replies measured 0.7 to 2 s on Gemini Flash-Lite and about 3 s on
  // Claude Haiku, so 6 s rarely fires on a normal day and still comes well
  // before anyone gives up; it must also come well before the request is
  // given up on.
  it('says a reply is slow at six seconds, long before giving up on it', () => {
    expect(SLOW_REPLY_NOTICE_MS).toBe(6000);
    expect(SLOW_REPLY_NOTICE_MS).toBeLessThan(POLISH_TIMEOUT_MS / 4);
  });
  it('uses fixed budgets for short modes', () => {
    expect(computeMaxTokens('word', 'charge')).toBe(700);
    expect(computeMaxTokens('phrase', 'run the migration')).toBe(700);
    expect(computeMaxTokens('sentence', 'a'.repeat(200))).toBe(900);
  });
  it('scales text and batch budgets with input length, capped at 4096', () => {
    expect(computeMaxTokens('text', 'a'.repeat(100))).toBe(600);
    expect(computeMaxTokens('batch', 'a'.repeat(100))).toBe(600);
    expect(computeMaxTokens('text', 'a'.repeat(5000))).toBe(4096);
  });
  it('streams only text and batch', () => {
    expect(isStreamingMode('text')).toBe(true);
    expect(isStreamingMode('batch')).toBe(true);
    expect(isStreamingMode('word')).toBe(false);
    expect(isStreamingMode('sentence')).toBe(false);
  });
});
