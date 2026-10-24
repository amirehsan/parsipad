import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Window } from 'happy-dom';

/**
 * One side panel lives in one browser window. Selections and tab activations
 * from other windows must not move this window's chip.
 */
const root = path.resolve(__dirname, '..');
const panelHtml = fs.readFileSync(path.join(root, 'sidepanel/sidepanel.html'), 'utf8');
const chipMarkup = panelHtml.match(/<div id="selection-chip"[\s\S]*?<\/div>/)[0];

const PANEL_WINDOW = 7;
let doc;
let onMessage;
let onActivated;
let tabsQuery;
let sendMessage;

async function setup({ selectionInTab = null } = {}) {
  const window = new Window();
  doc = window.document;
  doc.body.innerHTML = chipMarkup;
  globalThis.document = doc;
  tabsQuery = vi.fn().mockResolvedValue([{ id: 1 }]);
  sendMessage = vi.fn().mockImplementation(async () => (selectionInTab ? { text: selectionInTab } : {}));
  globalThis.chrome = {
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: PANEL_WINDOW }) },
    runtime: { onMessage: { addListener: (fn) => { onMessage = fn; } } },
    tabs: {
      onActivated: { addListener: (fn) => { onActivated = fn; } },
      query: tabsQuery,
      sendMessage
    }
  };
  vi.resetModules();
  const { initPanel } = await import('../sidepanel/panel.js');
  await initPanel();
  await Promise.resolve();
}

const chip = () => doc.getElementById('selection-chip');
const select = (text, windowId, active = true) =>
  onMessage({ action: 'SELECTION_CHANGED', text }, { tab: { id: 2, active, windowId } });

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.chrome;
});

describe('side panel window scoping', () => {
  it('shows a selection reported from its own window', async () => {
    await setup();
    select('hello world', PANEL_WINDOW);
    expect(chip().hidden).toBe(false);
    expect(doc.getElementById('selection-chip-text').textContent).toBe('hello world');
  });

  it('ignores a selection reported from another window', async () => {
    await setup();
    select('elsewhere', PANEL_WINDOW + 1);
    expect(chip().hidden).toBe(true);
  });

  it('does not let another window clear the chip when its tab is activated', async () => {
    await setup();
    select('keep me', PANEL_WINDOW);
    onActivated({ tabId: 9, windowId: PANEL_WINDOW + 1 });
    expect(chip().hidden).toBe(false);
    expect(doc.getElementById('selection-chip-text').textContent).toBe('keep me');
  });

  it('hides and re-pulls when a tab in its own window is activated', async () => {
    await setup();
    select('old', PANEL_WINDOW);
    tabsQuery.mockClear();
    onActivated({ tabId: 9, windowId: PANEL_WINDOW });
    expect(chip().hidden).toBe(true);
    await Promise.resolve();
    expect(tabsQuery).toHaveBeenCalled();
  });
});
