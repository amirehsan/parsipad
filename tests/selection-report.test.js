import { describe, it, expect, vi } from 'vitest';
import { selectionToReport, createSelectionReporter } from '../content/selection-report.js';

const sel = (text) => ({ toString: () => text });

describe('selectionToReport', () => {
  it('returns trimmed text of two or more characters', () => {
    expect(selectionToReport(sel('  hello  '), null)).toBe('hello');
    expect(selectionToReport(sel('h'), null)).toBeNull();
    expect(selectionToReport(null, null)).toBeNull();
  });

  it('ignores selections inside editable elements', () => {
    expect(selectionToReport(sel('hello'), { tagName: 'TEXTAREA' })).toBeNull();
    expect(selectionToReport(sel('hello'), { tagName: 'INPUT' })).toBeNull();
    expect(selectionToReport(sel('hello'), { tagName: 'DIV', isContentEditable: true })).toBeNull();
  });
});

describe('createSelectionReporter', () => {
  it('debounces and sends only on change', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const report = createSelectionReporter(send, { delay: 300 });
    report('hello'); report('hello world'); vi.advanceTimersByTime(300);
    report('hello world'); vi.advanceTimersByTime(300);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('hello world');
    vi.useRealTimers();
  });

  it('does not send when the selection is cleared', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const report = createSelectionReporter(send, { delay: 300 });
    report(null); vi.advanceTimersByTime(300);
    expect(send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
