# Chrome Web Store Submission Guide

## Step 1: Host Your Privacy Policy

Since you don't have a website, use GitHub:

**Option A: GitHub Repository (Recommended)**
1. Push this repo to GitHub (public or private)
2. Your privacy policy URL will be:
   `https://github.com/YOUR_USERNAME/translator-extension/blob/main/PRIVACY.md`

**Option B: GitHub Gist**
1. Go to https://gist.github.com
2. Create a new public gist
3. Paste the contents of PRIVACY.md
4. Use the raw URL as your privacy policy link

## Step 2: Create Developer Account

1. Go to: https://chrome.google.com/webstore/devconsole
2. Sign in with your Google account
3. Pay the one-time $5 registration fee
4. Accept the developer agreement

## Step 3: Create Screenshots

You need at least 1 screenshot (1280x800 or 640x400 pixels).

**How to capture:**
1. Load the extension in Chrome (chrome://extensions → Developer mode → Load unpacked)
2. Use the extension on a webpage
3. Take screenshots using:
   - Mac: Cmd+Shift+4
   - Or use Chrome DevTools device toolbar for exact dimensions

**Recommended screenshots:**
1. Translation popup on a webpage
2. Polish feature with options
3. Settings page
4. History page

## Step 4: Prepare Extension Package

Your zip file is ready at: `store-assets/parsipad-v1.0.0.zip`

## Step 5: Submit to Chrome Web Store

1. Go to: https://chrome.google.com/webstore/devconsole
2. Click "New Item"
3. Upload `parsipad-v1.0.0.zip`
4. Fill in the store listing:

   **Product Details:**
   - Name: ParsiPad - Persian English Translator
   - Description: Copy from STORE_LISTING.md
   - Category: Productivity
   - Language: English

   **Graphic Assets:**
   - Upload your screenshots
   - Icon is already in the package (128x128)

   **Privacy Practices:**
   - Single purpose: "AI-powered Persian-English translation and text polishing"
   - Permissions justification:
     - `storage`: Store user settings and translation history locally
     - `contextMenus`: Add right-click translation options
     - `activeTab`: Access selected text for translation
     - `scripting`: Inject translation UI into webpages
   - Host permissions: `api.anthropic.com` - Required to call Claude API for translations
   - Data usage: Select "Personally identifiable information is not being collected or used"
   - Privacy policy URL: Your GitHub link from Step 1

5. Click "Submit for Review"

## Step 6: Wait for Review

- Review typically takes 1-3 business days
- You'll receive an email when approved
- If rejected, you'll get feedback on what to fix

## Common Rejection Reasons & Fixes

1. **Missing privacy policy**: Make sure your GitHub link works
2. **Permission justification unclear**: Be specific about why each permission is needed
3. **Screenshots don't match functionality**: Show real features
4. **Description too vague**: Use the detailed description provided

## After Approval

- Your extension will be live on the Chrome Web Store
- Users can find it by searching "ParsiPad" or "Persian translator"
- You can update anytime by uploading a new zip with incremented version

---

## Quick Checklist

- [ ] Privacy policy hosted on GitHub
- [ ] Developer account created ($5 paid)
- [ ] At least 1 screenshot (1280x800)
- [ ] Zip file ready (store-assets/parsipad-v1.0.0.zip)
- [ ] Store listing text ready (STORE_LISTING.md)
