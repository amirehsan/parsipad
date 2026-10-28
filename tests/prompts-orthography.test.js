import { describe, it, expect } from 'vitest';
import { CORE_PROMPT } from '../lib/translation/prompts.js';
import { DOCUMENT_SYSTEM_PROMPT, IMAGE_SYSTEM_PROMPT } from '../lib/constants.js';

// A text file translated through the popup came back without a single
// zero-width non-joiner (نوشتههای, هیچجا, میشود). The main translate prompt
// spells the rule out and its results carry the character; the document and
// image prompts only said "standard written Persian", and the model took that
// as licence to drop it. Every prompt that writes Persian states the rule.
describe('Persian orthography rule', () => {
  const prompts = { CORE_PROMPT, DOCUMENT_SYSTEM_PROMPT, IMAGE_SYSTEM_PROMPT };

  for (const [name, prompt] of Object.entries(prompts)) {
    it(`${name} asks for the zero-width non-joiner, with examples that use it`, () => {
      expect(prompt).toMatch(/zero-width non-joiner/);
      expect(prompt).toContain('می‌روم');
      expect(prompt).toContain('کتاب‌ها');
    });

    it(`${name} asks for Persian letters and punctuation`, () => {
      expect(prompt).toMatch(/Persian ی and ک/);
      expect(prompt).toMatch(/Persian punctuation/);
    });
  }
});
