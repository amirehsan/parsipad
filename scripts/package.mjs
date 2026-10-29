#!/usr/bin/env node
/**
 * Package a release for both stores, into store-assets/:
 *
 *   parsipad-vX.Y.Z.zip          Chrome Web Store upload (the contents of dist/)
 *   parsipad-vX.Y.Z-firefox.zip  addons.mozilla.org upload (dist-firefox/)
 *   parsipad-vX.Y.Z-source.zip   the source AMO reviewers rebuild it from
 *   parsipad-vX.Y.Z-SHA256SUMS.txt  the SHA-256 of each zip, in the format
 *                                   `shasum -a 256 -c` reads, published with
 *                                   the GitHub release so anyone can check
 *                                   the zips they download are these
 *
 * It runs its own production build of both browsers first, so a stale,
 * dev or one-browser build in dist/ can never be what ships. The source zip
 * is `git archive` of HEAD, so untracked files such as landing/ never reach
 * it, and a dirty tree is refused: the source has to be exactly what was
 * built. A zip that already
 * exists for this version is the one a store may already have, so it is
 * kept unless --force says otherwise.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store-assets');
const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const FORCE = process.argv.includes('--force');
const NAMES = [`parsipad-v${version}.zip`, `parsipad-v${version}-firefox.zip`, `parsipad-v${version}-source.zip`];
const SUMS = `parsipad-v${version}-SHA256SUMS.txt`;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

function fail(message) {
  console.error(`[parsipad] ${message}`);
  process.exit(1);
}

if (git('status', '--porcelain').trim()) {
  fail('Commit or stash your changes first: the source zip must match the build.');
}

const existing = [...NAMES, SUMS].filter(name => existsSync(join(OUT, name)));
if (existing.length && !FORCE) {
  fail(`Already packaged for ${version}: ${existing.join(', ')}. Bump the version, or pass --force to replace them.`);
}

execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs'), '--browser=all'], { cwd: ROOT, stdio: 'inherit' });
for (const dir of ['dist', 'dist-firefox']) {
  const built = JSON.parse(readFileSync(join(ROOT, dir, 'manifest.json'), 'utf8')).version;
  if (built !== version) fail(`${dir}/ holds ${built}, not ${version}.`);
}

/** Zip a build directory with its files at the zip root, not under the folder. */
function zipDir(dir, name) {
  const src = join(ROOT, dir);
  const out = join(OUT, name);
  rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', out, '.'], { cwd: src });
  return out;
}

const made = [zipDir('dist', NAMES[0]), zipDir('dist-firefox', NAMES[1])];
const source = join(OUT, NAMES[2]);
rmSync(source, { force: true });
git('archive', '--format=zip', '-o', source, 'HEAD');
made.push(source);

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const sums = join(OUT, SUMS);
writeFileSync(sums, made.map((file, i) => `${sha256(file)}  ${NAMES[i]}\n`).join(''));
made.push(sums);

for (const file of made) console.log(`[parsipad] ${file.slice(ROOT.length + 1)}`);
