import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const popupHtml = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const panelHtml = fs.readFileSync(path.join(root, 'sidepanel/sidepanel.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');

describe('side panel', () => {
  it('is declared in the manifest', () => {
    expect(manifest.permissions).toContain('sidePanel');
    expect(manifest.side_panel.default_path).toBe('sidepanel/sidepanel.html');
  });

  // The panel page is a copy of the popup markup, so this is the guard against
  // the two drifting apart: popup.js would throw on a missing element.
  it('carries every id the popup script queries', () => {
    const ids = new Set([...popupJs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(panelHtml, id).toMatch(new RegExp(`id="${id}"`));
  });

  it('marks itself as the panel surface', () => {
    expect(panelHtml).toMatch(/<body data-surface="panel">/);
    expect(popupHtml).not.toMatch(/data-surface="panel"/);
  });
});
