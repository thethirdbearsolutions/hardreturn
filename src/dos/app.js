// The text-mode front end: two documents, an 80x25 screen, a stack of
// modes (prompts and full-screen menus) over the editing view.

import { Editor } from '../core/editor.js';
import { layout, lineAt, caretX, stateAt } from '../core/layout.js';
import { textMode } from '../core/measure.js';
import { isCode, isChar, isPair, label, code, inches, isVisible } from '../core/codes.js';
import { Screen, COLS } from './screen.js';
import { isChar as isCharKey } from './keys.js';

export const ATTR_CLASS = {
  BOLD: 'b', UND: 'u', 'DBL UND': 'u', ITALC: 'i', REDLN: 'rl', STKOUT: 'so', OUTLN: 'ol', SHADW: 'ol',
  'SM CAP': 'sc', SUPRSCPT: 'ss', SUBSCPT: 'ss', FINE: 'sz', SMALL: 'sz', LARGE: 'sz', 'VRY LARGE': 'sz', 'EXT LARGE': 'sz',
};

export function attrClass(attrs) {
  const set = new Set();
  for (const a of attrs) if (ATTR_CLASS[a]) set.add(ATTR_CLASS[a]);
  return [...set].join(' ');
}

const ROW_IN = 1 / 6;

export function newDoc() {
  return { ed: new Editor(), path: null, top: 0, hoff: 0, prevCursor: 0 };
}

export class App {
  constructor(el, { store, client = null } = {}) {
    this.scr = new Screen(el);
    this.el = el;
    this.store = store;
    this.client = client;
    this.docs = [newDoc(), newDoc()];
    this.cur = 0;
    this.modes = [];
    this.reveal = false;
    this.msg = null;
    this.homeCount = 0;
    this.repeat = 8;
    this.clip = null;
    this.lastSearch = '';
    this.dateFormat = '3 1, 4';
    this.cwd = store.home;
    this.highlight = null;
    this._lay = null;
    this._sent = { title: null, dirty: null };
    this.exited = false;
  }

  get doc() { return this.docs[this.cur]; }
  get ed() { return this.doc.ed; }

  // ---- layout ----------------------------------------------------------

  lay(doc = this.doc) {
    const ed = doc.ed;
    if (doc._lay && doc._lay.rev === ed.rev) return doc._lay;
    const res = layout(ed.items, { measure: textMode, justifyFull: false });
    const rows = [];
    const lineRow = [];
    res.pages.forEach((p, k) => {
      if (k > 0) rows.push({ kind: 'pb', hard: p.hardBefore, page: k });
      let prev = null;
      for (const line of p.lines) {
        if (prev) {
          const gap = Math.round((line.y - prev.y) / ROW_IN) - 1;
          for (let g = 0; g < gap; g++) rows.push({ kind: 'blank' });
        }
        lineRow[line.index] = rows.length;
        rows.push({ kind: 'line', line });
        prev = line;
      }
    });
    doc._lay = { rev: ed.rev, res, rows, lineRow };
    return doc._lay;
  }

  where(doc = this.doc) {
    const L = this.lay(doc);
    const line = lineAt(L.res, doc.ed.cursor);
    const x = caretX(line, doc.ed.cursor);
    return { L, line, x, page: L.res.pages[line.page], row: L.lineRow[line.index] };
  }

  // ---- modes -----------------------------------------------------------

  push(mode) { this.modes.push(mode); this.invalidate(); return mode; }
  pop(mode) {
    const k = this.modes.lastIndexOf(mode);
    if (k >= 0) this.modes.splice(k, 1);
    this.invalidate();
  }
  get top() { return this.modes[this.modes.length - 1]; }
  get fullMode() { for (let k = this.modes.length - 1; k >= 0; k--) if (this.modes[k].full) return this.modes[k]; return null; }

  promptRow() { return this.fullMode || !this.reveal ? 24 : 11; }

