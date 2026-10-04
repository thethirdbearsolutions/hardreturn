// The Windows front end: documents, selection, editing with undo, and the
// glue between the window's parts. Commands live in commands.js; the parts
// of the window draw themselves from this state.

import { Editor } from '../core/editor.js';
import { History } from '../core/history.js';
import { layout, lineAt, caretX, stateAt } from '../core/layout.js';
import { print, faceName, fontPoints } from '../core/measure.js';
import { isCode, isChar, isPair, is, code, inches } from '../core/codes.js';
import { paragraphStart, paragraphEnd, textOf, itemsOf, wordAt, prevWordStart } from '../core/stream.js';
import { KEYBOARDS, isTyping } from './keys.js';

export const DEFAULT_FONT = 'Times New Roman 12pt';
const PREFS_KEY = 'hardreturn:win:prefs';

const VISIBLE = new Set(['HRt', 'HPg', 'Tab', 'Indent', 'LRIndent', 'Date']);
const visible = (it) => isChar(it) || VISIBLE.has(it.c);

// Is there a code of one of these kinds among the codes that open the
// paragraph at i?
function leadingHas(items, i, kinds) {
  for (let j = i; j < items.length && isCode(items[j]) && !is(items[j], 'HRt') && !is(items[j], 'HPg'); j++) {
    if (kinds.includes(items[j].c)) return true;
  }
  return false;
}

export function loadPrefs() {
  const d = { zoom: 100, mode: 'page', keyboard: 'cua', toolbar: true, powerbar: true, ruler: true, status: true, revealH: 150, guides: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return d; }
}

export class WinApp {
  constructor({ store, client = null, root = document.body } = {}) {
    this.store = store;
    this.client = client;
    this.root = root;
    this.prefs = loadPrefs();
    this.docs = [];
    this.cur = 0;
    this.untitled = 0;
    this.modals = [];
    this.reveal = false;
    this.selectMode = false;
    this.clip = null;
    this.highlight = null;
    this.note = null;
    this.lastFind = { find: '', replace: '', backward: false };
    this._sent = { title: null, dirty: null };
    this.parts = {};
    this.newDoc();
  }

  get doc() { return this.docs[this.cur]; }
  get ed() { return this.doc.ed; }
  get keymap() { return KEYBOARDS[this.prefs.keyboard] || KEYBOARDS.cua; }

  savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* private mode */ }
  }

  newDoc() {
    const ed = new Editor();
    const doc = { ed, hist: new History(ed), path: null, name: `Document${++this.untitled}`, _lay: null, scroll: { top: 0, left: 0 } };
    this.saveScroll();
    this.docs.push(doc);
    this.cur = this.docs.length - 1;
    this.update();
    return doc;
  }

  switchTo(k) {
    if (k === this.cur || !this.docs[k]) return;
    this.saveScroll();
    this.cur = k;
    this.selectMode = false;
    this.update({ restoreScroll: true });
  }

  saveScroll() {
    const s = this.view?.scroller;
    if (s && this.doc) this.doc.scroll = { top: s.scrollTop, left: s.scrollLeft };
  }

  // ---- layout ------------------------------------------------------------

  layoutDefaults() { return { font: DEFAULT_FONT }; }

  layout(doc = this.doc) {
    const ed = doc.ed;
    if (doc._lay && doc._lay.rev === ed.rev) return doc._lay.res;
    const res = layout(ed.items, { measure: print, justifyFull: true, defaults: this.layoutDefaults() });
    doc._lay = { rev: ed.rev, res };
    return res;
  }

  // Font, attributes and position at the cursor, for the bars.
  cursorInfo() {
    const ed = this.ed;
    const res = this.layout();
    const st = stateAt(ed.items, ed.cursor, this.layoutDefaults());
    const line = lineAt(res, ed.cursor);
    const attrs = ed.attrs();
    return {
      font: st.font, face: faceName(st.font), size: fontPoints(st.font), attrs,
      just: st.just, spacing: st.spacing, lMar: st.lMar, rMar: st.rMar,
      page: res.pages[line.page].n, ln: line.y, pos: caretX(line, ed.cursor),
    };
  }

  // ---- drawing -------------------------------------------------------------

  update({ scroll = false, restoreScroll = false } = {}) {
    this._scroll ||= scroll;
    this._restore ||= restoreScroll;
    if (this._raf) return;
    const raf = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0));
    this._raf = raf(() => {
      this._raf = 0;
      const s = this._scroll, r = this._restore;
      this._scroll = this._restore = false;
      this.render({ scroll: s, restoreScroll: r });
    });
  }

  render({ scroll = false, restoreScroll = false } = {}) {
    const p = this.parts;
    p.frame?.render();
    if (this.view) {
      this.view.geometry();
      if (restoreScroll) {
        this.view.scroller.scrollTop = this.doc.scroll.top;
        this.view.scroller.scrollLeft = this.doc.scroll.left;
      }
      if (scroll) this.view.ensureVisible();
      this.view.draw();
    }
    if (this.reveal) p.reveal?.render();
    if (this.prefs.ruler) p.ruler?.render();
    p.bars?.render();
    this.syncShell();
  }

  statusNote(text) { this.note = text; this.parts.bars?.render(); }

  // ---- editing ---------------------------------------------------------------

  // Run an editing change as one undoable step, then redraw and scroll.
  edit(fn, group = null) {
    // edits inside an edit are part of it
    if (this._editing) return fn();
    let r;
    this._editing = true;
    try { r = this.doc.hist.change(fn, group); } finally { this._editing = false; }
    this.selectMode = this.selectMode && this.ed.blockOn;
    this.update({ scroll: true });
    return r;
  }

  get hasSelection() {
    const ed = this.ed;
    if (!ed.blockOn) return false;
    const [a, b] = ed.blockRange();
    return b > a;
  }

  clearSelection() { this.ed.endBlock(); this.selectMode = false; }

  // Delete the selection, if there is one, inside an edit.
  _dropSelection() {
    if (!this.ed.blockOn) return false;
    const [a, b] = this.ed.blockRange();
    this.ed.endBlock();
    this.selectMode = false;
    if (b > a) { this.ed.setCursor(a); this.ed.deleteRange(a, b); return true; }
    return false;
  }

  typeText(s) {
    this.edit(() => { this._dropSelection(); this.ed.type(s); }, 'type');
  }

  insert(items, group = null) {
    this.edit(() => { this._dropSelection(); this.ed.insertItems(items); }, group);
  }

  backspace() {
    this.edit(() => {
      if (this._dropSelection()) return;
      const ed = this.ed;
      if (this.reveal) { ed.backspace(); return; }
      let i = ed.cursor - 1;
      // hidden codes stay put; the visible item before them goes
      while (i >= 0 && isCode(ed.items[i]) && !visible(ed.items[i])) i--;
      if (i >= 0) ed.deleteRange(i, i + 1, { dir: -1 });
    }, 'bs');
  }

  del() {
    this.edit(() => {
      if (this._dropSelection()) return;
      const ed = this.ed;
      if (this.reveal) { ed.del(); return; }
      let i = ed.cursor;
      while (i < ed.length && isCode(ed.items[i]) && !visible(ed.items[i])) i++;
      if (i < ed.length) ed.deleteRange(i, i + 1, { dir: 1 });
    }, 'del');
  }

  // The word at the cursor and the spaces after it; after the end of a
  // word (past its punctuation), the word before.
  deleteWord() {
    this.edit(() => {
      if (this._dropSelection()) return;
      const ed = this.ed;
      let [a, b] = wordAt(ed.items, ed.cursor);
      if (a === b) { a = prevWordStart(ed.items, ed.cursor); b = ed.cursor; }
      while (b < ed.length && ed.items[b] === ' ') b++;
      if (b > a) { ed.setCursor(a); ed.deleteRange(a, b); }
    });
  }

  // Bold, Italic, Underline…: wraps a selection and keeps it selected.
  toggleAttr(name) {
    this.edit(() => {
      const ed = this.ed;
      if (this.hasSelection) {
        const [a, b] = ed.blockRange();
        ed.wrapBlock(name);
        ed.anchor = a + 1;
        ed.cursor = b + 1;
      } else {
        ed.endBlock();
        // inside the attribute already: step out of it
        const on = ed.attrs().includes(name);
        if (on) {
          let i = ed.cursor;
          while (i < ed.length && !(isPair(ed.items[i]) && ed.items[i].c === name && !ed.items[i].on)) {
            if (!isPair(ed.items[i])) { i = -1; break; }
            i++;
          }
          if (i >= 0 && i < ed.length) { ed.setCursor(i + 1); return; }
          // in the middle of the text: close it here and reopen after
          const at = ed.cursor;
          ed.insertItems([code.off(name), code.on(name)], at);
          ed.setCursor(at + 1);
          return;
        }
        ed.toggleAttr(name);
      }
    });
  }

  // A font change: [Font] at the cursor (replacing one right before it), or
  // around the selection with the old font restored after it.
  setFont(face, size) {
    const v = `${face} ${+(+size).toFixed(1)}pt`;
    this.edit(() => {
      const ed = this.ed;
      if (this.hasSelection) {
        const [a, b] = ed.blockRange();
        const after = stateAt(ed.items, b, this.layoutDefaults()).font;
        ed.endBlock();
        ed.insertItems([code.font(after)], b);
        ed.insertItems([code.font(v)], a);
        ed.anchor = a + 1;
        ed.cursor = b + 1;
        return;
      }
      if (is(ed.items[ed.cursor - 1], 'Font')) { ed.items[ed.cursor - 1] = code.font(v); ed._changed(); }
      else ed.insertCode(code.font(v));
    });
  }

  // Paragraph format codes ([Just], [Ln Spacing], [Lft Mar]…) go at the start
  // of the paragraph. With a selection, they cover its paragraphs and the
  // old setting comes back after.
  formatParagraphs(make, read) {
    this.edit(() => {
      const ed = this.ed;
      const defs = this.layoutDefaults();
      if (this.hasSelection) {
        const [a, b] = ed.blockRange();
        ed.endBlock();
        const end = paragraphEnd(ed.items, Math.max(a, b - 1));
        const probe = make(null).c;
        const kinds = probe === 'LMar' || probe === 'RMar' ? [probe, 'LRMar'] : [probe];
        if (end < ed.length && !leadingHas(ed.items, end + 1, kinds)) {
          const prev = read(stateAt(ed.items, end + 1, defs));
          const keep = ed.cursor;
          ed.setCursor(end + 1);
          ed.insertFormatCode(make(prev));
          ed.setCursor(keep);
        }
        ed.setCursor(a);
        ed.insertFormatCode(make(null));
        return;
      }
      ed.insertFormatCode(make(null));
    });
  }

  setJust(v) { this.formatParagraphs((prev) => code.just(prev ?? v), (s) => s.just); }
  setSpacing(v) { this.formatParagraphs((prev) => code.lnSpacing(prev ?? v), (s) => s.spacing); }
  setMargin(which, v) {
    this.formatParagraphs(
      (prev) => (which === 'l' ? code.lMar(prev ?? v) : code.rMar(prev ?? v)),
      (s) => (which === 'l' ? s.lMar : s.rMar),
    );
  }

  // ---- motion ------------------------------------------------------------------

  // Move the cursor with fn(); extend: grow the selection (Shift, or Select mode).
  move(fn, extend = false) {
    const ed = this.ed;
    extend = extend || this.selectMode;
    if (extend && !ed.blockOn) ed.startBlock();
    if (!extend && ed.blockOn) ed.endBlock();
    fn(ed);
    this.update({ scroll: true });
  }

  setCursorFromMouse(i, extend) {
    const ed = this.ed;
    if (extend) { if (!ed.blockOn) ed.startBlock(); }
    else { ed.endBlock(); this.selectMode = false; }
    ed.setCursor(i);
    this.update({ scroll: true });
  }

  selectRange(a, b) {
    const ed = this.ed;
    ed.setCursor(a);
    ed.startBlock();
    ed.setCursor(b);
    this.update({ scroll: true });
  }

  selectWordAt(i) {
    const [a, b] = wordAt(this.ed.items, i);
    let e = b;
    while (e < this.ed.length && this.ed.items[e] === ' ') e++;
    if (e > a) this.selectRange(a, e);
  }

  selectParagraphAt(i) {
    const items = this.ed.items;
    const a = paragraphStart(items, i), b = paragraphEnd(items, i);
    this.selectRange(a, Math.min(items.length, b + 1));
  }

  // Keys that edit or move, after the keyboard's commands had their turn.
  editorKey(k) {
    const ed = this.ed;
    if (isTyping(k)) { this.typeText(k); return true; }
    const shift = /(^|-)S-/.test(k);
    const base = k.replace(/^(C-)?(A-)?(S-)?/, (m, c, a) => (c || '') + (a || ''));
    const res = this.layout();
    const reveal = this.reveal;
    const view = this.view;
    const pageMove = (dir) => (e) => {
      const c = view.caretBox();
      const h = view.scroller.clientHeight;
      view.scroller.scrollTop += dir * (h - 24);
      const r = view.scroller.getBoundingClientRect();
      const y = c.y + dir * (h - 24) - view.scroller.scrollTop + r.top + c.h / 2;
      e.setCursor(view.hit(r.left + c.x - view.scroller.scrollLeft, y));
    };
    switch (base) {
      case 'Left': this.move((e) => e.left({ reveal }), shift); return true;
      case 'Right': this.move((e) => e.right({ reveal }), shift); return true;
      case 'Up': this.move((e) => e.vertical(res, -1), shift); return true;
      case 'Down': this.move((e) => e.vertical(res, 1), shift); return true;
      case 'C-Left': this.move((e) => e.wordLeft(), shift); return true;
      case 'C-Right': this.move((e) => e.wordRight(), shift); return true;
      case 'Home': this.move((e) => e.lineHome(res), shift); return true;
      case 'End': this.move((e) => e.lineEnd(res), shift); return true;
      case 'C-Home': this.move((e) => e.setCursor(0), shift); return true;
      case 'C-End': this.move((e) => e.setCursor(e.length), shift); return true;
      case 'PgUp': this.move(pageMove(-1), shift); return true;
      case 'PgDn': this.move(pageMove(1), shift); return true;
      case 'C-Up': this.move((e) => e.setCursor(paragraphStart(e.items, Math.max(0, paragraphStart(e.items, e.cursor) === e.cursor ? e.cursor - 1 : e.cursor))), shift); return true;
      case 'C-Down': this.move((e) => { const end = paragraphEnd(e.items, e.cursor); e.setCursor(Math.min(e.length, end + 1)); }, shift); return true;
      default: break;
    }
    switch (k) {
      case 'Enter': this.insert([code.hrt()], 'type'); return true;
      case 'Tab': this.insert([code.tab()], 'type'); return true;
      case 'Backspace': this.backspace(); return true;
      case 'Del': this.del(); return true;
      case 'C-Backspace': case 'C-Del': this.deleteWord(); return true;
      case 'Ins': ed.typeover = !ed.typeover; this.update(); return true;
      case 'Esc':
        if (ed.blockOn || this.selectMode) { this.clearSelection(); this.update(); }
        return true;
      default: return false;
    }
  }

  // ---- clipboard -----------------------------------------------------------------

  copySelection() {
    if (!this.hasSelection) return null;
    const ed = this.ed;
    const [a, b] = ed.blockRange();
    this.clip = ed.slice(a, b);
    return textOf(this.clip);
  }

  // Paste: the copied items when the system clipboard still holds their
  // text (codes and all), otherwise the plain text.
  pasteText(text) {
    let items;
    if (this.clip && (text === null || text === undefined || text === textOf(this.clip))) items = this.clip.map((it) => (isCode(it) ? { ...it } : it));
    else if (text) items = itemsOf(text);
    if (!items || !items.length) return;
    this.edit(() => {
      this._dropSelection();
      this.ed.insertItems(items);
    });
  }

  // ---- files and the shell ----------------------------------------------------------

  displayPath(path) {
    if (!path) return '';
    if (path.includes('\\')) return path.toLowerCase();
    return ('c:' + path.replace(/\//g, '\\')).toLowerCase();
  }

  docTitle(doc = this.doc) { return doc.path ? this.displayPath(doc.path) : doc.name; }

  syncShell() {
    if (!this.client) return;
    const d = this.doc;
    const name = d.path ? this.store.basename(d.path) : d.name;
    const title = `${name} - Hard Return`;
    if (title !== this._sent.title) { this._sent.title = title; this.client.notify('title', { title }); }
    const dirty = this.docs.some((x) => x.ed.dirty);
    if (dirty !== this._sent.dirty) { this._sent.dirty = dirty; this.client.notify('dirty', { dirty }); }
  }

  restoreFocus() {
    if (!this.modals.length) this.parts.focus?.();
  }

  posText() {
    const c = this.cursorInfo();
    return `Pg ${c.page} Ln ${inches(c.ln)} Pos ${inches(c.pos)}`;
  }
}
