# ParsiPad

## The landing page is never pushed to GitHub

This repository is open source. The marketing site in `landing/` is not, and
must stay out of every commit, branch and push.

- `landing/` is excluded in `.gitignore`. Do not remove that rule, do not add
  a negation for anything beneath it, and never stage its files with
  `git add -f`.
- If a task touches `landing/`, the change is finished when it is on disk and
  deployed. There is no commit step for it.

### Deploying it

Vercel serves the directory as a static upload with no build step, so the
stylesheet has to be rebuilt locally first or the deploy ships a stale one:

```bash
cd landing
npm run build:css
npx vercel deploy --yes
npx vercel promote <preview-url> --scope personal-46ddfab5 --yes
```

Deploy to a preview and check it before promoting. `vercel promote` reports
"Deployment belongs to a different team" unless `--scope` is passed
explicitly.

### Consequences to keep in mind

Because nothing in `landing/` is version controlled, the working copy is the
only copy of what is live on parsipad.com. A bad edit or a lost machine
cannot be recovered from git. Back the directory up somewhere outside the
repository.

`landing/index.html` and `landing/privacy.html` were tracked in earlier
history and are still present in the published history on `main`. They have
since been removed from tracking so they will not appear in future commits.
They were not purged from history, which would require rewriting it and a
force push.

## Every change ships with its release chores

A change is not finished when the code works. Before a change is merged,
do all of the following in the same branch, without being asked:

1. **Store description.** Update `store-assets/DESCRIPTION.txt` so it
   describes what the extension does after the change: add new features,
   change wording for changed behaviour, remove what was removed. Keep its
   plain-prose style. If the short description changes, also update
   `extensionDescription` in `_locales/en/messages.json` (132 characters
   max) and the matching text in `store-assets/STORE_LISTING.md`.
2. **Changelog.** Add the change under `## [Unreleased]` in `CHANGELOG.md`,
   in the existing style: what the user saw, why it happened, what changed.
3. **Version bump.** Move the version in every place it lives, together:
   - `manifest.json` `version` (the source of truth; Settings reads it at runtime)
   - `package.json` `version`
   - `package-lock.json`, both top-level `version` fields (it has drifted before)
   - `CHANGELOG.md`: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`
     and open a fresh empty `## [Unreleased]` above it
   Patch for fixes, minor for new features or visible changes, major for
   breaking changes. The Chrome Web Store rejects a version it already has.
   Make the bump its own commit: `chore(release): bump version to X.Y.Z`.
4. **Verify and package.** Run `npm test` (`tests/version.test.js` checks the
   manifest, package.json and the changelog heading agree), `npm run lint`
   and `npm run build`, then zip the contents of `dist/` (files at the zip
   root, not a `dist/` folder) to `store-assets/parsipad-vX.Y.Z.zip`.
   The zips are git-ignored; they are build output for the store upload.
5. **Landing page.** If the change affects anything `landing/` describes,
   update it on disk and deploy it as described above. Never commit it.

Report in the final message which of these were done, and say so
explicitly if any was skipped and why.
