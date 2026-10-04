// Editor: a code stream plus a cursor, a block anchor and the editing
// operations both front ends share. Nothing here knows about the screen;
// motions that depend on lines take a layout result.

import { isCode, isChar, isPair, is, code, PARA_CODES, PAGE_CODES } from './codes.js';
import { matchPair, attrsAt, paragraphStart, dropOrphans, nextWordStart, prevWordStart, wordAt, textOf, isWordChar } from './stream.js';
import { lineAt, caretX, indexAtX, lineEndIndex } from './layout.js';

export class Editor {
  constructor(items = []) {
    this.items = items.slice();
    this.cursor = 0;
    this.anchor = null;
    this.typeover = false;
    this.version = 0;
    this.savedVersion = 0;
    this.rev = 0; // bumps on every change, never rewinds (cache key)
    this.deletions = [];
    this._lastDel = null;
    this.goalX = null;
  }

  get length() { return this.items.length; }
  get dirty() { return this.version !== this.savedVersion; }
  markSaved() { this.savedVersion = this.version; }
  isEmpty() { return this.items.length === 0; }

  load(items) {
    this.items = items.slice();
    this.cursor = 0;
    this.anchor = null;
    this.version++;
    this.rev++;
    this.savedVersion = this.version;
    this._lastDel = null;
  }

  _changed() { this.version++; this.rev++; this.goalX = null; }

  setCursor(i, { keepGoal = false } = {}) {
    this.cursor = Math.max(0, Math.min(this.items.length, i));
    this._lastDel = null;
    if (!keepGoal) this.goalX = null;
  }

  attrs(i = this.cursor) { return attrsAt(this.items, i); }

  // ---- insertion -------------------------------------------------------

  insertItems(arr, at = this.cursor) {
    if (!arr.length) return;
    this.items.splice(at, 0, ...arr);
    if (this.cursor >= at) this.cursor += arr.length;
    if (this.anchor !== null && this.anchor > at) this.anchor += arr.length;
    this._lastDel = null;
    this._changed();
  }

  // Typed text. In typeover, a character replaces the character under the
  // cursor (never a code or a hard return).
  type(str) {
    for (const ch of str) {
      if (ch === '\n') { this.insertItems([code.hrt()]); continue; }
      if (this.typeover && isChar(this.items[this.cursor])) {
        this.items[this.cursor] = ch;
        this.cursor++;
        this._lastDel = null;
        this._changed();
      } else {
        this.insertItems([ch]);
      }
    }
  }

  insertCode(c) { this.insertItems([c]); }

  // Paragraph format codes go to the start of the paragraph and page codes
  // to the top of the page (pass pageStart), replacing a code of the same
  // kind already there.
  insertFormatCode(c, pageStart = null) {
    let at;
    if (PARA_CODES.has(c.c)) at = paragraphStart(this.items, this.cursor);
    else if (PAGE_CODES.has(c.c) && pageStart !== null) at = pageStart;
    else { this.insertCode(c); return this.cursor - 1; }
    for (let j = at; j < this.items.length && isCode(this.items[j]) && !is(this.items[j], 'HRt') && !is(this.items[j], 'HPg'); j++) {
      if (this.items[j].c === c.c) {
        this.items[j] = c;
        this._changed();
        return j;
      }
    }
    this.insertItems([c], at);
    return at;
  }

  // Bold/Underline/etc. With a block: wrap it. Without: if the cursor sits
  // just before the closing code, step past it; otherwise insert the pair
  // and put the cursor between the halves.
  toggleAttr(name) {
    if (this.anchor !== null) { this.wrapBlock(name); return 'block'; }
    const at = this.items[this.cursor];
    if (isPair(at) && at.c === name && !at.on) { this.setCursor(this.cursor + 1); return 'out'; }
    this.insertItems([code.on(name), code.off(name)]);
    this.cursor--;
    return 'in';
  }

  wrapBlock(name) {
    const [a, b] = this.blockRange();
    this.items.splice(b, 0, code.off(name));
    this.items.splice(a, 0, code.on(name));
    this.anchor = null;
    this.cursor = b + 2;
    this._changed();
  }

