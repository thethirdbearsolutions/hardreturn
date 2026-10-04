// The window frame, the Toolbar, the Power Bar and the status bar.

import { h } from './dialogs.js';
import { icon } from './icons.js';
import { COMMANDS, isEnabled, runCommand } from './commands.js';
import { FACES, SIZES } from './boxes.js';

// ---- frame --------------------------------------------------------------------

export class Frame {
  constructor(app, win) {
    this.app = app;
    this.win = win;
    this.title = win.querySelector('.titlebar .t');
    this.maximized = true;
    this.desk = document.querySelector('.desktop');
    const b = win.querySelector.bind(win);
    b('.titlebar .sysbtn').innerHTML = icon('sysbox');
    b('.titlebar .min').innerHTML = icon('min');
    b('.titlebar .max').innerHTML = icon('restore');
    b('.menubar .docbtn').innerHTML = icon('docbox');
    b('.menubar .restore').innerHTML = icon('restore');
    b('.titlebar .sysbtn').addEventListener('mousedown', (e) => { e.preventDefault(); app.parts.menu.openSys(e.currentTarget, false); });
    b('.titlebar .sysbtn').addEventListener('dblclick', () => runCommand(app, 'exit'));
    b('.menubar .docbtn').addEventListener('mousedown', (e) => { e.preventDefault(); app.parts.menu.openSys(e.currentTarget, true); });
    b('.menubar .docbtn').addEventListener('dblclick', () => runCommand(app, 'close'));
    b('.titlebar .min').addEventListener('click', () => this.minimize());
    b('.titlebar .max').addEventListener('click', () => this.toggleMax());
    b('.menubar .restore').addEventListener('click', () => this.toggleMax());
    b('.titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.toggleMax(); });
    this.icon = document.querySelector('.desktop .deskicon');
    this.icon.querySelector('.img').innerHTML = icon('app');
    this.icon.addEventListener('dblclick', () => this.restoreFromIcon());
    this.icon.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.restoreFromIcon(); });
  }

  render() {
    const app = this.app;
    const d = app.doc;
    this.title.textContent = `Hard Return - [${app.docTitle(d)}${d.ed.dirty ? '' : ' - unmodified'}]`;
  }

  // Show or hide the bars and the Reveal Codes pane.
  layout() {
    const p = this.app.prefs;
    const w = this.win;
    w.querySelector('.toolbar').hidden = !p.toolbar;
    w.querySelector('.powerbar').hidden = !p.powerbar;
    w.querySelector('.ruler').hidden = !p.ruler;
    w.querySelector('.statusbar').hidden = !p.status;
    w.querySelector('.splitter').hidden = !this.app.reveal;
    const rv = w.querySelector('.reveal');
    rv.hidden = !this.app.reveal;
    rv.style.height = `${p.revealH}px`;
  }

  toggleMax() {
    this.maximized = !this.maximized;
    this.win.classList.toggle('restored', !this.maximized);
    this.win.querySelector('.titlebar .max').innerHTML = icon(this.maximized ? 'restore' : 'max');
    this.app.update();
  }

  minimize() {
    this.win.hidden = true;
    this.icon.hidden = false;
    this.icon.querySelector('.label').textContent = 'Hard Return';
    this.icon.focus();
  }

  restoreFromIcon() {
    this.win.hidden = false;
    this.icon.hidden = true;
    this.app.update({ scroll: true });
    this.app.restoreFocus();
  }

  exit() {
    this.minimize();
  }
}

// ---- drop-down lists for the Power Bar ------------------------------------------------

let openDrop = null;

function closeDrop() {
  if (!openDrop) return;
  openDrop.el.remove();
  openDrop.btn.classList.remove('down');
  document.removeEventListener('mousedown', openDrop.outside, true);
  openDrop = null;
}

export function dropList(app, btn, items) {
  if (openDrop && openDrop.btn === btn) { closeDrop(); return; }
  closeDrop();
  const el = h('div', { class: 'popup drop' });
  for (const it of items) {
    if (it === '-') { el.append(h('div', { class: 'sep' })); continue; }
    const row = h('div', { class: `mi${it.checked ? ' cur' : ''}` }, h('span', { class: 'chk' }, it.checked ? '✓' : ''), h('span', { class: 'lab' }, it.t));
    if (it.style) row.querySelector('.lab').style.cssText = it.style;
    row.addEventListener('mouseenter', () => { el.querySelectorAll('.mi.on').forEach((r) => r.classList.remove('on')); row.classList.add('on'); });
    row.addEventListener('mousedown', (e) => e.preventDefault());
    row.addEventListener('mouseup', () => { closeDrop(); it.run(); app.restoreFocus(); });
    el.append(row);
  }
  (app.root || document.body).append(el);
  const r = btn.getBoundingClientRect();
  el.style.left = `${Math.min(r.left, window.innerWidth - el.offsetWidth - 2)}px`;
  el.style.top = `${r.bottom}px`;
  btn.classList.add('down');
  const outside = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) closeDrop(); };
  document.addEventListener('mousedown', outside, true);
  openDrop = { el, btn, outside };
  el.querySelector('.mi.cur')?.scrollIntoView({ block: 'nearest' });
}

