# Verifying ParsiPad yourself

ParsiPad asks you to trust it with the text you translate and with your AI provider's API key. You should not have to take that on faith. This guide shows how to check, without trusting the developer, that:

1. the copy you installed from a store was built from the public source, file for file;
2. a zip you downloaded from GitHub is the one that was released;
3. the extension only talks to the AI provider you chose.

None of this replaces a professional security audit, which ParsiPad has not had. It does mean every claim in the [privacy policy](../PRIVACY.md) can be checked against code you can read.

## 1. Check that the store copy matches the source

The Chrome Web Store and Firefox Add-ons serve exactly what was uploaded, plus their own signature files. The build is reproducible: building a tagged version from source gives the same files, byte for byte, as the zip uploaded to the stores. `npm run verify` does the comparison for you.

You need [Node.js](https://nodejs.org/) 20 or later, `git` and `unzip`.

**Get the copy you want to check.** Any of these works:

- The folder your browser installed it into. In Chrome, open `chrome://extensions`, switch on Developer mode and note ParsiPad's ID, then find the folder named after the version under:
  - macOS: `~/Library/Application Support/Google/Chrome/Default/Extensions/kmifhjlofnblfogkjjcmhlmcecghhfbp/`
  - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\kmifhjlofnblfogkjjcmhlmcecghhfbp\`
  - Linux: `~/.config/google-chrome/Default/Extensions/kmifhjlofnblfogkjjcmhlmcecghhfbp/`

  Other Chromium browsers keep the same layout under their own profile folder. In Firefox, open `about:support`, click **Open Folder** next to Profile Folder, and use `extensions/parsipad@parsipad.com.xpi`.
- The package straight from a store:

  ```bash
  curl -L -o parsipad.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx3&x=id%3Dkmifhjlofnblfogkjjcmhlmcecghhfbp%26uc"
  ```

  ```bash
  curl -L -o parsipad.xpi "https://addons.mozilla.org/firefox/downloads/latest/parsipad/latest.xpi"
  ```

**Build the same version and compare.** Replace `3.10.0` with the version you have, shown in ParsiPad's Settings > About:

```bash
git clone https://github.com/amirehsan/parsipad.git
```

```bash
cd parsipad && git checkout v3.10.0 && npm ci
```

```bash
npm run verify -- /path/to/parsipad.crx
```

`npm ci` installs the exact build tools pinned in `package-lock.json`, which is what makes the output reproducible. The script works out which browser the copy is for, builds that browser from your checkout, and compares every file. A match ends with:

```text
[parsipad] Match: all 57 files are identical to the source build.
```

Anything else lists each file that differs. The only things left out of the comparison are what the stores add on top of the upload: Chrome's `_metadata/` folder and the `update_url` it writes into an installed manifest, and the `META-INF/` signature files of a signed Firefox add-on. The script is [scripts/verify-build.mjs](../scripts/verify-build.mjs); it is short, and worth reading before you run it.

You can do the same by hand: run `npm run build`, unzip the package, and compare it with `dist/` (Chrome) or `dist-firefox/` (Firefox) using `diff -r`.

## 2. Check a zip from a GitHub release

Each [GitHub release](https://github.com/amirehsan/parsipad/releases) from 3.10.0 on carries the Chrome, Firefox and source zips that went to the stores, and a `SHA256SUMS.txt` file listing the hash of each. With the zips and the sums file in one folder:

```bash
shasum -a 256 -c parsipad-v3.10.0-SHA256SUMS.txt
```

On Linux `sha256sum -c` does the same. Each line should end in `OK`. The release's tag points at the commit the zips were built from, so section 1 applies to them as well.

## 3. Check where it sends data

**Read it in the code.** Only three files open network connections, the provider classes in [lib/providers/](../lib/providers/), and they send requests only to the endpoints in [lib/constants.js](../lib/constants.js):

| Provider | Address |
| --- | --- |
| Claude | `https://api.anthropic.com` |
| Gemini | `https://generativelanguage.googleapis.com` |
| ChatGPT | `https://api.openai.com` |

[tests/network-allowlist.test.js](../tests/network-allowlist.test.js) holds the code to that. It fails if the manifest asks for any other host, if anything outside the provider classes calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon`, or if the shipped source names any web address that is not one of these APIs or a link you can click (the provider key pages, the two stores, parsipad.com and GitHub). It runs on every push in [CI](https://github.com/amirehsan/parsipad/actions/workflows/ci.yml), so a change that broke it would show as a red build.

**Watch it happen.** In Chrome, open `chrome://extensions`, switch on Developer mode, and under ParsiPad click **service worker** to open its DevTools. In Firefox, open `about:debugging#/runtime/this-firefox` and click **Inspect** next to ParsiPad. Go to the Network tab and translate something. You should see requests only to your chosen provider's address. The popup, side panel and other ParsiPad pages can be inspected the same way: right-click inside them and choose Inspect.

**What the content script does.** ParsiPad's content script runs on every page you visit, which is how it offers translation there. It reads the page's text inside the page to decide where to show its icon, and that text stays in your browser. Text goes to the provider only when you ask for a translation, and then only the passage you asked for. This is the part of the [privacy policy](../PRIVACY.md) worth checking most closely, and the content script source is in [content/](../content/).

## 4. What others check

- **Firefox Add-ons** requires the full source with every version, because the code is bundled, so Mozilla's reviewers can rebuild and read it. Each version also passes Mozilla's automated validation.
- **Chrome Web Store** reviews each version before it is published.
- **GitHub** runs [CodeQL](https://github.com/amirehsan/parsipad/actions/workflows/codeql.yml) security analysis on every change, and Dependabot raises updates when a dependency has a known vulnerability.

Found something that does not match? Please report it privately, as [SECURITY.md](../SECURITY.md) describes.
