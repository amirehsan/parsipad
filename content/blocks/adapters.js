/**
 * Site-specific overrides, kept declarative and opt-in.
 *
 * An adapter is added only when the generic path is shown to fail on a real
 * site. Wikipedia deliberately has none: if the heuristic cannot handle
 * Wikipedia, the heuristic is wrong, so it serves as the proof case.
 *
 * @typedef {Object} Adapter
 * @property {string} id
 * @property {(hostname: string) => boolean} match
 * @property {string} block  - selector for the definitive block; a hit skips the heuristic
 * @property {string} reject - selector for regions that are never translatable
 */

/** @type {Adapter[]} */
export const ADAPTERS = [
  {
    id: 'x',
    // X's post body is a definitive selector, so matching it is both faster
    // and more exact than climbing through its div soup. These testids need
    // re-verifying against the live DOM periodically; X renames them.
    match: (hostname) => /(^|\.)(x|twitter)\.com$/i.test(hostname),
    block: '[data-testid="tweetText"]',
    reject: '[role="group"], [data-testid="caret"], [data-testid="UserCell"]'
  }
];

/**
 * @param {string} hostname
 * @returns {Adapter|null}
 */
export function adapterFor(hostname) {
  return ADAPTERS.find((adapter) => adapter.match(String(hostname || ''))) || null;
}
