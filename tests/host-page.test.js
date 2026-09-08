// tests/host-page.test.js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { detectHostTheme, applyHostTheme, ensurePersianFontLoaded } from '../content/host-page.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.style.backgroundColor = '';
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
});

describe('detectHostTheme', () => {
  it('reports dark for a dark page background', () => {
    document.body.style.backgroundColor = 'rgb(20, 20, 30)';
    expect(detectHostTheme()).toBe('dark');
  });

  it('reports light for a light page background', () => {
    document.body.style.backgroundColor = 'rgb(250, 250, 250)';
    expect(detectHostTheme()).toBe('light');
  });

  it('falls back to light for a transparent background', () => {
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    expect(detectHostTheme()).toBe('light');
  });
});

describe('applyHostTheme', () => {
  it('stamps data-theme on the host', () => {
    document.body.style.backgroundColor = 'rgb(20, 20, 30)';
    const host = document.createElement('div');
    applyHostTheme(host);
    expect(host.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores a null host without throwing', () => {
    expect(() => applyHostTheme(null)).not.toThrow();
  });
});

describe('ensurePersianFontLoaded', () => {
  it('registers the Vazirmatn faces once', () => {
    ensurePersianFontLoaded();
    ensurePersianFontLoaded();
    const styles = document.querySelectorAll('#parsipad-persian-font');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('Vazirmatn');
  });
});
