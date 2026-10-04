// The pull-down menu bar (Alt-=).

import { App } from './app.js';
import { COLS } from './screen.js';
import { code, formatDate } from '../core/codes.js';

const P = App.prototype;

// [label, action]; action is a key name, a method name prefixed with '.',
// 'attr:NAME', a submenu array, or null when not available.
const APPEARANCE = [['Bold', 'attr:BOLD'], ['Underline', 'attr:UND'], ['Double Underline', 'attr:DBL UND'], ['Italics', 'attr:ITALC'],
  ['Outline', 'attr:OUTLN'], ['Shadow', 'attr:SHADW'], ['Small Caps', 'attr:SM CAP'], ['Redline', 'attr:REDLN'], ['Strikeout', 'attr:STKOUT']];

export const MENUS = [
  ['File', [['Retrieve', 'S-F10'], ['Save', 'F10'], ['Text In', 'C-F5'], ['Text Out', 'C-F5'], ['Password', null], ['List Files', 'F5'],
    ['Summary', null], ['Print', 'S-F7'], ['Setup', null], ['Goto Shell', null], ['Exit', 'F7']]],
  ['Edit', [['Move (Cut)', 'C-F4'], ['Copy', 'C-F4'], ['Paste', '.paste'], ['Append', null], ['Delete', 'Del'], ['Undelete', 'F1'], ['Block', 'A-F4'],
    ['Select', null], ['Comment', null], ['Convert Case', '.convertCase'], ['Protect Block', null], ['Switch Document', 'S-F3'], ['Window', null], ['Reveal Codes', 'A-F3']]],
  ['Search', [['Forward', 'F2'], ['Backward', 'S-F2'], ['Next', '.searchNext'], ['Previous', '.searchPrevious'], ['Replace', 'A-F2'], ['Extended', null], ['Goto', 'C-Home']]],
  ['Layout', [['Line', '.formatLineNow'], ['Page', '.formatPageNow'], ['Document', '.formatDocumentNow'], ['Other', '.formatOtherNow'], ['Columns', null], ['Tables', null],
    ['Math', null], ['Footnote', null], ['Endnote', null], ['Justify', [['Left', 'just:Left'], ['Center', 'just:Center'], ['Right', 'just:Right'], ['Full', 'just:Full']]],
    ['Align', [['Indent →', 'F4'], ['Indent →←', 'S-F4'], ['Center', 'S-F6'], ['Flush Right', 'A-F6'], ['Hard Page', 'C-Enter']]], ['Styles', null]]],
  ['Mark', [['Index', null], ['Table of Contents', null], ['List', null], ['Cross-Reference', null], ['Table of Authorities', null], ['Define', null],
    ['Generate', null], ['Master Documents', null], ['Subdocument', null], ['Document Compare', null]]],
  ['Tools', [['Spell', 'C-F2'], ['Thesaurus', null], ['Macro', null], ['Outline', null], ['Paragraph Number', null], ['Define', null],
    ['Date Text', '.dateText'], ['Date Code', '.dateCode'], ['Date Format', '.dateFormatNow'], ['Comment', null], ['Merge Codes', null], ['Merge', null], ['Sort', null], ['Line Draw', null]]],
  ['Font', [['Base Font', '.baseFontNow'], ['Normal', '.fontNormal'], ['Appearance', APPEARANCE], ['Superscript', 'attr:SUPRSCPT'], ['Subscript', 'attr:SUBSCPT'],
    ['Fine', 'attr:FINE'], ['Small', 'attr:SMALL'], ['Large', 'attr:LARGE'], ['Very Large', 'attr:VRY LARGE'], ['Extra Large', 'attr:EXT LARGE'], ['Print Color', null]]],
  ['Graphics', [['Figure', null], ['Table Box', null], ['Text Box', null], ['User Box', null], ['Line', null], ['Equation', null]]],
  ['Help', [['Help', 'F3'], ['Index', '.helpIndex'], ['Template', '.helpTemplate']]],
];

// First letter not already taken in the list.
function mnemonics(items) {
  const used = new Set();
  return items.map(([t]) => {
    for (let k = 0; k < t.length; k++) {
      const ch = t[k].toUpperCase();
      if (/[A-Z]/.test(ch) && !used.has(ch)) { used.add(ch); return k; }
    }
    return -1;
  });
}