  invalidate() {
    if (this._raf) return;
    const raf = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0));
    this._raf = raf(() => { this._raf = 0; this.render(); });
  }

  // Run an async command; keys that arrive between prompts are swallowed.
  async run(fn) {
    const busy = this.push({ key: () => true, busy: true });
    try { await fn(); } catch (e) {
      console.error(e);
      this.message(`ERROR: ${e.message}`);
    } finally { this.pop(busy); this.syncShell(); }
  }

  message(text) { this.msg = text; this.invalidate(); }

  // ---- prompts ---------------------------------------------------------

  // A yes/no question on the status line. def is 'Y' or 'N'.
  ask(text, def = 'N', right = '') {
    return new Promise((resolve) => {
      const done = (v) => { this.pop(m); resolve(v); };
      const m = this.push({
        draw: (scr) => {
          const row = this.promptRow();
          scr.fill(row, 0, COLS, ' ');
          let col = scr.put(row, 0, text);
          const cur = col;
          col = scr.put(row, col, def === 'Y' ? 'Yes (No)' : 'No (Yes)');
          if (right) scr.put(row, COLS - right.length - 1, right);
          scr.setCursor(row, cur);
        },
        key: (k) => {
          if (k === 'y' || k === 'Y') done(true);
          else if (k === 'n' || k === 'N') done(false);
          else if (k === 'Enter') done(def === 'Y');
          else if (k === 'F1' || k === 'Esc') done(null);
          else if (isCharKey(k)) done(def === 'Y' ? true : false);
          return true;
        },
      });
    });
  }

  // A one-line field. opts: row, col, width, enterInserts (search strings),
  // onKey(k, field) to take extra keys, terminators.
  input(labelText, initial = '', opts = {}) {
    return new Promise((resolve) => {
      const f = { value: initial, pos: [...initial].length, fresh: initial !== '' && !opts.keepInitial };
      const terms = opts.terminators || ['Enter'];
      const done = (v) => { this.pop(m); resolve(v); };
      const show = (s) => s.replace(/\n/g, '[HRt]').replace(/\t/g, '[Tab]');
      const m = this.push({
        draw: (scr) => {
          const row = opts.row ?? this.promptRow();
          const col0 = opts.col ?? 0;
          if (opts.row === undefined) scr.fill(row, 0, COLS, ' ');
          else if (opts.width) scr.fill(row, col0, opts.width, ' ');
          let col = scr.puts(row, col0, typeof labelText === 'function' ? labelText() : [labelText]);
          const chars = [...f.value];
          const before = show(chars.slice(0, f.pos).join(''));
          scr.put(row, col, show(f.value), opts.cls || '');
          scr.setCursor(row, Math.min(COLS - 1, col + [...before].length));
        },
        key: (k) => {
          if (opts.onKey && opts.onKey(k, f, done)) return true;
          const chars = [...f.value];
          if (terms.includes(k)) { done(f.value); return true; }
          if (k === 'F1' || k === 'Esc') { done(null); return true; }
          if (k === 'Enter' && opts.enterInserts) k = '\n';
          if (k === 'Tab' && opts.enterInserts) k = '\t';
          if (isCharKey(k) || k === '\n' || k === '\t') {
            if (f.fresh) { chars.length = 0; f.pos = 0; }
            chars.splice(f.pos, 0, k);
            f.pos++;
          } else if (k === 'Backspace') {
            if (f.fresh) { chars.length = 0; f.pos = 0; } else if (f.pos > 0) { chars.splice(f.pos - 1, 1); f.pos--; }
          } else if (k === 'Del') {
            chars.splice(f.pos, 1);
          } else if (k === 'Left') f.pos = Math.max(0, f.pos - 1);
          else if (k === 'Right') f.pos = Math.min(chars.length, f.pos + 1);
          else if (k === 'Home') f.pos = 0;
          else if (k === 'End') f.pos = chars.length;
          else if (k === 'C-End') chars.length = f.pos;
          f.fresh = false;
          f.value = chars.join('');
          return true;
        },
      });
    });
  }

  // A status-line menu: choose('Move: ', [['1','Block','B'], …]) -> '1' | null.
  choose(lead, items, { row, def = '0', full = false } = {}) {
    return new Promise((resolve) => {
      const done = (v) => { this.pop(m); resolve(v); };
      const m = this.push({
        draw: (scr) => {
          const r = row ?? this.promptRow();
          scr.fill(r, 0, COLS, ' ');
          let col = scr.put(r, 0, lead);
          items.forEach(([n, text, mn], k) => {
            col = scr.put(r, col, n + ' ');
            const at = mn ? Math.max(0, text.indexOf(mn) >= 0 ? text.indexOf(mn) : text.toUpperCase().indexOf(mn.toUpperCase())) : -1;
            [...text].forEach((ch, j) => { col = scr.put(r, col, ch, j === at ? 'mn' : ''); });
            col = scr.put(r, col, k < items.length - 1 ? '; ' : ': ');
          });
          scr.put(r, col, def);
          scr.setCursor(r, col);
        },
        key: (k) => {
          if (k === 'F1' || k === 'Esc' || k === 'Enter' || k === ' ' || k === '0') { done(null); return true; }
          const hit = items.find(([n, , mn]) => n.toUpperCase() === String(k).toUpperCase() || (mn && mn.toUpperCase() === String(k).toUpperCase()));
          if (hit) done(hit[0]);
          return true;
        },
      });
      m.full = full;
    });
  }

  waitKey(text, { row } = {}) {
    return new Promise((resolve) => {
      const done = (k) => { this.pop(m); resolve(k); };
      const m = this.push({
        draw: (scr) => {
          const r = row ?? this.promptRow();
          scr.fill(r, 0, COLS, ' ');
          const c = scr.puts(r, 0, Array.isArray(text) ? text : [text]);
          scr.setCursor(r, c);
        },
        key: (k) => { done(k); return true; },
      });
    });
  }

  // ---- keys ------------------------------------------------------------

  press(k) {
    if (!k) return false;
    if (this.top) {
      const handled = this.top.key(k);
      this.render();
      return handled !== false;
    }
    this.msg = null;
    const handled = this.editorKey(k);
    this.render();
    this.syncShell();
    return handled !== false;
  }

  editorKey(k) {
    const ed = this.ed;
    const reveal = this.reveal;
    if (this.homeCount) {
      const n = this.homeCount;
      this.homeCount = 0;
      if (this.homeKey(k, n)) return true;
    }
    if (isCharKey(k)) {
      if (ed.blockOn) return this.extendBlockTo(k);
      ed.type(k);
      return true;
    }
    const L = this.lay();
    switch (k) {
      case 'Home': this.homeCount = 1; return true;
      case 'Left': ed.left({ reveal }); return true;
      case 'Right': ed.right({ reveal }); return true;
      case 'Up': ed.vertical(L.res, -1); return true;
      case 'Down': ed.vertical(L.res, 1); return true;
      case 'C-Left': ed.wordLeft(); return true;
      case 'C-Right': ed.wordRight(); return true;
      case 'End': ed.lineEnd(L.res); return true;
      case 'PgUp': case 'PgDn': {
        const { page } = this.where();
        const target = L.res.pages[page.index + (k === 'PgUp' ? -1 : 1)];
        this.doc.prevCursor = ed.cursor;
        if (target) ed.setCursor(target.lines[0].start);
        else if (k === 'PgUp') ed.setCursor(0);
        else ed.setCursor(ed.length);
        return true;
      }
      case 'Enter':
        if (ed.blockOn) return this.extendBlockTo('\n');
        ed.insertCode(code.hrt());
        return true;
      case 'Tab': ed.insertCode(code.tab()); return true;
      case 'C-Enter': ed.insertCode(code.hpg()); return true;
      case 'Backspace': this.deleteKey(-1); return true;
      case 'Del': this.deleteKey(1); return true;
      case 'C-Backspace': ed.deleteWord(); return true;
      case 'C-End': {
        const line = lineAt(L.res, ed.cursor);
        const end = line.how === 'hard' || line.how === 'hpg' ? line.end - 1 : line.end;
        ed.deleteRange(ed.cursor, end);
        return true;
      }
      case 'Ins': ed.typeover = !ed.typeover; return true;
      case 'Esc': this.run(() => this.repeatPrompt()); return true;
      default:
        return this.command(k);
    }
  }

  // Home, Home Home and Home Home Home before an arrow.
  homeKey(k, n) {
    const ed = this.ed;
    const L = this.lay();
    switch (k) {
      case 'Home': this.homeCount = Math.min(n + 1, 3); return true;
      case 'Left': ed.lineHome(L.res, { beforeCodes: n >= 3 }); return true;
      case 'Right': ed.lineEnd(L.res); return true;
      case 'Up':
        this.doc.prevCursor = ed.cursor;
        if (n === 1) {
          const r = this.lay().rows.slice(this.doc.top).find((x) => x.kind === 'line');
          if (r && lineAt(L.res, ed.cursor).index !== r.line.index) ed.setCursor(r.line.start);
          else for (let j = 0; j < (this.reveal ? 10 : 23); j++) ed.vertical(L.res, -1);
        } else {
          let i = 0;
          if (n === 2) while (i < ed.length && isCode(ed.items[i]) && !isVisible(ed.items[i])) i++;
          ed.setCursor(i);
        }
        return true;
      case 'Down':
        this.doc.prevCursor = ed.cursor;
        if (n === 1) for (let j = 0; j < (this.reveal ? 10 : 23); j++) ed.vertical(L.res, 1);
        else ed.setCursor(ed.length);
        return true;
      case 'Backspace': {
        let a = ed.cursor;
        while (a > 0 && /[\p{L}\p{N}'_-]/u.test(ed.items[a - 1])) a--;
        ed.deleteRange(a, ed.cursor);
        return true;
      }
      case 'Del': {
        let b = ed.cursor;
        while (b < ed.length && /[\p{L}\p{N}'_-]/u.test(ed.items[b])) b++;
        while (b < ed.length && ed.items[b] === ' ') b++;
        ed.deleteRange(ed.cursor, b);
        return true;
      }
      default: return false;
    }
  }

  // In Block, typing a character extends the block to it; Enter to the next [HRt].
  extendBlockTo(ch) {
    const ed = this.ed;
    for (let i = ed.cursor; i < ed.length; i++) {
      const it = ed.items[i];
      if ((ch === '\n' && isCode(it) && it.c === 'HRt') || it === ch) {
        ed.setCursor(i + 1);
        return true;
      }
    }
    return true;
  }

  // Backspace/Del. In the normal view a hidden code asks first.
  deleteKey(dir) {
    const ed = this.ed;
    if (ed.blockOn) {
      this.run(async () => {
        if (await this.ask('Delete Block? ', 'N')) ed.deleteBlock();
      });
      return;
    }
    if (this.reveal) { if (dir < 0) ed.backspace(); else ed.del(); return; }
    if (dir < 0) {
      let i = ed.cursor - 1;
      // a closing attribute code hugs the text before it
      while (i >= 0 && isPair(ed.items[i]) && !ed.items[i].on) i--;
      if (i < 0) return;
      const it = ed.items[i];
      if (isChar(it) || isVisible(it)) { ed.deleteRange(i, i + 1, { dir: -1 }); return; }
      this.confirmCodeDelete(i);
    } else {
      const i = ed.cursor;
      if (i >= ed.length) return;
      const it = ed.items[i];
      if (isChar(it) || isVisible(it)) { ed.del(); return; }
      this.confirmCodeDelete(i);
    }
  }

  confirmCodeDelete(i) {
    const ed = this.ed;
    this.run(async () => {
      const ok = await this.ask(`Delete [${label(ed.items[i])}]? `, 'N');
      if (ok) ed.deleteRange(i, i + 1);
    });
  }

  async repeatPrompt() {
    let n = String(this.repeat);
    let fresh = true;
    const key = await new Promise((resolve) => {
      const m = this.push({
        draw: (scr) => {
          const row = this.promptRow();
          scr.fill(row, 0, COLS, ' ');
          const c = scr.put(row, 0, `Repeat Value = ${n}`);
          scr.setCursor(row, c);
        },
        key: (k) => {
          if (/^\d$/.test(k)) { n = fresh ? k : (n + k).slice(0, 4); fresh = false; return true; }
          if (k === 'Backspace') { n = n.slice(0, -1); fresh = false; return true; }
          this.pop(m);
          resolve(k);
          return true;
        },
      });
    });
    const count = parseInt(n, 10) || 0;
    if (key === 'Enter') { if (count) this.repeat = count; return; }
    if (key === 'F1' || key === 'Esc') return;
    for (let j = 0; j < count; j++) {
      if (isCharKey(key) || ['Left', 'Right', 'Up', 'Down', 'Del', 'Backspace', 'C-Left', 'C-Right', 'PgUp', 'PgDn'].includes(key)) this.editorKey(key);
      else { this.editorKey(key); break; }
    }
  }

  // Function keys and other commands; filled in by commands.js.
  command() { return false; }

  // ---- drawing ---------------------------------------------------------

  render() {
    const scr = this.scr;
    scr.clear('');
    const full = this.fullMode;
    let from = 0;
    if (full) {
      from = this.modes.lastIndexOf(full);
      full.draw(scr);
      from++;
    } else {
      this.drawEditor(scr);
    }
    for (let k = from; k < this.modes.length; k++) this.modes[k].draw?.(scr);
    scr.flush();
    this.afterRender?.();
  }

  drawEditor(scr, { rows: textRows = this.reveal ? 11 : 24, statusRow = textRows } = {}) {
    const d = this.doc;
    const ed = d.ed;
    const { L, line, x, row: cr } = this.where();
    if (cr < d.top) d.top = cr;
    if (cr >= d.top + textRows) d.top = cr - textRows + 1;
    if (d.top > Math.max(0, L.rows.length - 1)) d.top = Math.max(0, L.rows.length - 1);
    const ccol = Math.round(x * 10);
    if (ccol < d.hoff) d.hoff = Math.max(0, ccol - 10);
    if (ccol >= d.hoff + COLS) d.hoff = ccol - COLS + 10;
    const [ba, bb] = ed.blockOn ? ed.blockRange() : this.highlight || [-1, -1];
    for (let r = 0; r < textRows; r++) {
      const row = L.rows[d.top + r];
      if (!row) continue;
      if (row.kind === 'pb') { scr.put(r, 0, (row.hard ? '=' : '-').repeat(COLS)); continue; }
      if (row.kind !== 'line') continue;
      for (const p of row.line.items) {
        const inBlock = p.i >= ba && p.i < bb;
        let col = Math.round(p.x * 10) - d.hoff;
        const glyph = p.ch ?? p.text;
        if (glyph === undefined) {
          if (inBlock && p.w > 0) scr.addClass(r, col, Math.round(p.w * 10), 'blk');
          continue;
        }
        const cls = attrClass(p.style.attrs) + (inBlock ? ' blk' : '');
        for (const ch of glyph) scr.put(r, col++, ch, cls);
      }
    }
    scr.setCursor(cr - d.top, ccol - d.hoff);
    this.drawStatus(scr, statusRow, { line, x });
    if (this.reveal && textRows === 11) {
      this.drawRuler(scr, 12);
      this.drawCodes(scr, 13, 12);
    }
  }

  displayName(path) {
    if (!path) return '';
    if (path.includes('\\')) return path.toUpperCase();
    // /Documents/letter.hr -> C:\DOCUMENTS\LETTER.HR
    return ('C:' + path.replace(/\//g, '\\')).toUpperCase();
  }

  posInfo() {
    const { line, x, page } = this.where();
    return { pg: page.n, ln: inches(line.y), pos: inches(x) };
  }

  drawStatus(scr, row, { line, x } = this.where()) {
    const ed = this.ed;
    if (row < 0) return;
    scr.fill(row, 0, COLS, ' ');
    if (this.msg) scr.puts(row, 0, Array.isArray(this.msg) ? this.msg : [this.msg]);
    else if (ed.blockOn) scr.put(row, 0, 'Block on', 'blink');
    else if (ed.typeover) scr.put(row, 0, 'Typeover');
    else scr.put(row, 0, this.displayName(this.doc.path).slice(0, 40));
    const page = this.lay().res.pages[line.page];
    const caps = this.capsLock;
    const posLabel = caps ? 'POS' : 'Pos';
    const left = `Doc ${this.cur + 1} Pg ${page.n} Ln ${inches(line.y)} `;
    const pos = `${posLabel} ${inches(x)}`;
    const start = COLS - 1 - left.length - pos.length;
    let col = scr.put(row, Math.max(42, start), left);
    scr.put(row, col, pos, attrClass(ed.attrs()));
  }

  drawRuler(scr, row) {
    const ed = this.ed;
    const st = stateAt(ed.items, ed.cursor);
    const cols = new Array(COLS).fill('\u2500');
    const off = this.doc.hoff;
    for (const t of st.tabs) {
      const c = Math.round(t.pos * 10) - off;
      if (c >= 0 && c < COLS) cols[c] = '\u25b2';
    }
    const lc = Math.round(st.lMar * 10) - off;
    const rc = Math.round((st.pageW - st.rMar) * 10) - off;
    if (lc >= 0 && lc < COLS) cols[lc] = cols[lc] === '\u25b2' ? '{' : '[';
    if (rc >= 0 && rc < COLS) cols[rc] = cols[rc] === '\u25b2' ? '}' : ']';
    scr.put(row, 0, cols.join(''), 'rul');
  }

  // Reveal Codes: the stream with codes in bold brackets, wrapped at 80.
  codeRows(fromLine, toLine) {
    const ed = this.ed;
    const { res } = this.lay();
    const out = [];
    let cur = [];
    let col = 0;
    const flushRow = () => { out.push(cur); cur = []; col = 0; };
    const add = (text, cls, i) => {
      const n = [...text].length;
      if (col + n > COLS && col > 0) flushRow();
      cur.push({ text, cls, i, col });
      col += n;
    };
    for (let li = fromLine; li <= toLine && li < res.lines.length; li++) {
      const line = res.lines[li];
      for (let i = line.start; i < line.end; i++) {
        const it = ed.items[i];
        if (isChar(it)) {
          if (i === line.end - 1 && line.how === 'soft' && it === ' ') { add('[SRt]', 'code', i); flushRow(); }
          else add(it, attrClass(ed.attrs(i)) || '', i);
        } else {
          add(`[${label(it)}]`, 'code', i);
          if (it.c === 'HRt' || it.c === 'HPg') flushRow();
        }
      }
      if (line.end === ed.length && li === res.lines.length - 1) {
        // the end of the document is a place the cursor can be
        add(' ', '', ed.length);
      }
    }
    if (cur.length) flushRow();
    return out;
  }

  drawCodes(scr, row0, nrows) {
    const ed = this.ed;
    const { res } = this.lay();
    const line = lineAt(res, ed.cursor);
    const rows = this.codeRows(Math.max(0, line.index - 8), line.index + 12);
    let cr = rows.findIndex((r) => r.some((t) => t.i === ed.cursor));
    if (cr < 0) cr = 0;
    const first = Math.max(0, Math.min(cr - 3, rows.length - nrows));
    const [ba, bb] = ed.blockOn ? ed.blockRange() : [-1, -1];
    for (let r = 0; r < nrows; r++) {
      const toks = rows[first + r];
      if (!toks) continue;
      for (const t of toks) {
        let cls = t.cls;
        if (t.i >= ba && t.i < bb) cls += ' blk';
        if (t.i === ed.cursor) cls = 'rcur';
        scr.put(row0 + r, t.col, t.text, cls);
      }
    }
  }

  // ---- shell sync ------------------------------------------------------

  syncShell() {
    if (!this.client) return;
    const name = this.doc.path ? this.store.basename(this.doc.path) : '';
    const title = name ? `${name} - Hard Return` : 'Hard Return';
    if (title !== this._sent.title) { this._sent.title = title; this.client.notify('title', { title }); }
    const dirty = this.docs.some((d) => d.ed.dirty);
    if (dirty !== this._sent.dirty) { this._sent.dirty = dirty; this.client.notify('dirty', { dirty }); }
  }
}
