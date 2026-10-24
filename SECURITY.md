# Security Policy

## Supported Versions

Only the latest release of ParsiPad receives security updates. Chrome updates installed extensions automatically, so a fix reaches users through a new release rather than a patch to an older one. We aim to ship a security fix within 7 days of confirmation.

| Version | Supported |
| ------- | --------- |
| Latest release | Yes |
| Any earlier release | No |

The current version is listed in [CHANGELOG.md](CHANGELOG.md) and in Settings > About.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email security reports privately to **[ehsundev@gmail.com](mailto:ehsundev@gmail.com)** with the subject `[ParsiPad Security]`. Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept code is welcome)
- The affected version(s) of the extension and Chrome
- Your name and affiliation (if you'd like to be credited)

You can expect:

- **Acknowledgement** within 72 hours
- **An initial assessment** within 7 days
- **A patch and disclosure plan** discussed before any public release

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure). Once a fix has shipped to the Chrome Web Store, we will publish an advisory crediting you (unless you prefer to remain anonymous).

## Out of Scope

The following are not considered vulnerabilities for this project:

- Issues that require a malicious extension to already be installed
- Self-XSS via the user pasting attacker-controlled content into the popup
- API keys leaking through DevTools while inspecting your own browser
- Bugs in the upstream Anthropic, Google or OpenAI APIs

## Threat Model and Known Limitations

For transparency, the security posture of ParsiPad is:

1. **API keys are stored in `chrome.storage.local`.** This storage is local to the user's device and is not synced to Google's cloud (unlike `chrome.storage.sync`). Other extensions and web pages cannot read it, but it is not encrypted: malware or anyone with access to the Chrome profile on disk can, as can any code running inside ParsiPad's own pages. Users should create keys with spending limits and revoke them if a device is compromised.

2. **The content script runs on `<all_urls>`.** It uses Shadow DOM to isolate its UI from host pages and has DOM access to every page it runs on. To decide where to offer the point-to-translate icon, it reads the text of the element under the pointer, locally and only while the user is pointing at something. Page text leaves the browser only when the user asks for a translation, and then only the passage they chose. Users can switch the icon and the selection toolbar off, or mute them on specific sites.

3. **No backend server.** Translation requests go directly from the user's browser to the chosen provider (Anthropic, Google, or OpenAI). ParsiPad has no servers and does not see or proxy any user data.

4. **Bookmarks permission is read-only in spirit.** It is used to populate the New Tab page's bookmarks drawer; we do not modify bookmarks. The Chrome API surface technically allows writes, but no code path in the extension writes to bookmarks. The optional `topSites` permission is requested only when the user turns on Most visited and is removed when they turn it off.
