# Contributing to ParsiPad

Thank you for your interest in contributing to ParsiPad! We welcome contributions from the community.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/amirehsan/parsipad/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Browser version and OS
   - Screenshots if applicable

### Suggesting Features

1. Check existing issues for similar suggestions
2. Create a new issue with the "feature request" label
3. Describe the feature and its use case
4. Explain why it would benefit users

### Submitting Code

1. **Fork the repository**

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the existing code style
   - Add comments for complex logic
   - Test your changes thoroughly

4. **Commit your changes**
   ```bash
   git commit -m "Add: brief description of changes"
   ```

   Commit message prefixes:
   - `Add:` for new features
   - `Fix:` for bug fixes
   - `Update:` for improvements
   - `Remove:` for deletions
   - `Docs:` for documentation

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Describe what your PR does
   - Reference any related issues
   - Include screenshots for UI changes

## Code Style Guidelines

### JavaScript

- Use ES6+ features (const/let, arrow functions, template literals)
- Use meaningful variable and function names
- Add JSDoc comments for functions
- Keep functions small and focused
- Handle errors appropriately

### HTML/CSS

- Use semantic HTML elements
- Follow existing class naming conventions
- Support both light and dark modes
- Ensure responsive design

### Localization

- Add translations for both English and Persian
- Use the i18n system in `lib/i18n.js`
- Test RTL layout for Persian text

## Testing

Before submitting:

1. Test in Chrome (primary target)
2. Test in at least one other Chromium browser (Brave, Edge)
3. Test both light and dark modes
4. Test with Persian and English content
5. Verify no console errors

## Development Setup

1. Clone your fork
2. Load as unpacked extension in Chrome
3. Make changes
4. Reload extension to test

No build step is required - the extension runs directly from source.

## Questions?

Feel free to open an issue for any questions about contributing.

Thank you for helping make ParsiPad better!
