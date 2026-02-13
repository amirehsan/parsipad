import { PROVIDERS, PROVIDER_CONFIGS } from '../constants.js';
import { getSelectedProvider, getProviderApiKey } from '../storage.js';
import { ClaudeProvider } from './claude-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenAIProvider } from './openai-provider.js';

// Provider class registry
const providerClasses = {
  [PROVIDERS.CLAUDE]: ClaudeProvider,
  [PROVIDERS.GEMINI]: GeminiProvider,
  [PROVIDERS.OPENAI]: OpenAIProvider
};

// Provider instance cache
const providerInstances = {};

/**
 * Get provider instance by ID
 * @param {string} providerId - Provider identifier
 * @returns {BaseProvider} Provider instance
 * @throws {Error} If provider ID is unknown
 */
export function getProviderById(providerId) {
  if (!providerInstances[providerId]) {
    const ProviderClass = providerClasses[providerId];
    const config = PROVIDER_CONFIGS[providerId];

    if (!ProviderClass || !config) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    providerInstances[providerId] = new ProviderClass(config);
  }

  return providerInstances[providerId];
}

/**
 * Get the currently selected provider instance
 * @returns {Promise<BaseProvider>} Provider instance
 */
export async function getCurrentProvider() {
  const providerId = await getSelectedProvider();
  return getProviderById(providerId);
}

/**
 * Get the API key for the currently selected provider
 * @returns {Promise<string|null>} API key or null if not set
 */
export async function getCurrentApiKey() {
  const providerId = await getSelectedProvider();
  return getProviderApiKey(providerId);
}

/**
 * Get all available providers with their configurations
 * @returns {Array<Object>} Array of provider configs with IDs
 */
export function getAllProviders() {
  return Object.entries(PROVIDER_CONFIGS).map(([id, config]) => ({
    id,
    ...config
  }));
}

/**
 * Check if a provider ID is valid
 * @param {string} providerId - Provider identifier to check
 * @returns {boolean} True if valid
 */
export function isValidProvider(providerId) {
  return !!PROVIDER_CONFIGS[providerId];
}

// Re-export for convenience
export { PROVIDERS, PROVIDER_CONFIGS };
