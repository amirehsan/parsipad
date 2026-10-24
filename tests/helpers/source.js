// Shared helpers for tests that read source files as text. This file sits
// outside the tests/**/*.test.js include in vitest.config.js, so it is never
// collected as a test file of its own.

/**
 * The text of a top-level function declaration in `js`, from its `function`
 * keyword up to the next top-level function declaration (or the end of the
 * file). Throws when the function is not found, so a renamed function fails
 * the test instead of slicing the wrong text.
 * @param {string} js
 * @param {string} name
 * @returns {string}
 */
export function functionBody(js, name) {
  const start = js.search(new RegExp(`\\n(async )?function ${name}\\(`));
  if (start === -1) throw new Error(`function ${name} not found`);
  const rest = js.slice(start + 1);
  const next = rest.search(/\n(async )?function [A-Za-z]+\(/);
  return next === -1 ? rest : rest.slice(0, next);
}
