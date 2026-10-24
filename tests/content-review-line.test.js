// tests/content-review-line.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Most readers never open the popup; they translate from the page. The
 * rating ask therefore also appears, as one quiet line, under a translation
 * in the floating box, when the service worker says it is time.
 * content/main.js has no DOM harness, so the wiring is read as source.
 */
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'content/main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'content/styles/index.js'), 'utf8');

function functionBody(name) {
  const start = js.search(new RegExp(`\\n(async )?function ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = js.slice(start + 1);
  const next = rest.search(/\n(async )?function [A-Za-z]+\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('floating box review line', () => {
  it('asks the service worker after a translation renders', () => {
    expect(functionBody('showTranslation')).toMatch(/maybeShowReviewLine\(content\)/);
    expect(functionBody('maybeShowReviewLine')).toMatch(/action: 'REVIEW_PROMPT_STATE'/);
  });

  it('offers rate and later, both reported back as answers', () => {
    const body = functionBody('maybeShowReviewLine');
    expect(body).toMatch(/t\('rateParsipad'/);
    expect(body).toMatch(/t\('later'/);
    expect(body).toMatch(/action: 'REVIEW_PROMPT_RESPONSE', response \}/);
    expect(body).toMatch(/answer\('rated'\)/);
    expect(body).toMatch(/answer\('later'\)/);
    expect(body).toMatch(/document\.createElement\('button'\)/);
  });

  it('styles the line in the box stylesheet', () => {
    expect(css).toMatch(/\.parsipad-review-line\s*\{/);
  });
});
