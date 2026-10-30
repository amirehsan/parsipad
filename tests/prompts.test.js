import { describe, it, expect } from 'vitest';
import { CORE_PROMPT, buildSystemPrompt, buildUserMessage, selectGlossaryEntries, buildGrammarUserMessage, GRAMMAR_POINTS_PROMPT, POLISH_PROMPT, POLISH_VARIANT_PROMPT, buildPolishUserMessage, buildPolishVariantUserMessage } from '../lib/translation/prompts.js';

describe('buildSystemPrompt', () => {
  it('starts with the shared core prompt for every mode', () => {
    for (const mode of ['word', 'phrase', 'sentence', 'text', 'batch']) {
      expect(buildSystemPrompt(mode).startsWith(CORE_PROMPT)).toBe(true);
    }
  });
  it('adds mode-specific instructions', () => {
    expect(buildSystemPrompt('word')).toMatch(/up to five distinct senses/);
    expect(buildSystemPrompt('sentence')).toMatch(/up to three alternatives/);
    expect(buildSystemPrompt('text')).toMatch(/Output only the translation/);
    expect(buildSystemPrompt('batch')).toMatch(/Keep the \[1\], \[2\] markers/);
  });
  it('asks for a note on unidiomatic English even when no context was given', () => {
    // The rule used to end "leave it empty when no context was given", so a
    // lookup typed straight into the popup could never carry a note. That is
    // the case where a learner most needs one: "apple yellow" is Persian
    // adjective order carried into English, and the model translates it
    // correctly without ever saying so.
    const word = buildSystemPrompt('word', {});
    expect(word).toMatch(/even if no context was given/i);
    expect(word).toMatch(/adjective/i);
  });

  it('does not let the note repeat the translation', () => {
    expect(buildSystemPrompt('word', {})).toMatch(/[Nn]ever repeat the translation/);
  });

  it('states the Persian orthography rules once in the core', () => {
    expect(CORE_PROMPT).toMatch(/never Arabic/);
    expect(CORE_PROMPT).toMatch(/zero-width non-joiner/);
    expect(CORE_PROMPT).toMatch(/Finglish/);
  });
});

describe('selectGlossaryEntries', () => {
  const glossary = [
    { source: 'commit', target: 'کامیت', direction: 'en-fa' },
    { source: 'branch', target: 'شاخه', direction: '' },
    { source: 'خط', target: 'line', direction: 'fa-en' }
  ];
  it('matches whole words, case-insensitively, in the right direction', () => {
    expect(selectGlossaryEntries(glossary, 'Please Commit your work', 'en-fa')).toEqual([glossary[0]]);
    expect(selectGlossaryEntries(glossary, 'committed', 'en-fa')).toEqual([]);
    expect(selectGlossaryEntries(glossary, 'the branch', 'fa-en')).toEqual([glossary[1]]);
    expect(selectGlossaryEntries(glossary, 'commit', 'fa-en')).toEqual([]);
  });
  it('matches Persian terms', () => {
    expect(selectGlossaryEntries(glossary, 'این خط را بخوان', 'fa-en')).toEqual([glossary[2]]);
  });
  it('tolerates missing input', () => {
    expect(selectGlossaryEntries(undefined, 'x', 'en-fa')).toEqual([]);
  });
});

describe('buildUserMessage', () => {
  const base = { text: 'charge', mode: 'word', fromName: 'English', toName: 'Persian', direction: 'en-fa' };
  it('wraps a word with task and selection tags and no context tags when absent', () => {
    const msg = buildUserMessage(base);
    expect(msg).toContain('<task>');
    expect(msg).toContain('Mode: word. Source: English (detected, may be wrong). Target: Persian.');
    expect(msg).toContain('<selection>charge</selection>');
    expect(msg).not.toContain('<context before>');
    expect(msg).not.toContain('<page');
    expect(msg).not.toContain('<glossary>');
  });
  it('omits the detection caveat when the user fixed the direction', () => {
    expect(buildUserMessage({ ...base, detectedByScript: false })).toContain('Source: English. Target: Persian.');
  });
  it('includes context and page tags when provided', () => {
    const msg = buildUserMessage({ ...base, context: { before: 'they will ', after: ' you a fee', pageLang: 'en', title: 'Library policies' } });
    expect(msg).toContain('<context before>they will </context before>');
    expect(msg).toContain('<context after> you a fee</context after>');
    expect(msg).toContain('<page lang="en" title="Library policies"/>');
    expect(msg.indexOf('<context before>')).toBeLessThan(msg.indexOf('<selection>charge</selection>'));
  });
  it('includes only matching glossary entries', () => {
    const msg = buildUserMessage({ ...base, text: 'commit now', mode: 'phrase', glossary: [{ source: 'commit', target: 'کامیت', direction: '' }, { source: 'push', target: 'پوش', direction: '' }] });
    expect(msg).toContain('<glossary>\ncommit => کامیت\n</glossary>');
    expect(msg).not.toContain('push');
  });
  it('uses a text tag for text and batch modes', () => {
    const text = buildUserMessage({ ...base, mode: 'text', text: 'Para one.\n\nPara two.' });
    expect(text).toContain('Translate the whole text inside <text>.');
    expect(text).toContain('<text>\nPara one.\n\nPara two.\n</text>');
    const batch = buildUserMessage({ ...base, mode: 'batch', text: '[1] a\n[2] b' });
    expect(batch).toContain('Keep the [n] markers');
    expect(batch).toContain('<text>\n[1] a\n[2] b\n</text>');
  });
});

