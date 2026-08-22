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
