import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { translations } from '../lib/i18n.js';
import { ACTIONS } from '../lib/constants.js';
import { chipPreview, CHIP_PREVIEW_LENGTH } from '../sidepanel/chip-preview.js';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('chipPreview', () => {
  it('leaves short text untouched', () => {
    expect(chipPreview('hello')).toBe('hello');
    expect(chipPreview('a'.repeat(CHIP_PREVIEW_LENGTH))).toBe('a'.repeat(CHIP_PREVIEW_LENGTH));
  });

  it('cuts to 120 characters and marks the cut with an ellipsis', () => {
    const out = chipPreview('a'.repeat(300));
    expect(out).toBe('a'.repeat(120) + '…');
  });

  it('counts whole characters, not UTF-16 halves', () => {
    const out = chipPreview('\u{1F600}'.repeat(200));
    expect(Array.from(out)).toHaveLength(121);
  });
});

describe('selection chip wiring', () => {
  it('has the chip markup only in the panel page', () => {
    expect(read('sidepanel/sidepanel.html')).toMatch(/id="selection-chip"[^>]*hidden/);
    expect(read('sidepanel/sidepanel.html')).toMatch(/id="selection-chip-translate"[^>]*data-i18n="translate"/);
    expect(read('popup/popup.html')).not.toMatch(/selection-chip/);
  });

  it('has the label in both locales and the message action declared', () => {
    expect(translations.en.selectedOnPage).toBeTruthy();
    expect(translations.fa.selectedOnPage).toBeTruthy();
    expect(ACTIONS.SELECTION_CHANGED).toBe('SELECTION_CHANGED');
    expect(ACTIONS.GET_SELECTION).toBe('GET_SELECTION');
  });

  it('lists the content module in web_accessible_resources', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(manifest.web_accessible_resources[0].resources).toContain('content/selection-report.js');
  });

  it('pulls the current selection from the content script on open and on tab change', () => {
    const panelJs = read('sidepanel/panel.js');
    expect(panelJs).toMatch(/action: 'GET_SELECTION'/);
    expect(panelJs).toMatch(/onActivated\.addListener\(\(\) => \{\s*hideChip\(\);\s*pullSelection\(\);/);
    expect(read('content/main.js')).toMatch(/case 'GET_SELECTION':/);
  });

  it('styles the chip with spacing tokens only', () => {
    const css = read('sidepanel/sidepanel.css');
    const block = css.slice(css.indexOf('.selection-chip {'));
    expect(block).toMatch(/var\(--space-inset-card\)/);
    expect(block).toMatch(/var\(--space-stack-item\)/);
    expect(block).toMatch(/var\(--space-inline-actions\)/);
    expect(block).not.toMatch(/(padding|margin|gap):\s*[^;]*\d+(px|rem)/);
  });
});
