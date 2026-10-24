// tests/content-abort.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Closing the floating box mid-stream used to leave the port open, so the
 * provider kept generating, and billing, a translation nobody would see.
 * The client already turns an aborted signal into a port disconnect (see
 * tests/client.test.js); this pins that the floating box passes one and
 * aborts it on close. content/main.js is a 3,000-line DOM module with no
 * test harness, so the wiring is read as source.
 */
const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');

function functionBody(name) {
  const start = js.search(new RegExp(`\\n(async )?function ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  const rest = js.slice(start + 1);
  const next = rest.search(/\n(async )?function [A-Za-z]+\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('floating box stream lifetime', () => {
  it('declares one controller for the box', () => {
    expect(js).toMatch(/\nlet boxAbortController = null;/);
  });

  it('removeFloatingBox aborts the in-flight request first', () => {
    const body = functionBody('removeFloatingBox');
    const abortAt = body.indexOf('boxAbortController?.abort()');
    expect(abortAt).toBeGreaterThan(-1);
    expect(abortAt).toBeLessThan(body.indexOf('floatingBox.remove()'));
  });

  it('every floating-box translation request carries the box signal', () => {
    const calls = [...js.matchAll(/requestTranslation\(\{[\s\S]*?\}\s*,\s*\{([\s\S]*?)\}\s*\)/g)];
    const boxCalls = calls.filter(m => !/abortSignal/.test(m[0]));
    expect(boxCalls.length).toBeGreaterThan(0);
    for (const m of boxCalls) expect(m[1]).toMatch(/signal:\s*boxAbortController\.signal/);
    expect(js).not.toMatch(/requestTranslation\(\{[^)]*mode: 'sentence',\s*context\s*\}\);/);
  });
});
