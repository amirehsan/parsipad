/**
 * The Firefox manifest, derived from manifest.json.
 *
 * manifest.json is written for Chrome and stays the only one anyone edits.
 * Firefox needs a handful of differences: it runs no extension service
 * workers, has a sidebar instead of a side panel, has no favicon service,
 * and needs an add-on ID and a data collection declaration for AMO. Kept
 * pure so the build and the tests share it.
 */

/** Permanent once published: AMO ties every update and every install to it. */
export const FIREFOX_ADDON_ID = 'parsipad@parsipad.com';

/**
 * Firefox 140 is the first to show the data collection declaration in its
 * own install prompt, so nothing older needs a consent screen of ours.
 */
export const FIREFOX_MIN_VERSION = '140.0';

const CHROME_ONLY_PERMISSIONS = new Set(['sidePanel', 'favicon']);

/**
 * @param {object} manifest - The Chrome manifest; left untouched
 * @returns {object} A new manifest for Firefox
 */
export function firefoxManifest(manifest) {
  const { side_panel: sidePanel, ...rest } = structuredClone(manifest);
  return {
    ...rest,
    background: {
      scripts: [manifest.background.service_worker],
      type: manifest.background.type
    },
    permissions: rest.permissions.filter(p => !CHROME_ONLY_PERMISSIONS.has(p)),
    sidebar_action: {
      default_panel: sidePanel.default_path,
      default_title: '__MSG_extensionName__',
      default_icon: rest.icons,
      // Firefox opens a sidebar on install by default; the welcome page
      // already opens then.
      open_at_install: false
    },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ADDON_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        // Selected page text goes to the AI provider the user picked.
        data_collection_permissions: { required: ['websiteContent'] }
      }
    }
  };
}
