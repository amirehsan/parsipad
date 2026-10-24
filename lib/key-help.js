import { t } from './i18n.js';
import { formatNumber } from './format.js';
import { PROVIDER_CONFIGS, INVALID_KEY_FORMAT } from './constants.js';
import { ERROR_CODES, errorI18nKey } from './translation/errors.js';

/**
 * Where to get a key for each provider, and the i18n keys for the how-to.
 * Step copy uses three placeholders: {link} (the provider's console, as a real
 * link), {prefix} (what the key starts with) and `backticked` words, which are
 * on-screen labels on the provider's site and stay in Latin.
 */
export const KEY_HELP = {
  claude: {
    url: 'https://console.anthropic.com/settings/keys',
    host: 'console.anthropic.com',
    prefix: 'sk-ant-',
    steps: ['keyHelpClaudeStep1', 'keyHelpClaudeStep2', 'keyHelpClaudeStep3'],
    cost: 'keyHelpClaudeCost'
  },
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    host: 'aistudio.google.com/apikey',
    prefix: 'AIza or AQ.',
    steps: ['keyHelpGeminiStep1', 'keyHelpGeminiStep2', 'keyHelpGeminiStep3'],
    cost: 'keyHelpGeminiCost'
  },
  openai: {
    url: 'https://platform.openai.com/api-keys',
    host: 'platform.openai.com/api-keys',
    prefix: 'sk-',
    steps: ['keyHelpOpenaiStep1', 'keyHelpOpenaiStep2', 'keyHelpOpenaiStep3'],
    cost: 'keyHelpOpenaiCost'
  }
};

const TOKEN = /(\{link\}|\{prefix\}|`[^`]+`)/;

function code(text) {
  const el = document.createElement('code');
  el.setAttribute('dir', 'ltr');
  el.textContent = text;
  return el;
}

// "AIza or AQ." becomes two code elements joined by the localized "or".
function prefixNodes(prefix, lang) {
  const nodes = [];
  prefix.split(' or ').forEach((part, index) => {
    if (index > 0) nodes.push(document.createTextNode(` ${t('keyHelpOr', lang)} `));
    nodes.push(code(part));
  });
  return nodes;
}

function stepNodes(template, help, lang) {
  const nodes = [];
  for (const part of template.split(TOKEN)) {
    if (!part) continue;
    if (part === '{link}') {
      const link = document.createElement('a');
      link.setAttribute('href', help.url);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
      link.setAttribute('dir', 'ltr');
      link.textContent = help.host;
      nodes.push(link);
    } else if (part === '{prefix}') {
      nodes.push(...prefixNodes(help.prefix, lang));
    } else if (part.startsWith('`')) {
      nodes.push(code(part.slice(1, -1)));
    } else {
      nodes.push(document.createTextNode(part));
    }
  }
  return nodes;
}

/**
 * Build the "How do I get a key?" block for a provider.
 *
 * `lang` is the language of this block only. The pill beside the disclosure
 * swaps it for the other language in place and never touches the UI language.
 * Everything is built with createElement and textContent.
 * @param {string} provider - Provider ID (claude, gemini, openai)
 * @param {string} lang - 'en' or 'fa'
 * @param {{open?: boolean}} [options] - open: start with the steps showing. The
 *   toggle carries the current open state over to the other language.
 * @returns {HTMLElement}
 */
export function renderKeyHelp(provider, lang, { open = false } = {}) {
  const help = KEY_HELP[provider];
  const root = document.createElement('div');
  root.className = 'key-help';
  if (!help) return root;

  const details = document.createElement('details');
  details.setAttribute('lang', lang);
  details.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
  details.open = open;

  const summary = document.createElement('summary');
  summary.textContent = t('keyHelpTitle', lang);
  details.append(summary);

  const steps = document.createElement('ol');
  for (const key of help.steps) {
    const item = document.createElement('li');
    item.append(...stepNodes(t(key, lang), help, lang));
    steps.append(item);
  }
  details.append(steps);

  const cost = document.createElement('p');
  cost.className = 'key-help-cost';
  cost.textContent = t(help.cost, lang);
  details.append(cost);

  // The pill is a sibling of <details>, not part of <summary>, so it stays its
  // own keyboard stop and clicking it does not toggle the disclosure.
  const other = lang === 'fa' ? 'en' : 'fa';
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'key-help-lang';
  pill.setAttribute('lang', other);
  pill.setAttribute('aria-label', t('keyHelpPillLabel', other));
  pill.textContent = t('keyHelpPill', other);
  pill.addEventListener('click', () => {
    const next = renderKeyHelp(provider, other, { open: details.open });
    root.replaceWith(next);
    next.querySelector('.key-help-lang').focus();
  });

  root.append(details, pill);
  return root;
}

// String.replace treats $& and friends in a string replacement as patterns;
// a function replacement inserts the text as it is.
const fill = (template, token, value) => template.replace(token, () => value);

// Codes that are a verdict on the key itself. Any other failure (offline, a
// timeout, rate limits, a provider outage, an unknown error) says nothing
// about whether the key is good.
const REJECTION_CODES = new Set([INVALID_KEY_FORMAT, ERROR_CODES.INVALID_API_KEY, ERROR_CODES.API_KEY_NOT_SET]);

const resultCode = (result) => result?.code ?? result?.errorCode;

/**
 * Whether a key test result rejects the key, as opposed to a test that could
 * not reach a verdict. A rejected key is never stored.
 * @param {object|undefined} result - A TEST_API_KEY result
 * @returns {boolean}
 */
export function isKeyRejected(result) {
  return !result?.ok && REJECTION_CODES.has(resultCode(result));
}

