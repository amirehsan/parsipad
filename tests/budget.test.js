import { describe, it, expect } from 'vitest';
import { TEMPERATURES, STREAM_IDLE_TIMEOUT_MS, computeMaxTokens, isStreamingMode } from '../lib/translation/budget.js';

describe('budget', () => {
  it('exposes the agreed temperatures and idle timeout', () => {
    expect(TEMPERATURES).toEqual({ translate: 0.2, grammar: 0.3, polish: 0.5 });
    expect(STREAM_IDLE_TIMEOUT_MS).toBe(20000);
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
