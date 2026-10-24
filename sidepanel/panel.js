// Side-panel-only behaviour layered over the popup controller. It drives the
// popup DOM the way a reader would (type, pick Translate, press the button), so
// the panel needs no API from popup.js and the two surfaces cannot drift.
import { chipPreview } from './chip-preview.js';

const chip = document.getElementById('selection-chip');
const chipText = document.getElementById('selection-chip-text');
const chipTranslateBtn = document.getElementById('selection-chip-translate');

let selectedText = '';

function showChip(text) {
  selectedText = text;
  chipText.textContent = chipPreview(text);
  chip.hidden = false;
}

function hideChip() {
  selectedText = '';
  chipText.textContent = '';
  chip.hidden = true;
}

function translateSelection() {
  if (!selectedText) return;
  const input = document.getElementById('input-text');
  const modeTranslate = document.getElementById('mode-translate');
  const actionBtn = document.getElementById('action-btn');
  if (!input || !modeTranslate || !actionBtn) return;

  // Switching modes resets the outputs, so do it before filling the input.
  if (modeTranslate.getAttribute('aria-selected') !== 'true') modeTranslate.click();
  input.value = selectedText;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  actionBtn.click();
}

/**
 * Wire the page-selection chip. The text arrives from content scripts over
 * chrome.runtime and never leaves the browser.
 */
export function initPanel() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.action !== 'SELECTION_CHANGED' || typeof message.text !== 'string') return;
    // A background tab can still fire selectionchange; only the tab being read counts.
    if (sender?.tab && sender.tab.active === false) return;
    showChip(message.text);
  });

  // The selection belongs to the tab it was made in.
  chrome.tabs.onActivated.addListener(hideChip);

  chipTranslateBtn.addEventListener('click', translateSelection);
}
