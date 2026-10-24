// tests/file-kind.test.js
import { describe, it, expect } from 'vitest';
import { classifyFile, FILE_INPUT_ACCEPT } from '../popup/file-kind.js';

const file = (name, type) => ({ name, type });

describe('classifyFile', () => {
  it('sends a text file to the document translator', () => {
    expect(classifyFile(file('notes.txt', 'text/plain'))).toEqual({ kind: 'document', mimeType: 'text/plain' });
  });

  it('sends JPG, PNG and WebP to image translation', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(classifyFile(file('x', type))).toEqual({ kind: 'image', mimeType: type });
    }
  });

  it('falls back to the extension when the browser reports no type', () => {
    expect(classifyFile(file('notes.TXT', ''))).toEqual({ kind: 'document', mimeType: 'text/plain' });
    expect(classifyFile(file('photo.JPG', ''))).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    expect(classifyFile(file('photo.jpeg', 'application/octet-stream'))).toEqual({ kind: 'image', mimeType: 'image/jpeg' });
    expect(classifyFile(file('shot.webp', ''))).toEqual({ kind: 'image', mimeType: 'image/webp' });
  });

  it('trusts a known type over a misleading extension', () => {
    expect(classifyFile(file('really-a-photo.txt', 'image/png'))).toEqual({ kind: 'image', mimeType: 'image/png' });
  });

  it('turns everything else away', () => {
    expect(classifyFile(file('report.pdf', 'application/pdf'))).toBeNull();
    expect(classifyFile(file('anim.gif', 'image/gif'))).toBeNull();
    expect(classifyFile(file('page.html', 'text/html'))).toBeNull();
    expect(classifyFile(file('noextension', ''))).toBeNull();
    expect(classifyFile(null)).toBeNull();
  });

  it('lets the picker offer exactly what is accepted', () => {
    expect(FILE_INPUT_ACCEPT.split(',')).toEqual(
      expect.arrayContaining(['.txt', 'text/plain', 'image/jpeg', 'image/png', 'image/webp'])
    );
  });
});
