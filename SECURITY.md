# Security Policy

## Supported Versions

Only the latest released version of ParsiPad receives security updates. We aim to ship a security fix within 7 days of confirmation.

| Version | Supported          |
| ------- | ------------------ |
| 2.10.x  | :white_check_mark: |
| < 2.10  | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email security reports privately to **ehsundev@gmail.com** with the subject `[ParsiPad Security]`. Include:

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
- Bugs in the upstream Anthropic / Google / OpenAI APIs

## Threat Model and Known Limitations

For transparency, the security posture of ParsiPad is:

1. **API keys are stored in `chrome.storage.local`.** This storage is local to the user's device and is not synced to Google's cloud (unlike `chrome.storage.sync`). However, any extension or compromised script running in the same Chrome profile can read it. Users should not install ParsiPad alongside untrusted extensions.

2. **The content script runs on `<all_urls>`.** It uses Shadow DOM to isolate its UI from host pages but inevitably has DOM access to the host page when the user invokes a translation. We do not read DOM content unless the user explicitly invokes translate.

3. **No backend server.** Translation requests go directly from the user's browser to the chosen provider (Anthropic, Google, or OpenAI). ParsiPad has no servers and does not see or proxy any user data.

4. **Bookmarks permission is read-only in spirit.** It is used to populate the new-tab page; we do not modify bookmarks. The Chrome API surface technically allows writes, but no code path in the extension writes to bookmarks.
