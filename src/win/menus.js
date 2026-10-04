// The menu bar and its pull-down menus, with access keys, Alt and F10 to
// reach the bar, and the arrow keys to get around. Items whose command
// isn't built are grayed.

import { mnemonic, h } from './dialogs.js';
import { COMMANDS, isEnabled, runCommand } from './commands.js';
import { keyFor, keyLabel } from './keys.js';

const S = '-';
const off = (t) => ({ t });

export function menuDefs(app) {
  const windows = app.docs.map((d, k) => ({ t: `&${k + 1} ${app.docTitle(d)}`, run: () => app.switchTo(k), checked: () => k === app.cur }));
  return [
    { t: '&File', items: [
      { t: '&New', cmd: 'new' }, off('&Template...'), { t: '&Open...', cmd: 'open' }, { t: '&Close', cmd: 'close' }, S,
      { t: '&Save', cmd: 'save' }, { t: 'Save &As...', cmd: 'saveAs' }, S,
      off('&QuickFinder...'), off('&Master Document'), off('Compa&re Document'), S,
      { t: 'Document &Info...', cmd: 'docInfo' }, off('Document Su&mmary...'), S,
      { t: '&Print...', cmd: 'print' }, off('Sen&d...'), S, { t: 'E&xit', cmd: 'exit', key: 'A-F4' },
    ] },
    { t: '&Edit', items: [
      { t: '&Undo', cmd: 'undo' }, { t: 'Undele&te...', cmd: 'undelete' }, off('Repeat...'), S,
      { t: 'Cu&t', cmd: 'cut' }, { t: '&Copy', cmd: 'copy' }, { t: '&Paste', cmd: 'paste' }, off('Appe&nd'),
      { t: '&Select', sub: [
        { t: '&Sentence', cmd: 'selectSentence' }, { t: '&Paragraph', cmd: 'selectParagraph' }, { t: 'Pa&ge', cmd: 'selectPage' },
        off('&Rectangle'), off('&Tabular Column'), { t: '&All', cmd: 'selectAll' },
      ] },
      off('Paste Spe&cial...'), off('Lin&ks...'), off('&Object'), S,
      { t: '&Find and Replace...', cmd: 'replace' }, { t: '&Go To...', cmd: 'goTo' }, S,
      { t: 'Con&vert Case', sub: [
        { t: '&lowercase', cmd: 'lowercase' }, { t: '&UPPERCASE', cmd: 'uppercase' }, { t: '&Initial Capitals', cmd: 'initialCaps' },
      ] },
    ] },
    { t: '&View', items: [
      { t: '&Draft', cmd: 'draft', radio: true }, { t: '&Page', cmd: 'page', radio: true }, off('&Two Page'), { t: '&Zoom...', cmd: 'zoom' }, S,
      { t: '&Toolbar', cmd: 'toolbar' }, { t: 'Po&wer Bar', cmd: 'powerBar' }, { t: '&Ruler Bar', cmd: 'rulerBar' }, { t: '&Status Bar', cmd: 'statusBar' },
      off('&Hide Bars'), S,
      off('&Graphics'), off('Ta&ble Gridlines'), off('Hidden Te&xt'), off('Show ¶'), { t: 'Guide&lines', cmd: 'guidelines' }, S,
      { t: 'Reveal &Codes', cmd: 'reveal' },
    ] },
    { t: '&Insert', items: [
      { t: '&Bullets', cmd: 'bullets' }, off('&Character...'), off('&Abbreviations...'),
      { t: '&Date', sub: [{ t: 'Date &Text', cmd: 'dateText' }, { t: 'Date &Code', cmd: 'dateCode' }, off('Date &Format...')] },
      off('&Other'), S, off('&Footnote'), off('&Endnote'), off('Co&mment'), off('&Sound...'), off('Boo&kmark...'), S,
      off('Spreadsheet/Data&base'), off('F&ile...'), off('&Object...'), off('Ac&quire Image...'), S,
      { t: '&Page Break', cmd: 'pageBreak' },
    ] },
    { t: '&Layout', items: [
      { t: '&Font...', cmd: 'font' },
      { t: '&Line', sub: [
        off('&Tab Set...'), off('&Height...'), { t: '&Spacing...', cmd: 'lineSpacing' }, off('&Numbering...'), off('H&yphenation...'), S,
        { t: '&Center', cmd: 'center' }, { t: '&Flush Right', cmd: 'flushRight' }, off('&Other Codes...'),
      ] },
      { t: '&Paragraph', sub: [
        off('&Format...'), off('&Border/Fill...'), S, { t: '&Indent', cmd: 'indent' }, off('&Hanging Indent'),
        { t: '&Double Indent', cmd: 'doubleIndent' }, off('Back &Tab'),
      ] },
      off('&Page'), off('&Document'), off('&Columns'), off('&Header/Footer...'), off('&Watermark...'), S,
      { t: '&Margins...', cmd: 'margins' },
      { t: '&Justification', sub: [
        { t: '&Left', cmd: 'justLeft', radio: true }, { t: '&Right', cmd: 'justRight', radio: true },
        { t: '&Center', cmd: 'justCenter', radio: true }, { t: '&Full', cmd: 'justFull', radio: true }, off('&All'),
      ] },
      off('T&ypesetting'), off('En&velope...'), off('La&bels...'), S, off('&QuickFormat...'), off('&Styles...'),
    ] },
    { t: '&Tools', items: [
      { t: '&Speller...', cmd: 'speller' }, off('&Thesaurus...'), off('&Grammatik...'), off('&QuickCorrect...'), off('&Language...'), S,
      off('&Macro'), off('Te&mplate Macro'), S, off('Me&rge...'), off('S&ort...'), off('&Outline'), S,
      off('&Hypertext'), off('&Cross-Reference'), off('&Generate...'), S,
      { t: '&Preferences', sub: [
        off('&Display...'), off('&Environment...'), off('&File...'), off('&Summary...'), off('&Writing Tools...'),
        { t: '&Keyboard...', cmd: 'keyboard' }, off('&Menu Bar...'), off('&Toolbar...'), off('&Power Bar...'), off('&Status Bar...'),
      ] },
    ] },
    { t: '&Graphics', items: [
      off('&Figure...'), off('&Text...'), off('&Equation...'), off('&Custom Box...'), off('&Edit Box...'), S,
      off('&Horizontal Line'), off('&Vertical Line'), off('Custom &Line...'), S, off('&Draw'), off('C&hart'), off('Te&xtArt'),
    ] },
    { t: 'T&able', items: [
      off('&Create...'), off('&Format...'), off('&Number Type...'), off('&Lines/Fill...'), S,
      off('&Join...'), off('&Split...'), off('&Insert...'), off('&Delete...'), S, off('Su&m'), off('Calc&ulate...'),
    ] },
    { t: '&Window', items: [
      off('&Cascade'), off('Tile &Horizontal'), off('Tile &Vertical'), S, ...windows,
    ] },
    { t: '&Help', items: [
      { t: '&Contents', cmd: 'help' }, off('&Search for Help On...'), off('&How Do I'), off('&Macros'), off('Coac&hes'), off('&Upgrade Help...'),
      off('&Tutorial'), S, { t: '&Keystrokes...', cmd: 'help' }, S, { t: '&About Hard Return...', cmd: 'about' },
    ] },
  ];
}

