// lib/providers/sse.js
import { TranslationError, ERROR_CODES } from '../translation/errors.js';

const BLOCK_DELIMITER = /\r?\n\r?\n/;

function parseBlock(block) {
  let event = 'message';
  const data = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(':')) continue;
    const idx = rawLine.indexOf(':');
    const field = idx === -1 ? rawLine : rawLine.slice(0, idx);
    let value = idx === -1 ? '' : rawLine.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

/**
 * Incremental Server-Sent Events parser. Feed it decoded text chunks; it
 * returns complete events and keeps partial blocks buffered.
 */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      const events = [];
      let match;
      while ((match = BLOCK_DELIMITER.exec(buffer)) !== null) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const event = parseBlock(block);
        if (event) events.push(event);
      }
      return events;
    },
    flush() {
      const block = buffer;
      buffer = '';
      const event = block.trim() ? parseBlock(block) : null;
      return event ? [event] : [];
    }
  };
}

/**
 * Read a fetch Response body as SSE events. Throws TranslationError TIMEOUT
 * when no bytes arrive for idleTimeoutMs and ABORTED when signal fires.
 * @param {Response} response
 * @param {{ signal?: AbortSignal, idleTimeoutMs?: number }} [options]
 */
export async function* readSseEvents(response, { signal, idleTimeoutMs = 0 } = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  const readWithIdleTimeout = () => {
    if (!idleTimeoutMs) return reader.read();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        // Reject before cancelling the reader: cancel() synchronously
        // settles any pending read() with { done: true }, and if that ran
        // first its resolution would win the race below instead of this
        // timeout rejection.
        reject(new TranslationError(ERROR_CODES.TIMEOUT));
        reader.cancel().catch(() => {});
      }, idleTimeoutMs);
    });
    return Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
  };

  try {
    while (true) {
      if (aborted) throw new TranslationError(ERROR_CODES.ABORTED);
      const { value, done } = await readWithIdleTimeout();
      if (aborted) throw new TranslationError(ERROR_CODES.ABORTED);
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) yield event;
    }
    for (const event of parser.flush()) yield event;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
