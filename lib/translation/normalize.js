/**
 * Input normalization (before sending to the model) and Persian output
 * normalization (before display, cache, history and copy).
 */

// Placeholder that survives the line-joining pass; never appears in user text.
const PARAGRAPH_MARK = '\u2029';
const TERMINAL_BEFORE_BREAK = /[.!?؟:;،؛]$/;
const LIST_ITEM_START = /^\s*(?:[-*•]\s|\d+[.)]\s)/;

/**
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeInput(text) {
  if (!text) return '';
  let s = String(text).replace(/\r\n?/g, '\n');

  // Soft hyphen, zero-width space, BOM: never meaningful, strip everywhere.
  s = s.replace(/[\u00AD\u200B\uFEFF]/g, '');
  // ZWNJ / ZWJ between Latin letters are layout artifacts; inside Persian they
  // are orthography and must stay.
  s = s.replace(/([A-Za-z])[\u200C\u200D]+(?=[A-Za-z])/g, '$1');

  // Standalone bracketed footnote markers.
  s = s.replace(/(^|\s)\[\d{1,3}\](?=\s|$)/g, '$1');

  // Protect paragraph breaks, then join single breaks inside sentences.
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, PARAGRAPH_MARK);
  const lines = s.split('\n');
  const joined = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      joined.push(line);
      continue;
    }
    const prev = joined[joined.length - 1];
    const keepBreak = TERMINAL_BEFORE_BREAK.test(prev.trimEnd())
      || LIST_ITEM_START.test(line)
      || prev.endsWith(PARAGRAPH_MARK)
      || line.startsWith(PARAGRAPH_MARK);
    if (keepBreak) {
      joined.push(line);
    } else {
      joined[joined.length - 1] = `${prev} ${line}`;
    }
  }
  s = joined.join('\n').split(PARAGRAPH_MARK).join('\n\n');

  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.split('\n').map(line => line.trim()).join('\n').trim();
}

/**
 * @param {unknown} text
 * @param {{ persianDigits?: boolean }} [options]
 * @returns {string}
 */
export function normalizePersian(text, options = {}) {
  if (!text) return '';
  let s = String(text)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
  if (options.persianDigits) {
    s = s.replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x06F0));
  }
  return s
    .replace(/ +([،؛؟.!])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
