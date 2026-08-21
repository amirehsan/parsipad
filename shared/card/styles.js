// shared/card/styles.js
/**
 * The card's stylesheet, exported as a string.
 *
 * The floating box needs these rules inside a closed shadow root and the
 * popup needs them in its document, so they cannot live in a stylesheet
 * file that only one of the two can load. Colours come from the custom
 * properties the box already defines, so the card follows whatever theme
 * its host is in without knowing which host that is.
 *
 * Token contract: this stylesheet consumes exactly four custom properties
 * and defines none of them itself:
 *   --pp-text
 *   --pp-text-secondary
 *   --pp-text-muted
 *   --pp-border
 * Each host is responsible for defining all four, in whatever scope these
 * rules end up in, before calling injectCardStyles. The floating box
 * already defines them (see content/styles/index.js). Any other host,
 * including one that names its own tokens differently, such as the
 * popup's --color-* namespace, must map its own tokens onto these four
 * names; there are no fallback values in the var() calls below, so a host
 * that skips the mapping will render with missing colours rather than
 * silently falling back to a default.
 */
export const CARD_STYLES = `
    .pp-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .pp-card-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      color: var(--pp-text-secondary);
    }
    .pp-card-pill-text {
      white-space: nowrap;
    }
    .pp-card-pill-swap {
      background: none;
      border: none;
      padding: 2px;
      font: inherit;
      font-size: 12px;
      line-height: 1;
      color: var(--pp-text-muted);
      cursor: pointer;
    }
    .pp-card-pill-swap:hover {
      color: var(--pp-text);
    }

    .pp-card-source {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px;
      font-size: 13px;
      color: var(--pp-text-secondary);
    }
    .pp-card-source-text {
      font-weight: 600;
      color: var(--pp-text);
    }
    .pp-card-source-ipa {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }
    .pp-card-source-pos {
      font-style: italic;
    }
    .pp-card-source-expand {
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      color: var(--pp-text-secondary);
      cursor: pointer;
      text-decoration: underline;
    }
    .pp-card-source-expand:hover {
      color: var(--pp-text);
    }
    .pp-card-source-clamped .pp-card-source-text {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .pp-card-translation {
      font-size: 17px;
      line-height: 1.55;
      color: var(--pp-text);
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .pp-card-translation[dir="rtl"] {
      line-height: 1.75;
      text-align: right;
    }

    .pp-card-note {
      font-size: 13px;
      line-height: 1.6;
      color: var(--pp-text-secondary);
    }
    .pp-card-note[dir="rtl"] {
      line-height: 1.8;
      text-align: right;
    }
    .pp-card-note-lead {
      font-weight: 600;
    }

    .pp-card-disclosure-wrap {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pp-card-disclosure-label {
      flex: 1;
    }

    .pp-card-disclosure {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      background: none;
      border: none;
      border-top: 1px solid var(--pp-border);
      padding: 10px 0 0;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      color: var(--pp-text-secondary);
      cursor: pointer;
      text-align: start;
    }
    .pp-card-disclosure:hover {
      color: var(--pp-text);
    }
    .pp-card-disclosure-caret {
      display: inline-block;
      transition: transform 0.15s ease;
    }
    .pp-card-disclosure[aria-expanded="true"] .pp-card-disclosure-caret {
      transform: rotate(90deg);
    }

    .pp-card-senses {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pp-card-sense-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .pp-card-sense-pos {
      font-size: 11px;
      font-style: italic;
      color: var(--pp-text-muted);
      flex-shrink: 0;
    }
    .pp-card-sense-meaning {
      font-size: 14px;
      line-height: 1.6;
      color: var(--pp-text);
    }
    .pp-card-sense-meaning[dir="rtl"] {
      line-height: 1.8;
    }
    .pp-card-example {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--pp-text-secondary);
    }
    .pp-card-example[dir="rtl"] {
      line-height: 1.8;
    }

    .pp-card-alternatives {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pp-card-alternative-label {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--pp-text-muted);
      margin-bottom: 2px;
    }
    .pp-card-alternative-text {
      font-size: 14px;
      line-height: 1.6;
      color: var(--pp-text);
    }
    .pp-card-alternative-text[dir="rtl"] {
      line-height: 1.8;
    }

    .pp-card-wordlist {
      font-size: 12px;
      line-height: 1.7;
      color: var(--pp-text-secondary);
    }
    .pp-card-wordlist-label {
      font-weight: 600;
    }

    .pp-card-truncated {
      font-size: 12px;
      line-height: 1.5;
      color: #b45309;
    }
    :host([data-theme='dark']) .pp-card-truncated {
      color: #fbbf24;
    }
    .pp-card-truncated[dir="rtl"] {
      line-height: 1.8;
    }

    .pp-card-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-top: 1px solid var(--pp-border);
      padding-top: 10px;
    }

    .pp-card-correction {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--pp-text);
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    :host([data-theme='dark']) .pp-card-correction {
      background: rgba(251, 191, 36, 0.12);
      border-color: rgba(251, 191, 36, 0.3);
    }
    .pp-card-correction-label {
      color: var(--pp-text-secondary);
      font-weight: 500;
    }
    .pp-card-correction-original {
      color: var(--pp-text-secondary);
      text-decoration: line-through;
    }
    .pp-card-correction-corrected {
      color: var(--pp-text);
      font-weight: 600;
    }

    .pp-card-provider {
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      font-size: 11px;
      color: var(--pp-text-muted);
      cursor: pointer;
    }
    .pp-card-provider:hover {
      color: var(--pp-text-secondary);
      text-decoration: underline;
    }

    .pp-card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .pp-card-action {
      background: none;
      border: none;
      padding: 4px 8px;
      font: inherit;
      font-size: 12px;
      color: var(--pp-text-secondary);
      cursor: pointer;
      border-radius: 6px;
    }
    .pp-card-action:hover {
      color: var(--pp-text);
    }

    .pp-card-action:focus-visible,
    .pp-card-pill-swap:focus-visible,
    .pp-card-disclosure:focus-visible,
    .pp-card-source-expand:focus-visible,
    .pp-card-provider:focus-visible {
      outline: 2px solid var(--pp-text-secondary);
      outline-offset: 2px;
      border-radius: 4px;
    }
`;

const INJECTED = new WeakSet();

/**
 * Append the card stylesheet to a root once.
 *
 * Roots are tracked by identity rather than by a marker element, so a
 * shadow root and the document can each hold their own copy without one
 * suppressing the other.
 *
 * @param {Node} root - shadow root, document head, or any container
 * @param {Document} doc - document used to create the style element
 * @returns {boolean} true when this call performed the injection
 */
export function injectCardStyles(root, doc) {
  if (!root || INJECTED.has(root)) return false;
  const style = doc.createElement('style');
  style.textContent = CARD_STYLES;
  root.appendChild(style);
  INJECTED.add(root);
  return true;
}
