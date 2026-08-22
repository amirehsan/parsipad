// shared/shortcuts.js
/**
 * What the keyboard shortcuts actually are, as opposed to what the manifest
 * asked for.
 *
 * `suggested_key` is a request, not a guarantee. Chrome drops it silently
 * when another extension has already claimed the combination, and the user
 * can rebind or clear anything at chrome://extensions/shortcuts. A surface
 * that hardcodes "Alt+D" therefore risks telling someone to press a key that
 * does nothing, and they conclude the feature is broken rather than unbound.
 *
 * Everything here reads chrome.commands at call time, so a page that loads
 * before the API is available still works, and tests can stub it.
 */

/**
 * The i18n key describing each command, keyed by the command name in
 * manifest.json. A test pins this against the manifest, so a command added
 * there without a description here fails the suite.
 */
export const COMMAND_DESCRIPTIONS = Object.freeze({
  'translate-selection': 'shortcutTranslate',
  'dictionary-lookup': 'shortcutDictionary',
  'translate-page': 'shortcutTranslatePage',
  'screenshot-translate': 'shortcutScreenshot'
});

/**
 * Every command's real binding, empty string when Chrome bound nothing.
 * @returns {Promise<Map<string, string>>}
 */
export async function getBoundShortcuts() {
  const commands = globalThis.chrome && globalThis.chrome.commands;
  if (!commands || typeof commands.getAll !== 'function') return new Map();

  try {
    const all = await commands.getAll();
    return new Map((all || []).map(command => [command.name, command.shortcut || '']));
  } catch (error) {
    // An unavailable commands API is not worth breaking a settings page over.
    return new Map();
  }
}

/**
 * A shortcut split into the keys it is made of, for rendering as separate
 * <kbd> elements. Mac shortcuts arrive as a single glyph run with no
 * separator ("⌥T"), so they stay whole rather than being torn apart
 * character by character.
 *
 * @param {string} shortcut
 * @returns {string[]} empty when the command is unbound
 */
export function shortcutKeys(shortcut) {
  const value = String(shortcut || '').trim();
  if (!value) return [];
  if (!value.includes('+')) return [value];
  return value.split('+').map(key => key.trim()).filter(Boolean);
}
