import { classifyMode } from './mode.js';
import { normalizeInput } from './normalize.js';
import { isStreamingMode } from './budget.js';

const PORT_NAME = 'translate-stream';
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
      finish({ error: error?.message || 'Connection failed', errorCode: 'UNKNOWN' });
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