  // Insert codes around the block (e.g. [Just:Center]…[Just:Left]).
  surroundBlock(before, after) {
    const [a, b] = this.blockRange();
    this.items.splice(b, 0, ...after);
    this.items.splice(a, 0, ...before);
    this.anchor = null;
    this.cursor = b + before.length + after.length;
    this._changed();
  }

  // ---- block -----------------------------------------------------------

  startBlock() { this.anchor = this.cursor; }
  endBlock() { this.anchor = null; }
  get blockOn() { return this.anchor !== null; }
  blockRange() {
    if (this.anchor === null) return [this.cursor, this.cursor];
    return [Math.min(this.anchor, this.cursor), Math.max(this.anchor, this.cursor)];
  }

  // A copy of items[a..b) with unmatched pair halves left out.
  slice(a, b) { return dropOrphans(this.items.slice(a, b)); }

  // ---- deletion --------------------------------------------------------

  // Removes items[a..b) and the other half of any paired code among them.
  // Returns the removed items (orphan halves dropped) for Undelete.
  deleteRange(a, b, { record = true, dir = 0 } = {}) {
    if (b <= a) return [];
    const kill = new Set();
    for (let j = a; j < b; j++) {
      kill.add(j);
      const p = matchPair(this.items, j);
      if (p >= 0) kill.add(p);
    }
    const removed = this.items.slice(a, b);
    const idx = [...kill].sort((x, y) => y - x);
    for (const j of idx) {
      this.items.splice(j, 1);
      if (j < this.cursor) this.cursor--;
      if (this.anchor !== null && j < this.anchor) this.anchor--;
    }
    this.cursor = Math.max(0, Math.min(this.items.length, this.cursor));
    const kept = dropOrphans(removed);
    if (record && kept.some((it) => !isPair(it))) this._record(kept, a, dir);
    else if (record) this._lastDel = null;
    this._changed();
    return removed;
  }

  _record(items, at, dir) {
    const last = this._lastDel;
    if (dir && last && last.dir === dir && this.deletions.length) {
      if (dir < 0 && last.at === at + items.length) {
        this.deletions[0] = items.concat(this.deletions[0]);
        this._lastDel = { at, dir };
        return;
      }
      if (dir > 0 && last.at === at) {
        this.deletions[0] = this.deletions[0].concat(items);
        this._lastDel = { at, dir };
        return;
      }
    }
    this.deletions.unshift(items);
    this.deletions.length = Math.min(this.deletions.length, 3);
    this._lastDel = { at, dir };
  }

  // Del: the item at the cursor.
  del() {
    if (this.cursor >= this.items.length) return [];
    const at = this.cursor;
    return this.deleteRange(at, at + 1, { dir: 1 });
  }

  // Backspace: the item before the cursor.
  backspace() {
    if (this.cursor <= 0) return [];
    const at = this.cursor - 1;
    const r = this.deleteRange(at, at + 1, { dir: -1 });
    return r;
  }

  deleteBlock() {
    const [a, b] = this.blockRange();
    this.anchor = null;
    this.cursor = a;
    return this.deleteRange(a, b);
  }

  deleteWord() {
    let [a, b] = wordAt(this.items, this.cursor);
    while (b < this.items.length && this.items[b] === ' ') b++;
    if (a === b) return [];
    this.cursor = a;
    return this.deleteRange(a, b);
  }

  // ---- undelete --------------------------------------------------------

  restore(k = 0) {
    const items = this.deletions[k];
    if (!items) return null;
    const at = this.cursor;
    this.insertItems(items.slice(), at);
    this.cursor = at;
    return [at, at + items.length];
  }

  // ---- motion over the stream -----------------------------------------

  // In the normal view the cursor passes over invisible codes as if they
  // were not there; in Reveal Codes it stops on every item.
  right({ reveal = false } = {}) {
    let i = this.cursor;
    if (!reveal) while (i < this.items.length && isCode(this.items[i]) && !visible(this.items[i])) i++;
    this.setCursor(Math.min(this.items.length, i + 1));
  }

  left({ reveal = false } = {}) {
    let i = this.cursor - 1;
    if (!reveal) while (i > 0 && isCode(this.items[i]) && !visible(this.items[i])) i--;
    this.setCursor(Math.max(0, i));
  }

