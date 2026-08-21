import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Regression guard for the "content script failed to load" defect.
 *
 * content/content.js is a classic content script. It cannot use static
 * `import` syntax (that would throw a SyntaxError), so it bootstraps by
 * dynamically importing content/main.js as a real ES module via
 * chrome.runtime.getURL(). For that dynamic import to succeed at runtime,
 * every file reachable from content/main.js through relative `import`
 * statements must be listed in manifest.json's web_accessible_resources,
 * or the browser fetch of chrome-extension://<id>/content/main.js (and
 * whatever it imports) fails.
 *
 * This test parses the real files on disk to compute that transitive
 * closure and checks it against the real manifest.json, so a future
 * import added to the content-script module graph without a matching
 * manifest entry fails the suite instead of only breaking unpacked loads.
 */

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const dynamicImportEntry = 'content/main.js';
const classicScriptEntry = 'content/content.js';

function extractRelativeImports(source) {
  const specifiers = [];
  const importRegex = /import\s+(?:[^'"]*?from\s+)?['"](\.[^'"]+)['"]/g;
  let match = importRegex.exec(source);
  while (match !== null) {
    specifiers.push(match[1]);
    match = importRegex.exec(source);
  }
  return specifiers;
}

function resolveClosure(entry) {
  const visited = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const relPath = queue.shift();
    if (visited.has(relPath)) continue;
    visited.add(relPath);
    const absPath = path.join(rootDir, relPath);
    const source = fs.readFileSync(absPath, 'utf8');
    const specifiers = extractRelativeImports(source);
    for (const spec of specifiers) {
      const dir = path.dirname(relPath);
      const resolved = path.normalize(path.join(dir, spec)).split(path.sep).join('/');
      if (!visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return visited;
}

function patternToRegExp(pattern) {
  const escaped = pattern
    .split('')
    .map((ch) => {
      if (ch === '*') return ' STAR ';
      return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  const withStars = escaped.split(' STAR ').join('[^/]*');
  return new RegExp('^' + withStars + '$');
}

function collectPatterns(manifestData) {
  const patterns = [];
  const resourceGroups = manifestData.web_accessible_resources || [];
  for (const group of resourceGroups) {
    for (const resource of group.resources || []) {
      patterns.push(resource);
    }
  }
  return patterns;
}

describe('web_accessible_resources covers the content script module graph', () => {
  it('content/content.js has no relative imports of its own', () => {
    const closure = resolveClosure(classicScriptEntry);
    expect([...closure]).toEqual([classicScriptEntry]);
  });

  it('every file transitively imported by content/main.js matches a web_accessible_resources pattern', () => {
    const closure = resolveClosure(dynamicImportEntry);
    const patterns = collectPatterns(manifest);
    const regexes = patterns.map((pattern) => patternToRegExp(pattern));

    const uncovered = [...closure]
      .filter((file) => !regexes.some((re) => re.test(file)))
      .sort();

    expect(uncovered).toEqual([]);
  });
});
