# Contributing to ParsiPad

Thank you for your interest in contributing to ParsiPad! Contributions of every size are welcome, from typo fixes to new features. Please read the [code of conduct](CODE_OF_CONDUCT.md) before taking part.

## Reporting bugs

1. Check whether the bug has already been reported in [Issues](https://github.com/amirehsan/parsipad/issues)
2. If not, open a new issue with the **Bug report** template and include:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected and actual behavior
   - ParsiPad version (Settings > About), browser version and OS
   - The AI provider you were using
   - Screenshots or console errors if you have them

Never paste your API key into an issue. To report a security vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Suggesting features

1. Check the [roadmap](ROADMAP.md) and existing issues for similar ideas
2. Open a new issue with the **Feature request** template (it applies the `enhancement` label)
3. Describe the problem it solves and who it helps

## Development setup

Requires [Node.js](https://nodejs.org/) 20 or later (CI uses Node 20).

```bash
git clone https://github.com/<your-username>/parsipad.git
cd parsipad
npm ci
npm run build:watch
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select the `dist/` folder. `build:watch` rebuilds on every change; press the reload icon on ParsiPad's card in `chrome://extensions` to pick up the new build, and reload any open web page to get the new content script.

For Firefox, run `npm run build:firefox` and then `npm run start:firefox`. It opens Firefox with a clean profile and ParsiPad loaded from `dist-firefox/`, and reloads it when the build changes. `npm run build:watch -- --browser=firefox` keeps that build current.

To use the extension you need an API key from Anthropic, Google or OpenAI. See the [README](README.md#quick-start).

## Building from source

The same source builds both packages, with the same steps on macOS and Linux. They need Node 20 or later and the `zip` command line tool only for `npm run package`, so the default Firefox Add-ons review setup (Ubuntu 24.04, Node 24, npm 11) can follow them as written.

```bash
npm ci
npm run build
```

`npm run build` writes the Chrome package to `dist/` and the Firefox package to `dist-firefox/`. The Firefox manifest is generated from `manifest.json` by `scripts/manifest-targets.mjs`. The bundles are made with esbuild, from the exact versions pinned in `package-lock.json`. `npm run lint:firefox` runs Mozilla's `web-ext lint` on the Firefox package.

## Submitting code

1. **Fork the repository** and create a branch from `main`, named after the kind of change:

   ```bash
   git checkout -b feat/short-description
   ```

   Use `feat/`, `fix/` or `docs/` as the prefix.

2. **Make your changes**, following the code style below. Add or update tests for any logic you change.

3. **Check your work** before pushing:

   ```bash
   npm test
   npm run lint
   npm run build
   ```

   CI runs the same three checks on every pull request, and lint must pass with no warnings.

4. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/), with the area of the extension as the scope:

   ```bash
   git commit -m "fix(popup): keep the translation when a copy fails"
   ```

   Common types are `feat`, `fix`, `docs`, `test` and `refactor`. Scopes match the folders, such as `popup`, `content`, `settings`, `newtab` or `library`.

5. **Describe user-visible changes** under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), in the existing style: what the user saw, why it happened and what changed. Leave version numbers alone; the maintainer bumps them at release time.

6. **Open a pull request** against `main`. Fill in the template, link any related issue and include screenshots for UI changes.

## Code style

### JavaScript

- Plain JavaScript ES modules, no UI framework. Do not add runtime dependencies without discussing it in an issue first
- ESLint enforces the basics: single quotes, semicolons, `const`/`let`, and `===`
- Use clear names and keep functions small and focused
- Add a comment where the reason for the code is not obvious from the code itself
- Sanitize any HTML built from provider output or user content with `lib/sanitize.js`
- Handle errors with a message the user can act on, never a silent failure

### HTML and CSS

- Use semantic HTML and keep pages keyboard accessible, with visible focus
- Use the shared tokens in `lib/design-tokens.css` and components in `lib/components.css`
- Support light and dark themes

### Localization

- Every interface string goes in `lib/i18n.js`, in both English and Persian
- Strings Chrome itself shows (the extension name, description, menu entries and command labels) go in `_locales/en/messages.json` and `_locales/fa/messages.json`
- Check the Persian interface for right-to-left layout, and keep English text left to right inside it

## Testing

Unit tests live in `tests/` and run with [Vitest](https://vitest.dev/) and happy-dom: `npm test`, or `npm run test:watch` while you work.

Before opening a pull request, also try your change by hand:

1. In Chrome, and in Firefox (`npm run start:firefox`), plus one other Chromium browser such as Edge or Brave if you can
2. In both light and dark themes
3. In both the English and Persian interface, with Persian and English text
4. With no errors in the console of the popup, the service worker or the page

## Questions?

Open an [issue](https://github.com/amirehsan/parsipad/issues) with your question.

Thank you for helping make ParsiPad better!
