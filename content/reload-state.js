/**
 * What a box says once the extension was reloaded or updated under an open
 * page. Chrome leaves the old content script running but cuts it off from
 * the extension for good, so every request fails the same way and no retry
 * helps; only reloading the page does. Kept to i18n as its only import
 * because the content script loads it unbundled from the extension root
 * (see web_accessible_resources).
 */
import { t } from '../lib/i18n.js';

// The box's info icon, decorative: the message beside it says everything.
const ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
`;

/**
 * Replace the container's children with the explanation and a Reload page
 * button.
 * @param {HTMLElement} container - the box's content area
 * @param {string} lang - the reader's interface language
 * @param {{reload?: () => void}} [options] - what the button does; reloads
 *   the page unless a test passes its own
 */
export function renderReloadState(container, lang, { reload = () => location.reload() } = {}) {
  const doc = container.ownerDocument;

  const state = doc.createElement('div');
  state.className = 'parsipad-error parsipad-reload-state';
  state.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
  state.innerHTML = ICON;

  const body = doc.createElement('div');
  const message = doc.createElement('div');
  message.setAttribute('role', 'alert');
  message.textContent = t('errorContextInvalidated', lang);

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'parsipad-reload-page';
  button.textContent = t('blockTranslateReload', lang);
  button.addEventListener('click', () => reload());

  body.append(message, button);
  state.appendChild(body);
  container.replaceChildren(state);
}
