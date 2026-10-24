import { classifyMode } from './mode.js';
import { normalizeInput } from './normalize.js';
import { isStreamingMode } from './budget.js';
import { toTranslationError } from './errors.js';

const PORT_NAME = 'translate-stream';
// A user-initiated cancel or a dropped port is not an error the user needs
// to be told about; every caller (floating box, popup, page translation)
// checks errorCode === 'ABORTED' and stops quietly before ever reading
// `error`. The message is kept only as an inert, never-displayed fallback
// in case a future caller reads `error` without checking the code first.
const ABORTED = { error: 'Translation cancelled.', errorCode: 'ABORTED' };

/**
 * Request a translation from the service worker. Short inputs go through a
 * one-shot TRANSLATE message; text and batch modes stream through a port.
 * Resolves with the result contract, or with { error, errorCode } so callers
 * keep their existing `if (response.error)` checks.
 *
 * @param {{text: string, sourceLang?: string, context?: object, mode?: string}} payload
 * @param {{onDelta?: (text: string) => void, signal?: AbortSignal}} [options]
 * @returns {Promise<object>}
 */
export function requestTranslation(payload, { onDelta, signal } = {}) {
  const mode = payload.mode || classifyMode(normalizeInput(payload.text));
  const message = { ...payload, mode };

  if (!isStreamingMode(mode)) {
    return chrome.runtime.sendMessage({ action: 'TRANSLATE', ...message });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let port;
    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
    } catch (error) {
      // An extension reloaded under the page throws here for good; the code
      // lets the box offer a page reload instead of showing Chrome's words.
      const failure = toTranslationError(error);
      finish({ error: failure.message, errorCode: failure.code });
      return;
    }

    port.onMessage.addListener((msg) => {
      if (msg?.type === 'delta') {
        if (onDelta) onDelta(msg.text);
      } else if (msg?.type === 'done') {
        finish(msg.result);
        port.disconnect();
      } else if (msg?.type === 'error') {
        finish({ error: msg.message, errorCode: msg.code || 'UNKNOWN' });
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => finish(ABORTED));

    if (signal) {
      const onAbort = () => {
        finish(ABORTED);
        port.disconnect();
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    port.postMessage({ type: 'start', ...message });
  });
}