  wordRight() { this.setCursor(nextWordStart(this.items, this.cursor)); }
  wordLeft() { this.setCursor(prevWordStart(this.items, this.cursor)); }

  // Up/down by lines on a layout, keeping the column you started from.
  vertical(res, dir) {
    const line = lineAt(res, this.cursor);
    const target = res.lines[line.index + dir];
    if (!target) return false;
    if (this.goalX === null) this.goalX = caretX(line, this.cursor);
    const g = this.goalX;
    this.setCursor(indexAtX(res, target, g), { keepGoal: true });
    return true;
  }

  lineHome(res, { beforeCodes = false } = {}) {
    const line = lineAt(res, this.cursor);
    let i = line.start;
    if (!beforeCodes) while (i < line.end && isCode(this.items[i]) && !visible(this.items[i])) i++;
    this.setCursor(i);
  }

  lineEnd(res) {
    const line = lineAt(res, this.cursor);
    this.setCursor(lineEndIndex(res, line));
  }

  // ---- search ----------------------------------------------------------

  // Find `pattern` ('\n' stands for [HRt], '\t' for [Tab]). Lowercase in the
  // pattern matches either case; uppercase matches only uppercase. Codes
  // between characters are ignored. Returns { start, end } item indices.
  find(pattern, from = this.cursor, backward = false) {
    if (!pattern) return null;
    const pos = [], chars = [];
    this.items.forEach((it, i) => {
      if (isChar(it)) { pos.push(i); chars.push(it); }
      else if (it.c === 'HRt') { pos.push(i); chars.push('\n'); }
      else if (it.c === 'Tab') { pos.push(i); chars.push('\t'); }
    });
    const pat = [...pattern];
    const matchAt = (k) => {
      for (let m = 0; m < pat.length; m++) {
        const c = chars[k + m], p = pat[m];
        if (c === undefined) return false;
        if (p === p.toLowerCase() && p !== p.toUpperCase()) { if (c.toLowerCase() !== p) return false; }
        else if (c !== p) return false;
      }
      return true;
    };
    if (!backward) {
      for (let k = 0; k + pat.length <= chars.length; k++) {
        if (pos[k] < from) continue;
        if (matchAt(k)) return { start: pos[k], end: pos[k + pat.length - 1] + 1 };
      }
    } else {
      for (let k = chars.length - pat.length; k >= 0; k--) {
        if (pos[k] >= from) continue;
        if (matchAt(k)) return { start: pos[k], end: pos[k + pat.length - 1] + 1 };
      }
    }
    return null;
  }

  // Replace the characters of a match, keeping any codes inside it.
  replaceMatch(m, str) {
    for (let j = m.end - 1; j >= m.start; j--) {
      const it = this.items[j];
      if (isChar(it) || is(it, 'HRt') || is(it, 'Tab')) {
        this.items.splice(j, 1);
        if (this.cursor > j) this.cursor--;
      }
    }
    const ins = [];
    for (const ch of str) ins.push(ch === '\n' ? code.hrt() : ch === '\t' ? code.tab() : ch);
    this.items.splice(m.start, 0, ...ins);
    this.cursor = m.start + ins.length;
    this._changed();
    return m.start + ins.length;
  }

  convertCase(a, b, mode) {
    for (let j = a; j < b; j++) {
      const it = this.items[j];
      if (!isChar(it)) continue;
      this.items[j] = mode === 'upper' ? it.toUpperCase() : it.toLowerCase();
    }
    this._changed();
  }

  replaceWord(a, b, word) {
    const ins = [...word];
    this.deleteRange(a, b, { record: false });
    this.items.splice(a, 0, ...ins);
    this.cursor = a + ins.length;
    this._changed();
  }

  text(a, b) { return textOf(this.items, a, b); }

  wordCount() {
    let n = 0, inWord = false;
    for (const it of this.items) {
      const w = isWordChar(it);
      if (w && !inWord) n++;
      if (isCode(it) && isPair(it)) continue;
      inWord = w;
    }
    return n;
  }
}

function visible(it) {
  return isChar(it) || ['HRt', 'HPg', 'Tab', 'Indent', 'LRIndent', 'Date'].includes(it.c);
}
