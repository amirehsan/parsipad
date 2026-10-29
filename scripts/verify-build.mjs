#!/usr/bin/env node
/**
 * Check that a copy of ParsiPad is exactly what this source builds:
 *
 *   npm run verify -- <path>
 *
 * <path> is a release zip, a .crx or .xpi downloaded from a store, or the
 * folder a browser installed the extension into. The browser is read from
 * its manifest, that browser is built from the current checkout, and every
 * file is compared. Check out the matching tag first (git checkout vX.Y.Z)
 * and run npm ci, so the source and the build tools are the ones it shipped
 * with.
 *
 * What the stores add on top of the upload is left out of the comparison:
 * Chrome's _metadata/ folder of content hashes and the update_url (and key)
 * it writes into an installed manifest, and the META-INF/ signature files
 * in a signed Firefox add-on. Everything else must match byte for byte.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv.slice(2).find(a => !a.startsWith('--'));

function fail(message) {
  console.error(`[parsipad] ${message}`);
  process.exit(1);
}

if (!target) fail('Usage: npm run verify -- <zip, crx, xpi or installed extension folder>');

const STORE_ADDED_DIRS = ['_metadata/', 'META-INF/'];
const STORE_ADDED_MANIFEST_KEYS = ['update_url', 'key'];

/** Relative paths of every file under dir, store additions left out. */
function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.filter(p => !STORE_ADDED_DIRS.some(prefix => p.startsWith(prefix))).sort();
}

function readManifest(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  for (const key of STORE_ADDED_MANIFEST_KEYS) delete manifest[key];
  return manifest;
}

let tmp = null;
let shipped = resolve(target);
if (!statSync(shipped).isDirectory()) {
  tmp = mkdtempSync(join(tmpdir(), 'parsipad-verify-'));
  try {
    execFileSync('unzip', ['-q', shipped, '-d', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    // A .crx is a zip behind a signed header. unzip reads past the header
    // and extracts it, but exits 1 to warn about the extra bytes.
    if (err.status !== 1) fail(`Could not unpack ${target}.`);
  }
  shipped = tmp;
}

try {
  const shippedManifest = readManifest(shipped);
  const browser = shippedManifest.browser_specific_settings?.gecko ? 'firefox' : 'chrome';
  const ours = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;
  if (shippedManifest.version !== ours) {
    fail(`That is version ${shippedManifest.version} and this checkout is ${ours}. Run git checkout v${shippedManifest.version} and npm ci first.`);
  }

  console.log(`[parsipad] Building ${browser} ${ours} from this checkout...`);
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs'), `--browser=${browser}`], { cwd: ROOT, stdio: 'ignore' });
  const built = join(ROOT, browser === 'firefox' ? 'dist-firefox' : 'dist');

  const a = listFiles(built);
  const b = listFiles(shipped);
  const onlyBuilt = a.filter(p => !b.includes(p));
  const onlyShipped = b.filter(p => !a.includes(p));
  const differ = a.filter(p => b.includes(p) && p !== 'manifest.json'
    && !readFileSync(join(built, p)).equals(readFileSync(join(shipped, p))));
  if (JSON.stringify(readManifest(built)) !== JSON.stringify(shippedManifest)) differ.unshift('manifest.json');

  const problems = [
    ...onlyShipped.map(p => `only in the copy you gave: ${p}`),
    ...onlyBuilt.map(p => `missing from the copy you gave: ${p}`),
    ...differ.map(p => `different: ${p}`)
  ];
  if (problems.length) {
    for (const line of problems) console.error(`[parsipad]   ${line}`);
    fail(`${problems.length} file(s) do not match the source.`);
  }
  console.log(`[parsipad] Match: all ${a.length} files are identical to the source build.`);
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
