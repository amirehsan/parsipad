import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROVIDER_CONFIGS } from '../lib/constants.js';

/**
 * The privacy policy promises that text and keys go to the provider the
 * reader picked and nowhere else. These pin the code to that promise, so a
 * change that would break it fails here instead of shipping:
 *
 * - the manifest asks for exactly the three provider APIs and no other host
 * - only the provider classes open network connections
 * - every web address in the shipped source is either a provider API or a
 *   link the reader can click, never somewhere data is sent
 *
 * docs/VERIFY.md points readers here, so keep it in step with this file.
 */

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// The folders the build bundles or copies into the extension.
const SHIPPED_DIRS = ['background', 'content', 'popup', 'sidepanel', 'settings', 'newtab', 'welcome',
  'grammar', 'library', 'practice', 'analytics', 'history', 'favorites', 'shared', 'lib'];
const VENDOR = 'lib/vendor/';
const PROVIDER_DIR = 'lib/providers/';

function shippedFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(m?js|html|css)$/.test(entry.name)) out.push(rel);
    }
  };
  for (const dir of SHIPPED_DIRS) walk(dir);
  return out.map(rel => ({ rel, text: fs.readFileSync(path.join(root, rel), 'utf8') }));
}

const files = shippedFiles();
const configuredOrigins = Object.values(PROVIDER_CONFIGS).map(c => new URL(c.endpoint).origin).sort();

// Written out rather than read from PROVIDER_CONFIGS, so that pointing a
// provider somewhere new fails every check below, not only the first.
const PROVIDER_ORIGINS = [
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com'
];

// Pages the reader is sent to by clicking a link. Nothing is fetched from
// them and nothing is sent to them.
const LINK_ORIGINS = [
  'https://console.anthropic.com',
  'https://aistudio.google.com',
  'https://platform.openai.com',
  'https://chromewebstore.google.com',
  'https://addons.mozilla.org',
  'https://parsipad.com',
  'https://github.com'
];
// XML namespace identifiers in SVG markup. They are names, not addresses.
const NAMESPACE_ORIGINS = ['http://www.w3.org'];

const NETWORK_APIS = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|\bimportScripts\b/;

describe('network allowlist', () => {
  it('scans the shipped source', () => {
    // Guards the walk itself: an empty list would pass every check below.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some(f => f.rel.startsWith(PROVIDER_DIR))).toBe(true);
  });

  it('configures exactly the three provider APIs', () => {
    expect(configuredOrigins).toEqual(PROVIDER_ORIGINS);
  });

  it('asks the browser for exactly the three provider APIs', () => {
    expect([...manifest.host_permissions].sort()).toEqual(PROVIDER_ORIGINS.map(o => `${o}/*`));
  });

  it('asks for no host access beyond the provider APIs', () => {
    // The content script does run on every page, to offer translation there,
    // and reads page text inside the page as PRIVACY.md says. A host
    // permission is different: <all_urls> or a wildcard here would let the
    // extension's own pages and worker read any site with your cookies.
    const asked = [...(manifest.permissions || []), ...(manifest.optional_permissions || []),
      ...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])];
    for (const p of asked) {
      expect(p).not.toBe('<all_urls>');
      expect(p).not.toMatch(/^\*:\/\/|^https?:\/\/\*\//);
    }
  });

  it('opens network connections only from the provider classes', () => {
    const offenders = files
      .filter(f => !f.rel.startsWith(PROVIDER_DIR) && NETWORK_APIS.test(f.text))
      .map(f => f.rel);
    expect(offenders).toEqual([]);
  });

  it('sends provider requests only to the configured endpoints', () => {
    // The classes build every URL from this.config.endpoint, so an address
    // written into one of them is a request going somewhere else.
    for (const f of files.filter(file => file.rel.startsWith(PROVIDER_DIR))) {
      expect(f.text, f.rel).not.toMatch(/(https?|wss?):\/\//);
    }
  });

  it('names no web address that is not a provider API or a link', () => {
    const allowed = new Set([...PROVIDER_ORIGINS, ...LINK_ORIGINS, ...NAMESPACE_ORIGINS]);
    const unknown = [];
    for (const f of files.filter(file => !file.rel.startsWith(VENDOR))) {
      for (const [origin] of f.text.matchAll(/(?:https?|wss?):\/\/[a-zA-Z0-9.-]+/g)) {
        if (!allowed.has(origin)) unknown.push(`${f.rel}: ${origin}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('names the provider APIs only in the provider configuration', () => {
    const outside = files
      .filter(f => f.rel !== 'lib/constants.js' && PROVIDER_ORIGINS.some(o => f.text.includes(o)))
      .map(f => f.rel);
    expect(outside).toEqual([]);
  });
});
