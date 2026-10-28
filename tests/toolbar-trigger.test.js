// tests/toolbar-trigger.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createToolbarTrigger, selectionAnchor, isSameAnchor } from '../content/toolbar-trigger.js';
import { functionBody } from './helpers/source.js';

beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());

describe('toolbar trigger', () => {
  it('waits for the pointer to lift, then evaluates once', () => {
    const evaluate = vi.fn(), hide = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide, delay: 250 });
    t.onPointerDown(); expect(hide).toHaveBeenCalled();
    t.onSelectionChange(); t.onSelectionChange(); vi.advanceTimersByTime(1000);
    expect(evaluate).not.toHaveBeenCalled();
    t.onPointerUp(); vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('tells evaluate whether a pointer gesture ended the selection', () => {
    const evaluate = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide: () => {}, delay: 250 });
    t.onPointerDown();
    t.onPointerUp();
    vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenLastCalledWith({ pointer: true });
    t.onSelectionChange();
    vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenLastCalledWith({ pointer: false });
  });

  it('evaluates after selectionchange settles with no pointer (touch handles, keyboard)', () => {
    const evaluate = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide: () => {}, delay: 250 });
    t.onSelectionChange(); vi.advanceTimersByTime(200);
    t.onSelectionChange(); vi.advanceTimersByTime(249);
    expect(evaluate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('evaluates after a long-press, which ends in pointercancel rather than pointerup', () => {
    // A touch long-press sends pointerdown, then pointercancel when the
    // browser takes the gesture over for its own selection; main.js routes
    // pointercancel to onPointerUp so the suppression lifts.
    const evaluate = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide: () => {}, delay: 250 });
    t.onPointerDown();
    t.onSelectionChange();
    t.onPointerUp(); // pointercancel
    t.onSelectionChange(); vi.advanceTimersByTime(100);
    t.onSelectionChange(); vi.advanceTimersByTime(249);
    expect(evaluate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('follows the selection handles: each settled drag evaluates the final range', () => {
    let range = 'word';
    const seen = [];
    const t = createToolbarTrigger({ evaluate: () => seen.push(range), hide: () => {}, delay: 250 });
    t.onPointerDown(); t.onPointerUp(); // long-press, ended by pointercancel
    t.onSelectionChange(); vi.advanceTimersByTime(250);
    expect(seen).toEqual(['word']);
    // Dragging a handle sends only selectionchange events, many per second.
    for (const next of ['word and', 'word and more', 'word and more text']) {
      range = next;
      t.onSelectionChange(); vi.advanceTimersByTime(50);
    }
    expect(seen).toEqual(['word']);
    vi.advanceTimersByTime(200);
    expect(seen).toEqual(['word', 'word and more text']);
  });

  it('keeps at most one pending timer', () => {
    const t = createToolbarTrigger({ evaluate: () => {}, hide: () => {}, delay: 250 });
    t.onSelectionChange(); t.onSelectionChange(); t.onSelectionChange();
    expect(vi.getTimerCount()).toBe(1);
    t.onPointerDown();
    expect(vi.getTimerCount()).toBe(0);
    t.onPointerUp(); t.onPointerUp();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(250);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new pointer gesture cancels an evaluation still pending', () => {
    const evaluate = vi.fn(), hide = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide, delay: 250 });
    t.onSelectionChange(); vi.advanceTimersByTime(100);
    t.onPointerDown(); vi.advanceTimersByTime(1000);
    expect(evaluate).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('a gesture that starts on ParsiPad UI neither hides the toolbar nor evaluates when it ends', () => {
    const evaluate = vi.fn(), hide = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide, delay: 250 });
    t.onPointerDown(true); // a toolbar button
    expect(hide).not.toHaveBeenCalled();
    t.onPointerUp(); vi.advanceTimersByTime(1000);
    expect(evaluate).not.toHaveBeenCalled();
    // Nothing is left suppressed: keyboard selection still works afterwards.
    t.onSelectionChange(); vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('a gesture on ParsiPad UI does not swallow the next page gesture', () => {
    const evaluate = vi.fn(), hide = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide, delay: 250 });
    t.onPointerDown(true); t.onPointerUp();
    t.onPointerDown(); expect(hide).toHaveBeenCalledTimes(1);
    t.onPointerUp(); vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('a page drag that ends over ParsiPad UI lifts the suppression and evaluates', () => {
    // main.js passes every pointerup to the trigger, wherever it lands; only
    // where the gesture started decides whether to evaluate.
    const evaluate = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide: () => {}, delay: 250 });
    t.onPointerDown(); t.onPointerUp(); vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenCalledTimes(1);
    t.onSelectionChange(); vi.advanceTimersByTime(250);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('waits 250 ms by default', () => {
    const evaluate = vi.fn();
    const t = createToolbarTrigger({ evaluate, hide: () => {} });
    t.onSelectionChange(); vi.advanceTimersByTime(249);
    expect(evaluate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});

describe('toolbar anchor', () => {
  const rect = (top, left, width, height) => ({ top, left, width, height, bottom: top + height, right: left + width });

  it('is the same only when the trimmed text and the range rectangle both match', () => {
    const a = selectionAnchor('hello', rect(10, 20, 30, 16));
    expect(isSameAnchor(a, selectionAnchor('hello', rect(10, 20, 30, 16)))).toBe(true);
    expect(isSameAnchor(a, selectionAnchor('hello!', rect(10, 20, 30, 16)))).toBe(false);
    expect(isSameAnchor(a, selectionAnchor('hello', rect(10, 21, 30, 16)))).toBe(false);
    expect(isSameAnchor(a, selectionAnchor('hello', rect(10, 20, 30, 32)))).toBe(false);
  });

  it('never matches a missing anchor (no toolbar on screen)', () => {
    const a = selectionAnchor('hello', rect(10, 20, 30, 16));
    expect(isSameAnchor(a, null)).toBe(false);
    expect(isSameAnchor(null, a)).toBe(false);
  });
});

describe('content script wiring', () => {
  const root = path.resolve(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const main = read('content/main.js');
  const listener = (type) => {
    const start = main.indexOf(`document.addEventListener('${type}'`);
    expect(start, type).toBeGreaterThan(-1);
    return main.slice(start, main.indexOf('});', start));
  };

  it('has no imports, so the content script can load it unbundled', () => {
    expect(read('content/toolbar-trigger.js')).not.toMatch(/^\s*import\s/m);
    expect(main).toMatch(/from '\.\/toolbar-trigger\.js'/);
  });

  it('replaces the mouseup handler with pointer and selectionchange listeners', () => {
    expect(main).not.toMatch(/addEventListener\('mouseup'/);
    expect(main).not.toMatch(/function handleTextSelection\(/);
    expect(functionBody(main, 'init')).toMatch(/createToolbarTrigger\(\{\s*evaluate: evaluateSelection,\s*hide: removeSelectionPopup/);
    expect(listener('pointerdown')).toMatch(/toolbarTrigger\.onPointerDown\(isPointerOnOwnUi\(event\)\)/);
    expect(main).toMatch(/document\.addEventListener\('pointerup', toolbarTrigger\.onPointerUp, \{ capture: true \}\)/);
    expect(main).toMatch(/document\.addEventListener\('pointercancel', toolbarTrigger\.onPointerUp, \{ capture: true \}\)/);
    expect(main).toMatch(/document\.addEventListener\('selectionchange', toolbarTrigger\.onSelectionChange, \{ capture: true \}\)/);
  });

  it('tells the trigger when a gesture starts on the toolbar or the floating box, so their buttons still get the click', () => {
    const own = functionBody(main, 'isPointerOnOwnUi');
    expect(own).toMatch(/event\.composedPath\(\)/);
    expect(own).toMatch(/path\.includes\(selectionPopup\)/);
    expect(own).toMatch(/path\.includes\(floatingBox\)/);
  });

  it('listens in the capture phase, so a page that stops pointerup cannot leave the trigger stuck', () => {
    expect(main).toMatch(/document\.addEventListener\('pointerdown', \(event\) => \{[\s\S]*?\}, \{ capture: true \}\);/);
    for (const type of ['pointerup', 'pointercancel']) {
      expect(main, type).toMatch(new RegExp(`addEventListener\\('${type}', [^)]*\\{ capture: true \\}\\)`));
    }
  });

  it('ignores a mouse press with any button but the primary one (a right-click opens a menu)', () => {
    const down = listener('pointerdown');
    const guard = down.indexOf("if (event.pointerType === 'mouse' && event.button !== 0) return;");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(down.indexOf('onPointerDown('));
  });

  it('checks the mute and the setting first, then focus, editable fields and its own UI', () => {
    const body = functionBody(main, 'evaluateSelection');
    expect(body).toMatch(/^function evaluateSelection\([^)]*\) \{\s*if \(siteMuted\) return;\s*if \(!selectionPopupEnabled\) return;/);
    const create = body.indexOf('createSelectionPopup(');
    expect(create).toBeGreaterThan(-1);
    for (const guard of [
      'document.activeElement === selectionPopup',
      'isEditableSelection(selection, document.activeElement)',
      'isSelectionInOwnUi(selection)',
      'isSameAnchor(anchor, selectionPopupAnchor)',
      'selectedText.length > MAX_REPORT_LENGTH'
    ]) {
      const at = body.indexOf(guard);
      expect(at, guard).toBeGreaterThan(-1);
      expect(at, guard).toBeLessThan(create);
    }
    // Never moves focus: a rich editor keeps its caret.
    expect(body).not.toMatch(/\.focus\(/);
    expect(main).toMatch(/import \{[^}]*isEditableSelection[^}]*\} from '\.\/selection-report\.js'/);
  });

  it('skips a page-sized selection (Ctrl+A) with the same cap the side panel uses', () => {
    const body = functionBody(main, 'evaluateSelection');
    expect(main).toMatch(/import \{[^}]*MAX_REPORT_LENGTH[^}]*\} from '\.\/selection-report\.js'/);
    expect(body).toMatch(/if \(selectedText\.length < 2 \|\| selectedText\.length > MAX_REPORT_LENGTH\) \{\s*removeSelectionPopup\(\);\s*return;/);
  });

  it('forgets the anchor whenever the toolbar goes, so the next selection rebuilds it', () => {
    expect(functionBody(main, 'removeSelectionPopup')).toMatch(/selectionPopupAnchor = null;/);
  });

  it('says in Settings that the toolbar stays out of text fields, in both languages', () => {
    const i18n = read('lib/i18n.js');
    expect(i18n).toMatch(/selectionToolbarHint: '[^']*Also appears in text boxes you are typing in, so Polish and Translate can replace what you selected\.'/);
    expect(i18n).toMatch(/selectionToolbarHint: '[^']*در کادرهای متنی که در آن می\\u200cنویسید هم نمایش داده می\\u200cشود تا ویرایش و ترجمه بتوانند متن انتخاب\\u200cشده را جایگزین کنند\.'/);
  });
});