describe('grammar prompt', () => {
  it('asks for English-only points in JSON and passes both sides', () => {
    expect(GRAMMAR_POINTS_PROMPT).toMatch(/ENGLISH/);
    const msg = buildGrammarUserMessage({ source: 'I have been waiting.', translation: 'منتظر بوده\u200cام.', direction: 'en-fa' });
    expect(msg).toContain('<source lang="English">I have been waiting.</source>');
    expect(msg).toContain('<translation lang="Persian">منتظر بوده\u200cام.</translation>');
  });
});

describe('polish prompts', () => {
  // The three-version prompt and the single-version prompt behind Regenerate
  // each defined the styles in their own words, so a regenerated Professional
  // version came back more inflated than the one it replaced.
  it('define each style once, in both prompts', () => {
    for (const fragment of [
      'formal only as much as the situation calls for',
      'with contractions',
      'keeps every fact, name, number, date, condition and request'
    ]) {
      expect(POLISH_PROMPT).toContain(fragment);
      expect(POLISH_VARIANT_PROMPT).toContain(fragment);
    }
  });

  it('tell the editor who is writing and to keep their voice and their structure', () => {
    for (const prompt of [POLISH_PROMPT, POLISH_VARIANT_PROMPT]) {
      expect(prompt).toMatch(/Persian speaker/);
      expect(prompt).toMatch(/Keep the writer's voice/);
      expect(prompt).toMatch(/never reply to it/);
      expect(prompt).toMatch(/@handles/);
      expect(prompt).toMatch(/paragraph breaks/);
    }
  });

  // Seen on a live run: "I hope this email finds you well" and a made-up
  // "Sincerely, [Your Name]" added to a four-line email, an em dash in an
  // apology to a friend, and list items left in lowercase.
  it('ban stock phrases, invented sign-offs and em dashes, and name capitalization', () => {
    for (const prompt of [POLISH_PROMPT, POLISH_VARIANT_PROMPT]) {
      expect(prompt).toContain('I hope this email finds you well');
      expect(prompt).toMatch(/sign-off/);
      expect(prompt).toMatch(/[Nn]o em dashes/);
      expect(prompt).toMatch(/capitalization/);
    }
  });

  // With "change as little as needed" alone, a short or already natural text
  // came back as three identical cards.
  it('ask for three versions that read differently from each other', () => {
    expect(POLISH_PROMPT).toMatch(/read differently from each other/);
  });

  it('ask for JSON with exactly the three keys, and unsupported only for non-Latin script', () => {
    expect(POLISH_PROMPT).toMatch(/exactly the keys professional, conversational and concise/);
    expect(POLISH_PROMPT).toContain('{"unsupported": true}');
    expect(POLISH_PROMPT).toMatch(/not unsupported/);
    expect(POLISH_PROMPT).not.toMatch(/corrections/);
  });

  it('single-version prompt asks for the rewritten text alone', () => {
    expect(POLISH_VARIANT_PROMPT).toMatch(/rewritten text only/i);
    expect(POLISH_VARIANT_PROMPT).toMatch(/[Nn]o JSON/);
  });
});

describe('buildPolishUserMessage', () => {
  it('wraps the text in a text tag', () => {
    const msg = buildPolishUserMessage('hi there\n\nsecond line');
    expect(msg).toContain('Polish the text inside <text>.');
    expect(msg).toContain('<text>\nhi there\n\nsecond line\n</text>');
  });
});

describe('buildPolishVariantUserMessage', () => {
  it('names the style and asks for a version noticeably different from the rejected one', () => {
    const msg = buildPolishVariantUserMessage({ text: 'thanks for help', variant: 'professional', previous: 'Thank you for your help.' });
    expect(msg).toContain('<text>\nthanks for help\n</text>');
    expect(msg).toContain('<previous>\nThank you for your help.\n</previous>');
    expect(msg).toMatch(/professional/);
    expect(msg).toMatch(/noticeably different/);
  });

  it('leaves the previous version out when there is none', () => {
    const msg = buildPolishVariantUserMessage({ text: 'thanks for help', variant: 'concise' });
    expect(msg).not.toContain('<previous>');
    expect(msg).not.toMatch(/different/);
    expect(msg).toMatch(/concise/);
  });

  it('rejects an unknown style', () => {
    expect(() => buildPolishVariantUserMessage({ text: 'x', variant: 'poetic' })).toThrow(/variant/);
  });
});

describe('plain-text replies', () => {
  it('tells the model to begin with the translation and never repeat the task', () => {
    expect(buildSystemPrompt('text')).toMatch(/never repeat the task/);
    expect(buildSystemPrompt('batch')).toMatch(/Begin with \[1\]/);
  });
});