P.menuBar = function () {
  const st = { bar: 0, open: [], sel: [] };
  const barMn = mnemonics(MENUS);
  const listAt = (depth) => {
    let items = MENUS[st.bar][1];
    for (let d = 0; d < depth; d++) items = items[st.sel[d]][1];
    return items;
  };
  const barCols = [];
  let col = 0;
  for (const [t] of MENUS) { barCols.push(col); col += t.length + 2; }

  return new Promise((resolve) => {
    const done = (action) => { this.pop(m); resolve(); if (action) this.menuAction(action); };
    const m = this.push({
      draw: (scr) => {
        scr.fill(0, 0, COLS, ' ', 'bar');
        MENUS.forEach(([t], k) => {
          const active = k === st.bar;
          [...t].forEach((ch, j) => scr.put(0, barCols[k] + 1 + j, ch, active ? 'barsel' : j === barMn[k] ? 'bar barmn' : 'bar'));
          if (active) { scr.put(0, barCols[k], ' ', 'barsel'); scr.put(0, barCols[k] + 1 + t.length, ' ', 'barsel'); }
        });
        let x = barCols[st.bar];
        let y = 1;
        for (let d = 0; d < st.open.length; d++) {
          const items = listAt(d);
          const w = Math.max(...items.map(([t, a]) => t.length + (Array.isArray(a) ? 2 : 0))) + 4;
          if (x + w > COLS) x = COLS - w;
          scr.box(y, x, items.length + 2, w, 'menu');
          const mn = mnemonics(items);
          items.forEach(([t, a], r) => {
            const sel = r === st.sel[d];
            const avail = a !== null;
            const text = (avail ? ` ${t} ` : `[${t}]`).padEnd(w - 2) ;
            const shown = Array.isArray(a) ? text.slice(0, w - 3) + '►' : text;
            [...shown].forEach((ch, j) => scr.put(y + 1 + r, x + 1 + j, ch, sel ? 'menusel' : avail && j - 1 === mn[r] ? 'menu barmn' : avail ? 'menu' : 'menu dim'));
          });
          y = y + 1 + st.sel[d];
          x = x + w - 1;
        }
        scr.setCursor(0, barCols[st.bar] + 1);
        scr.cursor.on = false;
      },
      key: (k) => {
        const depth = st.open.length;
        if (k === 'F1' || k === 'A-=' || k === 'F7') { done(null); return true; }
        if (k === 'Esc') { if (depth) { st.open.pop(); st.sel.pop(); } else done(null); return true; }
        if (depth === 0) {
          if (k === 'Left') st.bar = (st.bar + MENUS.length - 1) % MENUS.length;
          else if (k === 'Right') st.bar = (st.bar + 1) % MENUS.length;
          else if (k === 'Down' || k === 'Enter') { st.open = [true]; st.sel = [0]; }
          else {
            const hit = MENUS.findIndex(([t], j) => t[barMn[j]]?.toUpperCase() === String(k).toUpperCase());
            if (hit >= 0) { st.bar = hit; st.open = [true]; st.sel = [0]; }
          }
          return true;
        }
        const items = listAt(depth - 1);
        const s = st.sel[depth - 1];
        const choose = (r) => {
          const a = items[r][1];
          if (a === null) return;
          if (Array.isArray(a)) { st.sel[depth - 1] = r; st.open.push(true); st.sel.push(0); return; }
          done(a);
        };
        if (k === 'Up') st.sel[depth - 1] = (s + items.length - 1) % items.length;
        else if (k === 'Down') st.sel[depth - 1] = (s + 1) % items.length;
        else if (k === 'Right') {
          if (Array.isArray(items[s][1])) choose(s);
          else { st.bar = (st.bar + 1) % MENUS.length; st.open = [true]; st.sel = [0]; }
        } else if (k === 'Left') {
          if (depth > 1) { st.open.pop(); st.sel.pop(); } else { st.bar = (st.bar + MENUS.length - 1) % MENUS.length; st.open = [true]; st.sel = [0]; }
        } else if (k === 'Enter') choose(s);
        else {
          const mn = mnemonics(items);
          const r = items.findIndex(([t], j) => t[mn[j]]?.toUpperCase() === String(k).toUpperCase());
          if (r >= 0) choose(r);
        }
        return true;
      },
    });
  });
};

P.menuAction = function (a) {
  if (a.startsWith('.')) return this[a.slice(1)]();
  if (a.startsWith('attr:')) { this.ed.toggleAttr(a.slice(5)); this.invalidate(); return; }
  if (a.startsWith('just:')) { this.ed.insertFormatCode(code.just(a.slice(5))); this.invalidate(); return; }
  this.press(a);
};

// Small entry points the menus use.
P.dateText = function () { this.ed.type(formatDate(this.dateFormat)); this.invalidate(); };
P.dateCode = function () { this.ed.insertCode(code.date(this.dateFormat)); this.invalidate(); };
P.dateFormatNow = function () { return this.run(async () => { const f = await this.dateFormatScreen(); if (f) this.dateFormat = f; }); };
P.baseFontNow = function () { return this.run(async () => { const f = await this.baseFontScreen(); if (f) this.ed.insertCode(code.font(f)); }); };
P.fontNormal = function () {
  const ed = this.ed;
  let i = ed.cursor;
  while (i < ed.length && typeof ed.items[i] === 'object' && ed.items[i].on === false) i++;
  ed.setCursor(i);
  this.invalidate();
};
P.formatLineNow = function () { return this.run(() => this.formatLine()); };
P.formatPageNow = function () { return this.run(() => this.formatPage()); };
P.formatDocumentNow = function () { return this.run(() => this.formatDocument()); };
P.formatOtherNow = function () { return this.run(() => this.formatOther()); };
P.searchNext = function () {
  return this.run(async () => {
    const ed = this.ed;
    if (!this.lastSearch) return this.search(false);
    const m = ed.find(this.lastSearch, ed.cursor, false);
    if (m) ed.setCursor(m.end); else this.message('* Not found *');
  });
};
P.searchPrevious = function () {
  return this.run(async () => {
    const ed = this.ed;
    if (!this.lastSearch) return this.search(true);
    const m = ed.find(this.lastSearch, ed.cursor, true);
    if (m) ed.setCursor(m.start); else this.message('* Not found *');
  });
};
P.helpIndex = function () { return this.help(); };
P.helpTemplate = function () { return this.press('F3') && this.press('F3'); };

P.convertCase = function () {
  return this.run(async () => {
    const ed = this.ed;
    if (!ed.blockOn) { this.message('Block on required'); return; }
    const c = await this.choose('', [['1', 'Uppercase', 'U'], ['2', 'Lowercase', 'L']]);
    if (!c) return;
    const [a, b] = ed.blockRange();
    ed.convertCase(a, b, c === '1' ? 'upper' : 'lower');
    ed.endBlock();
  });
};
