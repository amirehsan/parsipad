// tests/sidepanel-prefill.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Window } from 'happy-dom';

/**
 * "Open in side panel" on a Library card writes the entry's text to
 * chrome.storage.session under panel_prefill and opens the panel. The panel
 * reads it on load (it was just opened) and on onChanged (it was already
 * open), puts it in the input and removes the key so it is used once. A
 * prefill names the window it was opened in; another window's panel leaves it.
 */
const root = path.resolve(__dirname, '..');
const panelHtml = fs.readFileSync(path.join(root, 'sidepanel/sidepanel.html'), 'utf8');
const chipMarkup = panelHtml.match(/<div id="selection-chip"[\s\S]*?<\/div>/)[0];

let doc;
let session;
let onSessionChanged;
let modeClicks;
let polishClicks;

async function setup(stored = {}, { translateSelected = true } = {}) {
  const window = new Window();
  doc = window.document;
  doc.body.innerHTML = `${chipMarkup}<button id="mode-translate" aria-selected="${translateSelected}"></button><button id="mode-polish" aria-selected="false"></button><textarea id="input-text"></textarea>`;
  modeClicks = 0;
  polishClicks = 0;
  // Like the popup controller, a click selects that mode and deselects the other.
  const select = (selected, other) => {
    doc.getElementById(selected).setAttribute('aria-selected', 'true');
    doc.getElementById(other).setAttribute('aria-selected', 'false');
  };
  doc.getElementById('mode-translate').addEventListener('click', () => { modeClicks += 1; select('mode-translate', 'mode-polish'); });
  doc.getElementById('mode-polish').addEventListener('click', () => { polishClicks += 1; select('mode-polish', 'mode-translate'); });
  globalThis.document = doc;
  globalThis.Event = window.Event;
  onSessionChanged = undefined;
  session = {
    get: vi.fn().mockImplementation(async (key) => (key in stored ? { [key]: stored[key] } : {})),
    remove: vi.fn().mockResolvedValue(undefined),
    onChanged: { addListener: (fn) => { onSessionChanged = fn; } }
  };
  globalThis.chrome = {
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
    runtime: { onMessage: { addListener: () => {} } },
    tabs: {
      onActivated: { addListener: () => {} },
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn()
    },
    storage: { session }
  };
  vi.resetModules();
  const { initPanel } = await import('../sidepanel/panel.js');
  await initPanel();
  await vi.waitFor(() => expect(session.get).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
}

const input = () => doc.getElementById('input-text');

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete globalThis.document;
  delete globalThis.chrome;
  delete globalThis.Event;
});

describe('side panel prefill', () => {
  it('fills the input from a prefill waiting on load and removes the key', async () => {
    await setup({ panel_prefill: { text: 'Hello there', at: Date.now() } });
    expect(session.get).toHaveBeenCalledWith('panel_prefill');
    expect(input().value).toBe('Hello there');
    expect(session.remove).toHaveBeenCalledWith('panel_prefill');
  });

  it('leaves the input alone when nothing is waiting', async () => {
    await setup();
    expect(input().value).toBe('');
    expect(session.remove).not.toHaveBeenCalled();
  });

  it('fills the input when a prefill arrives while the panel is open', async () => {
    await setup();
    expect(onSessionChanged).toBeTypeOf('function');
    onSessionChanged({ panel_prefill: { newValue: { text: 'Later text', at: Date.now() } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(input().value).toBe('Later text');
    expect(session.remove).toHaveBeenCalledWith('panel_prefill');
  });

  it('ignores the removal it triggers and unrelated keys', async () => {
    await setup();
    onSessionChanged({ panel_prefill: { oldValue: { text: 'x', at: Date.now() } } });
    onSessionChanged({ other_key: { newValue: 'y' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(input().value).toBe('');
    expect(session.remove).not.toHaveBeenCalled();
  });

  it('leaves a prefill meant for another window to that window\'s panel', async () => {
    await setup();
    onSessionChanged({ panel_prefill: { newValue: { text: 'Elsewhere', at: Date.now(), windowId: 2 } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(input().value).toBe('');
    expect(session.remove).not.toHaveBeenCalled();
    onSessionChanged({ panel_prefill: { newValue: { text: 'Mine', at: Date.now(), windowId: 1 } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(input().value).toBe('Mine');
  });

  it('sets the input direction itself, since the popup may not be listening yet', async () => {
    await setup({ panel_prefill: { text: 'سلام دنیا', at: Date.now() } });
    expect(input().value).toBe('سلام دنیا');
    expect(input().dir).toBe('rtl');
    onSessionChanged({ panel_prefill: { newValue: { text: 'Hello world', at: Date.now() } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(input().dir).toBe('ltr');
  });

  it('switches to Translate before filling, so the text never lands in a hidden input', async () => {
    await setup({}, { translateSelected: false });
    onSessionChanged({ panel_prefill: { newValue: { text: 'Hello', at: Date.now() } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(modeClicks).toBe(1);
    expect(input().value).toBe('Hello');
  });

  it('leaves the mode alone when Translate is already selected', async () => {
    await setup({ panel_prefill: { text: 'Hello', at: Date.now() } });
    expect(modeClicks).toBe(0);
  });

  it('opens a polish entry in Polish, and switches back to Translate for a translation', async () => {
    await setup({ panel_prefill: { text: 'hey there', at: Date.now(), mode: 'polish' } });
    expect(polishClicks).toBe(1);
    expect(modeClicks).toBe(0);
    expect(doc.getElementById('mode-polish').getAttribute('aria-selected')).toBe('true');
    expect(input().value).toBe('hey there');

    onSessionChanged({ panel_prefill: { newValue: { text: 'Hello', at: Date.now(), mode: 'translate' } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(modeClicks).toBe(1);
    expect(doc.getElementById('mode-translate').getAttribute('aria-selected')).toBe('true');
    expect(input().value).toBe('Hello');
  });

  it('treats a prefill with no mode, written by an older Library, as a translation', async () => {
    await setup({}, { translateSelected: false });
    doc.getElementById('mode-polish').setAttribute('aria-selected', 'true');
    onSessionChanged({ panel_prefill: { newValue: { text: 'Hello', at: Date.now() } } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(modeClicks).toBe(1);
    expect(polishClicks).toBe(0);
    expect(input().value).toBe('Hello');
  });

  it('drops a stale prefill instead of filling a later panel with it', async () => {
    await setup({ panel_prefill: { text: 'Old text', at: Date.now() - 5 * 60e3 } });
    expect(input().value).toBe('');
    expect(session.remove).toHaveBeenCalledWith('panel_prefill');
  });
});
