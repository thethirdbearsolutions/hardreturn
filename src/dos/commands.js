// Function-key commands for the text-mode front end.

import { App, newDoc } from './app.js';
import { code, isCode, isPair, formatDate } from '../core/codes.js';
import { lineAt, stateAt } from '../core/layout.js';
import { paragraphStart, paragraphEnd } from '../core/stream.js';
import { parse, serialize, toTxt, fromTxt } from '../core/format.js';
import { isChar as isCharKey } from './keys.js';
import { COLS } from './screen.js';

const NA = 'Not available in this version';

// key -> method name
export const KEYMAP = {
  F1: 'undelete', F2: 'searchForward', 'S-F2': 'searchBackward', 'A-F2': 'replace', 'C-F2': 'spell',
  F3: 'help', 'S-F3': 'switchDoc', 'A-F3': 'toggleReveal', F11: 'toggleReveal',
  F4: 'indent', 'S-F4': 'lrIndent', 'A-F4': 'toggleBlock', F12: 'toggleBlock', 'C-F4': 'move',
  F5: 'listFiles', 'S-F5': 'dateOutline', 'C-F5': 'textInOut',
  F6: 'bold', 'S-F6': 'center', 'A-F6': 'flushRight',
  F7: 'exit', 'S-F7': 'print', 'C-F8': 'font',
  F8: 'underline', 'S-F8': 'format',
  F10: 'save', 'S-F10': 'retrieve',
  'C-Home': 'goto', 'A-=': 'menuBar', 'C-PgDn': 'deleteToPageEnd',
};

const P = App.prototype;

P.command = function (k) {
  const name = KEYMAP[k];
  if (!name) {
    if (/^(C-|A-|S-)*F\d+$/.test(k)) { this.message(NA); return true; }
    return false;
  }
  const r = this[name]();
  if (r && typeof r.then === 'function') {
    // already wrapped in run() by the method
  }
  return true;
};

const cmd = (fn) => function (...args) { return this.run(() => fn.apply(this, args)); };

P.notAvailable = function () { this.message(NA); };

// ---- simple codes ------------------------------------------------------

P.bold = function () { this.ed.toggleAttr('BOLD'); };
P.underline = function () { this.ed.toggleAttr('UND'); };
P.indent = function () { this.ed.insertCode(code.indent()); };
P.lrIndent = function () { this.ed.insertCode(code.lrIndent()); };
P.toggleReveal = function () { this.reveal = !this.reveal; };
P.toggleBlock = function () { if (this.ed.blockOn) this.ed.endBlock(); else this.ed.startBlock(); };
P.switchDoc = function () {
  if (this.ed.blockOn) return this.convertCase();
  this.cur = 1 - this.cur;
};

P.center = cmd(async function () {
  const ed = this.ed;
  if (ed.blockOn) {
    if (await this.ask('[Just:Center]? ', 'N')) {
      const prev = stateAt(ed.items, ed.blockRange()[0]).just;
      ed.surroundBlock([code.just('Center')], [code.just(prev)]);
    }
    return;
  }
  ed.insertCode(code.center());
});

P.flushRight = cmd(async function () {
  const ed = this.ed;
  if (ed.blockOn) {
    if (await this.ask('[Just:Right]? ', 'N')) {
      const prev = stateAt(ed.items, ed.blockRange()[0]).just;
      ed.surroundBlock([code.just('Right')], [code.just(prev)]);
    }
    return;
  }
  ed.insertCode(code.flushRight());
});

// ---- undelete ----------------------------------------------------------

P.undelete = cmd(async function () {
  const ed = this.ed;
  if (ed.blockOn) { ed.endBlock(); return; }
  const v0 = ed.version;
  let k = 0;
  for (;;) {
    const range = ed.deletions.length ? ed.restore(k) : null;
    this.highlight = range;
    const c = await this.choose('Undelete: ', [['1', 'Restore', 'R'], ['2', 'Previous Deletion', 'P']]);
    this.highlight = null;
    if (c === '1' && range) return;
    if (range) { ed.deleteRange(range[0], range[1], { record: false }); ed.setCursor(range[0]); }
    if (c === '2' && ed.deletions.length) { k = (k + 1) % ed.deletions.length; continue; }
    ed.version = v0;
    return;
  }
});

// ---- search and replace -----------------------------------------------

