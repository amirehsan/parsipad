// shared/source-override.js
/**
 * Remembering a source language the user picked by hand.
 *
 * The swap control exists because script detection cannot see Persian
 * written in Latin letters, so "khoobam" reads as English. Correcting that
 * once should hold, or the user corrects it on every word.
 *
 * What is remembered is the correction, not the answer: "when the detector
 * says en, I mean fa". Remembering the bare language instead would force
 * every later selection through it, and this extension's users select
 * English and Persian on the same page constantly, so the very next lookup
 * would come back in the wrong direction.
 *
 * Nothing here is persisted. A stale override carried into another session
 * would be worse than the occasional wrong guess, because the user would
 * have no idea why the extension had started disagreeing with them.
 */

/**
 * @param {Object} params
 * @param {'en'|'fa'} params.detected - what script detection says about this text
 * @param {'en'|'fa'} [params.chosen] - a source the user just picked by hand
 * @param {{from: string, to: string}|null} [params.override] - the correction in force
 * @returns {{sourceLang: string, override: {from: string, to: string}|null}}
 */
export function applySourceOverride({ detected, chosen, override = null }) {
  if (chosen) {
    return { sourceLang: chosen, override: { from: detected, to: chosen } };
  }

  if (override && override.from === detected) {
    return { sourceLang: override.to, override };
  }

  return { sourceLang: 'auto', override };
}
