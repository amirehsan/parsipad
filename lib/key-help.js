import { t } from './i18n.js';

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
 * @returns {HTMLElement}
 */
export function renderKeyHelp(provider, lang) {
  const help = KEY_HELP[provider];
  const root = document.createElement('div');
  root.className = 'key-help';
  if (!help) return root;

  const details = document.createElement('details');
  details.setAttribute('lang', lang);
  details.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');

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
    const wasOpen = details.open;
    const next = renderKeyHelp(provider, other);
    next.querySelector('details').open = wasOpen;
    root.replaceWith(next);
    next.querySelector('.key-help-lang').focus();
  });

  root.append(details, pill);
  return root;
}

/**
 * Status line for a key that answered.
 * @param {{model: string, ms: number}} result
 * @param {string} lang
 * @returns {string}
 */
export function keyTestOkText(result, lang) {
  return t('keyTestOk', lang).replace('{model}', result.model).replace('{ms}', String(result.ms));
}

/**
 * Status line for a key that did not work. The reason is the localized error
 * message; a missing full stop is added so the advice reads as its own sentence.
 * @param {string|undefined} reason
 * @param {string} lang
 * @returns {string}
 */
export function keyTestFailedText(reason, lang) {
  const text = String(reason || t('errorUnknown', lang)).trim();
  const sentence = /[.!?\u061F\u06D4]$/.test(text) ? text : `${text}.`;
  return t('keyTestFailed', lang).replace('{reason}', sentence);
}
