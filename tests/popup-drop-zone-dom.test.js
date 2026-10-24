// tests/popup-drop-zone-dom.test.js
// @vitest-environment happy-dom
// @vitest-environment-options {"url": "chrome-extension://parsipad/popup/popup.html"}
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';

/**
 * The Doc & Image drop zone driven through the real popup: whatever arrives
 * by the picker, a drop or a paste goes to the translator its type belongs
 * to, the zone gives way while a file is loaded, and focus follows.
 */
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
const en = translations.en;

let store;

/** Every chrome.* call the popup makes resolves; storage is held in memory. */
function installChrome() {
  const listener = { addListener: vi.fn(), removeListener: vi.fn() };
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          const keys = key === null || key === undefined ? Object.keys(store) : Array.isArray(key) ? key : typeof key === 'object' ? Object.keys(key) : [key];
          const out = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (items) => { Object.assign(store, items); }),
        remove: vi.fn(async () => {})
      },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      onChanged: listener
    },
    runtime: {
      id: 'parsipad',
      getURL: (p) => `chrome-extension://parsipad/${p}`,
      getManifest: () => ({ version: '0.0.0' }),
      sendMessage: vi.fn(async () => ({})),
      connect: vi.fn(() => ({ postMessage: vi.fn(), disconnect: vi.fn(), onMessage: listener, onDisconnect: listener })),
      onMessage: listener
    },
    commands: { getAll: vi.fn(async () => []) },
    tabs: { query: vi.fn(async () => [{ id: 1, url: 'https://example.com/' }]), create: vi.fn(), sendMessage: vi.fn(async () => ({})) },
    sidePanel: { open: vi.fn(async () => {}) },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) }
  };
}

const $ = (selector) => document.querySelector(selector);
const shown = (selector) => !$(selector).hidden;

async function openDocImage() {
  store = { onboarding_complete: true, ui_language: 'en', theme: 'light' };
  installChrome();
  document.body.innerHTML = bodyMarkup;
  vi.resetModules();
  await import('../popup/popup.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // init has run once it has written the character count over the markup's placeholder.
  await vi.waitFor(() => expect($('#char-count').textContent).not.toBe('0 characters'));
  $('#mode-doc-image').click();
  await vi.waitFor(() => expect(shown('#doc-image-section')).toBe(true));
}

function choose(file) {
  const input = $('#file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function drop(file, target = $('#drop-zone')) {
  const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' };
  const over = new Event('dragover', { bubbles: true, cancelable: true });
  over.dataTransfer = dataTransfer;
  target.dispatchEvent(over);
  const lit = $('#drop-zone').classList.contains('is-dragover');
  const dropped = new Event('drop', { bubbles: true, cancelable: true });
  dropped.dataTransfer = dataTransfer;
  target.dispatchEvent(dropped);
  return { lit, prevented: dropped.defaultPrevented };
}

function paste(file) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  event.clipboardData = { items: [{ kind: 'file', type: file.type, getAsFile: () => file }] };
  document.body.dispatchEvent(event);
  return event;
}

const textFile = (name = 'notes.txt', type = 'text/plain', body = 'Hello there.') => new File([body], name, { type });
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
const imageFile = (name = 'photo.png', type = 'image/png') => new File([PNG], name, { type });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('Doc & Image drop zone', () => {
  it('starts with only the zone, a button named by its title and described by the supported types', async () => {
    await openDocImage();
    const zone = $('#drop-zone');
    expect(zone.tagName).toBe('BUTTON');
    expect($(`#${zone.getAttribute('aria-labelledby')}`).textContent).toBe(en.dropZoneTitle);
    expect($(`#${zone.getAttribute('aria-describedby')}`).textContent).toBe(en.dropZoneHint);
    expect(shown('#drop-zone')).toBe(true);
    expect(shown('.document-section')).toBe(false);
    expect(shown('.image-section')).toBe(false);
  });

  it('sends a chosen text file to the document translator and moves focus to Translate', async () => {
    await openDocImage();
    choose(textFile());
    expect(shown('.document-section')).toBe(true);
    expect(shown('#drop-zone')).toBe(false);
    expect($('#doc-name').textContent).toBe('notes.txt');
    expect(document.activeElement).toBe($('#translate-doc-btn'));
    expect($('#status-line').textContent).toBe(en.documentReady);
  });

  it('lights up for a dragged file and sends a dropped image to image translation', async () => {
    await openDocImage();
    const { lit, prevented } = drop(imageFile());
    expect(lit).toBe(true);
    expect(prevented).toBe(true);
    expect(shown('.image-section')).toBe(true);
    expect(shown('.document-section')).toBe(false);
    expect($('#drop-zone').classList.contains('is-dragover')).toBe(false);
    expect($('#status-line').textContent).toBe(en.imageReady);
  });

  it('takes a drop anywhere in Doc & Image, not only on the zone', async () => {
    await openDocImage();
    drop(textFile(), $('#doc-image-section'));
    expect(shown('.document-section')).toBe(true);
  });

  it('turns away a file it cannot translate, says what it takes, and keeps the zone', async () => {
    await openDocImage();
    drop(new File(['%PDF'], 'report.pdf', { type: 'application/pdf' }));
    expect($('#error-message').textContent).toBe(en.unsupportedFileType);
    expect(shown('#error-section')).toBe(true);
    expect(shown('#drop-zone')).toBe(true);
    expect(shown('.document-section')).toBe(false);
  });

  it('judges a file the browser could not type by its extension', async () => {
    await openDocImage();
    choose(imageFile('photo.JPG', ''));
    expect(shown('.image-section')).toBe(true);
  });

  it('routes a pasted image, and ignores a paste once a file is loaded', async () => {
    await openDocImage();
    expect(paste(imageFile()).defaultPrevented).toBe(true);
    expect(shown('.image-section')).toBe(true);
    expect(paste(textFile()).defaultPrevented).toBe(false);
    expect(shown('.document-section')).toBe(false);
  });

  it('brings the zone back with Remove and puts focus on it', async () => {
    await openDocImage();
    choose(textFile());
    $('#remove-file-btn').click();
    expect(shown('#drop-zone')).toBe(true);
    expect(shown('.document-section')).toBe(false);
    expect(document.activeElement).toBe($('#drop-zone'));
  });

  it('keeps Remove locked while the document is translating, so a run cannot carry on behind the zone', async () => {
    await openDocImage();
    store.selectedProvider = 'claude';
    store.apiKey = 'sk-ant-test';
    choose(textFile());
    $('#translate-doc-btn').click();
    await vi.waitFor(() => expect($('#remove-file-btn').disabled).toBe(true));
    expect(shown('#drop-zone')).toBe(false);
  });

  it('checks size before taking a file, so an oversized one leaves the zone as it was', async () => {
    await openDocImage();
    choose(textFile('big.txt', 'text/plain', 'x'.repeat(100 * 1024 + 1)));
    expect($('#error-message').textContent).toBe(en.fileTooLarge);
    expect(shown('#drop-zone')).toBe(true);
    choose(textFile('empty.txt', 'text/plain', ''));
    expect($('#error-message').textContent).toBe(en.fileEmpty);
  });

  it('opens the file picker from the zone', async () => {
    await openDocImage();
    const click = vi.spyOn($('#file-input'), 'click').mockImplementation(() => {});
    $('#drop-zone').click();
    expect(click).toHaveBeenCalledTimes(1);
  });
});
