import {
  getLanguage,
  getSelectedProvider,
  setSelectedProvider,
  setProviderApiKey,
  getProviderApiKey,
  hasProviderApiKey,
  normalizeApiKey,
  checkKeyFormat,
  setOnboardingComplete,
  getTheme,
  setTheme
} from '../lib/storage.js';
import { PROVIDER_CONFIGS, ACTIONS } from '../lib/constants.js';
import { t, applyTranslations } from '../lib/i18n.js';
import { renderKeyHelp, describeKeyTest, keyTestErrorResult, isKeyRejected, renderKeyTest, setKeyRevealed } from '../lib/key-help.js';
import { applyThemeToRoot } from '../lib/theme.js';
import { ERROR_CODES, errorI18nKey, toTranslationError } from '../lib/translation/errors.js';
import { WELCOME_SAMPLE, finishTarget } from './finish.js';

// The label of the key field for each provider
const KEY_LABELS = {
  claude: 'anthropicApiKey',
  gemini: 'googleApiKey',
  openai: 'openaiApiKey'
};

// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const providerRadios = document.querySelectorAll('input[name="provider"]');
const apiKeyLabel = document.querySelector('label[for="api-key"]');
const apiKeyInput = document.getElementById('api-key');
const toggleVisibilityBtn = document.getElementById('toggle-visibility');
const saveKeyBtn = document.getElementById('save-key-btn');
const apiStatusEl = document.getElementById('api-status');
const keyHelpEl = document.getElementById('key-help');
const trySourceEl = document.getElementById('try-it-source');
const tryBtn = document.getElementById('try-it-btn');
const tryLabelEl = tryBtn.querySelector('.try-btn-label');
const tryResultEl = document.getElementById('try-it-result');
const doneBtn = document.getElementById('done-btn');
const doneLabelEl = doneBtn.querySelector('.done-btn-label');

// State
let currentLang = 'en';
let currentProvider = 'claude';
// The provider that was selected when the page loaded, which Done goes back
// to when the one chosen here never got a key.
let entryProvider = 'claude';
let testing = false;
let translating = false;
let finishing = false;
// The last key the provider rejected, so Done does not store it either.
let rejectedKey = null;
// The Save & test in flight, so Done waits for it instead of cutting it off.
let pendingSave = null;

/**
 * Whether the selected provider has a key worth using, which is when the
 * sample can be translated. It starts true when a key is already stored for
 * that provider (and is recomputed when the provider changes), so nothing is
 * sent until a click. A Save & test then overrides it: true once a key is
 * stored; after a rejection, whether a key is still stored, since the
 * background translates with the stored key and not the rejected one.
 * @type {boolean}
 */
export let keyWorks = false;

/**
 * Set whenever the provider or its key changes, so a result or error from
 * the last key never sits under a different one.
 * @param {boolean} value
 */
function setKeyWorks(value) {
  keyWorks = value;
  clearTryResult();
  updateTryButton();
}

/**
 * Translate is off until a key works. While the sample runs it stays
 * focusable and says it is busy instead (see handleTryTranslate).
 */
function updateTryButton() {
  tryBtn.disabled = !keyWorks;
}

/**
 * Initialize the welcome page
 */
async function init() {
  initTheme();
  await loadLanguage();
  currentProvider = await getSelectedProvider();
  entryProvider = currentProvider;
  const radio = [...providerRadios].find(r => r.value === currentProvider);
  if (radio) radio.checked = true;
  setKeyRevealed(apiKeyInput, toggleVisibilityBtn, false, currentLang);
  trySourceEl.textContent = WELCOME_SAMPLE;
  await updateProviderUI(currentProvider);
  setupEventListeners();
}

/**
 * Initialize theme from chrome.storage (shared across all extension surfaces)
 * or system preference if unset.
 */