P.searchPrompt = async function (back) {
  let dir = back;
  const s = await this.input(() => [dir ? '<- Srch: ' : '-> Srch: '], this.lastSearch, {
    enterInserts: true,
    terminators: ['F2', 'S-F2', 'Esc'],
    onKey: (k) => {
      if (k === 'Up') { dir = true; return true; }
      if (k === 'Down') { dir = false; return true; }
      return false;
    },
  });
  return s ? { s, back: dir } : null;
};

P.search = async function (back) {
  const q = await this.searchPrompt(back);
  if (!q) return;
  this.lastSearch = q.s;
  const ed = this.ed;
  const m = ed.find(q.s, ed.cursor, q.back);
  if (!m) { this.message('* Not found *'); return; }
  this.doc.prevCursor = ed.cursor;
  ed.setCursor(q.back ? m.start : m.end);
};
P.searchForward = cmd(function () { return this.search(false); });
P.searchBackward = cmd(function () { return this.search(true); });

P.replace = cmd(async function () {
  const ed = this.ed;
  const confirm = await this.ask('w/Confirm? ', 'N');
  if (confirm === null) return;
  const q = await this.searchPrompt(false);
  if (!q) return;
  this.lastSearch = q.s;
  const r = await this.input('Replace with: ', this.lastReplace ?? '', { enterInserts: true, terminators: ['F2', 'S-F2', 'Esc'] });
  if (r === null) return;
  this.lastReplace = r;
  let from = ed.cursor;
  let n = 0;
  for (;;) {
    const m = ed.find(q.s, from, q.back);
    if (!m) break;
    if (confirm) {
      ed.setCursor(m.end);
      this.highlight = [m.start, m.end];
      const ans = await this.ask('Confirm? ', 'N');
      this.highlight = null;
      if (ans === null) break;
      if (!ans) { from = q.back ? m.start : m.end; continue; }
    }
    const end = ed.replaceMatch(m, r);
    n++;
    from = q.back ? m.start : end;
  }
  if (!n) this.message('* Not found *');
});

// ---- go to -------------------------------------------------------------

P.goto = cmd(async function () {
  const ed = this.ed;
  const v = await this.input('Go to ', '', {
    onKey: (k, f, done) => {
      if (['Up', 'Down', 'C-Home'].includes(k)) { done('\0' + k); return true; }
      if (isCharKey(k) && !/\d/.test(k) && f.value === '') { done('\x01' + k); return true; }
      return false;
    },
  });
  if (v === null || v === '') return;
  const { L, page } = this.where();
  const prev = ed.cursor;
  if (v === '\0C-Home') { ed.setCursor(this.doc.prevCursor); this.doc.prevCursor = prev; return; }
  this.doc.prevCursor = prev;
  if (v === '\0Up') { ed.setCursor(page.lines[0].start); return; }
  if (v === '\0Down') { const last = page.lines[page.lines.length - 1]; ed.setCursor(last.end === ed.length ? ed.length : last.end - 1); return; }
  if (v.startsWith('\x01')) {
    const ch = v.slice(1);
    for (let i = ed.cursor + 1; i < Math.min(ed.length, ed.cursor + 2000); i++) {
      if (ed.items[i] === ch) { ed.setCursor(i + 1); return; }
    }
    return;
  }
  const n = parseInt(v, 10);
  if (n > 0) {
    const pg = L.res.pages[Math.min(n, L.res.pages.length) - 1];
    ed.setCursor(pg.lines[0].start);
  }
});

P.deleteToPageEnd = cmd(async function () {
  const ed = this.ed;
  if (!(await this.ask('Delete Remainder of page? ', 'N'))) return;
  const { page } = this.where();
  const last = page.lines[page.lines.length - 1];
  ed.deleteRange(ed.cursor, last.end);
});

// ---- move / copy -------------------------------------------------------

function sentenceRange(items, i) {
  const pa = paragraphStart(items, i), pb = paragraphEnd(items, i);
  let a = i;
  while (a > pa) {
    const prev = items[a - 1];
    if (prev === ' ' && a - 2 >= pa && /[.!?]/.test(items[a - 2])) break;
    a--;
  }
  while (a < pb && items[a] === ' ') a++;
  let b = i;
  while (b < pb && !/[.!?]/.test(items[b])) b++;
  if (b < pb) b++;
  while (b < pb && items[b] === ' ') b++;
  return [a, b];
}

