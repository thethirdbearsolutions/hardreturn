// Format (Shift-F8): Line, Page, Document and Other menus, Tab Set, Base
// Font and Date Format screens.

import { App } from './app.js';
import { item } from './print.js';
import { stateAt } from '../core/layout.js';
import { code, inches, label, isCode, isChar, PGNUM_POSITIONS } from '../core/codes.js';
import { BASE_FONTS } from '../core/measure.js';
import { COLS } from './screen.js';

const P = App.prototype;
const NA = 'Not available in this version';

const num = (s) => {
  if (s === null || s === undefined) return null;
  const v = parseFloat(String(s).replace(/"/g, ''));
  return Number.isFinite(v) ? v : null;
};

P.cursorState = function () { return stateAt(this.ed.items, this.ed.cursor); };

P.pageStart = function () { return this.where().page.lines[0].start; };

P.format = function () {
  return this.run(async () => {
    for (;;) {
      const c = await this.screenMenu((scr) => this.drawFormatMenu(scr), ['1', '2', '3', '4', 'L', 'P', 'D', 'O']);
      this.msg = null;
      if (c === null) return;
      if (c === '1' || c === 'L') { if (await this.formatLine()) return; }
      if (c === '2' || c === 'P') { if (await this.formatPage()) return; }
      if (c === '3' || c === 'D') { if (await this.formatDocument()) return; }
      if (c === '4' || c === 'O') { if (await this.formatOther()) return; }
    }
  });
};

P.drawFormatMenu = function (scr) {
  scr.put(0, 0, 'Format', 'b');
  const groups = [
    ['1', 'Line', [['Hyphenation', 'Line Spacing'], ['Justification', 'Margins Left/Right'], ['Line Height', 'Tab Set'], ['Line Numbering', 'Widow/Orphan Protection']]],
    ['2', 'Page', [['Center Page (top to bottom)', 'Page Numbering'], ['Force Odd/Even Page', 'Paper Size/Type'], ['Headers', 'Suppress'], ['Footers', 'Margins Top/Bottom']]],
    ['3', 'Document', [['Display Pitch', 'Redline Method'], ['Initial Codes/Font', 'Summary']]],
    ['4', 'Other', [['Advance', 'Overstrike'], ['Conditional End of Page', 'Printer Functions'], ['Decimal Characters', 'Underline Spaces/Tabs'], ['Language', 'Border Options']]],
  ];
  let row = 2;
  for (const [n, name, rows] of groups) {
    item(scr, row, 5, n, name, name[0]);
    row++;
    for (const [a, b] of rows) {
      scr.put(row, 15, a);
      scr.put(row, 47, b);
      row++;
    }
    row++;
  }
  this.selectionLine(scr);
};

// ---- Line ---------------------------------------------------------------

P.drawLineMenu = function (scr) {
  const s = this.cursorState();
  scr.put(0, 0, 'Format: Line', 'b');
  item(scr, 2, 5, '1', 'Hyphenation', 'y', 'No');
  item(scr, 4, 5, '2', 'Hyphenation Zone -  Left', 'Z', '10%');
  scr.put(5, 25, 'Right'); scr.put(5, 40, '4%');
  item(scr, 7, 5, '3', 'Justification', 'J', s.just);
  item(scr, 9, 5, '4', 'Line Height', 'H', 'Auto');
  item(scr, 11, 5, '5', 'Line Numbering', 'N', 'No');
  item(scr, 13, 5, '6', 'Line Spacing', 'S', String(s.spacing));
  item(scr, 15, 5, '7', 'Margins - Left', 'M', inches(s.lMar));
  scr.put(16, 19, 'Right'); scr.put(16, 40, inches(s.rMar));
  item(scr, 18, 5, '8', 'Tab Set', 'T', label(code.tabSet(s.tabs)).replace('Tab Set:', ''));
  item(scr, 20, 5, '9', 'Widow/Orphan Protection', 'W', 'No');
  this.selectionLine(scr);
};

P.subMenu = async function (draw, keys, act) {
  for (;;) {
    const c = await this.screenMenu(draw, keys, { exitKeys: ['F1', 'Esc', 'Enter', ' ', '0'] });
    this.msg = null;
    if (c === null) return false;
    // keep the menu on screen behind any prompt the selection raises
    const bg = this.push({ full: true, draw, key: () => true });
    let r;
    try { r = await act(c); } finally { this.pop(bg); }
    if (r === 'exit') return true;
  }
};

// F7 inside a submenu goes straight back to the document.
P.formatLine = function () {
  return this.subMenu((scr) => this.drawLineMenu(scr), ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Y', 'Z', 'J', 'H', 'N', 'S', 'M', 'T', 'W', 'F7'], async (c) => {
    if (c === 'F7') return 'exit';
    const ed = this.ed;
    const s = this.cursorState();
    if (c === '3' || c === 'J') {
      const j = await this.choose('Justification: ', [['1', 'Left', 'L'], ['2', 'Center', 'C'], ['3', 'Right', 'R'], ['4', 'Full', 'F']], { row: 24 });
      const v = { 1: 'Left', 2: 'Center', 3: 'Right', 4: 'Full' }[j];
      if (v) ed.insertFormatCode(code.just(v));
    } else if (c === '6' || c === 'S') {
      const v = num(await this.input('', String(s.spacing), { row: 13, col: 40, width: 20 }));
      if (v && v > 0 && v <= 10) ed.insertFormatCode(code.lnSpacing(v));
    } else if (c === '7' || c === 'M') {
      const l = num(await this.input('', inches(s.lMar), { row: 15, col: 40, width: 20 }));
      if (l === null) return;
      const r = num(await this.input('', inches(s.rMar), { row: 16, col: 40, width: 20 }));
      if (r === null) return;
      if (l >= 0 && r >= 0 && l + r < s.pageW - 0.5) ed.insertFormatCode(code.lrMar(l, r));
    } else if (c === '8' || c === 'T') {
      const tabs = await this.tabSetScreen(s.tabs);
      if (tabs) ed.insertFormatCode(code.tabSet(tabs));
    } else this.msg = NA;
  });
};

// ---- Page ---------------------------------------------------------------

P.pageCode = function (c) {
  const ed = this.ed;
  const at = this.pageStart();
  for (let j = at; j < ed.length && isCode(ed.items[j]) && ed.items[j].c !== 'HRt' && ed.items[j].c !== 'HPg'; j++) {
    if (ed.items[j].c === c) return j;
  }
  return -1;
};

P.drawPageMenu = function (scr) {
  const s = this.cursorState();
  const top = this.where().page;
  scr.put(0, 0, 'Format: Page', 'b');
  item(scr, 2, 5, '1', 'Center Page (top to bottom)', 'C', this.pageCode('CntrPg') >= 0 ? 'Yes' : 'No');
  item(scr, 4, 5, '2', 'Force Odd/Even Page', 'F');
  item(scr, 6, 5, '3', 'Headers', 'H');
  item(scr, 8, 5, '4', 'Footers', 'o');
  item(scr, 10, 5, '5', 'Margins - Top', 'M', inches(top.tMar));
  scr.put(11, 19, 'Bottom'); scr.put(11, 40, inches(top.bMar));
  item(scr, 13, 5, '6', 'Page Numbering', 'N', PGNUM_POSITIONS[s.pgNum] ? '' : '');
  item(scr, 15, 5, '7', 'Paper Size', 'S', `${s.pageW}" x ${s.pageH}"`);
  scr.put(16, 19, 'Type'); scr.put(16, 40, 'Standard');
  item(scr, 18, 5, '8', 'Suppress (this page only)', 'u');
  this.selectionLine(scr);
};

P.formatPage = function () {
  return this.subMenu((scr) => this.drawPageMenu(scr), ['1', '2', '3', '4', '5', '6', '7', '8', 'C', 'F', 'H', 'O', 'M', 'N', 'S', 'U', 'F7'], async (c) => {
    if (c === 'F7') return 'exit';
    const ed = this.ed;
    if (c === '1' || c === 'C') {
      const has = this.pageCode('CntrPg');
      const v = await this.input('', has >= 0 ? 'Yes' : 'No', { row: 2, col: 40, width: 20, keepInitial: true,
        onKey: (k, f, done) => { if (/^[yYnN]$/.test(k)) { done(k.toUpperCase()); return true; } return false; } });
      if (v === 'Y' && has < 0) ed.insertItems([code.cntrPg()], this.pageStart());
      if (v === 'N' && has >= 0) ed.deleteRange(has, has + 1, { record: false });
    } else if (c === '5' || c === 'M') {
      const top = this.where().page;
      const t = num(await this.input('', inches(top.tMar), { row: 10, col: 40, width: 20 }));
      if (t === null) return;
      const b = num(await this.input('', inches(top.bMar), { row: 11, col: 40, width: 20 }));
      if (b === null) return;
      if (t >= 0 && b >= 0 && t + b < 10) ed.insertFormatCode(code.tbMar(t, b), this.pageStart());
    } else if (c === '6' || c === 'N') {
      if (await this.pageNumbering()) return 'exit';
    } else this.msg = NA;
  });
};

P.pageNumbering = function () {
  return this.subMenu((scr) => {
    const s = this.cursorState();
    scr.put(0, 0, 'Format: Page Numbering', 'b');
    item(scr, 2, 5, '1', 'New Page Number', 'N', '1');
    item(scr, 4, 5, '2', 'Page Number Style', 'S', '^B');
    item(scr, 6, 5, '3', 'Insert Page Number', 'I');
    item(scr, 8, 5, '4', 'Page Number Position', 'P', PGNUM_POSITIONS[s.pgNum] || s.pgNum);
    this.selectionLine(scr);
  }, ['1', '2', '3', '4', 'N', 'S', 'I', 'P', 'F7'], async (c) => {
    if (c === 'F7') return 'exit';
    if (c === '4' || c === 'P') {
      const pos = await this.screenMenu((scr) => this.drawPositions(scr), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
      const v = { 1: 'TopLeft', 2: 'TopCenter', 3: 'TopRight', 4: 'TopRight', 5: 'BottomLeft', 6: 'BottomCenter', 7: 'BottomRight', 8: 'BottomRight', 9: 'None' }[pos];
      if (v) this.ed.insertFormatCode(code.pgNum(v), this.pageStart());
    } else this.msg = NA;
  });
};

P.drawPositions = function (scr) {
  scr.put(0, 0, 'Format: Page Number Position', 'b');
  scr.put(2, 0, 'Every Page');
  scr.put(2, 46, 'Alternating Pages');
  const pageBox = (r, c, top, bottom) => {
    scr.box(r, c, 9, 19);
    scr.put(r + 1, c + 2, top);
    scr.put(r + 7, c + 2, bottom);
  };
  pageBox(4, 8, '1      2      3', '5      6      7');
  scr.box(4, 44, 9, 13); scr.put(5, 46, '4'); scr.put(11, 46, '8');
  scr.box(4, 57, 9, 13); scr.put(5, 67, '4'); scr.put(11, 67, '8');
  scr.put(13, 49, 'Even'); scr.put(13, 63, 'Odd');
  scr.put(15, 0, '9 - No Page Numbers');
  scr.put(23, 0, 'Location of page numbers on each page');
  this.selectionLine(scr);
};

// ---- Document -------------------------------------------------------------

P.formatDocument = function () {
  return this.subMenu((scr) => {
    const s = stateAt(this.ed.items, this.leadingCodesEnd());
    scr.put(0, 0, 'Format: Document', 'b');
    item(scr, 2, 5, '1', 'Display Pitch - Automatic', 'D', 'Yes');
    scr.put(3, 26, 'Width'); scr.put(3, 40, '0.1"');
    item(scr, 5, 5, '2', 'Initial Codes', 'C');
    item(scr, 7, 5, '3', 'Initial Base Font', 'F', s.font);
    item(scr, 9, 5, '4', 'Redline Method', 'R', 'Printer Dependent');
    item(scr, 11, 5, '5', 'Summary', 'S');
    this.selectionLine(scr);
  }, ['1', '2', '3', '4', '5', 'D', 'C', 'F', 'R', 'S', 'F7'], async (c) => {
    if (c === 'F7') return 'exit';
    if (c === '3' || c === 'F') {
      const f = await this.baseFontScreen(stateAt(this.ed.items, this.leadingCodesEnd()).font);
      if (!f) return;
      const ed = this.ed;
      const end = this.leadingCodesEnd();
      const j = ed.items.slice(0, end).findIndex((it) => it.c === 'Font');
      if (j >= 0) { ed.items[j] = code.font(f); ed._changed(); } else ed.insertItems([code.font(f)], 0);
    } else this.msg = NA;
  });
};

P.leadingCodesEnd = function () {
  const ed = this.ed;
  let j = 0;
  while (j < ed.length && isCode(ed.items[j]) && ed.items[j].c !== 'HRt' && ed.items[j].c !== 'HPg') j++;
  return j;
};

P.formatOther = function () {
  return this.subMenu((scr) => {
    scr.put(0, 0, 'Format: Other', 'b');
    item(scr, 2, 5, '1', 'Advance', 'A');
    item(scr, 4, 5, '2', 'Conditional End of Page', 'C');
    item(scr, 6, 5, '3', 'Decimal/Align Character', 'D', '.');
    scr.put(7, 9, "Thousands' Separator"); scr.put(7, 40, ',');
    item(scr, 9, 5, '4', 'Language', 'L', 'US');
    item(scr, 11, 5, '5', 'Overstrike', 'O');
    item(scr, 13, 5, '6', 'Printer Functions', 'P');
    item(scr, 15, 5, '7', 'Underline - Spaces', 'U', 'Yes');
    scr.put(16, 21, 'Tabs'); scr.put(16, 40, 'No');
    item(scr, 18, 5, '8', 'Border Options', 'B');
    this.selectionLine(scr);
  }, ['1', '2', '3', '4', '5', '6', '7', '8', 'F7'], async (c) => {
    if (c === 'F7') return 'exit';
    this.msg = NA;
  });
};

// ---- Tab Set --------------------------------------------------------------

P.tabSetScreen = function (initial) {
  const tabs = new Map(initial.map((t) => [Math.round(t.pos * 10), t.type]));
  let col = Math.round(this.cursorState().lMar * 10);
  let buf = '';
  return new Promise((resolve) => {
    const done = (v) => { this.pop(m); resolve(v); };
    const m = this.push({
      full: true,
      draw: (scr) => {
        this.drawEditor(scr, { rows: 19, statusRow: -1 });
        let scale = '';
        for (let c = 0; c < COLS; c++) scale += c % 10 === 0 ? '|' : c % 5 === 0 ? '^' : '.';
        let labels = ' '.repeat(COLS).split('');
        for (let n = 0; n < 8; n++) [...`${n}"`].forEach((ch, j) => { labels[n * 10 + j] = ch; });
        scr.put(20, 0, labels.join(''));
        scr.put(21, 0, scale);
        const row = new Array(COLS).fill(' ');
        for (const [c, t] of tabs) if (c >= 0 && c < COLS) row[c] = t;
        scr.put(22, 0, row.join(''), 'b');
        if (buf) scr.put(23, 0, `Tab position: ${buf}`);
        else scr.puts(23, 0, [['Delete EOL', 'mn'], ' (clear tabs); ', ['Enter Number', 'mn'], ' (set tab); ', ['Del', 'mn'], ' (clear tab);']);
        scr.puts(24, 0, ['Type; ', ['L', 'mn'], 'eft; ', ['C', 'mn'], 'enter; ', ['R', 'mn'], 'ight; ', ['D', 'mn'], 'ecimal; ', ['.', 'mn'], '= Dot Leader; Press Exit when done.']);
        scr.setCursor(22, col);
      },
      key: (k) => {
        if (/^[0-9.]$/.test(k) && !(k === '.' && !buf)) { buf += k; return true; }
        if (k === 'Enter' && buf) {
          const v = parseFloat(buf);
          buf = '';
          if (Number.isFinite(v) && v >= 0 && v < 17) { col = Math.round(v * 10); tabs.set(col, tabs.get(col) || 'L'); }
          return true;
        }
        buf = '';
        if (k === 'Left') col = Math.max(0, col - 1);
        else if (k === 'Right') col = Math.min(COLS - 1, col + 1);
        else if (k === 'Up' || k === 'Home') col = 0;
        else if (k === 'Down' || k === 'End') col = COLS - 1;
        else if (/^[lLcCrRdD]$/.test(k)) tabs.set(col, k.toUpperCase());
        else if (k === 'Del' || k === 'Backspace') tabs.delete(col);
        else if (k === 'C-End') { for (const c of [...tabs.keys()]) if (c >= col) tabs.delete(c); }
        else if (k === 'F7') done([...tabs.entries()].sort((a, b) => a[0] - b[0]).map(([c, type]) => ({ pos: c / 10, type })));
        else if (k === 'F1' || k === 'Esc') done(null);
        return true;
      },
    });
  });
};

// ---- Base Font --------------------------------------------------------------

P.baseFontScreen = function (current = this.cursorState().font) {
  let sel = Math.max(0, BASE_FONTS.indexOf(current));
  return new Promise((resolve) => {
    const done = (v) => { this.pop(m); resolve(v); };
    const m = this.push({
      full: true,
      draw: (scr) => {
        scr.put(0, 0, 'Base Font', 'b');
        BASE_FONTS.forEach((f, k) => {
          const text = `${f === current ? '*' : ' '} ${f}`.padEnd(40);
          scr.put(2 + k, 0, text, k === sel ? 'hl' : '');
        });
        scr.puts(24, 0, ['1 ', ['S', 'mn'], 'elect; ', ['N', 'mn'], ' Name search: 1']);
        scr.setCursor(24, 30);
      },
      key: (k) => {
        if (k === 'Up') sel = Math.max(0, sel - 1);
        else if (k === 'Down') sel = Math.min(BASE_FONTS.length - 1, sel + 1);
        else if (k === 'Enter' || k === '1' || k === 's' || k === 'S') done(BASE_FONTS[sel]);
        else if (k === 'F1' || k === 'F7' || k === 'Esc') done(null);
        return true;
      },
    });
  });
};

// ---- Date Format ------------------------------------------------------------

P.dateFormatScreen = function () {
  const m = this.push({
    full: true,
    key: () => true,
    draw: (scr) => {
      scr.put(0, 0, 'Date Format', 'b');
      scr.put(2, 5, 'Character  Meaning');
      const rows = [['1', 'Day of the Month'], ['2', 'Month (number)'], ['3', 'Month (word)'], ['4', 'Year (all four digits)'],
        ['5', 'Year (last two digits)'], ['6', 'Day of the Week (word)'], ['7', 'Hour (24-hour clock)'], ['8', 'Hour (12-hour clock)'],
        ['9', 'Minute'], ['0', 'am / pm']];
      rows.forEach(([c, t], k) => { scr.put(4 + k, 9, c); scr.put(4 + k, 16, t); });
      scr.put(16, 5, 'Examples:  3 1, 4          = December 25, 1984');
      scr.put(17, 16, '2/1/5 (6)       = 12/25/84 (Tuesday)');
      scr.put(18, 16, '8:90            = 10:55am');
    },
  });
  m.full = true;
  return this.input('Date format: ', this.dateFormat, { row: 24 }).then((v) => { this.pop(m); return v; });
};

export { num };
