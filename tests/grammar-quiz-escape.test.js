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

/** The text with every escapeHtml(...) call removed, parentheses balanced. */
function withoutEscaped(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('escapeHtml(', i)) {
      let depth = 0;
      let j = i + 'escapeHtml'.length;
      do {
        if (text[j] === '(') depth++;
        else if (text[j] === ')') depth--;
        j++;
      } while (depth > 0 && j < text.length);
      i = j;
    } else {
      out += text[i++];
    }
  }
  return out;
}

describe('quiz feedback', () => {
  it('escapes every model explanation it puts into markup', () => {
    expect(start).toBeGreaterThan(-1);
    const assignments = handler.match(/explanationText \+?= [^;]+;/g) || [];
    expect(assignments.length).toBeGreaterThan(0);
    for (const line of assignments) {
      expect(withoutEscaped(line.replace(/^explanationText \+?= /, '')), line)
        .not.toMatch(/selectedExplanation|correctExplanation|quiz\.explanation/);
    }
  });

  it('notices an explanation left unescaped', () => {
    expect(withoutEscaped('escapeHtml(a || b) + c')).toBe(' + c');
    expect(withoutEscaped('x(quiz.explanation)')).toContain('quiz.explanation');
  });
});
