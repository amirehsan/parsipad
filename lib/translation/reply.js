/**
 * Clean-up for plain-text replies, the text and batch modes.
 *
 * The user message wraps every request in <task>...</task> and the source in
 * <text>...</text> (see prompts.js). Now and then a model answers by
 * repeating that header, or by wrapping its translation in the same <text>
 * tags. Word and sentence modes parse JSON and never see this; the text
 * modes show the reply as it is, so the scaffolding is removed here, from
 * the finished reply and from the live stream alike. Nothing here touches
 * the content of a translation: only a header at the very start and a
 * <text> tag at either end are removed.
 */

const LEADING_TASK = /^\s*<task>[\s\S]*?<\/task>\s*/i;
const LEADING_TEXT = /^\s*<text>\s*/i;
const TRAILING_TEXT = /\s*<\/text>\s*$/i;

// How much of a reply to hold back while waiting for </task>. The header
// is about 150 characters; past this the reply is released as it came.
const HOLD_LIMIT = 600;

/**
 * The reply without an echoed task header or a <text> wrapper.
 * @param {string} reply
 * @returns {string}
 */
export function stripReplyScaffolding(reply) {
  return String(reply || '').replace(LEADING_TASK, '').replace(LEADING_TEXT, '').replace(TRAILING_TEXT, '');
}

function stripLeadingScaffolding(reply) {
  return String(reply || '').replace(LEADING_TASK, '').replace(LEADING_TEXT, '');
}

/**
 * Whether what has streamed so far may still turn out to be scaffolding: a
 * partial tag, a task header that has not closed yet, or a header or <text>
 * tag with nothing after it yet.
 * @param {string} lead - The reply so far, without leading whitespace
 * @returns {boolean}
 */
function undecided(lead) {
  const lower = lead.toLowerCase();
  if (lower.length < 6) return '<task>'.startsWith(lower) || '<text>'.startsWith(lower);
  if (lower.startsWith('<task>')) {
    const close = lower.indexOf('</task>');
    if (close < 0) return lead.length < HOLD_LIMIT;
    return undecided(lead.slice(close + '</task>'.length).replace(/^\s+/, ''));
  }
  if (lower.startsWith('<text>')) return lead.slice('<text>'.length).trim() === '';
  return false;
}

/**
 * Wrap an onDelta callback so that scaffolding never reaches the screen
 * while a reply streams. Deltas are held back while the reply so far could
 * still be a header or a <text> tag, and released, with the scaffolding
 * removed, as soon as it is clear what it is. After that every delta passes
 * straight through.
 * @param {(text: string) => void} onDelta
 * @returns {(delta: string) => void}
 */
export function createScaffoldingGate(onDelta) {
  let held = '';
  let open = false;
  return (delta) => {
    if (open) {
      if (delta) onDelta(delta);
      return;
    }
    held += delta;
    const lead = held.replace(/^\s+/, '');
    if (!lead || undecided(lead)) return;
    open = true;
    const released = stripLeadingScaffolding(lead);
    if (released) onDelta(released);
  };
}
