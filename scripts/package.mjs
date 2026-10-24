#!/usr/bin/env node
/**
 * Package a release for both stores, into store-assets/:
 *
 *   parsipad-vX.Y.Z.zip          Chrome Web Store upload (the contents of dist/)
 *   parsipad-vX.Y.Z-firefox.zip  addons.mozilla.org upload (dist-firefox/)
 *   parsipad-vX.Y.Z-source.zip   the source AMO reviewers rebuild it from
 *
 * Run `npm run build` first. The source zip is `git archive` of HEAD, so
 * untracked files such as landing/ never reach it, and a dirty tree is
 * refused: the source has to be exactly what was built. A zip that already
 * exists for this version is the one a store may already have, so it is
 * kept unless --force says otherwise.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store-assets');
const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const FORCE = process.argv.includes('--force');
const NAMES = [`parsipad-v${version}.zip`, `parsipad-v${version}-firefox.zip`, `parsipad-v${version}-source.zip`];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

function fail(message) {
  console.error(`[parsipad] ${message}`);
  process.exit(1);
}

if (git('status', '--porcelain').trim()) {
  fail('Commit or stash your changes first: the source zip must match the build.');
}

const existing = NAMES.filter(name => existsSync(join(OUT, name)));
if (existing.length && !FORCE) {
  fail(`Already packaged for ${version}: ${existing.join(', ')}. Bump the version, or pass --force to replace them.`);
}

/** Zip a build directory with its files at the zip root, not under the folder. */
function zipDir(dir, name) {
  const src = join(ROOT, dir);
  if (!existsSync(join(src, 'manifest.json'))) fail(`${dir}/ has no build. Run npm run build first.`);
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

for (const file of made) console.log(`[parsipad] ${file.slice(ROOT.length + 1)}`);
