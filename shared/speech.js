// shared/speech.js
/**
 * English speech playback, shared by the grammar page and the card.
 *
 * Playback is deliberately English-only. Browser Persian voices are
 * inconsistent across platforms and the product teaches English to
 * Persian speakers, so listening to Persian was never a goal. The guard
 * lives here rather than at each call site, which is why a caller can
 * hand this module any text without checking first: `canSpeak` decides
 * whether to offer the control, and `speak` refuses anyway if it is
 * called with Persian.
 *
 * Every read of `speechSynthesis` happens at call time, not at import
 * time, so a page that loads before the API is ready still works.
 */
import { getTextDirection } from '../lib/language-detect.js';

/**
 * The speech synthesis API, or null where it does not exist.
 * @returns {SpeechSynthesis|null}
 */
function synth() {
  return typeof globalThis.speechSynthesis === 'undefined' ? null : globalThis.speechSynthesis;
}

/**
 * Whether this text can be spoken: non-empty, English, and with an API
 * to speak it. A host offers its Listen control only when this is true.
 * @param {string} text
 * @returns {boolean}
 */
export function canSpeak(text) {
  if (!text || !String(text).trim()) return false;
  if (!synth()) return false;
  return getTextDirection(text) === 'ltr';
}

/**
 * Speak the text, replacing whatever is currently playing.
 *
 * The caller is told when playback starts and stops so it can show the
 * state on its own control; this module keeps no state of its own, so
 * two hosts on the same page cannot disagree about what is playing.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {Function} [options.onStateChange] - called with true on start, false on stop
 * @returns {boolean} whether an utterance was started
 */
export function speak(text, { onStateChange } = {}) {
  if (!canSpeak(text)) return false;

  const speech = synth();
  speech.cancel();

  const utterance = new globalThis.SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';

  // English-only after the canSpeak guard above.
  const voice = (speech.getVoices() || []).find(v => v.lang && v.lang.startsWith('en'));
  if (voice) utterance.voice = voice;

  const report = (speaking) => {
    if (onStateChange) onStateChange(speaking);
  };
  utterance.onstart = () => report(true);
  utterance.onend = () => report(false);
  utterance.onerror = () => report(false);

  speech.speak(utterance);
  return true;
}

/**
 * Stop whatever is playing. Safe to call when nothing is.
 */
export function cancelSpeech() {
  const speech = synth();
  if (speech) speech.cancel();
}
