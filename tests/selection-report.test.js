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

  it('caps the report at 2000 characters', () => {
    expect(selectionToReport(sel('a'.repeat(5000)), null)).toHaveLength(2000);
    expect(selectionToReport(sel('a'.repeat(2000)), null)).toHaveLength(2000);
  });
});

describe('createSelectionReporter', () => {
  it('debounces and sends only on change', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const report = createSelectionReporter(send, { delay: 300 });
    report(() => 'hello'); report(() => 'hello world'); vi.advanceTimersByTime(300);
    report(() => 'hello world'); vi.advanceTimersByTime(300);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('hello world');
    vi.useRealTimers();
  });

  it('does not call the getter until the delay has elapsed', () => {
    vi.useFakeTimers();
    const getReport = vi.fn(() => 'hello');
    const report = createSelectionReporter(vi.fn(), { delay: 300 });
    report(getReport); report(getReport);
    vi.advanceTimersByTime(299);
    expect(getReport).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(getReport).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not send when the selection is cleared', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const report = createSelectionReporter(send, { delay: 300 });
    report(() => null); vi.advanceTimersByTime(300);
    expect(send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sends the same text again after the selection was cleared', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const report = createSelectionReporter(send, { delay: 300 });
    report(() => 'foo'); vi.advanceTimersByTime(300);
    report(() => null); vi.advanceTimersByTime(300);
    report(() => 'foo'); vi.advanceTimersByTime(300);
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('selectionToReport inside shadow DOM', () => {
  async function dom() {
    const { Window } = await import('happy-dom');
    const window = new Window();
    return window.document;
  }

  it('rejects a focused input inside an open shadow root', async () => {
    const doc = await dom();
    const host = doc.createElement('search-box');
    doc.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const input = doc.createElement('input');
    root.appendChild(input);
    input.focus();
    // The page sees the host, not the input, as its active element.
    expect(doc.activeElement).toBe(host);
    expect(selectionToReport(sel('hello'), doc.activeElement)).toBeNull();
  });

  it('rejects an input nested through two open shadow roots', async () => {
    const doc = await dom();
    const outer = doc.createElement('outer-box');
    doc.body.appendChild(outer);
    const outerRoot = outer.attachShadow({ mode: 'open' });
    const inner = doc.createElement('inner-box');
    outerRoot.appendChild(inner);
    const innerRoot = inner.attachShadow({ mode: 'open' });
    const area = doc.createElement('textarea');
    innerRoot.appendChild(area);
    area.focus();
    expect(selectionToReport(sel('hello'), doc.activeElement)).toBeNull();
  });

  it('rejects a focused custom element whose shadow root is closed', async () => {
    const doc = await dom();
    const host = doc.createElement('secret-field');
    host.setAttribute('tabindex', '0');
    doc.body.appendChild(host);
    host.attachShadow({ mode: 'closed' });
    host.focus();
    expect(host.shadowRoot).toBeNull();
    expect(selectionToReport(sel('hello'), doc.activeElement)).toBeNull();
  });

  it('still reports text when focus is on a non-editable element inside a shadow root', async () => {
    const doc = await dom();
    const host = doc.createElement('fancy-card');
    doc.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const button = doc.createElement('button');
    root.appendChild(button);
    button.focus();
    expect(selectionToReport(sel('hello'), doc.activeElement)).toBe('hello');
  });

  it('still reports ordinary light-DOM text', async () => {
    const doc = await dom();
    const p = doc.createElement('p');
    p.setAttribute('tabindex', '0');
    doc.body.appendChild(p);
    p.focus();
    expect(selectionToReport(sel('hello'), doc.activeElement)).toBe('hello');
    expect(selectionToReport(sel('hello'), doc.body)).toBe('hello');
  });
});
