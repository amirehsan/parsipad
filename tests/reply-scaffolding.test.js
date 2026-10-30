import { describe, it, expect, vi } from 'vitest';
import { stripReplyScaffolding, createScaffoldingGate } from '../lib/translation/reply.js';

const HEADER = '<task>\nMode: text. Source: English (detected, may be wrong). Target: Persian.\nTranslate the whole text inside <text>.\n</task>\n';

describe('stripReplyScaffolding', () => {
  it('removes an echoed task header in front of the translation', () => {
    expect(stripReplyScaffolding(`${HEADER}سلام دنیا`)).toBe('سلام دنیا');
  });

  it('unwraps a translation the model put inside text tags', () => {
    expect(stripReplyScaffolding('<text>\nسلام دنیا\n</text>')).toBe('سلام دنیا');
    expect(stripReplyScaffolding(`${HEADER}<text>سلام دنیا</text>`)).toBe('سلام دنیا');
  });

  it('is case-insensitive about the tags', () => {
    expect(stripReplyScaffolding('<TASK>Mode: text.</TASK>\n<Text>hi</Text>')).toBe('hi');
  });

  it('leaves an ordinary reply alone, tags inside the text included', () => {
    expect(stripReplyScaffolding('سلام دنیا')).toBe('سلام دنیا');
    expect(stripReplyScaffolding('<p>Hello</p> and <text> later')).toBe('<p>Hello</p> and <text> later');
    expect(stripReplyScaffolding('[1] یک\n[2] دو')).toBe('[1] یک\n[2] دو');
  });

  it('keeps a header that is part of the translation itself', () => {
    const body = 'He wrote <task> on the board and left.';
    expect(stripReplyScaffolding(body)).toBe(body);
  });

  it('tolerates empty input', () => {
    expect(stripReplyScaffolding('')).toBe('');
    expect(stripReplyScaffolding(undefined)).toBe('');
  });
});

describe('createScaffoldingGate', () => {
  it('passes an ordinary stream through at once and unchanged', () => {
    const onDelta = vi.fn();
    const gate = createScaffoldingGate(onDelta);
    gate('سلام ');
    expect(onDelta).toHaveBeenCalledWith('سلام ');
    gate('دنیا');
    expect(onDelta.mock.calls).toEqual([['سلام '], ['دنیا']]);
  });

  it('holds back an echoed header and releases only the translation', () => {
    const onDelta = vi.fn();
    const gate = createScaffoldingGate(onDelta);
    gate('<ta');
    gate('sk>\nMode: text. Source: English. Target: Persian.\n');
    gate('Translate the whole text inside <text>.\n</task>\n');
    expect(onDelta).not.toHaveBeenCalled();
    gate('سلام ');
    expect(onDelta.mock.calls).toEqual([['سلام ']]);
    gate('دنیا');
    expect(onDelta.mock.calls).toEqual([['سلام '], ['دنیا']]);
  });

  it('holds back an opening text tag and releases what follows it', () => {
    const onDelta = vi.fn();
    const gate = createScaffoldingGate(onDelta);
    gate('<text>\n');
    expect(onDelta).not.toHaveBeenCalled();
    gate('سلام');
    expect(onDelta.mock.calls).toEqual([['سلام']]);
  });

  it('releases a reply that merely starts with a different tag', () => {
    const onDelta = vi.fn();
    const gate = createScaffoldingGate(onDelta);
    gate('<t');
    expect(onDelta).not.toHaveBeenCalled();
    gate('itle>Hello</title>');
    expect(onDelta.mock.calls).toEqual([['<title>Hello</title>']]);
  });

  it('stops waiting for a closing task tag that never comes', () => {
    const onDelta = vi.fn();
    const gate = createScaffoldingGate(onDelta);
    gate('<task>\n');
    gate('x'.repeat(700));
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta.mock.calls[0][0].startsWith('<task>')).toBe(true);
  });

  it('ignores leading whitespace while deciding', () => {
    const onDelta = vi.fn();
    const gate = createScaffoldingGate(onDelta);
    gate('\n\n');
    expect(onDelta).not.toHaveBeenCalled();
    gate('<task>a</task>\n\nب');
    expect(onDelta.mock.calls).toEqual([['ب']]);
  });
});