const SYS_ITEMS = (app, doc) => doc
  ? [{ t: '&Restore', run: () => app.parts.frame?.toggleMax() }, off('&Move'), off('&Size'), off('Mi&nimize'), off('Ma&ximize'), S,
    { t: '&Close', cmd: 'close', key: 'C-F4' }, S, { t: 'Nex&t', cmd: 'nextWindow', key: 'C-F6' }]
  : [{ t: '&Restore', run: () => app.parts.frame?.toggleMax(), enabled: () => app.parts.frame?.maximized === false },
    off('&Move'), off('&Size'), { t: 'Mi&nimize', run: () => app.parts.frame?.minimize() },
    { t: 'Ma&ximize', run: () => app.parts.frame?.toggleMax(), enabled: () => app.parts.frame?.maximized === true ? false : true }, S,
    { t: '&Close', cmd: 'exit', key: 'A-F4' }, S, off('S&witch To...')];

export class MenuBar {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.active = false; // the bar has the keyboard
    this.sel = -1; // highlighted title
    this.stack = []; // open popups: { items, el, index, anchor }
    this.defs = [];
    this.render();
    document.addEventListener('mousedown', (e) => {
      if (!this.stack.length && !this.active) return;
      if (e.target.closest('.menubar .mtitle') || e.target.closest('.popup')) return;
      this.close();
    }, true);
  }

  render() {
    this.defs = menuDefs(this.app);
    const bar = this.el.querySelector('.mtitles');
    bar.innerHTML = '';
    this.defs.forEach((m, k) => {
      const mn = mnemonic(m.t);
      const t = h('span', { class: `mtitle${k === this.sel ? ' on' : ''}`, html: mn.html, 'data-k': k });
      t.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.stack.length && this.sel === k && !this.sys) this.close();
        else this.openTop(k);
      });
      t.addEventListener('mouseenter', () => { if (this.stack.length && this.sel !== k && !this.sys) this.openTop(k); });
      bar.append(t);
    });
  }

  get isOpen() { return this.active || this.stack.length > 0; }

  activate() {
    this.active = true;
    this.sel = 0;
    this.render();
  }

  close() {
    for (const p of this.stack) p.el.remove();
    this.stack = [];
    this.active = false;
    this.sel = -1;
    this.sys = null;
    this.el.querySelectorAll('.sysbtn.on').forEach((b) => b.classList.remove('on'));
    this.render();
    this.app.restoreFocus();
  }

  openTop(k) {
    for (const p of this.stack) p.el.remove();
    this.stack = [];
    this.sys = null;
    this.active = true;
    this.sel = k;
    this.render();
    const title = this.el.querySelectorAll('.mtitle')[k];
    const r = title.getBoundingClientRect();
    this.openPopup(this.defs[k].items, { x: r.left, y: r.bottom });
  }

  // A system menu box's menu (the application's, or the document's).
  openSys(btn, doc) {
    this.close();
    this.active = true;
    this.sys = btn;
    btn.classList.add('on');
    const r = btn.getBoundingClientRect();
    this.openPopup(SYS_ITEMS(this.app, doc), { x: r.left, y: r.bottom });
  }

  itemEnabled(it) {
    if (it === S) return false;
    if (it.sub) return true;
    if (it.enabled) return it.enabled();
    if (it.run) return true;
    if (!it.cmd) return false;
    return isEnabled(this.app, it.cmd);
  }

  itemChecked(it) {
    if (it.checked) return it.checked();
    const c = it.cmd && COMMANDS[it.cmd];
    return !!(c && c.checked && c.checked(this.app));
  }

  openPopup(items, { x, y }) {
    const el = h('div', { class: 'popup', role: 'menu' });
    const p = { items, el, index: -1 };
    const km = this.app.keymap;
    items.forEach((it, k) => {
      if (it === S) { el.append(h('div', { class: 'sep' })); return; }
      const mn = mnemonic(it.t);
      const en = this.itemEnabled(it);
      const key = it.key || (it.cmd ? keyFor(km, it.cmd) : null);
      const row = h('div', { class: `mi${en ? '' : ' gray'}`, 'data-k': k },
        h('span', { class: 'chk' }, this.itemChecked(it) ? (it.radio ? '•' : '✓') : ''),
        h('span', { class: 'lab', html: mn.html }),
        h('span', { class: 'acc' }, key ? keyLabel(key) : ''),
        h('span', { class: 'arr', html: it.sub ? '&#9654;' : '' }));
      row.addEventListener('mouseenter', () => {
        const depth = this.stack.indexOf(p);
        this.trim(depth + 1);
        this.highlight(p, k);
        if (it.sub) this.openSub(p, k);
      });
      row.addEventListener('mouseup', () => this.choose(p, k));
      row.addEventListener('mousedown', (e) => e.preventDefault());
      el.append(row);
    });
    (this.app.root || document.body).append(el);
    const w = el.offsetWidth, hgt = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    el.style.left = `${Math.max(0, Math.min(x, vw - w - 2))}px`;
    el.style.top = `${Math.max(0, Math.min(y, vh - hgt - 2))}px`;
    this.stack.push(p);
    return p;
  }

  trim(n) {
    while (this.stack.length > n) this.stack.pop().el.remove();
  }

  highlight(p, k) {
    p.index = k;
    p.el.querySelectorAll('.mi').forEach((r) => r.classList.toggle('on', Number(r.dataset.k) === k));
  }

  openSub(p, k) {
    const depth = this.stack.indexOf(p);
    this.trim(depth + 1);
    const row = p.el.querySelector(`.mi[data-k="${k}"]`);
    const r = row.getBoundingClientRect();
    const sub = this.openPopup(p.items[k].sub, { x: r.right - 3, y: r.top - 3 });
    return sub;
  }

  choose(p, k) {
    const it = p.items[k];
    if (!it || it === S) return;
    if (it.sub) { const s = this.openSub(p, k); this.highlight(s, this.firstItem(s)); return; }
    if (!this.itemEnabled(it)) return;
    this.close();
    if (it.run) it.run();
    else runCommand(this.app, it.cmd);
    this.app.update();
  }

  firstItem(p, from = -1, dir = 1) {
    const n = p.items.length;
    for (let j = 1; j <= n; j++) {
      const k = (from + dir * j + n * 2) % n;
      if (p.items[k] !== S) return k;
    }
    return -1;
  }

  // Keys while the bar or a menu has the keyboard. Returns true when used.
  key(k) {
    if (!this.isOpen) return false;
    const top = this.stack[this.stack.length - 1];
    const n = this.defs.length;
    switch (k) {
      case 'Esc':
        if (this.stack.length > 1) { this.trim(this.stack.length - 1); return true; }
        if (this.stack.length === 1 && !this.sys) { this.trim(0); return true; }
        this.close();
        return true;
      case 'A-': case 'F10':
        this.close();
        return true;
      case 'Left':
        if (this.stack.length > 1) { this.trim(this.stack.length - 1); return true; }
        if (this.sys) return true;
        this.sel = (this.sel - 1 + n) % n;
        if (this.stack.length) { this.openTop(this.sel); this.highlight(this.stack[0], this.firstItem(this.stack[0])); } else this.render();
        return true;
      case 'Right':
        if (top && top.index >= 0 && top.items[top.index].sub) {
          const s = this.openSub(top, top.index);
          this.highlight(s, this.firstItem(s));
          return true;
        }
        if (this.sys) return true;
        this.sel = (this.sel + 1) % n;
        if (this.stack.length) { this.openTop(this.sel); this.highlight(this.stack[0], this.firstItem(this.stack[0])); } else this.render();
        return true;
      case 'Down': case 'Up':
        if (!top) { this.openTop(Math.max(0, this.sel)); this.highlight(this.stack[0], this.firstItem(this.stack[0])); return true; }
        this.highlight(top, this.firstItem(top, top.index < 0 && k === 'Up' ? 0 : top.index, k === 'Down' ? 1 : -1));
        return true;
      case 'Enter':
        if (!top) { this.openTop(Math.max(0, this.sel)); this.highlight(this.stack[0], this.firstItem(this.stack[0])); return true; }
        if (top.index >= 0) this.choose(top, top.index);
        return true;
      default: {
        const letter = /^(A-)?(\w)$/.exec(k)?.[2]?.toUpperCase();
        if (!letter) return true;
        if (!top) {
          const t = this.defs.findIndex((m) => mnemonic(m.t).key === letter);
          if (t >= 0) { this.openTop(t); this.highlight(this.stack[0], this.firstItem(this.stack[0])); }
          return true;
        }
        const j = top.items.findIndex((it) => it !== S && mnemonic(it.t).key === letter);
        if (j >= 0) { this.highlight(top, j); this.choose(top, j); }
        return true;
      }
    }
  }

  // Alt+letter from the document: open that menu.
  openByKey(letter) {
    const t = this.defs.findIndex((m) => mnemonic(m.t).key === letter);
    if (t < 0) return false;
    this.openTop(t);
    this.highlight(this.stack[0], this.firstItem(this.stack[0]));
    return true;
  }
}

