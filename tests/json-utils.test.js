import { describe, it, expect } from 'vitest';
import { extractJSON } from '../lib/json-utils.js';

describe('extractJSON', () => {
  it('returns null for nullish or non-string input', () => {
    expect(extractJSON(null)).toBeNull();
    expect(extractJSON(undefined)).toBeNull();
    expect(extractJSON(123)).toBeNull();
    expect(extractJSON('')).toBeNull();
  });

  it('parses clean JSON directly', () => {
    expect(extractJSON('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('unwraps fenced ```json blocks', () => {
    const text = '```json\n{"k": "v"}\n```';
    expect(extractJSON(text)).toEqual({ k: 'v' });
  });

  it('unwraps fenced ``` blocks without language tag', () => {
    expect(extractJSON('```\n{"n":42}\n```')).toEqual({ n: 42 });
  });

  it('extracts JSON when there is leading and trailing prose', () => {
    const text = 'Sure, here is the result:\n{"hello":"world"}\nLet me know if you need more.';
    expect(extractJSON(text)).toEqual({ hello: 'world' });
  });

  it('handles nested objects with strings containing braces', () => {
    const text = '{"a":{"b":"contains } brace"},"c":2}';
    expect(extractJSON(text)).toEqual({ a: { b: 'contains } brace' }, c: 2 });
  });

  it('returns null when no JSON object exists', () => {
    expect(extractJSON('no json here at all')).toBeNull();
  });

  it('falls back to substring search when the response has extra text after the JSON', () => {
    const text = '{"professional":"x","conversational":"y","concise":"z"} extra commentary here';
    expect(extractJSON(text)).toEqual({ professional: 'x', conversational: 'y', concise: 'z' });
  });
});
