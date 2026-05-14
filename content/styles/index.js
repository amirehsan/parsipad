/**
 * CSS string generators for the ParsiPad content script's Shadow DOM trees.
 * Each export returns a stylesheet string keyed to a specific UI surface
 * (floating box, page-progress overlay, etc.).
 */

export function getPageProgressStyles() {
  return `
    .parsipad-progress-overlay {
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25);
      padding: 16px 24px;
      min-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
      color: #111827;
    }

    .parsipad-progress-bar-container {
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .parsipad-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .parsipad-progress-text {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
    }

    .parsipad-progress-cancel {
      width: 100%;
      padding: 8px 16px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      color: #374151;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .parsipad-progress-cancel:hover {
      background: #e5e7eb;
      border-color: #d1d5db;
    }
  `;
}

export function getPageToggleStyles() {
  return `
    .parsipad-toggle-btn {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15),
                  0 2px 4px rgba(0, 0, 0, 0.1);
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
    }

    .parsipad-toggle-btn svg {
      width: 22px;
      height: 22px;
    }

    .parsipad-toggle-btn.showing-translated {
      background: #6366f1;
      color: white;
    }

    .parsipad-toggle-btn.showing-translated:hover {
      background: #4f46e5;
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4),
                  0 3px 8px rgba(0, 0, 0, 0.12);
    }

    .parsipad-toggle-btn.showing-original {
      background: #ffffff;
      color: #6b7280;
      border: 1px solid #e5e7eb;
    }

    .parsipad-toggle-btn.showing-original:hover {
      background: #f9fafb;
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15),
                  0 3px 8px rgba(0, 0, 0, 0.1);
    }

    .parsipad-toggle-btn:active {
      transform: scale(0.96);
    }
  `;
}

export function getScreenshotStyles() {
  return `
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
      background: rgba(0, 0, 0, 0.4);
      pointer-events: none;
    }

    .screenshot-dimmer-full {
      inset: 0;
    }

    .screenshot-selection {
      position: absolute;
      border: 2px solid #6366f1;
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3), 0 4px 12px rgba(0, 0, 0, 0.15);
      pointer-events: none;
      display: none;
    }

    .screenshot-tooltip {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.75);
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
      background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
      border-radius: 10px;
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.12),
        0 1px 3px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(0, 0, 0, 0.04);
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
      color: #64748b;
      transition: background-color 0.15s, color 0.15s, transform 0.15s;
    }

    .selection-btn:hover {
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
      transform: scale(1.05);
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
      color: #64748b;
      transform: none;
    }

    .selection-btn svg {
      width: 18px;
      height: 18px;
    }

    .selection-btn::before {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      background: #1f2937;
      color: #ffffff;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      border-radius: 4px;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      pointer-events: none;
      z-index: 10;
    }

    .selection-btn::after {
      content: '';
      position: absolute;
      bottom: calc(100% + 2px);
      left: 50%;
      transform: translateX(-50%);
      border: 4px solid transparent;
      border-top-color: #1f2937;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s, visibility 0.15s;
      pointer-events: none;
      z-index: 10;
    }

    .selection-btn:hover::before,
    .selection-btn:hover::after {
      opacity: 1;
      visibility: visible;
    }

    .selection-btn.disabled:hover::before {
      opacity: 1;
      visibility: visible;
    }
  `;
}

