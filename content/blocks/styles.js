/**
 * CSS strings for the block-translate surfaces.
 *
 * Theme tokens are imported from content/styles/index.js rather than redefined,
 * so there is one palette for the extension rather than two. Kept in its own
 * module instead of appended to that 1,155-line file so the feature stays
 * self-contained.
 */

import { themeVars } from '../styles/index.js';

export const ICON_SIZE = 24;

export function getBlockIconStyles() {
  return `
    ${themeVars()}
    :host {
      pointer-events: none;
    }
    .pp-block-icon {
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: ${ICON_SIZE}px;
      height: ${ICON_SIZE}px;
      padding: 0;
      border: 1px solid var(--pp-border-strong);
      border-radius: 7px;
      background: var(--pp-bg);
      color: var(--pp-accent);
      box-shadow: var(--pp-shadow-card);
      cursor: pointer;
      opacity: 0;
      transform: scale(0.85);
      transition: opacity 120ms ease, transform 120ms ease, background 120ms ease;
    }
    :host([data-visible='true']) .pp-block-icon {
      pointer-events: auto;
      opacity: 1;
      transform: scale(1);
    }
    .pp-block-icon:hover {
      background: var(--pp-bg-hover);
    }
    .pp-block-icon:focus-visible {
      outline: 2px solid var(--pp-accent);
      outline-offset: 2px;
    }
    .pp-block-icon svg {
      width: 15px;
      height: 15px;
    }
    @media (prefers-reduced-motion: reduce) {
      .pp-block-icon { transition: none; }
    }
  `;
}

export function getBlockTranslationStyles() {
  return `
    ${themeVars()}
    :host {
      display: block;
      margin: 6px 0 10px;
    }
    .pp-block-translation {
      border-inline-start: 3px solid var(--pp-accent);
      padding: 6px 0 6px 12px;
      padding-inline-start: 12px;
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      font-size: var(--pp-source-font-size, 1rem);
      line-height: var(--pp-source-line-height, 1.7);
      color: var(--pp-source-color, var(--pp-text));
      direction: rtl;
      text-align: start;
    }
    .pp-block-body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .pp-block-skeleton {
      display: block;
      height: 1em;
      margin-bottom: 6px;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--pp-skeleton-from), var(--pp-skeleton-to), var(--pp-skeleton-from));
      background-size: 200% 100%;
      animation: var(--pp-motion-skeleton);
    }
    .pp-block-skeleton:last-child { width: 60%; }
    .pp-block-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 11px;
      color: var(--pp-chrome-text, var(--pp-text-muted));
    }
    .pp-block-footer button {
      padding: 2px 8px;
      border: 1px solid var(--pp-chrome-border, var(--pp-border));
      border-radius: 5px;
      background: transparent;
      color: var(--pp-chrome-text, var(--pp-text-secondary));
      font: inherit;
      cursor: pointer;
    }
    .pp-block-footer button:hover { background: var(--pp-chrome-hover, var(--pp-bg-hover)); }
    .pp-block-error {
      color: var(--pp-error);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
    }
    @keyframes parsipad-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
}
