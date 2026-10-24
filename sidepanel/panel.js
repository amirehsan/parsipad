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
 * Ask the active tab's top frame for what is selected right now. Covers a
 * panel opened after the selection was made and a return to a tab whose text
 * is still selected. Rejections (chrome:// pages, no content script) leave
 * the chip hidden.
 */
async function pullSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Action name literal: kept in step with ACTIONS.GET_SELECTION (lib/constants.js)
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_SELECTION' }, { frameId: 0 });
    if (typeof response?.text === 'string' && response.text) showChip(response.text);
  } catch {
    // Nothing to offer from this tab
  }
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
  chrome.tabs.onActivated.addListener(() => {
    hideChip();
    pullSelection();
  });

  chipTranslateBtn.addEventListener('click', translateSelection);

  pullSelection();
}