export function getStyles() {
  return `
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
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid #e5e7eb;
      min-width: 280px;
      max-width: 450px;
      animation: parsipad-fade-in 150ms ease-out;
      font-size: 14px;
      line-height: 1.5;
      color: #111827;
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
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
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
      background: #6366f1;
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
      color: #374151;
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
      background: #6366f1;
      color: white;
      border-radius: 4px;
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
      background: linear-gradient(135deg, #D97706 0%, #B45309 100%);
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
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background-color 0.15s, color 0.15s;
      font-size: 18px;
      line-height: 1;
    }

    .parsipad-close:hover {
      background: #e5e7eb;
      color: #374151;
    }

    .parsipad-content {
      padding: 12px;
      max-height: 200px;
      overflow-y: auto;
    }

    .parsipad-text {
      font-size: 14px;
      line-height: 1.6;
      color: #111827;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .parsipad-text[dir="rtl"] {
      font-family: 'Vazirmatn', 'Tahoma', sans-serif;
      text-align: right;
    }

    .parsipad-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
    }

    .parsipad-cache-badge {
      font-size: 11px;
      color: #9ca3af;
    }

    .parsipad-copy {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background-color 0.15s;
    }

    .parsipad-copy:hover {
      background: #4f46e5;
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
      border: 1px solid #e5e7eb;
      cursor: pointer;
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
    }

    .parsipad-favorite:hover {
      background: #fef3c7;
      border-color: #fbbf24;
      color: #f59e0b;
    }

    .parsipad-favorite svg {
      width: 16px;
      height: 16px;
    }

    .parsipad-favorite.favorited {
      background: #fef3c7;
      border-color: #fbbf24;
      color: #f59e0b;
    }

    .parsipad-loading {
      padding: 4px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .parsipad-skeleton {
      height: 14px;
      background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
      background-size: 200% 100%;
      animation: parsipad-shimmer 1.5s infinite;
      border-radius: 4px;
    }

    .parsipad-skeleton:nth-child(1) { width: 90%; }
    .parsipad-skeleton:nth-child(2) { width: 75%; }
    .parsipad-skeleton:nth-child(3) { width: 60%; }

    @keyframes parsipad-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .parsipad-error {
      color: #ef4444;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .parsipad-error svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .parsipad-open-settings {
      margin-top: 8px;
      padding: 6px 12px;
      background: #6366f1;
      color: #fff;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }

    .parsipad-open-settings:hover {
      background: #4f46e5;
    }

    .parsipad-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    .parsipad-content::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }

    /* Polish Box Styles */
    .parsipad-polish-box {
      max-width: 500px;
    }

    .parsipad-badge-polish {
      background: #8b5cf6;
    }

    .parsipad-polish-content {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 350px;
      overflow-y: auto;
    }

    .parsipad-polish-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .parsipad-polish-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
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
      color: #6366f1;
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
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s, transform 0.15s;
    }

    .parsipad-polish-copy:hover,
    .parsipad-polish-regenerate:hover {
      background: #e5e7eb;
      color: #374151;
    }

    .parsipad-polish-favorite:hover {
      background: #fef3c7;
      color: #f59e0b;
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
      color: #f59e0b;
      background: #fef3c7;
    }

    .parsipad-polish-regenerate.loading {
      color: #6366f1;
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
      line-height: 1.5;
      color: #111827;
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
      background: #d1d5db;
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
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e5e7eb;
    }

    .parsipad-dict-word {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }

    .parsipad-dict-phonetic {
      font-size: 13px;
      color: #6b7280;
      font-style: italic;
      margin-bottom: 4px;
    }

    .parsipad-dict-pos {
      display: inline-block;
      font-size: 11px;
      font-weight: 500;
      color: #8b5cf6;
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
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .parsipad-dict-definition {
      margin-bottom: 8px;
    }

    .parsipad-dict-meaning {
      font-size: 13px;
      color: #111827;
      line-height: 1.5;
    }

    .parsipad-dict-example {
      font-size: 12px;
      color: #6b7280;
      font-style: italic;
      margin-top: 4px;
      padding-left: 10px;
      border-left: 2px solid #e5e7eb;
    }

    .parsipad-dict-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .parsipad-dict-tag {
      font-size: 12px;
      padding: 3px 8px;
      background: #f3f4f6;
      color: #374151;
      border-radius: 4px;
    }

    .parsipad-dict-tag-antonym {
      background: #fef2f2;
      color: #991b1b;
    }

    .parsipad-dict-translation {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      position: relative;
    }

    .parsipad-dict-translation-text {
      font-size: 15px;
      font-weight: 500;
      color: #111827;
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
      color: #9ca3af;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.15s, color 0.15s;
    }

    .parsipad-dict-copy-translation:hover {
      background: #f3f4f6;
      color: #374151;
    }

    .parsipad-dict-favorite-translation:hover {
      background: #fef3c7;
      color: #f59e0b;
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
      background: #fef3c7;
      color: #f59e0b;
    }

    .parsipad-dictionary-content::-webkit-scrollbar {
      width: 6px;
    }

    .parsipad-dictionary-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .parsipad-dictionary-content::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }
  `;
}