async function initTheme() {
  // Both conventions, always. This page styles dark with the class, but
  // lib/design-tokens.css also answers to [data-theme], and theme-boot sets
  // both. Clearing only the class leaves data-theme="dark" behind and the
  // tokens stay dark while the page's own rules go light.
  applyThemeToRoot(await getTheme());
}

/**
 * Toggle dark/light theme; persisted to chrome.storage so popup/settings stay in sync.
 */
async function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyThemeToRoot(next);
  await setTheme(next);
}

/**
 * Load and apply language preference
 */
async function loadLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
}

/**
 * Label, placeholder and key help for the selected provider, in the UI
 * language
 */
function updateKeyField() {
  const config = PROVIDER_CONFIGS[currentProvider];
  apiKeyLabel.textContent = t(KEY_LABELS[currentProvider], currentLang);
  apiKeyInput.placeholder = config.keyPlaceholder;
  keyHelpEl.replaceChildren(renderKeyHelp(currentProvider, currentLang));
}

/**
 * Show a key message in the status line under the field
 * @param {{tone: string, text: string, ltr?: string[]}} description
 */
function showStatus(description) {
  renderKeyTest(apiStatusEl, description);
}

function clearStatus() {
  apiStatusEl.textContent = '';
  apiStatusEl.dataset.state = '';
}

/**
 * Switch the key field to a provider and load any key stored for it. Makes no
 * request.
 * @param {string} provider
 */
async function updateProviderUI(provider) {
  currentProvider = provider;
  updateKeyField();
  clearStatus();

  const savedKey = await getProviderApiKey(provider);
  // A later switch may have finished first.
  if (provider !== currentProvider) return;
  apiKeyInput.value = savedKey || '';
  setKeyWorks(Boolean(savedKey));
}

/**
 * Use the chosen provider, as Settings does: the choice is stored at once, so
 * keyWorks and the provider a translation goes to are the same one. Makes no
 * request. If the choice cannot be stored, the radios go back.
 * @param {Event} e
 */
async function handleProviderChange(e) {
  const previous = currentProvider;
  const provider = e.target.value;
  await updateProviderUI(provider);
  try {
    await setSelectedProvider(provider);
  } catch {
    const radio = [...providerRadios].find(r => r.value === previous);
    if (radio) radio.checked = true;
    await updateProviderUI(previous);
    showStatus({ tone: 'error', text: t('errorUnknown', currentLang) });
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // Provider selection
  providerRadios.forEach(radio => {
    radio.addEventListener('change', handleProviderChange);
  });

  // Show or hide the key
  toggleVisibilityBtn.addEventListener('click', () => {
    setKeyRevealed(apiKeyInput, toggleVisibilityBtn, apiKeyInput.type === 'password', currentLang);
  });

  // Save & test
  saveKeyBtn.addEventListener('click', handleSaveApiKey);

  // Enter in the key field is Save & test
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSaveApiKey();
    }
  });

  // Try it: translate the sample, only on this click
  tryBtn.addEventListener('click', handleTryTranslate);

  // Done
  doneBtn.addEventListener('click', handleDone);
}

/**
 * Test the typed key with one real request, then store it, exactly as
 * Settings does. Only on this click (or Enter in the field). A key with the
 * wrong prefix is turned away before any request. The typed key is stored,
 * with the provider choice, only when the provider accepts it or when the
 * test reaches no verdict (offline, timeout, rate limit, outage, unknown), and
 * then the status says it is untested. A key the provider rejects is never
 * stored. Focus goes back into the field when the key was not stored.
 */
