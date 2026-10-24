import { describe, it, expect, vi } from 'vitest';
import { selectionToReport, createSelectionReporter, isEditableSelection } from '../content/selection-report.js';

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

describe('isEditableSelection', () => {
  it('treats a selection inside a contenteditable ancestor as editable', () => {
    const editor = { closest: (s) => (s.startsWith('[contenteditable]') ? editor : null) };
    const text = { nodeType: 3, parentElement: editor };
    expect(isEditableSelection({ anchorNode: text }, { tagName: 'BODY' })).toBe(true);
    expect(isEditableSelection({ anchorNode: { nodeType: 3, parentElement: { closest: () => null } } }, { tagName: 'BODY' })).toBe(false);
    expect(isEditableSelection(null, { tagName: 'SELECT' })).toBe(true);
  });

  it('treats focus in an input, textarea, select or contenteditable element as editable', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isEditableSelection(null, { tagName }), tagName).toBe(true);
    }
    expect(isEditableSelection(null, { tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableSelection(null, { tagName: 'DIV' })).toBe(false);
  });

  it('returns false for a selection without an anchor node', () => {
    expect(isEditableSelection(sel('hello'), null)).toBe(false);
    expect(isEditableSelection({ anchorNode: null }, { tagName: 'BODY' })).toBe(false);
    expect(isEditableSelection(null, null)).toBe(false);
  });

  it('asks for an enabled contenteditable ancestor, not one set to false', () => {
    const asked = [];
    const element = { nodeType: 1, closest: (s) => { asked.push(s); return null; } };
    isEditableSelection({ anchorNode: element }, null);
    expect(asked).toEqual(['[contenteditable]:not([contenteditable="false"])']);
  });
});

describe('rich editors', () => {
  async function dom() {
    const { Window } = await import('happy-dom');
    const window = new Window();
    return window.document;
  }

  function selectText(doc, node) {
    const selection = doc.getSelection();
    selection.removeAllRanges();
    const range = doc.createRange();
    range.selectNodeContents(node);
    selection.addRange(range);
    return selection;
  }

  it('skips a selection in an editor even when focus has moved elsewhere, and leaves focus alone', async () => {
    const doc = await dom();
    doc.body.innerHTML = '<div contenteditable="true"><p><b id="word">Draft text</b> in an editor</p></div><button id="other">Other</button>';
    const other = doc.getElementById('other');
    other.focus();
    const selection = selectText(doc, doc.getElementById('word').firstChild);
    expect(isEditableSelection(selection, doc.activeElement)).toBe(true);
    expect(selectionToReport(selection, doc.activeElement)).toBeNull();
    expect(doc.activeElement).toBe(other);
  });

  it('skips a selection in a focused editor without moving the caret out of it', async () => {
    const doc = await dom();
    doc.body.innerHTML = '<div id="editor" contenteditable="true">Draft text in an editor</div>';
    const editor = doc.getElementById('editor');
    editor.focus();
    const selection = selectText(doc, editor.firstChild);
    expect(isEditableSelection(selection, doc.activeElement)).toBe(true);
    expect(doc.activeElement).toBe(editor);
  });

  it('still offers ordinary text, and a read-only island marked contenteditable="false"', async () => {
    const doc = await dom();
    doc.body.innerHTML = '<article><p id="plain">Ordinary page text</p></article><section contenteditable="false"><p id="island">Read only</p></section>';
    let selection = selectText(doc, doc.getElementById('plain').firstChild);
    expect(isEditableSelection(selection, doc.body)).toBe(false);
    expect(selectionToReport(selection, doc.body)).toBe('Ordinary page text');
    selection = selectText(doc, doc.getElementById('island').firstChild);
    expect(isEditableSelection(selection, doc.body)).toBe(false);
  });

  it('agrees with selectionToReport, so the toolbar and the side panel skip the same selections', async () => {
    const doc = await dom();
    doc.body.innerHTML = '<select id="s"><option>One option</option></select><div contenteditable><span id="e">Editable words</span></div>';
    doc.getElementById('s').focus();
    expect(isEditableSelection(sel('One option'), doc.activeElement)).toBe(true);
    expect(selectionToReport(sel('One option'), doc.activeElement)).toBeNull();
    doc.body.focus();
    const selection = selectText(doc, doc.getElementById('e').firstChild);
    expect(isEditableSelection(selection, doc.body)).toBe(true);
    expect(selectionToReport(selection, doc.body)).toBeNull();
  });
});