export function dropOpen() { return !!openDrop; }
export { closeDrop };

// ---- Toolbar ---------------------------------------------------------------------------

const TOOLS = [
  ['new', 'new', 'New Document'], ['open', 'open', 'Open'], ['save', 'save', 'Save'], ['print', 'print', 'Print'], null,
  ['cut', 'cut', 'Cut'], ['copy', 'copy', 'Copy'], ['paste', 'paste', 'Paste'], ['undo', 'undo', 'Undo'], null,
  ['bold', 'bold', 'Bold'], ['italic', 'italic', 'Italic'], ['underline', 'underline', 'Underline'], null,
  ['font', 'font', 'Font'], ['indent', 'indent', 'Indent'], ['bullets', 'bullets', 'Bullets'], null,
  ['notBuilt', 'table', 'Table'], ['notBuilt', 'figure', 'Figure'], null,
  ['speller', 'speller', 'Speller'], ['reveal', 'reveal', 'Reveal Codes'], ['zoomFull', 'fullpage', 'Page/Zoom Full'],
];

const TIPS = {
  new: 'Open a new document window', open: 'Open an existing document', save: 'Save the current document',
  print: 'Print the document to a PDF file', cut: 'Cut the selection to the Clipboard', copy: 'Copy the selection to the Clipboard',
  paste: 'Insert the Clipboard contents', undo: 'Reverse the last change', bold: 'Turn bold on or off',
  italic: 'Turn italic on or off', underline: 'Turn underline on or off', font: 'Change the font and its attributes',
  indent: 'Indent the paragraph one tab stop', bullets: 'Insert a bullet', notBuilt: 'Not available in this release',
  speller: 'Check the spelling of the document', reveal: 'Show the codes in the document', zoomFull: 'Switch between full page and 100%',
};

export class Toolbar {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.buttons = [];
    for (const t of TOOLS) {
      if (!t) { el.append(h('span', { class: 'gap' })); continue; }
      const [cmd, ic, tip] = t;
      const b = h('button', { type: 'button', class: 'tool', tabindex: '-1', 'aria-label': tip });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { runCommand(app, cmd); app.update(); app.restoreFocus(); });
      quickTip(app, b, tip, TIPS[cmd]);
      el.append(b);
      this.buttons.push({ b, cmd, ic, state: '' });
    }
  }

  render() {
    for (const x of this.buttons) {
      const en = isEnabled(this.app, x.cmd);
      const on = !!COMMANDS[x.cmd]?.checked?.(this.app);
      const state = `${en}|${on}`;
      if (state === x.state) continue;
      x.state = state;
      x.b.disabled = !en;
      x.b.classList.toggle('on', on);
      x.b.innerHTML = icon(x.ic, { gray: !en });
    }
  }
}

// Yellow tips under a button, and the longer help in the title bar.
function quickTip(app, el, tip, help) {
  let timer = 0;
  let node = null;
  const hide = () => { clearTimeout(timer); node?.remove(); node = null; app.statusNote(null); };
  el.addEventListener('mouseenter', () => {
    if (help) app.statusNote(help);
    timer = setTimeout(() => {
      node = h('div', { class: 'quicktip' }, tip);
      (app.root || document.body).append(node);
      const r = el.getBoundingClientRect();
      node.style.left = `${Math.min(r.left + 6, window.innerWidth - node.offsetWidth - 4)}px`;
      node.style.top = `${r.bottom + 4}px`;
    }, 500);
  });
  el.addEventListener('mouseleave', hide);
  el.addEventListener('mousedown', hide);
}

// ---- Power Bar --------------------------------------------------------------------------

const JUST_ICON = { Left: 'justLeft', Right: 'justRight', Center: 'justCenter', Full: 'justFull' };
const ZOOM_LIST = [[50, '50%'], [75, '75%'], [100, '100%'], [150, '150%'], [200, '200%'], ['margin', 'Margin Width'], ['page', 'Page Width'], ['full', 'Full Page']];

export function zoomLabel(z) {
  return { margin: 'Margin', page: 'Page', full: 'Full' }[z] || `${z}%`;
}

