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
 * refused: the source has to be exactly what was built.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store-assets');
const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

function fail(message) {
  console.error(`[parsipad] ${message}`);
  process.exit(1);
}

if (git('status', '--porcelain').trim()) {
  fail('Commit or stash your changes first: the source zip must match the build.');
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

const made = [
  zipDir('dist', `parsipad-v${version}.zip`),
  zipDir('dist-firefox', `parsipad-v${version}-firefox.zip`)
];
const source = join(OUT, `parsipad-v${version}-source.zip`);
git('archive', '--format=zip', '-o', source, 'HEAD');
made.push(source);

for (const file of made) console.log(`[parsipad] ${file.slice(ROOT.length + 1)}`);
