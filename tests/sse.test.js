// tests/sse.test.js
import { describe, it, expect } from 'vitest';
import { createSseParser, readSseEvents } from '../lib/providers/sse.js';

function streamResponse(chunks, { delayMs = 0, hang = false } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
        controller.enqueue(encoder.encode(chunk));
      }
      if (!hang) controller.close();
    }
  });
  return new Response(body, { status: 200 });
}

describe('createSseParser', () => {
  it('parses event and multi-line data blocks', () => {
    const parser = createSseParser();
    const events = parser.push('event: ping\ndata: {"a":1}\ndata: {"b":2}\n\n');
    expect(events).toEqual([{ event: 'ping', data: '{"a":1}\n{"b":2}' }]);
  });
  it('buffers across chunk boundaries and handles CRLF', () => {
    const parser = createSseParser();
    expect(parser.push('data: hel')).toEqual([]);
    expect(parser.push('lo\r\n\r\ndata: [DONE]\r\n\r\n')).toEqual([
      { event: 'message', data: 'hello' },
      { event: 'message', data: '[DONE]' }
    ]);
  });
  it('ignores comments and unknown fields, flushes a trailing block', () => {
    const parser = createSseParser();
    expect(parser.push(': keep-alive\nid: 7\n\n')).toEqual([]);
    expect(parser.push('data: tail')).toEqual([]);
    expect(parser.flush()).toEqual([{ event: 'message', data: 'tail' }]);
    expect(parser.flush()).toEqual([]);
  });
});

describe('readSseEvents', () => {
  it('yields events from a streamed response', async () => {
    const response = streamResponse(['data: a\n\nda', 'ta: b\n\n']);
    const seen = [];
    for await (const ev of readSseEvents(response)) seen.push(ev.data);
    expect(seen).toEqual(['a', 'b']);
  });
  it('throws TIMEOUT when the stream goes idle', async () => {
    const response = streamResponse(['data: a\n\n'], { hang: true });
    const run = async () => {
      for await (const _ev of readSseEvents(response, { idleTimeoutMs: 30 })) { /* drain */ }
    };
    await expect(run()).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('stops when the abort signal fires', async () => {
    const controller = new AbortController();
    const response = streamResponse(['data: a\n\n', 'data: b\n\n'], { delayMs: 20 });
    const seen = [];
    const run = async () => {
      for await (const ev of readSseEvents(response, { signal: controller.signal })) {
        seen.push(ev.data);
        controller.abort();
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'ABORTED' });
    expect(seen).toEqual(['a']);
  });
});
