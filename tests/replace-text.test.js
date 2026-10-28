// @vitest-environment happy-dom
// Writing generated text into a field or editor, and undoing it.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { applyReplacement, replaceWholeValue } from '../shared/replace-text.js';

/** A textarea with `value`, listening for input and change. */
function textarea(value) {
  const el = document.createElement('textarea');
  document.body.appendChild(el);
  el.value = value;
  const events = { input: [], change: 0 };
  el.addEventListener('input', (e) => events.input.push(e));
  el.addEventListener('change', () => { events.change += 1; });
  return { el, events };
}

/** A field target for `text` inside `el`, at the given offsets. */
const fieldTarget = (el, start, end, text) => ({ kind: 'field', element: el, start, end, text });

/** A contenteditable editor holding one text node, with a range around `text`. */
function richEditor(content, text) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  const node = document.createTextNode(content);
  el.appendChild(node);
  document.body.appendChild(el);
  const range = document.createRange();
  const at = content.indexOf(text);
  range.setStart(node, at);
  range.setEnd(node, at + text.length);
  const inputs = [];
  el.addEventListener('input', (e) => inputs.push(e));
  return { el, node, range, inputs, target: { kind: 'rich', element: el, range, text } };
}

afterEach(() => {
  document.body.innerHTML = '';
  delete document.execCommand;
});

describe('applyReplacement on a field', () => {
  it('replaces the slice, dispatches input and change, and places the caret after it', () => {
    const { el, events } = textarea('hello world');
    const result = applyReplacement(fieldTarget(el, 6, 11, 'world'), 'there');
    expect(result.ok).toBe(true);
    expect(el.value).toBe('hello there');
    expect(events.input).toHaveLength(1);
    expect(events.input[0]).toMatchObject({ inputType: 'insertReplacementText', bubbles: true, data: 'there' });
    expect(events.change).toBe(1);
    expect([el.selectionStart, el.selectionEnd]).toEqual([11, 11]);
  });

  it('uses execCommand when the document has it and it succeeds', () => {
    const { el, events } = textarea('hello world');
    document.execCommand = vi.fn((command, ui, text) => {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
      return true;
    });
    const result = applyReplacement(fieldTarget(el, 6, 11, 'world'), 'there');
    expect(result.ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'there');
    expect(el.value).toBe('hello there');
    // The editing command fires the site's events itself; no synthetic one.
    expect(events.input).toHaveLength(0);
  });

  it('falls back when execCommand returns false', () => {
    const { el, events } = textarea('hello world');
    document.execCommand = vi.fn(() => false);
    const result = applyReplacement(fieldTarget(el, 6, 11, 'world'), 'there');
    expect(result.ok).toBe(true);
    expect(el.value).toBe('hello there');
    expect(events.input).toHaveLength(1);
  });

  it('still replaces when the slice moved but the text occurs once', () => {
    const { el } = textarea('xx hello world');
    const result = applyReplacement(fieldTarget(el, 6, 11, 'world'), 'there');
    expect(result.ok).toBe(true);
    expect(el.value).toBe('xx hello there');
  });

  it('fails without touching the value when the text is gone or occurs twice', () => {
    const gone = textarea('hello there');
    expect(applyReplacement(fieldTarget(gone.el, 6, 11, 'world'), 'x')).toEqual({ ok: false });
    expect(gone.el.value).toBe('hello there');
    expect(gone.events.input).toHaveLength(0);
    const twice = textarea('world and world');
    expect(applyReplacement(fieldTarget(twice.el, 3, 8, 'world'), 'x')).toEqual({ ok: false });
    expect(twice.el.value).toBe('world and world');
  });

  it('fails on a detached, read-only or disabled element', () => {
    const detached = textarea('hello world');
    detached.el.remove();
    expect(applyReplacement(fieldTarget(detached.el, 6, 11, 'world'), 'x')).toEqual({ ok: false });
    const ro = textarea('hello world');
    ro.el.readOnly = true;
    expect(applyReplacement(fieldTarget(ro.el, 6, 11, 'world'), 'x')).toEqual({ ok: false });
    const dis = textarea('hello world');
    dis.el.disabled = true;
    expect(applyReplacement(fieldTarget(dis.el, 6, 11, 'world'), 'x')).toEqual({ ok: false });
  });

  it('undo restores the original text and offsets', () => {
    const { el } = textarea('hello world');
    const result = applyReplacement(fieldTarget(el, 6, 11, 'world'), 'there, friend');
    expect(result.undo()).toBe(true);
    expect(el.value).toBe('hello world');
    expect([el.selectionStart, el.selectionEnd]).toEqual([6, 11]);
  });

  it('undo refuses when the inserted text moved', () => {
    const { el } = textarea('hello world');
    const result = applyReplacement(fieldTarget(el, 6, 11, 'world'), 'there');
    el.value = 'oh hello there';
    expect(result.undo()).toBe(false);
    expect(el.value).toBe('oh hello there');
  });
});

describe('applyReplacement on a rich editor', () => {
  it('replaces inside a contenteditable and dispatches input', () => {
    const { el, inputs, target } = richEditor('some text here', 'text');
    const result = applyReplacement(target, 'words');
    expect(result.ok).toBe(true);
    expect(el.textContent).toBe('some words here');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ inputType: 'insertReplacementText', bubbles: true });
  });

  it('undo restores the original text in the editor', () => {
    const { el, target } = richEditor('some text here', 'text');
    const result = applyReplacement(target, 'words');
    expect(result.undo()).toBe(true);
    expect(el.textContent).toBe('some text here');
  });

  it('never inserts a second copy when the editor takes the command but renders later', () => {
    // Framework editors (Draft.js, Lexical, ProseMirror) handle beforeinput
    // themselves and update the DOM on their next render. execCommand
    // reports success while the DOM still shows the old text; a manual
    // insert on top of that leaves two copies once the editor renders.
    const { el, node, inputs, target } = richEditor('some text here', 'text');
    let rendered = false;
    document.execCommand = vi.fn(() => {
      queueMicrotask(() => { node.data = 'some words here'; rendered = true; });
      return true;
    });
    const result = applyReplacement(target, 'words');
    expect(result.ok).toBe(true);
    expect(el.textContent).toBe('some text here');
    expect(el.querySelectorAll('*').length + el.childNodes.length).toBe(1);
    expect(inputs).toHaveLength(0);
    return new Promise((resolve) => queueMicrotask(() => {
      expect(rendered).toBe(true);
      expect(el.textContent).toBe('some words here');
      resolve();
    }));
  });

  it('fails for a rich target whose range left the editor', () => {
    const { el, node, target } = richEditor('some text here', 'text');
    node.remove();
    expect(applyReplacement(target, 'words')).toEqual({ ok: false });
    expect(el.textContent).toBe('');
  });
});

describe('replaceWholeValue', () => {
  it('swaps the whole value and dispatches input', () => {
    const { el, events } = textarea('old text');
    expect(replaceWholeValue(el, 'new text')).toBe(true);
    expect(el.value).toBe('new text');
    expect(events.input).toHaveLength(1);
  });
});