async function handleSaveApiKey() {
  if (testing) return;
  const provider = currentProvider;

  const key = normalizeApiKey(apiKeyInput.value);
  if (!key) {
    showStatus({ tone: 'error', text: t('pleaseEnterApiKey', currentLang) });
    apiKeyInput.focus();
    return;
  }

  const formatProblem = checkKeyFormat(provider, key);
  if (formatProblem) {
    showStatus(describeKeyTest(formatProblem, currentLang, provider));
    apiKeyInput.focus();
    return;
  }

  testing = true;
  saveKeyBtn.disabled = true;
  showStatus({ tone: 'pending', text: t('keyTesting', currentLang) });
  const run = testAndStore(provider, key);
  pendingSave = run;
  let outcome;
  try {
    outcome = await run;
  } finally {
    pendingSave = null;
    testing = false;
    saveKeyBtn.disabled = false;
  }
  const { result, stored } = outcome;

  // The provider may have changed while the test ran; the result belongs to
  // the provider it was for.
  if (provider !== currentProvider) return;

  if (stored) {
    rejectedKey = null;
    setKeyWorks(true);
  } else if (isKeyRejected(result)) {
    rejectedKey = key;
    const stillStored = await hasStoredKey(provider);
    if (provider !== currentProvider) return;
    setKeyWorks(stillStored);
  }

  const untested = stored && !result?.ok;
  showStatus(describeKeyTest(result, currentLang, provider, { stored: untested }));
  if (!stored) apiKeyInput.focus();
}

/**
 * Test a key with one real request, then store it with the provider choice
 * unless the provider rejected it. A test that reaches no verdict (offline,
 * timeout, rate limit, outage, unknown) still stores it. Never rejects.
 * @param {string} provider
 * @param {string} key - normalized, with the right prefix
 * @returns {Promise<{result: object, stored: boolean}>}
 */
async function testAndStore(provider, key) {
  let result;
  let stored = false;
  try {
    result = await chrome.runtime.sendMessage({ action: ACTIONS.TEST_API_KEY, provider, key });
  } catch (error) {
    result = keyTestErrorResult(error);
  }
  try {
    if (!isKeyRejected(result)) {
      await setProviderApiKey(provider, key);
      stored = true;
      if (provider === currentProvider) await setSelectedProvider(provider);
    }
  } catch (error) {
    result = keyTestErrorResult(error);
  }
  return { result, stored };
}

/**
 * @param {string} provider
 * @returns {Promise<boolean>} false when storage cannot be read
 */
async function hasStoredKey(provider) {
  try {
    return await hasProviderApiKey(provider);
  } catch {
    return false;
  }
}

/**
 * Translate the English sample through the background, exactly as any
 * translation runs, with the stored key of the selected provider. Only on a
 * click. The Persian result is written rtl; a failure shows the localized
 * error and a next step in the UI language. While it runs the button stays
 * focusable, marked busy and disabled for assistive technology, and further
 * clicks are ignored.
 */
async function handleTryTranslate() {
  if (translating || !keyWorks) return;
  translating = true;
  tryBtn.setAttribute('aria-busy', 'true');
  tryBtn.setAttribute('aria-disabled', 'true');
  tryLabelEl.textContent = t('translating', currentLang);
  // Emptied first, so a repeated identical message is announced again
  clearTryResult();

  let response;
  try {
    response = await chrome.runtime.sendMessage({ action: ACTIONS.TRANSLATE, text: WELCOME_SAMPLE });
  } catch (error) {
    response = { errorCode: toTranslationError(error).code };
  } finally {
    translating = false;
    tryBtn.removeAttribute('aria-busy');
    tryBtn.removeAttribute('aria-disabled');
    tryLabelEl.textContent = t('welcomeTryTranslate', currentLang);
  }

  if (!response?.error && typeof response?.translation === 'string' && response.translation) {
    showTryResult(response.translation);
  } else {
    showTryError(response);
  }
}

function clearTryResult() {
  tryResultEl.textContent = '';
  tryResultEl.dataset.state = '';
}

/**
 * @param {string} translation - Persian
 */
function showTryResult(translation) {
  tryResultEl.setAttribute('lang', 'fa');
  tryResultEl.setAttribute('dir', 'rtl');
  tryResultEl.dataset.state = 'ok';
  tryResultEl.textContent = translation;
}

