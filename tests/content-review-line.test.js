// tests/content-review-line.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { functionBody as bodyOf } from './helpers/source.js';

/**
 * Most readers never open the popup; they translate from the page. The
 * rating ask therefore also appears, as one quiet line, under a translation
 * in the floating box, when the service worker says it is time.
 * The wiring is read as source here; tests/content-box-errors.test.js drives
 * the line in the real content script.
 */
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'content/main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'content/styles/index.js'), 'utf8');

const functionBody = (name) => bodyOf(js, name);

describe('floating box review line', () => {
  it('asks the service worker after a translation renders', () => {
    expect(functionBody('showTranslation')).toMatch(/maybeShowReviewLine\(currentCardEl\)/);
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

  it('sits outside the live region and is not claimed under a skeleton', () => {
    expect(js).toMatch(/class="parsipad-content"[^>]*aria-live="polite"[\s\S]*?<\/div>\s*<div class="parsipad-review-slot">/);
    const body = functionBody('maybeShowReviewLine');
    expect(body).toMatch(/parsipad-review-slot/);
    expect(body).toMatch(/\.parsipad-loading/);
  });

  it('decides before it asks, because asking is what records the show', () => {
    const body = functionBody('maybeShowReviewLine');
    const ask = body.indexOf("action: 'REVIEW_PROMPT_STATE'");
    expect(ask).toBeGreaterThan(-1);
    expect(body.indexOf('.parsipad-loading')).toBeGreaterThan(-1);
    expect(body.indexOf('.parsipad-loading')).toBeLessThan(ask);
    expect(body.indexOf('currentCardEl')).toBeGreaterThan(-1);
    expect(body.indexOf('currentCardEl')).toBeLessThan(ask);
  });

  it('leaves the box when the box shows an error or the reload state', () => {
    // A same-box request (the Sentence control) can follow a translation
    // that earned the line; a rating ask under a failure reads as a joke.
    const body = functionBody('showError');
    const cleared = body.search(/\.parsipad-review-slot'\)\?\.replaceChildren\(\)/);
    expect(cleared).toBeGreaterThan(-1);
    expect(cleared).toBeLessThan(body.indexOf('renderReloadState('));
  });

  it('styles the line in the box stylesheet', () => {
    expect(css).toMatch(/\.parsipad-review-line\s*\{/);
  });
});
