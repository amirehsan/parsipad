#!/usr/bin/env node
/**
 * Build pipeline for the ParsiPad extension, for Chrome and Firefox.
 * Bundles each ES-module entry point with esbuild and copies static assets,
 * to dist/ for Chrome and dist-firefox/ for Firefox. Both come from the same
 * source; the Firefox manifest is derived in scripts/manifest-targets.mjs.
 *
 * Usage:
 *   node scripts/build.mjs                    # one-shot production build, both browsers
 *   node scripts/build.mjs --browser=firefox  # one browser: chrome, firefox or all
 *   node scripts/build.mjs --watch            # rebuild on change (esbuild watch mode), Chrome unless --browser says
 *   node scripts/build.mjs --dev              # un-minified + sourcemaps
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefoxManifest } from './manifest-targets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TARGETS = {
  chrome: { dist: join(ROOT, 'dist'), esbuildTarget: 'chrome120' },
  firefox: { dist: join(ROOT, 'dist-firefox'), esbuildTarget: 'firefox140' }
};

const args = process.argv.slice(2);
const argv = new Set(args);
const WATCH = argv.has('--watch');
const DEV = argv.has('--dev') || WATCH;
const BROWSER = (args.find(a => a.startsWith('--browser=')) || '').slice('--browser='.length) || (WATCH ? 'chrome' : 'all');

// content/content.js is a tiny bootstrap that runs as a classic content_script
// and dynamically imports content/main.js (the real ES module entry).
// Everything else loads as <script type="module"> from HTML or as a module worker.
const MODULE_ENTRIES = [
  { in: 'background/service-worker.js', out: 'background/service-worker.js' },
  { in: 'content/main.js',               out: 'content/main.js' },
  { in: 'popup/popup.js',                out: 'popup/popup.js' },
  { in: 'sidepanel/sidepanel.js',        out: 'sidepanel/sidepanel.js' },
  { in: 'settings/settings.js',          out: 'settings/settings.js' },
  { in: 'newtab/newtab.js',              out: 'newtab/newtab.js' },
  { in: 'welcome/welcome.js',            out: 'welcome/welcome.js' },
  { in: 'grammar/grammar.js',            out: 'grammar/grammar.js' },
  { in: 'library/library.js',            out: 'library/library.js' },
  { in: 'practice/practice.js',          out: 'practice/practice.js' },
  { in: 'analytics/analytics.js',        out: 'analytics/analytics.js' }
];
const IIFE_ENTRIES = [
  { in: 'content/content.js', out: 'content/content.js' },
  // Classic script, loaded in each page's <head> before the body so the
  // stored theme is applied before first paint.
  { in: 'lib/theme-boot.js', out: 'lib/theme-boot.js' }
];

const STATIC = [
  'manifest.json',
  'icons',
  'popup/popup.html', 'popup/popup.css',
  'sidepanel/sidepanel.html', 'sidepanel/sidepanel.css',
  'settings/settings.html', 'settings/settings.css',
  'newtab/newtab.html', 'newtab/newtab.css',
  'welcome/welcome.html', 'welcome/welcome.css',
  'grammar/grammar.html', 'grammar/grammar.css',
  'library/library.html', 'library/library.css',
  'practice/practice.html', 'practice/practice.css',
  // Redirect stubs: old links and bookmarks land on the matching Library tab.
  'history/history.html',
  'favorites/favorites.html',
  'analytics/analytics.html', 'analytics/analytics.css',
  '_locales',
  'fonts',
  'lib/design-tokens.css',
  'lib/components.css'
];

const COMMON = {
  bundle: true,
  platform: 'browser',
  legalComments: 'none',
  logLevel: 'info',
  minify: !DEV,
  sourcemap: DEV ? 'inline' : false
};

async function clean(dist) {
  if (existsSync(dist)) await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
}

async function copyStatic(dist) {
  for (const rel of STATIC) {
    const src = join(ROOT, rel);
    const dst = join(dist, rel);
    if (!existsSync(src)) continue;
    await mkdir(dirname(dst), { recursive: true });
    await cp(src, dst, { recursive: true });
  }
}

/**
 * Chrome gets manifest.json as written. Firefox gets the manifest derived
 * from it. The bundled paths match the source layout, so neither rewrites
 * them.
 */
async function writeManifest(browser, dist) {
  const src = await readFile(join(ROOT, 'manifest.json'), 'utf8');
  const out = browser === 'firefox' ? `${JSON.stringify(firefoxManifest(JSON.parse(src)), null, 2)}\n` : src;
  await writeFile(join(dist, 'manifest.json'), out);
}

function toEntryPoints(list) {
  return list.map(e => ({ in: join(ROOT, e.in), out: e.out.replace(/\.js$/, '') }));
}

async function bundleAll(browser, dist) {
  const moduleEntries = toEntryPoints(MODULE_ENTRIES);
  const iifeEntries = toEntryPoints(IIFE_ENTRIES);
  const options = { ...COMMON, target: [TARGETS[browser].esbuildTarget], outdir: dist };

  if (WATCH) {
    const ctxModule = await context({ ...options, format: 'esm', entryPoints: moduleEntries });
    const ctxIife = await context({ ...options, format: 'iife', entryPoints: iifeEntries });
    await Promise.all([ctxModule.watch(), ctxIife.watch()]);
    console.log(`[parsipad] esbuild watching for changes (${browser})...`);
    return;
  }

  await Promise.all([
    build({ ...options, format: 'esm', entryPoints: moduleEntries }),
    build({ ...options, format: 'iife', entryPoints: iifeEntries })
  ]);
}

async function buildFor(browser) {
  const { dist } = TARGETS[browser];
  await clean(dist);
  await copyStatic(dist);
  await writeManifest(browser, dist);
  await bundleAll(browser, dist);
  console.log(`[parsipad] ${browser} build complete → ${dist.slice(ROOT.length + 1)}/`);
}

async function main() {
  const browsers = BROWSER === 'all' ? Object.keys(TARGETS) : [BROWSER];
  if (!browsers.every(b => b in TARGETS)) throw new Error(`Unknown --browser=${BROWSER}; use chrome, firefox or all`);
  if (WATCH && browsers.length > 1) throw new Error('--watch builds one browser; pass --browser=chrome or --browser=firefox');
  console.log(`[parsipad] build ${DEV ? '(dev)' : '(prod)'}${WATCH ? ' --watch' : ''}: ${browsers.join(', ')}`);
  for (const browser of browsers) await buildFor(browser);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
