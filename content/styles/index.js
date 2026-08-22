/**
 * CSS string generators for the ParsiPad content script's Shadow DOM trees.
 * Each export returns a stylesheet string keyed to a specific UI surface
 * (floating box, page-progress overlay, etc.).
 *
 * All floating surfaces share a `:host` theme block emitted by `themeVars()`.
 * The host element exposes `data-theme="dark"` or `data-theme="light"`; CSS
 * variables flip automatically, so no rebuild is required when the host page
 * toggles between dark and light modes at runtime.
 *
 * Brand colors (primary indigo, accent purple, semantic greens/reds) stay
 * literal — they're consistent across light and dark themes. Neutrals
 * (backgrounds, text, borders) come from variables.
 */
export function themeVars() {
  return `
    :host {
      --pp-bg: #fdfcff;
      --pp-bg-secondary: #f6f5fb;
      --pp-bg-hover: #eceaf4;
      --pp-text: #1b1826;
      --pp-text-strong: #302c3d;
      --pp-text-secondary: #565165;
      --pp-text-muted: #6b6680;
      --pp-border: #bfbad2;
      --pp-border-strong: #d8d5e6;
      --pp-shadow-card: 0 10px 25px -5px rgba(27, 24, 38, 0.15), 0 8px 10px -6px rgba(27, 24, 38, 0.1);
      --pp-skeleton-from: #eceaf4;
      --pp-skeleton-to: #f6f5fb;
      --pp-motion-skeleton: parsipad-shimmer 1.5s infinite;
      /* Brand accent. Previously scattered as var(--pp-accent) literals through this
         file, which is why the box kept the old colour when the palette
         changed. --pp-accent was also referenced in two rules without ever
         being defined, so those silently used their fallback. */
      --pp-accent: #4f46e5;
      --pp-accent-strong: #4338ca;
      --pp-warning: #8a5a04;
      --pp-warning-soft: #f6e8cf;
      --pp-error: #c0263a;
      --pp-error-soft: #f7dde1;
      --pp-accent-soft: rgba(99, 102, 241, 0.10);
      --pp-on-accent: #fdfcff;
    }
    :host([data-theme='dark']) {
      --pp-bg: #1c1930;
      --pp-bg-secondary: #131120;
      --pp-bg-hover: #252139;
      --pp-text: #f7f6fb;
      --pp-text-strong: #e4e1ee;
      --pp-text-secondary: #cbc7db;
      --pp-text-muted: #a09ab5;
      --pp-border: #332e4a;
      --pp-border-strong: #453e60;
      --pp-shadow-card: 0 10px 25px -5px rgba(27, 24, 38, 0.6), 0 8px 10px -6px rgba(27, 24, 38, 0.4);
      --pp-skeleton-from: #252139;
      --pp-skeleton-to: #332e4a;
      --pp-accent: #818cf8;
      --pp-accent-strong: #6366f1;
      --pp-warning: #e8b45c;
      --pp-warning-soft: #3a2f1b;
      --pp-error: #f79aa6;
      --pp-error-soft: #40202a;
      --pp-accent-soft: rgba(129, 140, 248, 0.16);
      --pp-on-accent: #131120;
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        --pp-motion-skeleton: none;
      }
    }
  `;
}

export function getPageProgressStyles() {
  return `
    ${themeVars()}
    .parsipad-progress-overlay {
      background: var(--pp-bg);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25);
      padding: 16px 24px;
      min-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border: 1px solid var(--pp-border);
      color: var(--pp-text);
    }

    .parsipad-progress-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .parsipad-progress-logo {
      width: 24px;
      height: 24px;
    }

    .parsipad-progress-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--pp-text);
    }

    .parsipad-progress-bar-container {
      height: 6px;
      background: var(--pp-border);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .parsipad-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, var(--pp-accent), var(--pp-accent-strong));
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .parsipad-progress-text {
      font-size: 12px;
      color: var(--pp-text-secondary);
      margin-bottom: 12px;
    }

    .parsipad-progress-cancel {
      width: 100%;
      padding: 8px 16px;
      background: var(--pp-bg-hover);
      border: 1px solid var(--pp-border);
      border-radius: 8px;
      color: var(--pp-text-strong);
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .parsipad-progress-cancel:hover {
      background: var(--pp-border);
      border-color: var(--pp-border-strong);
    }
  `;
}

