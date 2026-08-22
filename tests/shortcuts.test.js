// tests/shortcuts.test.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { COMMAND_DESCRIPTIONS, getBoundShortcuts, shortcutKeys } from '../shared/shortcuts.js';

function stubCommands(all) {
  globalThis.chrome = { commands: { getAll: vi.fn().mockResolvedValue(all) } };
}

describe('getBoundShortcuts', () => {
  afterEach(() => { delete globalThis.chrome; });

  it('reports what Chrome actually bound, not what the manifest asked for', async () => {
    stubCommands([
      { name: 'translate-selection', shortcut: 'Alt+T' },
      { name: 'dictionary-lookup', shortcut: 'Alt+D' }
    ]);
    const bound = await getBoundShortcuts();
    expect(bound.get('translate-selection')).toBe('Alt+T');
  });

  it('reports an unbound command as empty rather than inventing its suggested key', async () => {
    // Chrome silently drops a suggested_key another extension already claimed.
    // Showing "Alt+D" here would send the user to press a key that does nothing.
    stubCommands([{ name: 'dictionary-lookup', shortcut: '' }]);
    const bound = await getBoundShortcuts();
    expect(bound.get('dictionary-lookup')).toBe('');
  });

  it('passes the platform spelling straight through', async () => {
    // Chrome reports the Mac glyph itself, so nothing here needs to know
    // which platform it is on.
    stubCommands([{ name: 'translate-selection', shortcut: '⌥T' }]);
    expect((await getBoundShortcuts()).get('translate-selection')).toBe('⌥T');
  });

  it('returns nothing where the commands API does not exist', async () => {
    delete globalThis.chrome;
    expect((await getBoundShortcuts()).size).toBe(0);
  });

  it('survives the API rejecting', async () => {
    globalThis.chrome = { commands: { getAll: vi.fn().mockRejectedValue(new Error('nope')) } };
    expect((await getBoundShortcuts()).size).toBe(0);
  });
});

describe('shortcutKeys', () => {
  it('splits a combination into its keys', () => {
    expect(shortcutKeys('Alt+T')).toEqual(['Alt', 'T']);
    expect(shortcutKeys('Ctrl+Shift+Y')).toEqual(['Ctrl', 'Shift', 'Y']);
  });

  it('keeps a glyph combination whole, since it has no separator to split on', () => {
    expect(shortcutKeys('⌥T')).toEqual(['⌥T']);
  });

  it('gives nothing back for an unbound command', () => {
    expect(shortcutKeys('')).toEqual([]);
    expect(shortcutKeys(undefined)).toEqual([]);
  });
});

describe('COMMAND_DESCRIPTIONS', () => {
  it('names a label for every command the manifest declares', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const manifest = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../manifest.json'), 'utf8'));

    const declared = Object.keys(manifest.commands).sort();
    expect(Object.keys(COMMAND_DESCRIPTIONS).sort()).toEqual(declared);
  });
});