/**
 * The service worker answers a failure with { error, errorCode }. A known
 * code is shown in the UI language; an UNKNOWN or missing one shows the
 * worker's own message when there is one. Only a verdict on the key
 * (rejected, missing or malformed) adds the hint to check the key above;
 * offline, timeouts, rate limits and the rest say nothing about the key.
 * @param {{error?: string, errorCode?: string}|undefined} response
 */
function showTryError(response) {
  const code = response?.errorCode;
  const useWorkerMessage = (!code || code === ERROR_CODES.UNKNOWN) && response?.error;
  // The general errorInvalidApiKey sends people to settings; Settings and the
  // key help already use keyRejected for a provider rejection, so Welcome does too.
  const message = code === ERROR_CODES.INVALID_API_KEY
    ? t('keyRejected', currentLang)
    : useWorkerMessage ? response.error : t(errorI18nKey(code), currentLang);
  tryResultEl.setAttribute('lang', currentLang);
  tryResultEl.setAttribute('dir', document.documentElement.dir || 'ltr');
  tryResultEl.dataset.state = 'error';
  tryResultEl.textContent = isKeyRejected(response)
    ? `${message} ${t('welcomeTryAgainHint', currentLang)}`
    : message;
}

/**
 * A key typed but never saved goes through the same test-before-store path
 * as Save & test on the way out, when the provider has no key stored yet and
 * the typed key has the right shape and was not already rejected. A Save &
 * test still running is waited for first.
 */
async function saveTypedKey() {
  if (pendingSave) await pendingSave;
  const provider = currentProvider;
  const typed = normalizeApiKey(apiKeyInput.value);
  if (!typed || typed === rejectedKey || checkKeyFormat(provider, typed)) return;
  if (await hasProviderApiKey(provider)) return;
  showStatus({ tone: 'pending', text: t('keyTesting', currentLang) });
  await testAndStore(provider, typed);
}

/**
 * Show Done as busy while it finishes (a typed key test can take a while),
 * or as itself again. It stays focusable either way.
 * @param {boolean} busy
 */
function setDoneBusy(busy) {
  finishing = busy;
  if (busy) {
    doneBtn.setAttribute('aria-busy', 'true');
    doneBtn.setAttribute('aria-disabled', 'true');
  } else {
    doneBtn.removeAttribute('aria-busy');
    doneBtn.removeAttribute('aria-disabled');
  }
  doneLabelEl.textContent = t(busy ? 'welcomeFinishing' : 'welcomeDone', currentLang);
}

/**
 * Choosing a provider stores it at once, so a provider picked here and never
 * given a key would leave a working setup pointing at one that cannot
 * translate. When the selected provider has no key and the one selected on
 * entry has, the entry provider is selected again.
 */
async function keepWorkingProvider() {
  const selected = await getSelectedProvider();
  if (selected === entryProvider) return;
  if (await hasProviderApiKey(selected)) return;
  if (!(await hasProviderApiKey(entryProvider))) return;
  await setSelectedProvider(entryProvider);
}

/**
 * Finish onboarding: Done never strands the user. The typed key is saved
 * when it can be, a provider without a key does not replace one with a key,
 * onboarding is marked complete whatever happened before,
 * then the page returns to Settings when Settings opened it, and closes
 * otherwise. Done does not wait for the sample translation.
 */
async function handleDone() {
  if (finishing) return;
  setDoneBusy(true);

  try {
    await saveTypedKey();
  } catch (error) {
    console.warn('[ParsiPad] Could not store the typed key:', error);
  }

  try {
    await keepWorkingProvider();
  } catch (error) {
    console.warn('[ParsiPad] Could not restore the provider:', error);
  }

  try {
    await setOnboardingComplete();
  } catch (error) {
    console.warn('[ParsiPad] Could not mark onboarding complete:', error);
  }

  const target = finishTarget(location.search);
  if (target.type === 'navigate') {
    // The page is leaving; Done stays busy so it is not pressed again
    location.assign(target.url);
    return;
  }
  window.close();
  // Should the tab refuse to close, Done can be pressed again.
  setDoneBusy(false);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