export class PowerBar {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    const combo = (cls, tip) => {
      const b = h('button', { type: 'button', class: `pcombo ${cls}`, tabindex: '-1', 'aria-label': tip },
        h('span', { class: 'v' }), h('span', { class: 'arrow', html: icon('down') }));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      quickTip(app, b, tip);
      return b;
    };
    const pbtn = (cls, tip, html = '') => {
      const b = h('button', { type: 'button', class: `pbtn ${cls}`, tabindex: '-1', 'aria-label': tip, html });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      quickTip(app, b, tip);
      return b;
    };
    this.face = combo('face', 'Font Face');
    this.size = combo('size', 'Font Size');
    this.styles = pbtn('styles', 'Styles', '<span class="v">Styles</span>');
    this.styles.disabled = true;
    this.just = pbtn('just', 'Justification');
    this.spacing = pbtn('spacing', 'Line Spacing', '<span class="v"></span>');
    this.zoom = pbtn('zoom', 'Zoom', `${icon('zoom')}<span class="v"></span>`);
    this.spell = pbtn('spell', 'Speller', icon('speller'));
    this.page = pbtn('pagemode', 'Page/Draft Mode', icon('fullpage'));
    el.append(this.face, this.size, h('span', { class: 'gap' }), this.styles, h('span', { class: 'gap' }), this.just, this.spacing,
      h('span', { class: 'gap' }), this.zoom, this.page, h('span', { class: 'gap' }), this.spell);

    this.face.addEventListener('click', () => {
      const info = app.cursorInfo();
      const faces = FACES.includes(info.face) ? FACES : [...FACES, info.face];
      dropList(app, this.face, faces.map((f) => ({ t: f, checked: f === info.face, run: () => app.setFont(f, info.size), style: `font-family:${cssFace(f)}` })));
    });
    this.size.addEventListener('click', () => {
      const info = app.cursorInfo();
      dropList(app, this.size, SIZES.map((s) => ({ t: String(s), checked: Math.abs(s - info.size) < 1e-6, run: () => app.setFont(info.face, s) })));
    });
    this.just.addEventListener('click', () => {
      const cur = app.cursorInfo().just;
      dropList(app, this.just, ['Left', 'Right', 'Center', 'Full'].map((j) => ({ t: j, checked: j === cur, run: () => app.setJust(j) })));
    });
    this.spacing.addEventListener('click', () => {
      const cur = app.cursorInfo().spacing;
      dropList(app, this.spacing, [
        ...[1, 1.5, 2].map((v) => ({ t: v.toFixed(1), checked: v === cur, run: () => app.setSpacing(v) })),
        '-', { t: 'Other...', run: () => runCommand(app, 'lineSpacing') }]);
    });
    this.zoom.addEventListener('click', () => {
      const cur = app.prefs.zoom;
      dropList(app, this.zoom, [
        ...ZOOM_LIST.map(([v, t]) => ({ t, checked: v === cur, run: () => { app.prefs.zoom = v; app.savePrefs(); app.update({ scroll: true }); } })),
        '-', { t: 'Other...', run: () => runCommand(app, 'zoom') }]);
    });
    this.spell.addEventListener('click', () => runCommand(app, 'speller'));
    this.page.addEventListener('click', () => runCommand(app, app.prefs.mode === 'page' ? 'draft' : 'page'));
  }

  render() {
    const info = this.app.cursorInfo();
    const set = (b, t) => { const v = b.querySelector('.v'); if (v.textContent !== t) v.textContent = t; };
    set(this.face, info.face);
    set(this.size, String(+info.size.toFixed(1)));
    this.just.innerHTML = icon(JUST_ICON[info.just] || 'justLeft');
    set(this.spacing, (+info.spacing).toFixed(1));
    set(this.zoom, zoomLabel(this.app.prefs.zoom));
    this.page.classList.toggle('on', this.app.prefs.mode === 'page');
  }
}

function cssFace(f) {
  return /^times/i.test(f) ? '"Times New Roman", Tinos, serif' : /^arial|helv/i.test(f) ? 'Arial, Arimo, sans-serif' : '"Courier New", Cousine, monospace';
}

// ---- status bar ----------------------------------------------------------------------------

export class StatusBar {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    el.innerHTML = '';
    this.general = h('div', { class: 'cell general' });
    this.mode = h('div', { class: 'cell mode' });
    this.select = h('div', { class: 'cell select' }, 'Select');
    this.printer = h('div', { class: 'cell printer' }, 'Hard Return PDF');
    this.pos = h('div', { class: 'cell pos' });
    el.append(this.general, this.mode, this.select, this.printer, this.pos);
    this.select.addEventListener('dblclick', () => runCommand(app, 'select'));
    this.mode.addEventListener('dblclick', () => { app.ed.typeover = !app.ed.typeover; app.update(); });
    this.general.addEventListener('dblclick', () => runCommand(app, 'font'));
    this.pos.addEventListener('dblclick', () => runCommand(app, 'goTo'));
  }

  render() {
    const app = this.app;
    const info = app.cursorInfo();
    const a = info.attrs;
    const style = a.includes('BOLD') && a.includes('ITALC') ? 'Bold Italic' : a.includes('BOLD') ? 'Bold' : a.includes('ITALC') ? 'Italic' : 'Regular';
    const text = app.note || `${info.face} ${style} ${+info.size.toFixed(1)}pt`;
    if (this.general.textContent !== text) this.general.textContent = text;
    this.mode.textContent = app.ed.typeover ? 'Typeover' : 'Insert';
    this.select.classList.toggle('gray', !app.ed.blockOn);
    this.pos.textContent = app.posText();
  }
}

