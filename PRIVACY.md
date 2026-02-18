# Privacy Policy for ParsiPad - Persian Translator

Last updated: February 2026

## Overview

ParsiPad is a browser extension for AI-powered Persian-English translation. We are committed to protecting your privacy and being transparent about our data practices. This policy explains what information we handle and how.

## Data Collection and Storage

### What We Store Locally

All data is stored locally on your device using Chrome's storage API:

- **API Keys**: Your API keys for supported providers (Anthropic, Google, OpenAI) are stored locally in Chrome's secure storage. They are never sent to any server other than their respective APIs.
- **Provider Preference**: Your selected AI provider is stored locally.
- **Translation History**: Recent translations (up to 50 entries) are stored locally for your convenience.
- **Translation Cache**: Recent translations are cached locally to reduce API calls and improve response times.

### What We Do NOT Collect

- We do not collect any personal information
- We do not use analytics or tracking in the extension
- We do not share any data with third parties (except your selected AI provider for translation)
- We do not store your data on any external servers

## Data Transmission

### Text Sent to AI Provider APIs

When you request a translation, the selected text is sent to your chosen AI provider's API for processing. This is necessary for the translation functionality to work.

**Supported providers:**
- **Claude (Anthropic)**: api.anthropic.com
- **Gemini (Google)**: generativelanguage.googleapis.com
- **ChatGPT (OpenAI)**: api.openai.com

- Text is sent directly from your browser to your selected provider's servers
- We do not intercept or store the transmitted data
- Each provider's privacy policy applies to data sent to their API

### Your API Keys

- Your API key is sent directly to the respective provider with each request
- Keys are never sent to any other server
- Keys are stored securely in Chrome's local storage

## Data Security

- All communication with AI provider APIs uses HTTPS encryption
- Your API keys and translation history never leave your device (except keys sent to their respective providers)
- We use Chrome's built-in secure storage mechanisms

## User Rights

You have full control over your data:

- **View**: You can view your translation history in the extension popup
- **Delete**: You can clear your translation history at any time
- **Remove**: Uninstalling the extension removes all locally stored data

## Third-Party Services

This extension uses the following AI provider APIs for translations. Please review each provider's privacy policy for information about how they handle data:

- Anthropic (Claude): https://www.anthropic.com/privacy
- Google (Gemini): https://ai.google.dev/terms
- OpenAI (ChatGPT): https://openai.com/policies/privacy-policy

## Website Analytics

The ParsiPad website (parsipad.com) uses Vercel Analytics to collect anonymous page view data. This helps us understand how visitors use our website.

- **Privacy-focused**: No cookies, no personal data collected
- **GDPR compliant**: Meets European privacy standards
- **Website only**: The browser extension does not include any analytics

Learn more: https://vercel.com/docs/analytics/privacy-policy

## Open Source

ParsiPad is open source. You can review the complete source code to verify our privacy practices. Transparency is at the core of what we do.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last updated" date.

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository or use our contact form at https://parsipad.com/contact.html.
