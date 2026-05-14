#!/usr/bin/env node
/**
 * Build pipeline for the ParsiPad Chrome extension.
 * Bundles each ES-module entry point with esbuild and copies static assets to dist/.
 *
 * Usage:
 *   node scripts/build.mjs           # one-shot production build
 *   node scripts/build.mjs --watch   # rebuild on change (esbuild watch mode)
 *   node scripts/build.mjs --dev     # un-minified + sourcemaps
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');

const argv = new Set(process.argv.slice(2));
const WATCH = argv.has('--watch');
const DEV = argv.has('--dev') || WATCH;

// content/content.js is a tiny bootstrap that runs as a classic content_script
// and dynamically imports content/main.js (the real ES module entry).
// Everything else loads as <script type="module"> from HTML or as a module worker.
const MODULE_ENTRIES = [
  { in: 'background/service-worker.js', out: 'background/service-worker.js' },
  { in: 'content/main.js',               out: 'content/main.js' },
  { in: 'popup/popup.js',                out: 'popup/popup.js' },
  { in: 'settings/settings.js',          out: 'settings/settings.js' },
  { in: 'newtab/newtab.js',              out: 'newtab/newtab.js' },
  { in: 'welcome/welcome.js',            out: 'welcome/welcome.js' },
  { in: 'grammar/grammar.js',            out: 'grammar/grammar.js' },
  { in: 'history/history.js',            out: 'history/history.js' },
  { in: 'favorites/favorites.js',        out: 'favorites/favorites.js' },
  { in: 'analytics/analytics.js',        out: 'analytics/analytics.js' }
];
const IIFE_ENTRIES = [
  { in: 'content/content.js', out: 'content/content.js' }
];

const STATIC = [
  'manifest.json',
  'icons',
  'popup/popup.html', 'popup/popup.css',
  'settings/settings.html', 'settings/settings.css',
  'newtab/newtab.html', 'newtab/newtab.css',
  'welcome/welcome.html', 'welcome/welcome.css',
  'grammar/grammar.html', 'grammar/grammar.css',
  'history/history.html', 'history/history.css',
  'favorites/favorites.html', 'favorites/favorites.css',
  'analytics/analytics.html', 'analytics/analytics.css',
  'content/content.css',
  '_locales',
  'fonts'
];

const COMMON = {
  bundle: true,
  target: ['chrome120'],
  platform: 'browser',
  legalComments: 'none',
  logLevel: 'info',
  minify: !DEV,
  sourcemap: DEV ? 'inline' : false
};

async function clean() {
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

async function copyStatic() {
  for (const rel of STATIC) {
    const src = join(ROOT, rel);
    const dst = join(DIST, rel);
    if (!existsSync(src)) continue;
    await mkdir(dirname(dst), { recursive: true });
    await cp(src, dst, { recursive: true });
  }
}

/**
 * Ensure manifest in dist points at the bundled file paths (they happen to
 * match the source layout, so we just copy as-is for now). Surfaced as its
 * own step so future renames stay easy to wire up.
 */
async function writeManifest() {
  const src = await readFile(join(ROOT, 'manifest.json'), 'utf8');
  await writeFile(join(DIST, 'manifest.json'), src);
}

function toEntryPoints(list) {
  return list.map(e => ({ in: join(ROOT, e.in), out: e.out.replace(/\.js$/, '') }));
}

async function bundleAll() {
  const moduleEntries = toEntryPoints(MODULE_ENTRIES);
  const iifeEntries = toEntryPoints(IIFE_ENTRIES);

  if (WATCH) {
    const ctxModule = await context({ ...COMMON, format: 'esm', entryPoints: moduleEntries, outdir: DIST });
    const ctxIife = await context({ ...COMMON, format: 'iife', entryPoints: iifeEntries, outdir: DIST });
    await Promise.all([ctxModule.watch(), ctxIife.watch()]);
    console.log('[parsipad] esbuild watching for changes...');
    return;
  }

  await Promise.all([
    build({ ...COMMON, format: 'esm', entryPoints: moduleEntries, outdir: DIST }),
    build({ ...COMMON, format: 'iife', entryPoints: iifeEntries, outdir: DIST })
  ]);
}

async function main() {
  console.log(`[parsipad] build ${DEV ? '(dev)' : '(prod)'}${WATCH ? ' --watch' : ''}`);
  await clean();
  await copyStatic();
  await writeManifest();
  await bundleAll();
  console.log('[parsipad] build complete → dist/');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