P.move = cmd(async function () {
  const ed = this.ed;
  if (ed.blockOn) {
    const c = await this.choose('Move: ', [['1', 'Block', 'B'], ['2', 'Tabular Column', 'C'], ['3', 'Rectangle', 'R']]);
    if (c === '1') return this.blockOp(...ed.blockRange());
    if (c) this.message(NA);
    return;
  }
  const c = await this.choose('Move: ', [['1', 'Sentence', 'S'], ['2', 'Paragraph', 'P'], ['3', 'Page', 'A'], ['4', 'Retrieve', 'R']]);
  if (!c) return;
  if (c === '4') {
    const r = await this.choose('Retrieve: ', [['1', 'Block', 'B'], ['2', 'Tabular Column', 'C'], ['3', 'Rectangle', 'R']]);
    if (r === '1') this.paste();
    else if (r) this.message(NA);
    return;
  }
  let range;
  if (c === '1') range = sentenceRange(ed.items, ed.cursor);
  else if (c === '2') {
    const a = paragraphStart(ed.items, ed.cursor);
    const b = Math.min(ed.length, paragraphEnd(ed.items, ed.cursor) + 1);
    range = [a, b];
  } else {
    const { page } = this.where();
    range = [page.lines[0].start, page.lines[page.lines.length - 1].end];
  }
  ed.anchor = range[0];
  ed.setCursor(range[1]);
  return this.blockOp(range[0], range[1]);
});

P.blockOp = async function (a, b) {
  const ed = this.ed;
  const op = await this.choose('', [['1', 'Move', 'M'], ['2', 'Copy', 'C'], ['3', 'Delete', 'D'], ['4', 'Append', 'A']]);
  if (!op) { ed.endBlock(); return; }
  if (op === '3') { ed.endBlock(); ed.setCursor(a); ed.deleteRange(a, b); return; }
  const clip = ed.slice(a, b);
  ed.endBlock();
  if (op === '4') {
    const name = await this.input('Append to: ', '');
    if (!name) return;
    const path = await this.toPath(name);
    let items = [];
    try { const f = await this.store.read(path); items = parse(f.name || path, f.content); } catch { /* new file */ }
    const { content, mime } = serialize(path, items.concat(clip));
    await this.store.write(path, content, mime);
    return;
  }
  this.clip = clip;
  if (op === '1') { ed.setCursor(a); ed.deleteRange(a, b, { record: false }); }
  else ed.setCursor(b);
  await this.placeClip();
};

const MOTION = new Set(['Left', 'Right', 'Up', 'Down', 'C-Left', 'C-Right', 'PgUp', 'PgDn', 'Home', 'End', 'C-Home']);

P.placeClip = function () {
  return new Promise((resolve) => {
    const done = () => { this.pop(m); resolve(); };
    const m = this.push({
      draw: (scr) => {
        const row = this.promptRow();
        scr.fill(row, 0, COLS, ' ');
        scr.put(row, 0, 'Move cursor; press Enter to retrieve.');
        const { row: pr } = this.where();
        void pr;
      },
      key: (k) => {
        if (k === 'Enter') { this.paste(); done(); }
        else if (k === 'F1' || k === 'Esc') done();
        else if (MOTION.has(k) || this.homeCount) this.editorKey(k);
        return true;
      },
    });
  });
};

P.paste = function () {
  if (!this.clip || !this.clip.length) return;
  const ed = this.ed;
  const at = ed.cursor;
  ed.insertItems(this.clip.map((it) => (isCode(it) ? { ...it } : it)), at);
  ed.setCursor(at);
};

// ---- font --------------------------------------------------------------

const SIZES = [['1', 'Suprscpt', 'P', 'SUPRSCPT'], ['2', 'Subscpt', 'B', 'SUBSCPT'], ['3', 'Fine', 'F', 'FINE'], ['4', 'Small', 'S', 'SMALL'],
  ['5', 'Large', 'L', 'LARGE'], ['6', 'Vry Large', 'V', 'VRY LARGE'], ['7', 'Ext Large', 'E', 'EXT LARGE']];
const LOOKS = [['1', 'Bold', 'B', 'BOLD'], ['2', 'Undln', 'U', 'UND'], ['3', 'Dbl Und', 'D', 'DBL UND'], ['4', 'Italc', 'I', 'ITALC'],
  ['5', 'Outln', 'O', 'OUTLN'], ['6', 'Shadw', 'A', 'SHADW'], ['7', 'Sm Cap', 'C', 'SM CAP'], ['8', 'Redln', 'R', 'REDLN'], ['9', 'Stkout', 'S', 'STKOUT']];

