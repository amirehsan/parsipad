import { describe, it, expect } from 'vitest';
import { CORE_PROMPT, buildSystemPrompt, buildUserMessage, selectGlossaryEntries, buildGrammarUserMessage, GRAMMAR_POINTS_PROMPT } from '../lib/translation/prompts.js';

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
    expect(msg.indexOf('<context before>')).toBeLessThan(msg.indexOf('<selection>'));
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
