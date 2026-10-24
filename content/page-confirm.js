/**
 * The question a whole-page translation asks before its first request: how
 * many paragraphs, about how much with which provider, and whether to go on.
 * Kept to i18n as its only import because the content script loads it
 * unbundled from the extension root (see web_accessible_resources).
 */
import { t } from '../lib/i18n.js';

// STORAGE_KEYS.confirmPageTranslate. Read with the same rule as
// getConfirmPageTranslate in lib/storage.js: anything but false asks.
export const CONFIRM_PAGE_TRANSLATE_KEY = 'confirm_page_translate';

// The elements a reader thinks of as one paragraph. Links, spans and other
// inline runs inside them split the text into several nodes that are still
// one paragraph.
const BLOCK_CONTAINERS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, dd, dt, blockquote, figcaption, pre';
// Sites built from divs put text straight into them; text with no block
// container counts once per nearest one of these, not once per inline run.
const LOOSE_TEXT_BOXES = 'div, section, article, aside, header, footer, nav, main';

let dialogCount = 0;

/**
 * How many paragraphs the extracted text nodes make up: the number of
 * distinct block containers they sit in. Text in none counts by its nearest
 * div or sectioning element, or by its own parent when it has neither.
 * @param {Array<{parent: Element|null}>} textNodes
 * @returns {number}
 */
export function countParagraphs(textNodes) {
  const blocks = new Set();
  for (const { parent } of textNodes) {
    if (parent) blocks.add(parent.closest(BLOCK_CONTAINERS) || parent.closest(LOOSE_TEXT_BOXES) || parent);
  }
  return blocks.size;
}

/**
 * Ask before translating the page. Renders a modal dialog into `root` with
 * Translate (focused), Cancel and a "Don't ask again" checkbox. Tab stays
 * among those three controls and Escape answers Cancel without reaching the
 * page's own handlers. Focus goes back to where it was when the dialog
 * closes. If `root` leaves the page (a navigation removed the overlay), the
 * dialog answers Cancel, so the caller is never left waiting.
 *
 * "Don't ask again" takes effect only with Translate: it then stores
 * confirm_page_translate false, which Settings shows as the switch turned off.
 *
 * @param {ShadowRoot|HTMLElement} root
 * @param {{count: number, costText: string, providerName: string, lang: string}} details
 * @returns {Promise<{go: boolean, dontAsk: boolean}>}
 */
export function confirmPageTranslation(root, { count, costText, providerName, lang }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const id = `parsipad-page-confirm-${++dialogCount}`;
    // In-page UI is not mirrored, but Persian text still reads right to left.
    const setLanguage = (el) => {
      el.setAttribute('lang', lang);
      el.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
      return el;
    };
    const make = (tag, className, text) => {
      const el = document.createElement(tag);
      el.className = className;
      if (text !== undefined) el.textContent = text;
      return el;
    };

    const dialog = make('div', 'parsipad-confirm');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-body`);

    const title = setLanguage(make('h2', 'parsipad-confirm-title', t('pageConfirmTitle', lang)));
    title.id = `${id}-title`;

    // The cost and the provider name are Latin runs inside what may be a
    // Persian sentence; each is its own left-to-right run so the dollar sign
    // and the digits keep their order.
    const body = setLanguage(make('p', 'parsipad-confirm-body'));
    body.id = `${id}-body`;
    const template = t(count === 1 ? 'pageConfirmBodyOne' : 'pageConfirmBody', lang).replace('{count}', String(count));
    for (const piece of template.split(/(\{cost\}|\{provider\})/)) {
      if (piece === '{cost}' || piece === '{provider}') {
        const run = document.createElement('bdi');
        run.setAttribute('dir', 'ltr');
        run.textContent = piece === '{cost}' ? costText : providerName;
        body.append(run);
      } else if (piece) {
        body.append(piece);
      }
    }

    const dontAskLabel = make('label', 'parsipad-confirm-dontask');
    const dontAsk = document.createElement('input');
    dontAsk.type = 'checkbox';
    dontAskLabel.append(dontAsk, setLanguage(make('span', '', t('dontAskAgain', lang))));

    const actions = make('div', 'parsipad-confirm-actions');
    const cancel = setLanguage(make('button', 'parsipad-confirm-cancel', t('cancel', lang)));
    cancel.type = 'button';
    cancel.dataset.action = 'cancel';
    const go = setLanguage(make('button', 'parsipad-confirm-go', t('pageConfirmGo', lang)));
    go.type = 'button';
    go.dataset.action = 'go';
    actions.append(cancel, go);

    dialog.append(title, body, dontAskLabel, actions);

    const controls = [dontAsk, cancel, go];
    // A ShadowRoot knows which of its elements has focus; an element root
    // shares the document's.
    const focusIsInside = () => {
      const active = 'activeElement' in root ? root.activeElement : document.activeElement;
      return Boolean(active) && dialog.contains(active);
    };

    let observer = null;
    let settled = false;
    const close = (choice) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      const confirmed = choice && dontAsk.checked;
      if (confirmed) {
        try {
          Promise.resolve(chrome.storage.local.set({ [CONFIRM_PAGE_TRANSLATE_KEY]: false })).catch(() => {});
        } catch {
          // Extension context invalidated; the next translation asks again.
        }
      }
      // Hand focus back only if it is still ours: inside the dialog, or
      // dropped to the body when the dialog left the page.
      const restore = focusIsInside() || !document.activeElement || document.activeElement === document.body;
      dialog.remove();
      if (restore && previous && previous !== document.body && previous.isConnected) previous.focus();
      resolve({ go: choice, dontAsk: confirmed });
    };

    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(false);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        const at = controls.indexOf(event.target);
        const step = event.shiftKey ? -1 : 1;
        const next = at === -1
          ? (event.shiftKey ? controls.length - 1 : 0)
          : (at + step + controls.length) % controls.length;
        controls[next].focus();
      }
    });
    cancel.addEventListener('click', () => close(false));
    go.addEventListener('click', () => close(true));

    root.append(dialog);
    if (!dialog.isConnected) {
      close(false);
      return;
    }
    // Removing the overlay host, or the dialog from it, answers Cancel.
    observer = new MutationObserver(() => {
      if (!dialog.isConnected) close(false);
    });
    observer.observe(document, { childList: true, subtree: true });
    observer.observe(root, { childList: true, subtree: true });
    go.focus();
  });
}
