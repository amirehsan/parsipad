// @vitest-environment happy-dom
// Which selections Replace can write back to, and where they are.
import { describe, it, expect, afterEach } from 'vitest';
import { captureEditableTarget, targetRect, ACCEPTED_INPUT_TYPES } from '../content/editable-target.js';

/**
 * Append a field, give it a value and a selection, and focus it.
 * @param {'input'|'textarea'} tag
 * @param {Record<string, string>} attrs
 * @param {string} value
 * @param {number} start
 * @param {number} end
 */
function field(tag, attrs, value, start, end) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  el.value = value;
  el.focus();
  el.setSelectionRange(start, end);
  return el;
}

/**
 * A contenteditable editor holding one text node, with `text` selected.
 * @param {string} content
 * @param {string} text
 * @param {{ island?: boolean }} [options]
 */
function editor(content, text, { island = false } = {}) {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  let holder = el;
  if (island) {
    holder = document.createElement('span');
    holder.setAttribute('contenteditable', 'false');
    el.appendChild(holder);
  }
  const node = document.createTextNode(content);
  holder.appendChild(node);
  document.body.appendChild(el);
  const range = document.createRange();
  const at = content.indexOf(text);
  range.setStart(node, at);
  range.setEnd(node, at + text.length);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return { el, selection };
}

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection().removeAllRanges();
});

describe('captureEditableTarget on fields', () => {
  it('captures a textarea selection with offsets and text', () => {
    const el = field('textarea', {}, 'hello world', 6, 11);
    expect(captureEditableTarget(window.getSelection(), el))
      .toEqual({ kind: 'field', element: el, start: 6, end: 11, text: 'world' });
  });

  it.each(['text', 'search', 'url', null])('captures an input of type %s', (type) => {
    const attrs = type ? { type } : {};
    const el = field('input', attrs, 'hello world', 0, 5);
    expect(captureEditableTarget(window.getSelection(), el)).toMatchObject({ kind: 'field', start: 0, end: 5, text: 'hello' });
  });

  it('lists the accepted input types', () => {
    expect(ACCEPTED_INPUT_TYPES).toEqual(['text', 'search', 'url']);
  });

  it.each(['password', 'number', 'tel', 'date', 'email'])('returns null for an input of type %s', (type) => {
    const el = document.createElement('input');
    el.setAttribute('type', type);
    document.body.appendChild(el);
    el.focus();
    expect(captureEditableTarget(window.getSelection(), el)).toBeNull();
  });

  it('returns null for read-only, disabled and collapsed selections', () => {
    const ro = field('textarea', { readonly: '' }, 'hello world', 0, 5);
    expect(captureEditableTarget(window.getSelection(), ro)).toBeNull();
    const dis = field('textarea', { disabled: '' }, 'hello world', 0, 5);
    expect(captureEditableTarget(window.getSelection(), dis)).toBeNull();
    const collapsed = field('textarea', {}, 'hello world', 3, 3);
    expect(captureEditableTarget(window.getSelection(), collapsed)).toBeNull();
  });

  it('returns null for a select and an opaque custom element', () => {
    const select = document.createElement('select');
    document.body.appendChild(select);
    expect(captureEditableTarget(window.getSelection(), select)).toBeNull();
    const custom = document.createElement('x-editor');
    document.body.appendChild(custom);
    expect(captureEditableTarget(window.getSelection(), custom)).toBeNull();
  });

  it('shrinks offsets to the trimmed text', () => {
    const el = field('textarea', {}, 'a  word \nb', 1, 9);
    expect(captureEditableTarget(window.getSelection(), el)).toMatchObject({ start: 3, end: 7, text: 'word' });
  });

  it('returns null when the selection is only whitespace', () => {
    const el = field('textarea', {}, 'a   b', 1, 4);
    expect(captureEditableTarget(window.getSelection(), el)).toBeNull();
  });

  it('finds a field inside an open shadow root', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const el = document.createElement('textarea');
    root.appendChild(el);
    el.value = 'shadow text';
    el.focus();
    el.setSelectionRange(0, 6);
    expect(captureEditableTarget(window.getSelection(), host)).toMatchObject({ kind: 'field', element: el, text: 'shadow' });
  });
});

describe('captureEditableTarget on rich editors', () => {
  it('captures a contenteditable selection as rich', () => {
    const { el, selection } = editor('some text here', 'text');
    const target = captureEditableTarget(selection, document.body);
    expect(target).toMatchObject({ kind: 'rich', element: el, text: 'text' });
    expect(target.range).toBeInstanceOf(Range);
    expect(target.range.toString()).toBe('text');
  });

  it('treats a contenteditable="false" island inside an editor as the editor', () => {
    const { el, selection } = editor('island text', 'island', { island: true });
    expect(captureEditableTarget(selection, document.body)).toMatchObject({ kind: 'rich', element: el });
  });

  it('returns null for ordinary page text', () => {
    const p = document.createElement('p');
    const node = document.createTextNode('plain text');
    p.appendChild(node);
    document.body.appendChild(p);
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 5);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    expect(captureEditableTarget(selection, document.body)).toBeNull();
  });

  it('returns null for a collapsed selection in an editor', () => {
    const { el, selection } = editor('some text', 'text');
    selection.collapseToStart();
    expect(captureEditableTarget(selection, el)).toBeNull();
  });
});

describe('targetRect', () => {
  it('uses the field box for a field target', () => {
    const el = field('textarea', {}, 'hello', 0, 5);
    const box = { top: 10, bottom: 40, left: 5, right: 105, width: 100, height: 30 };
    el.getBoundingClientRect = () => box;
    expect(targetRect({ kind: 'field', element: el, start: 0, end: 5, text: 'hello' })).toBe(box);
  });

  it('uses the range box for a rich target', () => {
    const range = { getBoundingClientRect: () => ({ top: 1 }) };
    expect(targetRect({ kind: 'rich', element: null, range, text: 'x' })).toEqual({ top: 1 });
  });
});
