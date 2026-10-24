// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { rovingIndex, applyRovingTabindex } from '../lib/roving.js';

describe('roving', () => {
  it('moves with wrap and jumps to the ends', () => {
    expect(rovingIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(rovingIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(rovingIndex(0, 'ArrowLeft', 3)).toBe(2);
    expect(rovingIndex(1, 'Home', 3)).toBe(0);
    expect(rovingIndex(1, 'End', 3)).toBe(2);
    expect(rovingIndex(1, 'a', 3)).toBeNull();
  });

  it('treats the vertical arrows like the horizontal ones', () => {
    expect(rovingIndex(0, 'ArrowDown', 3)).toBe(1);
    expect(rovingIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(rovingIndex(1, 'ArrowUp', 3)).toBe(0);
    expect(rovingIndex(0, 'ArrowUp', 3)).toBe(2);
  });

  it('has nowhere to go in an empty list', () => {
    expect(rovingIndex(0, 'ArrowRight', 0)).toBeNull();
    expect(rovingIndex(0, 'End', 0)).toBeNull();
  });

  it('leaves one tab stop', () => {
    const items = [0, 1, 2].map(() => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }));
    applyRovingTabindex(items, 1);
    expect(items.map(i => i.attrs.tabindex)).toEqual(['-1', '0', '-1']);
  });
});

describe('roving over a real row of buttons', () => {
  let buttons;
  let active;

  // The same wiring the selection toolbar uses: one handler per button that
  // asks rovingIndex where to go, moves the single tab stop, then focus.
  beforeEach(() => {
    document.body.innerHTML = '';
    const row = document.createElement('div');
    row.setAttribute('role', 'toolbar');
    buttons = ['a', 'b', 'c', 'd'].map((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      row.appendChild(btn);
      return btn;
    });
    document.body.appendChild(row);
    active = 0;
    applyRovingTabindex(buttons, active);
    buttons.forEach((btn) => {
      btn.addEventListener('keydown', (event) => {
        const next = rovingIndex(active, event.key, buttons.length);
        if (next === null) return;
        event.preventDefault();
        active = next;
        applyRovingTabindex(buttons, active);
        buttons[active].focus();
      });
    });
    buttons[0].focus();
  });

  const press = (key) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(event);
    return event;
  };
  const tabStops = () => buttons.filter(b => b.getAttribute('tabindex') === '0');

  it('starts with exactly one tab stop, on the first button', () => {
    expect(tabStops()).toEqual([buttons[0]]);
    expect(buttons.slice(1).every(b => b.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('moves focus and the tab stop with the arrows, wrapping at both ends', () => {
    press('ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    expect(tabStops()).toEqual([buttons[1]]);
    press('ArrowLeft');
    press('ArrowLeft');
    expect(document.activeElement).toBe(buttons[3]);
    expect(tabStops()).toEqual([buttons[3]]);
    press('ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('jumps with Home and End', () => {
    press('End');
    expect(document.activeElement).toBe(buttons[3]);
    press('Home');
    expect(document.activeElement).toBe(buttons[0]);
    expect(tabStops()).toEqual([buttons[0]]);
  });

  it('leaves other keys alone so Enter and Tab keep their default', () => {
    expect(press('Enter').defaultPrevented).toBe(false);
    expect(press('Tab').defaultPrevented).toBe(false);
    expect(press('ArrowRight').defaultPrevented).toBe(true);
  });
});