export function getPageToggleStyles() {
  return `
    ${themeVars()}
    .parsipad-toggle-btn {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(27, 24, 38, 0.15),
                  0 2px 4px rgba(27, 24, 38, 0.1);
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
    }

    .parsipad-toggle-btn svg {
      width: 22px;
      height: 22px;
    }

    .parsipad-toggle-btn.showing-translated {
      background: var(--pp-accent);
      color: white;
    }

    .parsipad-toggle-btn.showing-translated:hover {
      background: var(--pp-accent-strong);
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4),
                  0 3px 8px rgba(27, 24, 38, 0.12);
    }

    .parsipad-toggle-btn.showing-original {
      background: var(--pp-bg);
      color: var(--pp-text-secondary);
      border: 1px solid var(--pp-border);
    }

    .parsipad-toggle-btn.showing-original:hover {
      background: var(--pp-bg-secondary);
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(27, 24, 38, 0.15),
                  0 3px 8px rgba(27, 24, 38, 0.1);
    }

    .parsipad-toggle-btn:active {
      transform: scale(0.96);
    }
  `;
}

export function getScreenshotStyles() {
  return `
    ${themeVars()}
    * { margin: 0; padding: 0; box-sizing: border-box; }

    .screenshot-container {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
    }

    .screenshot-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }

    .screenshot-dimmer {
      position: absolute;
      background: rgba(27, 24, 38, 0.4);
      pointer-events: none;
    }

    .screenshot-dimmer-full {
      inset: 0;
    }

    .screenshot-selection {
      position: absolute;
      border: 2px solid var(--pp-accent);
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3), 0 4px 12px rgba(27, 24, 38, 0.15);
      pointer-events: none;
      display: none;
    }

    .screenshot-tooltip {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(27, 24, 38, 0.75);
      color: #fff;
      padding: 8px 16px;
      border-radius: 8px;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      white-space: nowrap;
      pointer-events: none;
      backdrop-filter: blur(4px);
    }

    .screenshot-tooltip kbd {
      display: inline-block;
      background: rgba(255, 255, 255, 0.15);
      padding: 1px 6px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      margin: 0 2px;
    }
  `;
}

export function getSelectionPopupStyles(showBelow = false) {
  const animFrom = showBelow ? 'translateY(-8px)' : 'translateY(8px)';

  return `
    ${themeVars()}
    :host {
      all: initial;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .selection-popup {
      display: flex;
      align-items: center;
      gap: 4px;
      background: linear-gradient(180deg, var(--pp-bg) 0%, var(--pp-bg-secondary) 100%);
      border-radius: 10px;
      box-shadow:
        0 4px 16px rgba(27, 24, 38, 0.12),
        0 1px 3px rgba(27, 24, 38, 0.08),
        0 0 0 1px rgba(27, 24, 38, 0.04);
      padding: 6px;
      animation: popup-spring-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes popup-spring-in {
      from {
        opacity: 0;
        transform: ${animFrom} scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .selection-btn {
      position: relative;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      /* Use token so the icon is readable in both light and dark themes */
      color: var(--pp-text-secondary);
      transition: background-color 0.15s, color 0.15s, transform 0.15s;
    }

    .selection-btn:hover {
      /* Brand-tint background; brighter brand color in dark mode for legibility */
      background: rgba(99, 102, 241, 0.18);
      color: var(--pp-accent);
      transform: scale(1.05);
    }

    :host([data-theme='dark']) .selection-btn:hover {
      color: var(--pp-accent); /* indigo-300, AA on dark popup bg */
    }

    .selection-btn:focus-visible {
      outline: 2px solid var(--pp-accent);
      outline-offset: 2px;
    }

    .selection-btn:active {
      transform: scale(0.95);
    }

    .selection-btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .selection-btn.disabled:hover {
      background: transparent;
      color: var(--pp-text-secondary);
      transform: none;
    }

    .selection-btn svg {
      width: 18px;
      height: 18px;
    }

    /*
     * Real <span class="pp-tooltip"> element (not ::before/::after) so the
     * tooltip uses theme-aware tokens and stays legible on dark host pages.
     * --pp-text is near-black in light theme, near-white in dark theme;
     * --pp-bg is the inverse. The tooltip is the inverse of its surface.
     */
    .pp-tooltip {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      background: var(--pp-text);
      color: var(--pp-bg);
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      border-radius: 4px;
      opacity: 0;
      visibility: hidden;
      transition: opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), visibility 150ms;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(27, 24, 38, 0.15);
    }

    .pp-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 4px solid transparent;
      border-top-color: var(--pp-text);
    }

    .selection-btn:hover .pp-tooltip,
    .selection-btn:focus-visible .pp-tooltip,
    .selection-btn.disabled:hover .pp-tooltip {
      opacity: 1;
      visibility: visible;
    }

  `;
}

