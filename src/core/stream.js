// Helpers over the flat item array.
import { isCode, isChar, isPair, is, code, formatDate } from './codes.js';

// Index of the other half of a paired code, or -1.
export function matchPair(items, i) {
  const it = items[i];
  if (!isPair(it)) return -1;
  if (it.on) {
    for (let j = i + 1; j < items.length; j++) {
      const o = items[j];
      if (isPair(o) && o.c === it.c) return o.on ? -1 : j;
    }
  } else {
    for (let j = i - 1; j >= 0; j--) {
      const o = items[j];
      if (isPair(o) && o.c === it.c) return o.on ? j : -1;
    }
  }
  return -1;
}

// Attribute names in effect at insertion point i (codes before i).
export function attrsAt(items, i) {
  const on = new Set();
  for (let j = 0; j < i && j < items.length; j++) {
    const it = items[j];
    if (isPair(it)) {
      if (it.on) on.add(it.c); else on.delete(it.c);
    }
  }
  return [...on];
}

// The most recent code named `c` before index i, or null.
export function lastCodeBefore(items, i, c) {
  for (let j = Math.min(i, items.length) - 1; j >= 0; j--) if (is(items[j], c)) return items[j];
  return null;
}

// Start of the paragraph containing insertion point i.
export function paragraphStart(items, i) {
  for (let j = Math.min(i, items.length) - 1; j >= 0; j--) {
    if (is(items[j], 'HRt') || is(items[j], 'HPg')) return j + 1;
  }
  return 0;
}

// End of the paragraph (index of its HRt, or items.length).
export function paragraphEnd(items, i) {
  for (let j = i; j < items.length; j++) {
    if (is(items[j], 'HRt') || is(items[j], 'HPg')) return j;
  }
  return items.length;
}

// Plain text of items[a..b). Codes that stand for whitespace become it.
export function textOf(items, a = 0, b = items.length, { now } = {}) {
  let s = '';
  for (let j = a; j < b; j++) {
    const it = items[j];
    if (isChar(it)) s += it;
    else if (it.c === 'HRt') s += '\n';
    else if (it.c === 'HPg') s += '\f';
    else if (it.c === 'Tab' || it.c === 'Indent' || it.c === 'LRIndent') s += '\t';
    else if (it.c === 'Date') s += formatDate(it.fmt, now);
  }
  return s;
}

// Items for a plain string: newlines become [HRt], tabs [Tab], form feeds [HPg].
export function itemsOf(str) {
  const out = [];
  const s = str.replace(/\r\n?/g, '\n');
  for (const ch of s) {
    if (ch === '\n') out.push(code.hrt());
    else if (ch === '\t') out.push(code.tab());
    else if (ch === '\f') out.push(code.hpg());
    else if (ch >= ' ' || ch > '\x7f') out.push(ch);
  }
  return out;
}

// Drop pair halves whose partner is not inside the array.
export function dropOrphans(items) {
  const keep = items.map(() => true);
  items.forEach((it, i) => { if (isPair(it) && matchPair(items, i) < 0) keep[i] = false; });
  return items.filter((_, i) => keep[i]);
}

export function isWordChar(it) {
  return isChar(it) && /[\p{L}\p{N}'’_-]/u.test(it);
}

// Codes are transparent to word motion.
function skipCodes(items, i, dir) {
  while (i >= 0 && i < items.length && isCode(items[i]) && !is(items[i], 'HRt') && !is(items[i], 'HPg') && !is(items[i], 'Tab')) i += dir;
  return i;
}

export function nextWordStart(items, i) {
  const n = items.length;
  let j = i;
  // leave the current word
  while (j < n && (isWordChar(items[j]) || (isCode(items[j]) && !isWhite(items[j])))) j++;
  // cross the gap
  while (j < n && !isWordChar(items[j])) j++;
  // back up over codes that open the word ([BOLD] before it) - stay after them
  return j;
}

export function prevWordStart(items, i) {
  let j = i;
  while (j > 0 && !isWordChar(items[j - 1])) j--;
  while (j > 0 && (isWordChar(items[j - 1]) || (isCode(items[j - 1]) && !isWhite(items[j - 1]) && j - 2 >= 0 && isWordChar(items[j - 2])))) j--;
  return j;
}

function isWhite(it) {
  return it === ' ' || is(it, 'HRt') || is(it, 'HPg') || is(it, 'Tab') || is(it, 'Indent') || is(it, 'LRIndent');
}

// [start, end) of the word around i (end excludes trailing space).
export function wordAt(items, i) {
  let a = i, b = i;
  if (!isWordChar(items[a]) && a > 0 && isWordChar(items[a - 1])) a--, b--;
  while (a > 0 && isWordChar(items[a - 1])) a--;
  while (b < items.length && isWordChar(items[b])) b++;
  return [a, b];
}

export { skipCodes };
