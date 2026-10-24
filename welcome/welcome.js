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
const startBtn = document.getElementById('start-btn');

// State
let currentLang = 'en';
let currentProvider = 'claude';
let testing = false;
// The last key the provider rejected, so Start does not store it either.
let rejectedKey = null;

/**
 * Whether the selected provider has a key worth using. It starts true when a
 * key is already stored for that provider (and is recomputed when the
 * provider changes), so nothing is sent until a click. A Save & test then
 * overrides it: true once a key is stored, false when the provider rejected
 * the typed key. Task 7's sample translation reads it.
 * @type {boolean}
 */
export let keyWorks = false;

/**
 * Initialize the welcome page
 */
async function init() {
  initTheme();
  await loadLanguage();
  currentProvider = await getSelectedProvider();
  const radio = [...providerRadios].find(r => r.value === currentProvider);
  if (radio) radio.checked = true;
  setKeyRevealed(apiKeyInput, toggleVisibilityBtn, false, currentLang);
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
  keyWorks = Boolean(savedKey);
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

  // Start button
  startBtn.addEventListener('click', handleStart);
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
  } finally {
    testing = false;
    saveKeyBtn.disabled = false;
  }

  // The provider may have changed while the test ran; the result belongs to
  // the provider it was for.
  if (provider !== currentProvider) return;

  if (stored) {
    keyWorks = true;
    rejectedKey = null;
  } else if (isKeyRejected(result)) {
    keyWorks = false;
    rejectedKey = key;
  }

  const untested = stored && !result?.ok;
  showStatus(describeKeyTest(result, currentLang, provider, { stored: untested }));
  if (!stored) apiKeyInput.focus();
}

/**
 * Finish onboarding. A key typed but never saved is stored on the way out,
 * unless it has the wrong shape or the provider already rejected it; nothing
 * here can keep the page from finishing.
 */
async function handleStart() {
  try {
    const typed = normalizeApiKey(apiKeyInput.value);
    const hasKey = await hasProviderApiKey(currentProvider);
    if (!hasKey && typed && typed !== rejectedKey && !checkKeyFormat(currentProvider, typed)) {
      await setProviderApiKey(currentProvider, typed);
      await setSelectedProvider(currentProvider);
    }
  } catch (error) {
    console.warn('[ParsiPad] Could not store the typed key:', error);
  }

  // Mark onboarding as complete
  await setOnboardingComplete();

  // Close this tab
  window.close();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
