/**
 * The notice a surface shows when a provider is slow to answer. Nothing
 * here knows whether the provider is busy, only that a healthy reply would
 * have landed by now, so the wording says "longer than usual" and nothing
 * more. The request itself is untouched; the existing timeout still ends it.
 */

import { SLOW_REPLY_NOTICE_MS } from './translation/budget.js';
import { t } from './i18n.js';

/**
 * Arm a notice for a request that has just been sent. Once `delayMs` pass
 * with the watch still armed, `message` is awaited and its text handed to
 * `render`. Call the returned function when the reply or an error lands:
 * nothing is rendered after that, even if the message was still being
 * built, so a notice never appears over a result. A message that cannot
 * be built renders nothing.
 *
 * @param {object} params
 * @param {() => Promise<string>} params.message
 * @param {(text: string) => void} params.render
 * @param {number} [params.delayMs]
 * @returns {() => void} stop
 */
export function watchSlowReply({ message, render, delayMs = SLOW_REPLY_NOTICE_MS }) {
  let armed = true;
  const timer = setTimeout(async () => {
    let text;
    try {
      text = await message();
    } catch {
      return;
    }
    if (armed) render(text);
  }, delayMs);
  return () => {
    armed = false;
    clearTimeout(timer);
  };
}

/**
 * @param {string} providerName - as the user knows it: Claude, Gemini, ChatGPT
 * @param {string} lang - interface language
 * @returns {string}
 */
export function slowReplyMessage(providerName, lang) {
  return t('slowReply', lang).replace('{provider}', providerName);
}