/**
 * Why a key test failed, in the UI language.
 * @returns {{reason: string, ltr: string[]}}
 */
function failureReason(result, lang, provider) {
  const code = resultCode(result);
  if (code === INVALID_KEY_FORMAT) {
    const prefixes = result.prefixes?.length ? result.prefixes : PROVIDER_CONFIGS[provider]?.keyPrefixes || [];
    const name = PROVIDER_CONFIGS[provider]?.name || provider;
    const reason = fill(fill(t('keyFormatInvalid', lang), '{provider}', name), '{prefixes}', prefixes.join(' / '));
    return { reason, ltr: [...prefixes] };
  }
  // The general errorInvalidApiKey sends people to settings, which is where
  // these sentences already are.
  if (code === ERROR_CODES.INVALID_API_KEY) return { reason: t('keyRejected', lang), ltr: [] };
  if (!code || code === ERROR_CODES.UNKNOWN) {
    return { reason: result?.message ?? result?.error ?? t('errorUnknown', lang), ltr: [] };
  }
  return { reason: t(errorI18nKey(code), lang), ltr: [] };
}

/**
 * The sentence for a key test result, in the UI language, for Settings, the
 * first-run panel and Welcome alike.
 *
 * ok fills keyTestOk with the model and the time. A failure fills the
 * keyTestFailed {reason}: keyFormatInvalid for a key with the wrong prefix,
 * keyRejected when the provider turned the key down, the provider's own
 * message when the code is UNKNOWN or missing (testApiKey keeps it on
 * purpose), and the localized error for any other code. A failure that
 * reached no verdict but whose key was stored anyway (options.stored) fills
 * keySavedUntested instead.
 * @param {{ok: true, model: string, ms: number} | {ok: false, code?: string, errorCode?: string, message?: string, error?: string, prefixes?: string[]} | undefined} result
 * @param {string} lang - 'en' or 'fa'
 * @param {string} provider - Provider ID (claude, gemini, openai)
 * @param {{stored?: boolean}} [options]
 * @returns {{tone: 'ok'|'error'|'info', text: string, ltr: string[]}} ltr: runs
 *   in the text that read left to right whatever the page direction (model
 *   name, key prefixes); renderKeyTest isolates them.
 */
export function describeKeyTest(result, lang, provider, { stored = false } = {}) {
  if (result?.ok) {
    const text = fill(fill(t('keyTestOk', lang), '{model}', String(result.model)), '{ms}', formatNumber(result.ms, lang));
    return { tone: 'ok', text, ltr: [String(result.model)] };
  }

  const { reason, ltr } = failureReason(result, lang, provider);
  if (stored) {
    return { tone: 'info', text: fill(t('keySavedUntested', lang), '{reason}', String(reason).trim()), ltr };
  }
  return { tone: 'error', text: fill(t('keyTestFailed', lang), '{reason}', String(reason).trim()), ltr };
}

/**
 * A key test result for an error thrown before or during the test: a key
 * storage turned away keeps its code and prefixes, anything else is UNKNOWN
 * with its message.
 * @param {Error & {code?: string, prefixes?: string[]}} error
 * @returns {{ok: false, code: string, prefixes?: string[], message?: string}}
 */
export function keyTestErrorResult(error) {
  if (error?.code === INVALID_KEY_FORMAT) {
    return { ok: false, code: INVALID_KEY_FORMAT, prefixes: error.prefixes };
  }
  return { ok: false, code: ERROR_CODES.UNKNOWN, message: error?.message };
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Show a key test sentence in its status element. The runs describeKeyTest
 * marks as ltr go in <bdi dir="ltr">, so a key prefix or model name keeps its
 * own order inside a Persian sentence. Built with createElement and
 * textContent.
 * @param {HTMLElement} el
 * @param {{tone: string, text: string, ltr?: string[]}} description
 */
export function renderKeyTest(el, { tone, text, ltr = [] }) {
  el.dataset.state = tone;
  const runs = ltr.filter(Boolean);
  if (!runs.length) {
    el.textContent = text;
    return;
  }
  const pattern = new RegExp(`(${runs.map(escapeRegExp).join('|')})`);
  el.replaceChildren(...text.split(pattern).filter(Boolean).map((part) => {
    if (!runs.includes(part)) return document.createTextNode(part);
    const bdi = document.createElement('bdi');
    bdi.setAttribute('dir', 'ltr');
    bdi.textContent = part;
    return bdi;
  }));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const EYE_ICONS = {
  // Key hidden: the open eye offers to show it.
  show: [
    ['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }],
    ['circle', { cx: '12', cy: '12', r: '3' }]
  ],
  // Key shown: the struck eye offers to hide it.
  hide: [
    ['path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }],
    ['line', { x1: '1', y1: '1', x2: '23', y2: '23' }]
  ]
};

/**
 * Show or hide a key field: its type, the button's pressed state, its tooltip
 * and the eye icon. The accessible name stays "Show key" in both states, so
 * only aria-pressed says the key is showing; the tooltip names what a click
 * does next. Shared by Settings and Welcome.
 * @param {HTMLInputElement} input
 * @param {HTMLButtonElement} button - Holds the eye <svg>
 * @param {boolean} revealed
 * @param {string} lang
 */
export function setKeyRevealed(input, button, revealed, lang) {
  input.type = revealed ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(revealed));
  button.setAttribute('aria-label', t('revealKey', lang));
  button.setAttribute('title', t(revealed ? 'hideKey' : 'revealKey', lang));
  const icon = button.querySelector('svg');
  if (!icon) return;
  icon.replaceChildren(...EYE_ICONS[revealed ? 'hide' : 'show'].map(([tag, attrs]) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    return el;
  }));
}
