// Side-panel-only behaviour layered over the popup controller. It drives the
// popup DOM the way a reader would (type, pick Translate, press the button), so
// the panel needs no API from popup.js and the two surfaces cannot drift.
import { chipPreview } from './chip-preview.js';
import { getTextDirection } from '../lib/language-detect.js';

const chip = document.getElementById('selection-chip');
const chipText = document.getElementById('selection-chip-text');
const chipTranslateBtn = document.getElementById('selection-chip-translate');

let selectedText = '';
// The window this panel lives in. Set once at init; null if it cannot be read.
let panelWindowId = null;

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

/**
 * Put text in the popup controller's Translate input. This can run before
 * popup.js has wired its listeners (a panel opened by the Library reads its
 * text while the popup controller is still starting), so it does not rely on
 * the input event alone: it sets the text direction itself, and the popup
 * counts characters when its own init finishes.
 * @param {string} text
 * @returns {boolean} false when the input is not on the page
 */
function fillInput(text) {
  const input = document.getElementById('input-text');
  if (!input) return false;
  // Switching modes resets the outputs and shows the text input, so it comes first.
  const modeTranslate = document.getElementById('mode-translate');
  if (modeTranslate && modeTranslate.getAttribute('aria-selected') !== 'true') modeTranslate.click();
  input.value = text;
  input.dir = getTextDirection(text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function translateSelection() {
  if (!selectedText) return;
  const actionBtn = document.getElementById('action-btn');
  if (!actionBtn) return;
  if (fillInput(selectedText)) actionBtn.click();
}

/**
 * Text handed over by the Library's "Open in side panel": the Library writes
 * { text, at, windowId } to chrome.storage.session and opens the panel in its
 * window. Session storage is shared by every window, so a panel in another
 * window leaves the text for the panel it was meant for. It is used once and
 * then removed. One older than PREFILL_MAX_AGE was left behind by an open
 * that never happened (the panel failed to open, or was closed first), and
 * would otherwise surprise the next panel opened, so it is dropped unused.
 */
const PREFILL_KEY = 'panel_prefill';
const PREFILL_MAX_AGE = 60e3;

function usePrefill(prefill) {
  if (!prefill || typeof prefill.text !== 'string') return;
  if (typeof prefill.windowId === 'number' && panelWindowId !== null && prefill.windowId !== panelWindowId) return;
  if (Date.now() - (Number(prefill.at) || 0) <= PREFILL_MAX_AGE) fillInput(prefill.text);
  chrome.storage.session.remove(PREFILL_KEY).catch(() => {});
}

async function readPrefill() {
  try {
    const stored = await chrome.storage.session.get(PREFILL_KEY);
    usePrefill(stored[PREFILL_KEY]);
  } catch {
    // Session storage unavailable; the panel opens empty
  }
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
export async function initPanel() {
  try {
    panelWindowId = (await chrome.windows.getCurrent()).id;
  } catch {
    // Without a window id nothing can be scoped; behave as a single window
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.action !== 'SELECTION_CHANGED' || typeof message.text !== 'string') return;
    // Another window's page is not what this panel is showing.
    if (panelWindowId !== null && sender?.tab && sender.tab.windowId !== panelWindowId) return;
    // A background tab can still fire selectionchange; only the tab being read counts.
    if (sender?.tab && sender.tab.active === false) return;
    showChip(message.text);
  });

  // The selection belongs to the tab it was made in. A tab switch in another
  // window leaves this window's chip alone.
  chrome.tabs.onActivated.addListener((activeInfo) => {
    if (panelWindowId !== null && activeInfo?.windowId !== panelWindowId) return;
    hideChip();
    pullSelection();
  });

  chipTranslateBtn.addEventListener('click', translateSelection);

  // A panel that is already open hears the Library through onChanged; one
  // that was just opened finds the text waiting. Removing the key fires
  // onChanged again with no newValue, which is ignored.
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes[PREFILL_KEY]?.newValue) usePrefill(changes[PREFILL_KEY].newValue);
  });
  readPrefill();

  pullSelection();
}
