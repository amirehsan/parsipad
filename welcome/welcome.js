import {
  getLanguage,
  setSelectedProvider,
  setProviderApiKey,
  getProviderApiKey,
  hasProviderApiKey,
  setOnboardingComplete
} from '../lib/storage.js';
import { PROVIDER_CONFIGS } from '../lib/constants.js';
import { t, applyTranslations } from '../lib/i18n.js';

// DOM Elements
const themeToggle = document.getElementById('theme-toggle');
const providerRadios = document.querySelectorAll('input[name="provider"]');
const apiKeyInput = document.getElementById('api-key');
const toggleVisibilityBtn = document.getElementById('toggle-visibility');
const saveKeyBtn = document.getElementById('save-key-btn');
const apiStatusEl = document.getElementById('api-status');
const apiConsoleLinkEl = document.getElementById('api-console-link');
const startBtn = document.getElementById('start-btn');

// State
let currentLang = 'en';
let currentProvider = 'claude';

/**
 * Initialize the welcome page
 */
async function init() {
  initTheme();
  await loadLanguage();
  updateProviderUI(currentProvider);
  setupEventListeners();
}

/**
 * Initialize theme from localStorage or system preference
 */
function initTheme() {
  const html = document.documentElement;

  if (localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

/**
 * Toggle dark/light theme
 */
function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle('dark');
  localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
}

/**
 * Load and apply language preference
 */
async function loadLanguage() {
  currentLang = await getLanguage();
  applyTranslations(currentLang);
  updateApiKeyLabel();
}

/**
 * Update API key label based on selected provider
 */
function updateApiKeyLabel() {
  const config = PROVIDER_CONFIGS[currentProvider];
  const labelEl = document.querySelector('.api-key-section .input-label');

  if (labelEl) {
    labelEl.textContent = `${config.name} API Key`;
  }

  if (apiKeyInput) {
    apiKeyInput.placeholder = config.keyPlaceholder;
  }

  if (apiConsoleLinkEl) {
    apiConsoleLinkEl.href = config.consoleUrl;
    apiConsoleLinkEl.textContent = config.consoleUrl.replace('https://', '');
  }
}

/**
 * Update UI when provider changes
 */
async function updateProviderUI(provider) {
  currentProvider = provider;
  updateApiKeyLabel();

  // Clear the input and load any existing saved key for the new provider
  if (apiKeyInput) {
    apiKeyInput.value = '';
    const savedKey = await getProviderApiKey(provider);
    if (savedKey) {
      apiKeyInput.value = savedKey;
    }
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
    radio.addEventListener('change', (e) => {
      updateProviderUI(e.target.value);
    });
  });

  // Toggle password visibility
  toggleVisibilityBtn.addEventListener('click', () => {
    const isVisible = apiKeyInput.type === 'text';
    apiKeyInput.type = isVisible ? 'password' : 'text';

    // Update icon
    const icon = toggleVisibilityBtn.querySelector('.eye-icon');
    if (icon) {
      if (isVisible) {
        icon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        `;
      } else {
        icon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        `;
      }
    }
  });

  // Save API key
  saveKeyBtn.addEventListener('click', handleSaveApiKey);

  // Allow Enter key to save
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSaveApiKey();
    }
  });

  // Start button
  startBtn.addEventListener('click', handleStart);
}

/**
 * Handle save API key
 */
async function handleSaveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  const config = PROVIDER_CONFIGS[currentProvider];

  if (!apiKey) {
    showStatus(t('pleaseEnterApiKey', currentLang), 'error');
    return;
  }

  try {
    // Save the provider selection
    await setSelectedProvider(currentProvider);

    // Save the API key
    await setProviderApiKey(currentProvider, apiKey);

    showStatus(`${config.name} API key saved successfully!`, 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  }
}

/**
 * Handle start button click
 */
async function handleStart() {
  // Check if API key is configured for current provider
  const hasKey = await hasProviderApiKey(currentProvider);

  if (!hasKey) {
    // Check if there's an unsaved key in the input
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      // Auto-save the key
      await setSelectedProvider(currentProvider);
      await setProviderApiKey(currentProvider, apiKey);
    }
  }

  // Mark onboarding as complete
  await setOnboardingComplete();

  // Close this tab and open the popup (or just close)
  window.close();
}

/**
 * Show a status message
 */
function showStatus(message, type) {
  apiStatusEl.textContent = message;
  apiStatusEl.className = `status-message ${type}`;
  apiStatusEl.hidden = false;

  setTimeout(() => {
    apiStatusEl.hidden = true;
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