P.font = cmd(async function () {
  const c = await this.choose('', [['1', 'Size', 'S'], ['2', 'Appearance', 'A'], ['3', 'Normal', 'N'], ['4', 'Base Font', 'F'], ['5', 'Print Color', 'C']]);
  if (c === '1' || c === '2') {
    const list = c === '1' ? SIZES : LOOKS;
    const s = await this.choose('', list.map(([n, t, m]) => [n, t, m]));
    const hit = list.find((x) => x[0] === s);
    if (hit) this.ed.toggleAttr(hit[3]);
  } else if (c === '3') {
    const ed = this.ed;
    let i = ed.cursor;
    while (i < ed.length && isPair(ed.items[i]) && !ed.items[i].on) i++;
    ed.setCursor(i);
  } else if (c === '4') {
    const f = await this.baseFontScreen();
    if (f) this.ed.insertCode(code.font(f));
  } else if (c) this.message(NA);
});

// ---- date --------------------------------------------------------------

P.dateOutline = cmd(async function () {
  const c = await this.choose('', [['1', 'Date Text', 'T'], ['2', 'Date Code', 'C'], ['3', 'Date Format', 'F'], ['4', 'Outline', 'O'], ['5', 'Para Num', 'P'], ['6', 'Define', 'D']]);
  if (c === '1') this.ed.type(formatDate(this.dateFormat));
  else if (c === '2') this.ed.insertCode(code.date(this.dateFormat));
  else if (c === '3') {
    const f = await this.dateFormatScreen();
    if (f) this.dateFormat = f;
  } else if (c) this.message(NA);
});

// ---- files -------------------------------------------------------------

const TOP = { DOCUMENTS: 'Documents', LEVELS: 'Levels', PROGRAMS: 'Programs' };

// What the person typed -> a path on the store.
P.toPath = async function (input, { ext = '.HR', forRead = false } = {}) {
  let s = input.trim();
  const base = s.split(/[\\/]/).pop();
  const hasExt = base.includes('.');
  if (!hasExt && !forRead && ext) s += ext;
  let path;
  if (this.client) {
    if (/^[a-z]:\\/i.test(s)) {
      const parts = s.slice(3).split('\\');
      path = '/' + [TOP[parts[0].toUpperCase()] || parts[0], ...parts.slice(1)].join('/');
    } else if (s.startsWith('/')) path = s;
    else path = this.store.join(this.cwd, s);
    path = await this.store.resolve(path);
  } else {
    path = /^[a-z]:\\/i.test(s) ? s.toUpperCase() : this.store.join(this.cwd, s).toUpperCase();
  }
  if (forRead && !hasExt && ext && !(await this.store.exists(path))) {
    const alt = await this.toPath(input + ext, { forRead: true, ext: '' });
    if (await this.store.exists(alt)) return alt;
  }
  return path;
};

P.saveFlow = async function ({ fromExit = false, asText = false } = {}) {
  const ed = this.ed;
  const blockSave = ed.blockOn && !fromExit;
  const label = blockSave ? 'Block name: ' : asText ? 'Document to be saved (DOS Text): ' : 'Document to be saved: ';
  const init = blockSave ? '' : this.displayName(this.doc.path);
  const name = await this.input(label, init);
  if (!name || !name.trim()) return false;
  const path = await this.toPath(name, { ext: asText ? '.TXT' : '.HR' });
  const disp = this.displayName(path);
  if (await this.store.exists(path)) {
    const ok = await this.ask(`Replace ${disp}? `, 'N');
    if (!ok) return false;
  }
  const items = blockSave ? ed.slice(...ed.blockRange()) : ed.items;
  const { content, mime } = asText ? { content: toTxt(items), mime: 'text/plain' } : serialize(path, items);
  this.message(`Saving ${disp}`);
  this.render();
  const r = await this.store.write(path, content, mime);
  this.msg = null;
  if (blockSave) ed.endBlock();
  else { this.doc.path = r.path || path; ed.markSaved(); }
  return true;
};

P.save = cmd(function () { return this.saveFlow(); });

P.retrieveFlow = async function ({ asText = false } = {}) {
  const name = await this.input('Document to be retrieved: ', '');
  if (name === null) return;
  let file;
  if (!name.trim()) {
    if (!this.client) return;
    try { file = (await this.client.request('open', { accept: ['.hr', '.txt'] })).file; } catch { return; }
  } else {
    const path = await this.toPath(name, { forRead: true });
    try { file = await this.store.read(path); } catch {
      this.message(`ERROR: File not found -- ${this.displayName(path)}`);
      return;
    }
  }
  await this.loadFile(file, { asText });
};