export function getStyles() {
  return `
    ${themeVars()}
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .parsipad-box {
      background: var(--pp-bg);
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(27, 24, 38, 0.15), 0 8px 10px -6px rgba(27, 24, 38, 0.1);
      border: 1px solid var(--pp-border);
      min-width: 280px;
      max-width: 450px;
      animation: parsipad-fade-in 150ms ease-out;
      font-size: 14px;
      line-height: 1.5;
      color: var(--pp-text);
    }

    @keyframes parsipad-fade-in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .parsipad-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--pp-border);
      background: var(--pp-bg-secondary);
      border-radius: 12px 12px 0 0;
      gap: 8px;
    }

    .parsipad-logo {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .parsipad-logo-icon {
      width: 20px;
      height: 20px;
      background: var(--pp-accent);
      color: white;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
    }

    .parsipad-logo-text {
      font-size: 13px;
      font-weight: 600;
      color: var(--pp-text-strong);
    }

    .parsipad-badges {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }

    .parsipad-badge {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 6px;
      background: var(--pp-accent);
      color: white;
      border-radius: 4px;
    }

    /*
     * An empty badge must take up no space at all.
     *
     * Both of these are filled only by the screenshot result now; a normal
     * translation carries its direction in the card's pill and its provider
     * in the card's footer. Without this the emptied elements still painted
     * their padding and fill, which showed up as two small coloured bars
     * floating in the header next to the close button.
     */
    .parsipad-badge:empty,
    .parsipad-provider-badge:empty {
      display: none;
    }

    .parsipad-provider-badge {
      font-size: 9px;
      font-weight: 500;
      padding: 2px 6px;
      color: white;
      border-radius: 4px;
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    }

    .parsipad-provider-claude {
      background: linear-gradient(135deg, var(--pp-warning) 0%, var(--pp-warning) 100%);
    }

    .parsipad-provider-gemini {
      background: linear-gradient(135deg, #4285F4 0%, #1A73E8 100%);
    }

    .parsipad-provider-chatgpt {
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    }

    .parsipad-close {
      width: 24px;
      height: 24px;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--pp-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background-color 0.15s, color 0.15s;
      font-size: 18px;
      line-height: 1;
    }

    .parsipad-close:hover {
      background: var(--pp-border);
      color: var(--pp-text-strong);
    }

    .parsipad-content {
      padding: 16px;
      max-height: 340px;
      overflow-y: auto;
    }

    /* The word a sentence card grew out of, marked in its source line so
       the user can see what they originally selected. */
    .parsipad-source-match {
      background: rgba(138, 90, 4, 0.28);
      color: inherit;
      border-radius: 3px;
      padding: 0 2px;
    }

    /* Inline grammar block: lazy-loaded after the user clicks "Explain grammar".
       Sits above the card's footer. Reads cleanly in both light and dark
       themes via --pp-* tokens. */
    .parsipad-grammar-slot:empty {
      display: none;
    }
    .parsipad-grammar-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--pp-text-muted);
    }
    .parsipad-grammar-list {
      margin: 8px 0 12px;
      padding-inline-start: 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .parsipad-grammar-list[dir='rtl'] {
      padding-inline-start: 0;
      padding-inline-end: 22px;
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
    }
    .parsipad-grammar-list li {
      font-size: 13px;
      line-height: 1.55;
      color: var(--pp-text);
    }
    .parsipad-grammar-point-title {
      font-weight: 600;
      color: var(--pp-text);
      margin-bottom: 2px;
    }
    .parsipad-grammar-point-body {
      color: var(--pp-text-secondary);
    }
    .parsipad-grammar-learn-more {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--pp-accent);
      color: #ffffff;
      border: 1px solid var(--pp-accent);
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      transition: background-color 0.15s;
    }
    .parsipad-grammar-learn-more:hover {
      background: var(--pp-accent-strong);
      border-color: var(--pp-accent-strong);
    }
    .parsipad-grammar-learn-more:focus-visible {
      outline: 2px solid var(--pp-accent);
      outline-offset: 2px;
    }
    .parsipad-grammar-empty,
    .parsipad-grammar-error {
      margin-top: 8px;
      font-size: 12px;
      color: var(--pp-text-secondary);
    }
    .parsipad-grammar-error {
      color: var(--pp-error);
    }
    :host([data-theme='dark']) .parsipad-grammar-error {
      color: var(--pp-error);
    }

    /* One rule covers every Persian node in the box. Elements carry dir
       set from their own content, so this reaches the translation, the
       dictionary entry and the polish variants without each selector
       having to name the family. */
    [dir="rtl"] {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
    }

    .parsipad-text {
      font-size: 17px;
      line-height: 1.55;
      color: var(--pp-text);
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    /* Persian needs more leading than Latin at the same size: the script
       carries dots below the baseline and ascenders that collide at 1.6. */
    .parsipad-text[dir="rtl"] {
      text-align: right;
      line-height: 1.75;
    }

    .parsipad-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid var(--pp-border);
      background: var(--pp-bg-secondary);
      border-radius: 0 0 12px 12px;
    }

    .parsipad-cache-badge {
      font-size: 11px;
      color: var(--pp-text-muted);
    }

    .parsipad-copy {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: var(--pp-accent);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background-color 0.15s;
    }

    .parsipad-copy:hover {
      background: var(--pp-accent-strong);
    }

    .parsipad-copy svg {
      width: 14px;
      height: 14px;
    }

    .parsipad-copy.copied {
      background: #10b981;
    }

    .parsipad-footer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .parsipad-favorite {
      width: 32px;
      height: 32px;
      background: none;
      border: 1px solid var(--pp-border);
      cursor: pointer;
      color: var(--pp-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background-color 0.15s, border-color 0.15s, color 0.15s;
    }

    .parsipad-favorite:hover {
      background: var(--pp-warning-soft);
      border-color: var(--pp-warning);
      color: var(--pp-warning);
    }

    .parsipad-favorite svg {
      width: 16px;
      height: 16px;
    }

    .parsipad-favorite.favorited {
      background: var(--pp-warning-soft);
      border-color: var(--pp-warning);
      color: var(--pp-warning);
    }

    .parsipad-loading {
      padding: 4px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .parsipad-skeleton {
      height: 14px;
      background: linear-gradient(90deg, var(--pp-border) 25%, var(--pp-bg-hover) 50%, var(--pp-border) 75%);
      background-size: 200% 100%;
      animation: var(--pp-motion-skeleton);
      border-radius: 4px;
    }

    .parsipad-skeleton:nth-child(1) { width: 90%; }
    .parsipad-skeleton:nth-child(2) { width: 75%; }
    .parsipad-skeleton:nth-child(3) { width: 60%; }

    @keyframes parsipad-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /*
     * Default is INFO tone (amber). The .is-destructive modifier (added by
     * showError in main.js for real failures like network/invalid-key)
     * upgrades it to the alarming red treatment.
     */
    .parsipad-error {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      background: rgba(138, 90, 4, 0.10);
      border: 1px solid rgba(138, 90, 4, 0.28);
      color: var(--pp-text);
      font-size: 13px;
      line-height: 1.5;
    }
    .parsipad-error svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      color: var(--pp-warning);
    }
    .parsipad-error.is-destructive {
      background: rgba(192, 38, 58, 0.10);
      border-color: rgba(192, 38, 58, 0.28);
      color: var(--pp-error);
    }
    .parsipad-error.is-destructive svg {
      color: var(--pp-error);
    }

    .parsipad-open-settings {
      margin-top: 8px;
      padding: 6px 12px;
      background: var(--pp-accent);
      color: #fff;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }

    .parsipad-open-settings:hover {
      background: var(--pp-accent-strong);
    }

    .parsipad-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-content::-webkit-scrollbar-thumb {
      background: var(--pp-border-strong);
      border-radius: 3px;
    }

    .parsipad-content::-webkit-scrollbar-thumb:hover {
      background: var(--pp-text-muted);
    }

    /* Polish Box Styles */
    .parsipad-polish-box {
      max-width: 500px;
    }

    .parsipad-badge-polish {
      background: var(--pp-accent-strong);
    }

    .parsipad-polish-content {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 380px;
      overflow-y: auto;
    }

    .parsipad-polish-card {
      background: var(--pp-bg-secondary);
      border: 1px solid var(--pp-border);
      border-radius: 8px;
      padding: 10px 12px;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .parsipad-polish-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 6px -1px rgba(27, 24, 38, 0.1);
    }

    .parsipad-polish-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .parsipad-polish-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--pp-accent);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .parsipad-polish-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .parsipad-polish-copy,
    .parsipad-polish-regenerate,
    .parsipad-polish-favorite {
      width: 24px;
      height: 24px;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--pp-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s, transform 0.15s;
    }

    .parsipad-polish-copy:hover,
    .parsipad-polish-regenerate:hover {
      background: var(--pp-border);
      color: var(--pp-text-strong);
    }

    .parsipad-polish-favorite:hover {
      background: var(--pp-warning-soft);
      color: var(--pp-warning);
    }

    .parsipad-polish-copy svg,
    .parsipad-polish-regenerate svg,
    .parsipad-polish-favorite svg {
      width: 14px;
      height: 14px;
    }

    .parsipad-polish-copy.copied {
      color: #10b981;
    }

    .parsipad-polish-favorite.favorited {
      color: var(--pp-warning);
      background: var(--pp-warning-soft);
    }

    .parsipad-polish-regenerate.loading {
      color: var(--pp-accent);
    }

    .parsipad-polish-regenerate.loading svg {
      animation: parsipad-spin 1s linear infinite;
    }

    @keyframes parsipad-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .parsipad-polish-regenerate:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .parsipad-polish-text {
      font-size: 13px;
      line-height: 1.65;
      color: var(--pp-text);
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .parsipad-polish-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-polish-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-polish-content::-webkit-scrollbar-thumb {
      background: var(--pp-border-strong);
      border-radius: 3px;
    }

    /* Dictionary Box Styles */
    .parsipad-dictionary-box {
      max-width: 400px;
    }

    .parsipad-badge-dictionary {
      background: #059669;
    }

    .parsipad-dictionary-content {
      padding: 12px;
      max-height: 350px;
      overflow-y: auto;
    }

    .parsipad-dict-header {
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--pp-border);
    }

    .parsipad-dict-word {
      font-size: 18px;
      font-weight: 600;
      color: var(--pp-text);
      margin-bottom: 4px;
    }

    .parsipad-dict-phonetic {
      font-size: 13px;
      color: var(--pp-text-secondary);
      font-style: italic;
      margin-bottom: 4px;
    }

    .parsipad-dict-pos {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      color: var(--pp-accent-strong);
      background: #f3e8ff;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: lowercase;
    }

    .parsipad-dict-section {
      margin-bottom: 12px;
    }

    .parsipad-dict-section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--pp-accent);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .parsipad-dict-definition {
      margin-bottom: 8px;
    }

    .parsipad-dict-meaning {
      font-size: 13px;
      color: var(--pp-text);
      line-height: 1.65;
    }

    .parsipad-dict-example {
      font-size: 12px;
      color: var(--pp-text-secondary);
      font-style: italic;
      margin-top: 4px;
      padding-left: 10px;
      border-left: 2px solid var(--pp-border);
    }

    .parsipad-dict-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .parsipad-dict-tag {
      font-size: 12px;
      padding: 3px 8px;
      background: var(--pp-bg-hover);
      color: var(--pp-text-strong);
      border-radius: 4px;
    }

    .parsipad-dict-tag-antonym {
      background: var(--pp-error-soft);
      color: var(--pp-error);
    }

    .parsipad-dict-translation {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--pp-border);
      position: relative;
    }

    .parsipad-dict-translation-text {
      font-size: 15px;
      font-weight: 500;
      color: var(--pp-text);
      line-height: 1.5;
      padding-right: 70px;
    }

    .parsipad-dict-translation-text[dir="rtl"] {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      text-align: right;
      padding-right: 0;
      padding-left: 70px;
    }

    .parsipad-dict-translation-actions {
      position: absolute;
      top: 12px;
      right: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .parsipad-dict-copy-translation,
    .parsipad-dict-favorite-translation {
      width: 28px;
      height: 28px;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--pp-text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s;
    }

    .parsipad-dict-copy-translation:hover {
      background: var(--pp-bg-hover);
      color: var(--pp-text-strong);
    }

    .parsipad-dict-favorite-translation:hover {
      background: var(--pp-warning-soft);
      color: var(--pp-warning);
    }

    .parsipad-dict-copy-translation svg,
    .parsipad-dict-favorite-translation svg {
      width: 16px;
      height: 16px;
    }

    .parsipad-dict-copy-translation.copied {
      color: #10b981;
    }

    .parsipad-dict-favorite-translation.favorited {
      background: var(--pp-warning-soft);
      color: var(--pp-warning);
    }

    .parsipad-dictionary-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-dictionary-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-dictionary-content::-webkit-scrollbar-thumb {
      background: var(--pp-border-strong);
      border-radius: 3px;
    }
  `;
}
