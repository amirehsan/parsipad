import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { functionBody } from './helpers/source.js';
import { translations } from '../lib/i18n.js';
import { getSelectionPopupStyles } from '../content/styles/index.js';

const js = fs.readFileSync(path.resolve(__dirname, '../content/main.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));

const TOOLBAR_KEYS = ['toolbarTranslate', 'toolbarPolish', 'toolbarDictionary', 'toolbarDictionarySingleWord', 'toolbarLabel'];

describe('selection toolbar', () => {
  it('is placed from its measured size, not constants', () => {
    expect(js).not.toMatch(/POPUP_WIDTH = 120/);
    expect(js).not.toMatch(/getSelectionPopupPosition/);
    const body = functionBody(js, 'createSelectionPopup');
    expect(body).toMatch(/getBoundingClientRect\(\)/);
    expect(body).toMatch(/computeBoxPosition\(\{[\s\S]*prefer: 'above'/);
    expect(body).toMatch(/computeBoxPosition\(\{[\s\S]*align: 'center'/);
    expect(body).toMatch(/computeBoxPosition\(\{[\s\S]*gap: 8, padding: 12/);
  });

  it('is laid out hidden, measured, placed, then shown', () => {
    const body = functionBody(js, 'createSelectionPopup');
    const order = [
      'visibility: hidden',
      'document.body.appendChild(host)',
      'getBoundingClientRect()',
      'computeBoxPosition({',
      'popup.dataset.placement = placement',
      "host.style.visibility = 'visible'"
    ].map((needle) => [needle, body.indexOf(needle)]);
    for (const [needle, at] of order) expect(at, needle).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i++) {
      expect(order[i][1], `${order[i - 1][0]} before ${order[i][0]}`).toBeGreaterThan(order[i - 1][1]);
    }
  });

  it('has one tab stop and arrow keys, with localized labels', () => {
    const body = functionBody(js, 'createSelectionPopup');
    expect(body).toMatch(/applyRovingTabindex\(/);
    expect(body).toMatch(/rovingIndex\(/);
    expect(body).not.toMatch(/ariaLabel: '[A-Z]/);
    expect(js).toMatch(/import \{ rovingIndex, applyRovingTabindex \} from '\.\.\/lib\/roving\.js';/);
  });

  it('labels every button and the toolbar itself through t(), in English and Persian', () => {
    const body = functionBody(js, 'createSelectionPopup');
    const actions = body.match(/action: '[a-z]+'/g) || [];
    expect(actions.length).toBeGreaterThanOrEqual(3);
    // One translated aria-label and one translated tooltip per button.
    expect((body.match(/ariaLabel: t\(/g) || []).length).toBe(actions.length);
    expect((body.match(/label: t\(/g) || []).length).toBe(actions.length);
    expect((body.match(/ariaLabel:/g) || []).length).toBe(actions.length);
    expect(body).toMatch(/popup\.setAttribute\('aria-label', t\('toolbarLabel', userLang\)\)/);
    expect(body).not.toMatch(/'Text actions'|'Translate selected text'|'Single word only'/);

    const used = [...new Set([...body.matchAll(/'(toolbar[A-Za-z]+)'/g)].map((m) => m[1]))];
    expect(used.sort()).toEqual([...TOOLBAR_KEYS].sort());
    for (const key of TOOLBAR_KEYS) {
      expect(translations.en[key], `en.${key}`).toMatch(/\S/);
      expect(translations.fa[key], `fa.${key}`).toMatch(/\S/);
      expect(translations.fa[key], `fa.${key} is translated`).not.toBe(translations.en[key]);
      expect(`${translations.en[key]} ${translations.fa[key]}`, key).not.toMatch(/\u2014/);
    }
  });

  it('sets its entry direction after measuring, through data-placement', () => {
    expect(getSelectionPopupStyles.length).toBe(0);
    const css = getSelectionPopupStyles();
    for (const side of ['above', 'below']) {
      const rule = css.match(new RegExp(`\\.selection-popup\\[data-placement='${side}'\\]\\s*\\{([^}]*)\\}`));
      expect(rule, side).not.toBeNull();
      const name = rule[1].match(/animation:\s*([\w-]+)/)[1];
      expect(css).toMatch(new RegExp(`@keyframes ${name}\\s*\\{`));
    }
    // Before data-placement is set (while it is measured) nothing animates.
    const base = css.match(/\.selection-popup\s*\{([^}]*)\}/)[1];
    expect(base).not.toMatch(/animation/);
    expect(functionBody(js, 'createSelectionPopup')).not.toMatch(/getSelectionPopupStyles\([^)]/);
  });

  it('serves lib/roving.js to the content script', () => {
    const resources = manifest.web_accessible_resources.flatMap((group) => group.resources);
    expect(resources).toContain('lib/roving.js');
    expect(fs.readFileSync(path.resolve(__dirname, '../lib/roving.js'), 'utf8')).not.toMatch(/^\s*import\s/m);
  });
});

describe('selection toolbar keyboard path', () => {
  const keyDown = functionBody(js, 'handleKeyDown');

  it('moves focus in on a plain Tab, but not from the toolbar, an editable field or the box', () => {
    const tab = functionBody(js, 'shouldTabIntoSelectionPopup');
    expect(tab).toMatch(/event\.key !== 'Tab'/);
    for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
      expect(tab).toMatch(new RegExp(`event\\.${modifier}`));
    }
    expect(tab).toMatch(/event\.defaultPrevented/);
    expect(tab).toMatch(/selectionPopupFocusLeft/);
    // keydown from inside the closed root is retargeted to the host, so the
    // composed path, not the target, says whether focus is already inside.
    expect(tab).toMatch(/path\.includes\(selectionPopup\)/);
    expect(tab).toMatch(/floatingBox && path\.includes\(floatingBox\)/);
    expect(tab).toMatch(/event\.composedPath\(\)/);
    // The origin of the event, not the retargeted host of an open root.
    expect(tab).toMatch(/if \(isEditableKeyTarget\(path\[0\]\)\) return false;/);

    expect(keyDown).toMatch(/if \(shouldTabIntoSelectionPopup\(event\)\)/);
    const branch = keyDown.slice(keyDown.indexOf('shouldTabIntoSelectionPopup(event'));
    // Focus first; Tab is cancelled only once focus really moved in.
    expect(branch).toMatch(/^[^}]*const returnTo = document\.activeElement;\s*focusSelectionPopup\(\);\s*if \(document\.activeElement === selectionPopup\) \{\s*selectionPopupReturnFocus = returnTo;\s*event\.preventDefault\(\);\s*\} else \{\s*selectionPopupFocusLeft = true;/);
  });

  it('focuses the active button without scrolling, from inside the closed root', () => {
    const focus = functionBody(js, 'focusSelectionPopup');
    expect(focus).toMatch(/selectionPopupShadow\.querySelector\('\.selection-btn\[tabindex="0"\]'\)/);
    expect(focus).toMatch(/\.focus\(\{ preventScroll: true \}\)/);
  });

  it('closes on Escape and hands focus back to where it was, never to <body>', () => {
    expect(keyDown).toMatch(/if \(event\.key === 'Escape'\)[\s\S]*removeSelectionPopup\(\);/);
    const remove = functionBody(js, 'removeSelectionPopup');
    expect(remove).toMatch(/const hadFocus = document\.activeElement === selectionPopup;/);
    expect(remove).toMatch(/selectionPopupReturnFocus = null;/);
    expect(remove).toMatch(/selectionPopupFocusLeft = false;/);
    const after = remove.slice(remove.indexOf('selectionPopup.remove()'));
    expect(after).toMatch(/if \(hadFocus\) returnFocusFromSelectionPopup\(\);/);
    // Focus is handed back before the element is forgotten.
    expect(remove.indexOf('returnFocusFromSelectionPopup()')).toBeLessThan(remove.indexOf('selectionPopupReturnFocus = null;'));

    const restore = functionBody(js, 'returnFocusFromSelectionPopup');
    expect(restore).toMatch(/const returnTo = selectionPopupReturnFocus;/);
    expect(restore).toMatch(/returnTo === document\.body/);
    expect(restore).toMatch(/!document\.contains\(returnTo\)/);
    expect(restore).toMatch(/returnTo\.focus\(\{ preventScroll: true \}\);/);
  });

  it('lets Tab leave the toolbar, continuing from where focus came in', () => {
    const body = functionBody(js, 'createSelectionPopup');
    expect(body).toMatch(/event\.key === 'Tab'/);
    expect(body).toMatch(/selectionPopupFocusLeft = true;/);
    // Shift+Tab lands back on that element; Tab lets the browser move on from it.
    expect(body).toMatch(/if \(returnFocusFromSelectionPopup\(\)\) \{\s*if \(event\.shiftKey\) event\.preventDefault\(\);/);
  });

  it('never takes focus when it appears', () => {
    expect(functionBody(js, 'evaluateSelection')).not.toMatch(/\.focus\(/);
    const create = functionBody(js, 'createSelectionPopup');
    const listeners = create.indexOf('addEventListener');
    expect(create.slice(0, listeners)).not.toMatch(/\.focus\(/);
  });
});
