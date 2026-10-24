import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Quiz feedback is built as markup from the lesson the model returned. The
 * explanations are the model's text, and a lesson can be shaped by the page
 * the sentence came from, so every one is escaped before it reaches
 * innerHTML. Only the correct option's explanation used to be.
 */
const js = fs.readFileSync(path.resolve(__dirname, '../grammar/grammar.js'), 'utf8');
const start = js.indexOf("checkBtn.addEventListener('click'");
const handler = js.slice(start, js.indexOf('feedback.innerHTML', start));

describe('quiz feedback', () => {
  it('escapes every model explanation it puts into markup', () => {
    expect(start).toBeGreaterThan(-1);
    const assignments = handler.match(/explanationText \+?= [^;]+;/g) || [];
    expect(assignments.length).toBeGreaterThan(0);
    for (const line of assignments) {
      for (const source of ['selectedExplanation', 'correctExplanation', 'quiz.explanation']) {
        if (line.includes(source)) expect(line, line).toMatch(new RegExp(`escapeHtml\\(${source.replace('.', '\\.')}`));
      }
    }
  });
});