P.retrieve = cmd(function () { return this.retrieveFlow(); });

P.loadFile = async function (file, { asText = false, replace = false } = {}) {
  let items;
  try { items = asText ? fromTxt(file.content) : parse(file.name || file.path, file.content); } catch {
    this.message('ERROR: Incompatible file format');
    return false;
  }
  const ed = this.ed;
  if (!ed.isEmpty() && !replace) {
    const ok = await this.ask('Retrieve into current document? ', 'N');
    if (!ok) return false;
    ed.insertItems(items);
    return true;
  }
  ed.load(items);
  this.doc.path = file.path || null;
  this.doc.top = 0;
  return true;
};

P.textInOut = cmd(async function () {
  const c = await this.choose('', [['1', 'Dos Text', 'T'], ['2', 'Password', 'P'], ['3', 'Save As', 'A'], ['4', 'Comment', 'C'], ['5', 'Spreadsheet', 'S']]);
  if (c !== '1') { if (c) this.message(NA); return; }
  const d = await this.choose('', [['1', 'Save', 'S'], ['2', 'Retrieve (CR/LF to [HRt])', 'R']]);
  if (d === '1') await this.saveFlow({ asText: true });
  else if (d === '2') await this.retrieveFlow({ asText: true });
});

// ---- exit --------------------------------------------------------------

P.exit = cmd(async function () {
  const ed = this.ed;
  if (ed.blockOn) { ed.endBlock(); return; }
  const save = await this.ask('Save document? ', 'Y', ed.dirty ? '' : '(Text was not modified)');
  if (save === null) return;
  if (save && !(await this.saveFlow({ fromExit: true }))) return;
  const other = this.docs[1 - this.cur];
  const otherOpen = !other.ed.isEmpty() || !!other.path;
  const ans = await this.ask(otherOpen ? `Exit doc ${this.cur + 1}? ` : 'Exit WP? ', 'N');
  if (ans === null) return;
  this.docs[this.cur] = newDoc();
  if (!ans) return;
  if (otherOpen) { this.cur = 1 - this.cur; return; }
  this.quit();
});

P.quit = function () {
  this.docs = [newDoc(), newDoc()];
  this.cur = 0;
  this.reveal = false;
  this.exited = true;
  if (this.client) this.client.notify('close');
  this.syncShell();
  let line = '';
  const lines = [];
  const prompt = this.store.home.replace(/\\$/, '') + '>';
  const m = this.push({
    full: true,
    draw: (scr) => {
      scr.clear('dos');
      const all = [...lines, prompt + line];
      const shown = all.slice(-25);
      shown.forEach((t, r) => scr.put(r, 0, t, 'dos'));
      scr.setCursor(shown.length - 1, Math.min(COLS - 1, [...shown[shown.length - 1]].length));
    },
    key: (k) => {
      if (isCharKey(k)) line += k;
      else if (k === 'Backspace') line = line.slice(0, -1);
      else if (k === 'Enter') {
        lines.push(prompt + line);
        const cmdline = line.trim().toLowerCase();
        line = '';
        if (cmdline === 'wp' || cmdline === 'hr') { this.exited = false; this.pop(m); }
        else if (cmdline === 'cls') lines.length = 0;
        else if (cmdline === 'ver') lines.push('', 'MS-DOS Version 3.30', '');
        else if (cmdline === 'dir') lines.push(' Volume in drive C has no label', ' Directory of  ' + this.store.home, '', 'WP       EXE', '');
        else if (cmdline) lines.push('Bad command or file name', '');
        else lines.push('');
      }
      return true;
    },
  });
};

// Open a file the shell handed us (welcome.file or open-file).
P.openFromShell = function (file) {
  this.run(async () => {
    let target = this.cur;
    if (this.ed.dirty || !this.ed.isEmpty()) {
      const other = this.docs[1 - this.cur];
      if (!other.ed.dirty && other.ed.isEmpty()) target = 1 - this.cur;
      else if (!(await this.ask(`Replace Doc ${this.cur + 1} with ${this.displayName(file.path)}? `, 'N'))) return;
    }
    if (this.exited) { this.pop(this.fullMode); this.exited = false; }
    this.cur = target;
    await this.loadFile(file, { replace: true });
  });
};

export { sentenceRange, lineAt };
