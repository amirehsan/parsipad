#!/usr/bin/env node
/**
 * Publish a packaged version as a tagged GitHub release:
 *
 *   npm run release                    the version in manifest.json
 *   npm run release -- --version=3.9.0 an earlier version that was packaged
 *   npm run release -- --dry-run       check everything, publish nothing
 *
 * Run it after `npm run package` and after the build has been pushed. It tags
 * the commit the source zip was archived from, which `git archive` writes
 * into the zip's comment, so the tag names exactly the code the store zips
 * were built from even when docs commits have landed on top since. The
 * release carries the Chrome, Firefox and source zips, their SHA-256 sums,
 * and the version's CHANGELOG.md section as its notes.
 *
 * It refuses when anything does not line up: a zip missing, a checksum that
 * no longer matches, the commit not on origin/main, or the tag or release
 * already existing. Releases are public and tags are not meant to move, so
 * nothing is overwritten.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store-assets');
const DRY_RUN = process.argv.includes('--dry-run');
const versionArg = process.argv.find(a => a.startsWith('--version='));
const version = versionArg
  ? versionArg.slice('--version='.length)
  : JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;
const tag = `v${version}`;

const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
const git = (...args) => run('git', ...args);

function fail(message) {
  console.error(`[parsipad] ${message}`);
  process.exit(1);
}

function succeeds(cmd, ...args) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`"${version}" is not a version.`);

const zips = [`parsipad-v${version}.zip`, `parsipad-v${version}-firefox.zip`, `parsipad-v${version}-source.zip`];
const missing = zips.filter(name => !existsSync(join(OUT, name)));
if (missing.length) fail(`Not packaged: ${missing.join(', ')}. Run npm run package first.`);

// The sums file is written by `npm run package`. Versions packaged before it
// did that get one written here from the zips, which are the uploaded ones.
const sha256 = (name) => createHash('sha256').update(readFileSync(join(OUT, name))).digest('hex');
const sumsName = `parsipad-v${version}-SHA256SUMS.txt`;
const sumsPath = join(OUT, sumsName);
const expected = zips.map(name => `${sha256(name)}  ${name}\n`).join('');
if (existsSync(sumsPath)) {
  if (readFileSync(sumsPath, 'utf8') !== expected) {
    fail(`${sumsName} does not match the zips beside it. Something changed them after packaging.`);
  }
} else if (!DRY_RUN) {
  writeFileSync(sumsPath, expected);
}

const comment = run('unzip', '-z', join(OUT, zips[2])).split('\n').map(l => l.trim());
const commit = comment.find(line => /^[0-9a-f]{40}$/.test(line));
if (!commit) fail(`${zips[2]} does not name the commit it was archived from.`);

git('fetch', '--quiet', '--tags', 'origin', 'main');
if (!succeeds('git', 'merge-base', '--is-ancestor', commit, 'origin/main')) {
  fail(`${commit.slice(0, 7)} is not on origin/main yet. Push it first.`);
}
const built = JSON.parse(git('show', `${commit}:manifest.json`)).version;
if (built !== version) fail(`${commit.slice(0, 7)} is version ${built}, not ${version}.`);

if (succeeds('git', 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}`)) fail(`Tag ${tag} already exists.`);
if (succeeds('gh', 'release', 'view', tag)) fail(`A GitHub release for ${tag} already exists.`);

// The version's changelog section, from its heading to the next one.
const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
const start = changelog.indexOf(`## [${version}]`);
if (start === -1) fail(`CHANGELOG.md has no section for ${version}.`);
const next = changelog.indexOf('\n## [', start + 1);
const section = changelog.slice(changelog.indexOf('\n', start) + 1, next === -1 ? undefined : next).trim();
const notes = `${section}

### Verify this release

\`${sumsName}\` lists the SHA-256 of each zip. The Chrome and Firefox zips can be rebuilt from this tag and compared file by file, as [docs/VERIFY.md](https://github.com/amirehsan/parsipad/blob/main/docs/VERIFY.md) explains.
`;

console.log(`[parsipad] ${tag} -> ${commit.slice(0, 7)}`);
for (const name of [...zips, sumsName]) console.log(`[parsipad]   ${name}`);
if (DRY_RUN) {
  console.log('[parsipad] Dry run: nothing tagged, pushed or published.');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'parsipad-release-'));
const notesFile = join(tmp, 'notes.md');
writeFileSync(notesFile, notes);
try {
  git('tag', '-a', tag, commit, '-m', `ParsiPad ${version}`);
  git('push', 'origin', `refs/tags/${tag}`);
  run('gh', 'release', 'create', tag, '--verify-tag', '--title', `ParsiPad ${version}`,
    '--notes-file', notesFile, ...[...zips, sumsName].map(name => join(OUT, name)));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`[parsipad] Released ${tag}.`);
