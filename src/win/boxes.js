// The dialogs: files, print, font, margins, spacing, zoom, find and
// replace, speller, undelete, preferences, help and about.

import { dialog, messageBox, h, label, textField, check, radio, group, listBox } from './dialogs.js';
import { CSS_FAMILY } from './view.js';
import { icon } from './icons.js';
import { KEYBOARDS, keyLabel } from './keys.js';
import { parse, serialize } from '../core/format.js';
import { layout, lineAt, stateAt } from '../core/layout.js';
import { print as printMeasure, familyOf } from '../core/measure.js';
import { makePdf, bytes } from '../core/pdf.js';
import { code, inches } from '../core/codes.js';
import { isWordChar, textOf } from '../core/stream.js';
import { Speller } from '../core/spell.js';
import { WORDS } from '../core/words.js';

// ---- messages --------------------------------------------------------------

export function error(app, text) {
  return messageBox(app, { text, kind: 'stop' });
}

export function info(app, text) {
  return messageBox(app, { text, kind: 'info' });
}

function askSave(app, doc) {
  return messageBox(app, {
    text: `Save changes to ${app.docTitle(doc)}?`, kind: 'question',
    buttons: [['&Yes', 'yes'], ['&No', 'no'], ['Cancel', 'cancel']],
  });
}

// ---- files -------------------------------------------------------------------

const TYPES = [
  { text: 'Hard Return (*.hr)', ext: '.hr' },
  { text: 'ASCII Text (*.txt)', ext: '.txt' },
  { text: 'All Files (*.*)', ext: '' },
];

// The open/save file dialog. Resolves with a store path or null.
function fileDialog(app, { mode, initial = '' }) {
  const store = app.store;
  const dir = store.home;
  const isSave = mode === 'save';
  const name = textField(initial || (isSave ? '' : '*.hr'), { style: 'width:100%' });
  let type = TYPES[0];
  let files = [];
  const list = listBox([], {
    rows: 8, cls: 'files',
    onSelect: (v) => { if (v) { name.value = v; } },
    onActivate: () => dlgRef?.press('ok'),
  });
  const typeSel = h('select', { class: 'combo' }, ...TYPES.map((t, k) => h('option', { value: String(k) }, t.text)));
  const filter = () => {
    const shown = files.filter((f) => !type.ext || f.name.toLowerCase().endsWith(type.ext));
    list.set(shown.map((f) => ({ text: f.name.toLowerCase(), value: f.name.toLowerCase() })), -1);
    list.index = -1;
  };
  typeSel.addEventListener('change', () => {
    type = TYPES[+typeSel.value];
    if (!isSave || name.value.includes('*')) name.value = type.ext ? `*${type.ext}` : '*.*';
    filter();
  });
  const dirLabel = app.displayPath(dir).replace(/\\$/, '');
  const dirs = listBox(dirLabel.split('\\').map((p, k, a) => ({ text: (k === 0 ? p + '\\' : p), cls: `dir d${k}${k === a.length - 1 ? ' open' : ''}` })), { rows: 8, selected: dirLabel.split('\\').length - 1, cls: 'dirs' });
  const drives = h('select', { class: 'combo', disabled: true }, h('option', {}, 'c:'));
  const body = h('div', { class: 'filedlg' },
    h('div', { class: 'col' }, label('File &Name:', name), name, list.el, label('List Files of &Type:', typeSel), typeSel),
    h('div', { class: 'col' }, h('div', { class: 'lbl' }, 'Directories:'), h('div', { class: 'path' }, dirLabel), dirs.el, label('Dri&ves:', drives), drives));
  let dlgRef = null;
  let result = null;
  return dialog(app, {
    title: isSave ? 'Save As' : 'Open File', body,
    buttons: [{ text: isSave ? 'Save' : 'Open', id: 'ok', isDefault: true }, { text: 'Cancel', id: 'cancel', cancel: true }],
    init: async (dlg) => {
      dlgRef = dlg;
      try { files = await store.list(dir); } catch { files = []; }
      filter();
    },
    focus: name,
    onButton: async (id) => {
      if (id !== 'ok') return true;
      let n = name.value.trim();
      if (!n) return false;
      if (/[*?]/.test(n)) {
        const ext = (/\*(\.[^.*?]+)$/.exec(n) || [])[1] || '';
        type = { ext: ext.toLowerCase() };
        filter();
        return false;
      }
      if (isSave && !/\.[^\\/.]+$/.test(n)) n += type.ext || '.hr';
      let path = n.includes('\\') || n.includes('/') ? n : store.join(dir, n);
      if (/^c:\\/i.test(path) && store.sep === '/') {
        const parts = path.slice(3).split('\\');
        path = '/' + [parts[0][0].toUpperCase() + parts[0].slice(1).toLowerCase(), ...parts.slice(1)].join('/');
      }
      path = await store.resolve(path);
      if (isSave) {
        if (await store.exists(path)) {
          const ok = await messageBox(app, { text: `Replace existing ${app.displayPath(path)}?`, kind: 'question', buttons: [['&Yes', 'yes'], ['&No', 'no']], def: 1 });
          if (ok !== 'yes') return false;
        }
      } else if (!(await store.exists(path))) {
        await error(app, `File not found: ${app.displayPath(path)}`);
        return false;
      }
      result = path;
      return true;
    },
  }).then(() => result);
}

export async function openFile(app) {
  const path = await fileDialog(app, { mode: 'open' });
  if (!path) return;
  let file;
  try { file = await app.store.read(path); } catch (e) { await error(app, e.message); return; }
  await loadFile(app, file);
}

export async function loadFile(app, file) {
  let items;
  try { items = parse(file.name || file.path, file.content); } catch {
    await error(app, `${app.displayPath(file.path)} is not a Hard Return document.`);
    return false;
  }
  // an untouched empty document is replaced; otherwise a new window
  const cur = app.doc;
  const doc = cur.ed.isEmpty() && !cur.ed.dirty && !cur.path ? cur : app.newDoc();
  doc.ed.load(items);
  doc.hist.clear();
  doc.path = file.path || null;
  doc.scroll = { top: 0, left: 0 };
  app.switchTo(app.docs.indexOf(doc));
  app.update({ restoreScroll: true });
  return true;
}

async function writeDoc(app, doc, path) {
  const { content, mime } = serialize(path, doc.ed.items);
  try {
    const r = await app.store.write(path, content, mime);
    doc.path = r.path || path;
    doc.ed.markSaved();
    app.update();
    return true;
  } catch (e) {
    await error(app, `Could not save ${app.displayPath(path)}: ${e.message}`);
    return false;
  }
}

export async function saveAs(app, doc = app.doc) {
  const init = doc.path ? app.store.basename(doc.path).toLowerCase() : '';
  const path = await fileDialog(app, { mode: 'save', initial: init });
  if (!path) return false;
  return writeDoc(app, doc, path);
}

export async function save(app, doc = app.doc) {
  if (!doc.path) return saveAs(app, doc);
  return writeDoc(app, doc, doc.path);
}

// Ask about unsaved changes. Resolves false when the person cancels.
async function settle(app, doc) {
  if (!doc.ed.dirty) return true;
  app.switchTo(app.docs.indexOf(doc));
  const a = await askSave(app, doc);
  if (a === 'cancel') return false;
  if (a === 'yes') return save(app, doc);
  return true;
}

export async function closeDoc(app) {
  const doc = app.doc;
  if (!(await settle(app, doc))) return;
  const k = app.docs.indexOf(doc);
  app.docs.splice(k, 1);
  if (!app.docs.length) { app.untitled = 0; app.newDoc(); return; }
  app.cur = Math.min(k, app.docs.length - 1);
  app.update({ restoreScroll: true });
}

export async function exitApp(app) {
  for (const doc of [...app.docs]) if (!(await settle(app, doc))) return;
  app.docs = [];
  app.untitled = 0;
  app.newDoc();
  app.reveal = false;
  if (app.client) app.client.notify('close');
  app.parts.frame?.exit();
}

// ---- print -----------------------------------------------------------------------

function docBase(app) {
  const d = app.doc;
  return (d.path ? app.store.basename(d.path).replace(/\.[^.]*$/, '') : d.name).toLowerCase();
}

export function printDialog(app) {
  const ed = app.ed;
  const hasSel = app.hasSelection;
  const full = radio('psel', '&Full Document', true, 'full');
  const page = radio('psel', '&Current Page', false, 'page');
  const selr = radio('psel', '&Selected Text', false, 'sel');
  selr.input.disabled = !hasSel;
  if (hasSel) { selr.input.checked = true; }
  const copies = textField('1', { style: 'width:40px', disabled: true });
  const out = h('div', { class: 'static' }, app.client ? `c:\\documents\\${docBase(app)}.pdf` : `${docBase(app)}.pdf`);
  const body = h('div', { class: 'printdlg' },
    h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Current Printer:'), h('b', {}, 'Hard Return PDF')),
    h('div', { class: 'row2' },
      group('Print Selection', full, page, selr),
      group('Copies', h('div', { class: 'row' }, label('&Number of Copies:', copies), copies))),
    group('Document Settings', h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Output File:'), out),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Print Quality:'), h('span', {}, 'High'))));
  return dialog(app, {
    title: 'Print', body,
    buttons: [
      { text: '&Print', id: 'print', isDefault: true }, { text: 'Close', id: 'close', cancel: true },
      { text: '&Initialize', id: 'init', disabled: true }, { text: '&Options...', id: 'opt', disabled: true },
      { text: 'Help', id: 'help', disabled: true },
    ],
    onButton: async (id) => {
      if (id !== 'print') return true;
      const which = full.input.checked ? 'full' : page.input.checked ? 'page' : 'sel';
      await printPdf(app, which);
      return true;
    },
  });
}

export async function printPdf(app, which = 'full') {
  const ed = app.ed;
  let res;
  if (which === 'sel' && app.hasSelection) {
    const [a, b] = ed.blockRange();
    const st = stateAt(ed.items, a, app.layoutDefaults());
    res = layout([code.font(st.font), ...ed.slice(a, b)], { measure: printMeasure, defaults: app.layoutDefaults() });
  } else {
    res = app.layout();
    if (which === 'page') {
      const line = lineAt(res, ed.cursor);
      res = { ...res, pages: [res.pages[line.page]] };
    }
  }
  const base = docBase(app);
  const pdf = makePdf(res, { title: app.docTitle() });
  app.lastPdf = pdf;
  if (app.client) {
    const path = `/Documents/${base}.pdf`;
    await app.store.write(path, pdf, 'application/pdf');
    app.statusNote(`Printed to ${app.displayPath(path)}`);
    setTimeout(() => app.statusNote(null), 4000);
    return;
  }
  const blob = new Blob([bytes(pdf)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${base}.pdf` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  app.statusNote(`Printed to ${base}.pdf`);
  setTimeout(() => app.statusNote(null), 4000);
}

// ---- document info, go to -------------------------------------------------------------

export function docInfo(app) {
  const ed = app.ed;
  const res = app.layout();
  const text = textOf(ed.items);
  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length;
  const rows = [
    ['Characters:', [...text.replace(/\s/g, '')].length], ['Words:', ed.wordCount()],
    ['Lines:', res.lines.length], ['Sentences:', sentences], ['Paragraphs:', (text.match(/\n/g) || []).length + (text ? 1 : 0)],
    ['Pages:', res.pages.length],
  ];
  const body = h('div', { class: 'info' }, ...rows.map(([k, v]) => h('div', { class: 'row' }, h('span', { class: 'lbl' }, k), h('span', { class: 'num' }, String(v)))));
  return dialog(app, { title: 'Document Information', body, buttons: [{ text: 'OK', id: 'ok', isDefault: true, cancel: true }] });
}

export function goTo(app) {
  const res = app.layout();
  const field = textField(String(app.cursorInfo().page), { style: 'width:50px' });
  const body = h('div', { class: 'goto' },
    h('div', { class: 'row' }, label('&Page Number:', field), field, h('span', { class: 'lbl' }, `of ${res.pages.length}`)));
  return dialog(app, {
    title: 'Go To', body,
    buttons: [{ text: 'OK', id: 'ok', isDefault: true }, { text: 'Cancel', id: 'cancel', cancel: true }],
    onButton: (id) => {
      if (id !== 'ok') return true;
      const n = parseInt(field.value, 10);
      const p = res.pages[Math.max(1, Math.min(res.pages.length, n || 1)) - 1];
      app.clearSelection();
      app.ed.setCursor(p.lines[0].start);
      app.update({ scroll: true });
      return true;
    },
  });
}

// ---- zoom ---------------------------------------------------------------------------

const ZOOMS = [[50, '&50%'], [75, '&75%'], [100, '&100%'], [150, '15&0%'], [200, '&200%'], ['margin', '&Margin Width'], ['page', 'Pa&ge Width'], ['full', '&Full Page']];

export function zoomDialog(app) {
  const cur = app.prefs.zoom;
  const known = ZOOMS.some(([v]) => v === cur);
  const radios = ZOOMS.map(([v, t]) => radio('zoom', t, v === cur, String(v)));
  const other = radio('zoom', '&Other:', !known, 'other');
  const pct = textField(typeof cur === 'number' ? String(cur) : '100', { style: 'width:44px' });
  pct.addEventListener('focus', () => { other.input.checked = true; });
  const body = h('div', { class: 'zoomdlg' }, group('Zoom', ...radios, h('div', { class: 'row' }, other, pct, h('span', {}, '%'))));
  return dialog(app, {
    title: 'Zoom', body,
    buttons: [{ text: 'OK', id: 'ok', isDefault: true }, { text: 'Cancel', id: 'cancel', cancel: true }, { text: 'Help', id: 'help', disabled: true }],
    onButton: (id) => {
      if (id !== 'ok') return true;
      const r = [...radios, other].find((x) => x.input.checked);
      let v = r.input.value;
      if (v === 'other') v = Math.max(25, Math.min(400, parseInt(pct.value, 10) || 100));
      else if (/^\d+$/.test(v)) v = +v;
      app.prefs.zoom = v;
      app.savePrefs();
      app.update({ scroll: true });
      return true;
    },
  });
}

// ---- font -------------------------------------------------------------------------------

export const FACES = ['Times New Roman', 'Arial', 'Courier New'];
export const SIZES = [6, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const LOOKS = [['&Bold', 'BOLD'], ['&Underline', 'UND'], ['&Double Underline', 'DBL UND'], ['&Italic', 'ITALC'], ['&Outline', 'OUTLN'],
  ['Shado&w', 'SHADW'], ['Small &Cap', 'SM CAP'], ['&Redline', 'REDLN'], ['Stri&keout', 'STKOUT']];
const POSITIONS = [['Normal', null], ['Superscript', 'SUPRSCPT'], ['Subscript', 'SUBSCPT']];
const REL = [['Normal', null], ['Fine', 'FINE'], ['Small', 'SMALL'], ['Large', 'LARGE'], ['Very Large', 'VRY LARGE'], ['Extra Large', 'EXT LARGE']];

export function fontDialog(app) {
  const info = app.cursorInfo();
  const ed = app.ed;
  const attrs = app.hasSelection ? ed.attrs(ed.blockRange()[0]) : info.attrs;
  const faces = FACES.includes(info.face) ? FACES : [...FACES, info.face].sort();
  const faceList = listBox(faces, { rows: 7, selected: Math.max(0, faces.indexOf(info.face)), onSelect: () => preview() });
  const sizeField = textField(String(+info.size.toFixed(1)), { style: 'width:100%' });
  const sizeList = listBox(SIZES.map(String), { rows: 6, selected: Math.max(0, SIZES.indexOf(Math.round(info.size))), onSelect: (v) => { sizeField.value = v; preview(); } });
  sizeField.addEventListener('input', () => { sizeList.selectValue(sizeField.value.trim(), { silent: true }); preview(); });
  const looks = LOOKS.map(([t, a]) => { const c = check(t, attrs.includes(a)); c.input.addEventListener('change', () => preview()); c.attr = a; return c; });
  const posSel = h('select', { class: 'combo' }, ...POSITIONS.map(([t, a]) => h('option', { value: a || '', selected: !!a && attrs.includes(a) }, t)));
  const relSel = h('select', { class: 'combo' }, ...REL.map(([t, a]) => h('option', { value: a || '', selected: !!a && attrs.includes(a) }, t)));
  posSel.addEventListener('change', () => preview());
  relSel.addEventListener('change', () => preview());
  const sample = h('div', { class: 'sample' }, 'The quick brown fox jumps over the lazy dog');
  const result = h('div', { class: 'resulting' });
  const preview = () => {
    const face = faceList.value;
    const size = parseFloat(sizeField.value) || info.size;
    const on = new Set(looks.filter((c) => c.input.checked).map((c) => c.attr));
    let px = (size / 72) * 96;
    const rel = { FINE: 0.6, SMALL: 0.8, LARGE: 1.2, 'VRY LARGE': 1.5, 'EXT LARGE': 2 }[relSel.value] || 1;
    px *= rel;
    if (posSel.value) px *= 0.6;
    const deco = [on.has('UND') || on.has('DBL UND') ? 'underline' : '', on.has('STKOUT') ? 'line-through' : ''].filter(Boolean).join(' ');
    sample.style.cssText = `font-family:${CSS_FAMILY[familyOf(face)]};font-size:${Math.min(40, px).toFixed(1)}px;` +
      `font-weight:${on.has('BOLD') ? 'bold' : 'normal'};font-style:${on.has('ITALC') ? 'italic' : 'normal'};` +
      `text-decoration:${deco || 'none'};${on.has('DBL UND') ? 'text-decoration-style:double;' : ''}` +
      `color:${on.has('REDLN') ? '#c00000' : '#000'};font-variant:${on.has('SM CAP') ? 'small-caps' : 'normal'};` +
      `${on.has('OUTLN') ? '-webkit-text-stroke:1px #000;color:#fff;' : ''}${on.has('SHADW') ? 'text-shadow:2px 2px #909090;' : ''}` +
      `vertical-align:${posSel.value === 'SUPRSCPT' ? 'super' : posSel.value === 'SUBSCPT' ? 'sub' : 'baseline'}`;
    const style = on.has('BOLD') && on.has('ITALC') ? 'Bold Italic' : on.has('BOLD') ? 'Bold' : on.has('ITALC') ? 'Italic' : 'Regular';
    result.textContent = `Resulting Font: ${face} ${style} ${+size.toFixed(1)}pt`;
  };
  const body = h('div', { class: 'fontdlg' },
    h('div', { class: 'row top' },
      h('div', { class: 'col face' }, label('Font &Face:', faceList.el), faceList.el),
      h('div', { class: 'col size' }, label('Font &Size:', sizeField), sizeField, sizeList.el),
      group('Appearance', h('div', { class: 'grid2' }, ...looks))),
    h('div', { class: 'row' },
      group('Size', h('div', { class: 'row' }, label('&Position:', posSel), posSel), h('div', { class: 'row' }, label('Relative Si&ze:', relSel), relSel)),
      group('Resulting Font', h('div', { class: 'samplebox' }, sample))),
    result);
  preview();
  return dialog(app, {
    title: 'Font', body, cls: 'wide',
    buttons: [{ text: 'OK', id: 'ok', isDefault: true }, { text: 'Cancel', id: 'cancel', cancel: true },
      { text: 'Font &Map...', id: 'map', disabled: true }, { text: '&Initial Font...', id: 'init', disabled: true }, { text: 'Help', id: 'help', disabled: true }],
    focus: faceList.el,
    onButton: (id) => {
      if (id !== 'ok') return true;
      const face = faceList.value;
      const size = Math.max(1, Math.min(250, parseFloat(sizeField.value) || info.size));
      app.edit(() => {
        if (face !== info.face || Math.abs(size - info.size) > 1e-6) app.setFont(face, size);
        const want = new Set(looks.filter((c) => c.input.checked).map((c) => c.attr));
        if (posSel.value) want.add(posSel.value);
        if (relSel.value) want.add(relSel.value);
        const all = [...LOOKS.map((x) => x[1]), 'SUPRSCPT', 'SUBSCPT', 'FINE', 'SMALL', 'LARGE', 'VRY LARGE', 'EXT LARGE'];
        for (const a of all) if (want.has(a) !== attrs.includes(a)) app.toggleAttr(a);
      });
      return true;
    },
  });
}

// ---- margins, spacing ----------------------------------------------------------------------

function parseInches(s) {
  const v = parseFloat(String(s).replace(/["in]+$/i, ''));
  return Number.isFinite(v) ? v : null;
}

export function marginsDialog(app) {
  const ed = app.ed;
  const st = stateAt(ed.items, ed.cursor, app.layoutDefaults());
  const res = app.layout();
  const page = res.pages[lineAt(res, ed.cursor).page];
  const f = {
    l: textField(inches(st.lMar), { style: 'width:56px' }), r: textField(inches(st.rMar), { style: 'width:56px' }),
    t: textField(inches(page.tMar), { style: 'width:56px' }), b: textField(inches(page.bMar), { style: 'width:56px' }),
  };
  const cv = h('canvas', { width: '80', height: '100', class: 'thumb' });
  const draw = () => {
    const c = cv.getContext('2d');
    const s = 100 / 11;
    c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, 80, 100);
    c.fillStyle = '#000'; c.fillRect(8 + 3, 3, 8.5 * s, 11 * s - 3);
    c.fillStyle = '#fff'; c.fillRect(8, 0, 8.5 * s - 1, 11 * s - 4);
    const v = (k, d) => parseInches(f[k].value) ?? d;
    const L = v('l', st.lMar), R = v('r', st.rMar), T = v('t', page.tMar), B = v('b', page.bMar);
    c.fillStyle = '#808080';
    for (let y = T * s; y < (11 - B) * s - 4; y += 3) c.fillRect(8 + L * s, y, Math.max(0, (8.5 - L - R) * s), 1);
  };
  Object.values(f).forEach((x) => x.addEventListener('input', draw));
  draw();
  const row = (t, k) => h('div', { class: 'row' }, label(t, f[k], { class: 'lbl w' }), f[k]);
  const body = h('div', { class: 'margins' },
    group('Margins', row('&Left:', 'l'), row('&Right:', 'r'), row('&Top:', 't'), row('&Bottom:', 'b')), cv);
  return dialog(app, {
    title: 'Margins', body,
    buttons: [{ text: 'OK', id: 'ok', isDefault: true }, { text: 'Cancel', id: 'cancel', cancel: true }, { text: 'Help', id: 'help', disabled: true }],
    onButton: async (id) => {
      if (id !== 'ok') return true;
      const v = Object.fromEntries(Object.entries(f).map(([k, x]) => [k, parseInches(x.value)]));
      if (Object.values(v).some((x) => x === null || x < 0) || v.l + v.r > st.pageW - 0.5 || v.t + v.b > st.pageH - 0.5) {
        await error(app, 'Invalid margin setting.');
        return false;
      }
      app.edit(() => {
        if (Math.abs(v.l - st.lMar) > 1e-9) app.setMargin('l', v.l);
        if (Math.abs(v.r - st.rMar) > 1e-9) app.setMargin('r', v.r);
        if (Math.abs(v.t - page.tMar) > 1e-9 || Math.abs(v.b - page.bMar) > 1e-9) {
          app.ed.endBlock();
          app.ed.insertFormatCode(code.tbMar(v.t, v.b), page.lines[0].start);
        }
      });
      return true;
    },
  });
}

export function spacingDialog(app) {
  const cur = app.cursorInfo().spacing;
  const field = textField(String(cur), { style: 'width:50px' });
  const bump = (d) => { field.value = String(Math.max(0.5, Math.round(((parseFloat(field.value) || 1) + d) * 10) / 10)); };
  const spin = h('span', { class: 'spin' },
    h('button', { type: 'button', tabindex: '-1', onclick: () => bump(0.1) }, '▲'),
    h('button', { type: 'button', tabindex: '-1', onclick: () => bump(-0.1) }, '▼'));
  field.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); bump(0.1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); bump(-0.1); }
  });
  const body = h('div', { class: 'spacing' }, h('div', { class: 'row' }, label('&Spacing:', field), field, spin));
  return dialog(app, {
    title: 'Line Spacing', body,
    buttons: [{ text: 'OK', id: 'ok', isDefault: true }, { text: 'Cancel', id: 'cancel', cancel: true }, { text: 'Help', id: 'help', disabled: true }],
    onButton: (id) => {
      if (id !== 'ok') return true;
      const v = Math.max(0.5, Math.min(10, parseFloat(field.value) || 1));
      if (v !== cur) app.setSpacing(v);
      return true;
    },
  });
}

// ---- find and replace -------------------------------------------------------------------------

export function findNext(app, backward = false) {
  const ed = app.ed;
  const q = app.lastFind.find;
  if (!q) return COMMANDS_FIND(app);
  const [a, b] = ed.blockOn ? ed.blockRange() : [ed.cursor, ed.cursor];
  const m = ed.find(q, backward ? a : b, backward);
  if (!m) { info(app, `"${q}" not found.`); return false; }
  app.selectRange(m.start, m.end);
  return true;
}

const COMMANDS_FIND = (app) => findReplace(app, { replace: false });

export function findReplace(app, { replace = false, backward = false } = {}) {
  const ed = app.ed;
  const lf = app.lastFind;
  const initial = app.hasSelection ? ed.text(...ed.blockRange()).split('\n')[0] : lf.find;
  const findF = textField(initial, { style: 'width:220px' });
  const replF = textField(lf.replace, { style: 'width:220px' });
  const dir = h('select', { class: 'combo' }, h('option', { value: 'f' }, 'Forward'), h('option', { value: 'b', selected: backward || lf.backward }, 'Backward'));
  const rows = [h('div', { class: 'row' }, label('&Find:', findF, { class: 'lbl w' }), findF)];
  if (replace) rows.push(h('div', { class: 'row' }, label('Replace &With:', replF, { class: 'lbl w' }), replF));
  rows.push(h('div', { class: 'row' }, label('&Direction:', dir, { class: 'lbl w' }), dir));
  const status = h('div', { class: 'note' }, '');
  const body = h('div', { class: 'finddlg' }, ...rows, status);
  const sync = () => { lf.find = findF.value; lf.replace = replF.value; lf.backward = dir.value === 'b'; };
  const go = () => {
    sync();
    if (!lf.find) return false;
    const [a, b] = ed.blockOn ? ed.blockRange() : [ed.cursor, ed.cursor];
    const m = ed.find(lf.find, lf.backward ? a : b, lf.backward);
    if (!m) { status.textContent = `"${lf.find}" not found.`; return false; }
    status.textContent = '';
    app.selectRange(m.start, m.end);
    return true;
  };
  const r = app.view?.scroller.getBoundingClientRect();
  return dialog(app, {
    title: replace ? 'Find and Replace Text' : 'Find Text', body,
    at: r ? { x: r.right - 380, y: r.top + 8 } : undefined,
    buttons: replace
      ? [{ text: '&Find', id: 'find', isDefault: true }, { text: '&Replace', id: 'replace' }, { text: 'Replace &All', id: 'all' }, { text: 'Close', id: 'close', cancel: true }]
      : [{ text: '&Find Next', id: 'find', isDefault: true }, { text: 'Find &Prev', id: 'prev' }, { text: 'Close', id: 'close', cancel: true }],
    onButton: (id) => {
      sync();
      if (id === 'close') return true;
      if (id === 'find') { go(); return false; }
      if (id === 'prev') { dir.value = 'b'; go(); dir.value = 'f'; sync(); return false; }
      if (id === 'replace') {
        if (app.hasSelection) {
          const [a, b] = ed.blockRange();
          const m = ed.find(lf.find, a, false);
          if (m && m.start === a && m.end === b) {
            app.edit(() => { ed.endBlock(); ed.replaceMatch(m, lf.replace); });
          }
        }
        go();
        return false;
      }
      if (id === 'all') {
        if (!lf.find) return false;
        let n = 0;
        app.edit(() => {
          ed.endBlock();
          let at = 0;
          for (;;) {
            const m = ed.find(lf.find, at, false);
            if (!m) break;
            at = ed.replaceMatch(m, lf.replace);
            n++;
          }
        });
        status.textContent = `${n} occurrence${n === 1 ? '' : 's'} replaced.`;
        return false;
      }
      return true;
    },
  });
}

// ---- undelete ----------------------------------------------------------------------------------

export function undelete(app) {
  const ed = app.ed;
  if (!ed.deletions.length) return;
  ed.endBlock();
  const hist = app.doc.hist;
  hist.before();
  let k = 0;
  let range = null;
  const show = () => {
    if (range) { ed.deleteRange(range[0], range[1], { record: false }); ed.setCursor(range[0]); }
    range = ed.restore(k);
    app.highlight = range;
    app.update({ scroll: true });
  };
  show();
  const r = app.view?.scroller.getBoundingClientRect();
  return dialog(app, {
    title: 'Undelete', body: h('div', { class: 'note' }, 'Restore the highlighted text?'),
    at: r ? { x: r.right - 330, y: r.top + 8 } : undefined,
    buttons: [{ text: '&Restore', id: 'restore', isDefault: true }, { text: '&Next', id: 'next' }, { text: '&Previous', id: 'prev' }, { text: 'Cancel', id: 'cancel', cancel: true }],
    onButton: (id) => {
      const n = ed.deletions.length;
      if (id === 'next' || id === 'prev') { k = (k + (id === 'next' ? 1 : n - 1)) % n; show(); return false; }
      app.highlight = null;
      if (id === 'restore') { ed.setCursor(range[1]); hist.after(); } else {
        ed.deleteRange(range[0], range[1], { record: false });
        ed.setCursor(range[0]);
        hist.drop();
      }
      app.update();
      return true;
    },
  });
}

// ---- speller ------------------------------------------------------------------------------------

const SUP_KEY = 'hardreturn:supplement';

function getSpeller(app) {
  if (!app._speller) {
    let extra = [];
    try { extra = JSON.parse(localStorage.getItem(SUP_KEY) || '[]'); } catch { /* none */ }
    app._speller = new Speller(WORDS, extra);
    app._spellExtra = extra;
  }
  return app._speller;
}

function nextWord(items, i) {
  const end = items.length;
  while (i < end && !isWordChar(items[i])) i++;
  if (i >= end) return null;
  let j = i;
  while (j < end && isWordChar(items[j])) j++;
  let a = i, b = j;
  while (a < b && /['’-]/.test(items[a])) a++;
  while (b > a && /['’-]/.test(items[b - 1])) b--;
  return { a, b, next: j };
}

export function speller(app) {
  const ed = app.ed;
  const sp = getSpeller(app);
  const skip = app._spellSkip || (app._spellSkip = new Set());
  let at = 0;
  let cur = null;
  const word = h('b', { class: 'notfound' }, '');
  const repl = textField('', { style: 'width:100%' });
  const sugg = listBox([], { rows: 7, onSelect: (v) => { repl.value = v; }, onActivate: () => dlgRef.press('replace') });
  const status = h('div', { class: 'note' }, '');
  let dlgRef;
  const findNextBad = () => {
    for (;;) {
      const w = nextWord(ed.items, at);
      if (!w) { cur = null; return false; }
      at = w.next;
      if (w.b <= w.a) continue;
      const text = ed.items.slice(w.a, w.b).join('');
      if (skip.has(text.toLowerCase()) || sp.check(text)) continue;
      cur = { ...w, text };
      return true;
    }
  };
  const showCur = () => {
    if (!findNextBad()) {
      word.textContent = '';
      repl.value = '';
      sugg.set([]);
      status.textContent = 'Spell check completed.';
      app.clearSelection();
      app.update();
      for (const id of ['replace', 'skip', 'always', 'add']) dlgRef.buttons[id].disabled = true;
      dlgRef.buttons.close.focus();
      return;
    }
    word.textContent = cur.text;
    const s = sp.suggest(cur.text, 12);
    sugg.set(s.length ? s : ['(no suggestions)'], 0);
    repl.value = s[0] || cur.text;
    app.selectRange(cur.a, cur.b);
  };
  const body = h('div', { class: 'spelldlg' },
    h('div', { class: 'row' }, h('span', { class: 'lbl w' }, 'Not Found:'), word),
    h('div', { class: 'row' }, label('Replace &With:', repl, { class: 'lbl w' }), repl),
    h('div', { class: 'row top' }, label('Suggestion&s:', sugg.el, { class: 'lbl w' }), sugg.el),
    h('div', { class: 'row' }, h('span', { class: 'lbl w' }, 'Check:'), h('span', {}, 'Document')),
    status);
  const r = app.view?.scroller.getBoundingClientRect();
  return dialog(app, {
    title: 'Speller - ' + app.docTitle(), body,
    at: r ? { x: r.right - 440, y: r.bottom - 300 } : undefined,
    buttons: [{ text: '&Replace', id: 'replace', isDefault: true }, { text: 'Skip &Once', id: 'skip' }, { text: 'Skip &Always', id: 'always' },
      { text: 'A&dd', id: 'add' }, { text: 'Close', id: 'close', cancel: true }],
    init: (dlg) => { dlgRef = dlg; showCur(); },
    onButton: (id) => {
      if (id === 'close') { app.clearSelection(); app.update(); return true; }
      if (!cur) return false;
      if (id === 'replace') {
        const w = repl.value;
        app.edit(() => { ed.endBlock(); ed.replaceWord(cur.a, cur.b, w); });
        at = cur.a + [...w].length;
      } else if (id === 'always') skip.add(cur.text.toLowerCase());
      else if (id === 'add') {
        sp.add(cur.text);
        app._spellExtra.push(cur.text.toLowerCase());
        try { localStorage.setItem(SUP_KEY, JSON.stringify(app._spellExtra)); } catch { /* private mode */ }
      }
      showCur();
      return false;
    },
  });
}

// ---- preferences, help, about -------------------------------------------------------------------

const KEYBOARD_NAMES = [['cua', 'Common User Access (CUA)'], ['wpdos', 'WPDOS Compatible']];

export function keyboardDialog(app) {
  const lb = listBox(KEYBOARD_NAMES.map(([v, t]) => ({ text: t, value: v })), {
    rows: 4, selected: Math.max(0, KEYBOARD_NAMES.findIndex(([v]) => v === app.prefs.keyboard)), onActivate: () => dlgRef.press('select'),
  });
  let dlgRef;
  const body = h('div', { class: 'kbd' }, label('&Keyboards:', lb.el), lb.el, h('div', { class: 'note' }, `Current: ${KEYBOARD_NAMES.find(([v]) => v === app.prefs.keyboard)?.[1]}`));
  return dialog(app, {
    title: 'Keyboard Preferences', body,
    buttons: [{ text: '&Select', id: 'select', isDefault: true }, { text: 'Close', id: 'close', cancel: true }, { text: 'Help', id: 'help', disabled: true }],
    init: (d) => { dlgRef = d; },
    onButton: (id) => {
      if (id === 'select') {
        app.prefs.keyboard = lb.value;
        app.savePrefs();
        app.parts.menu?.render();
      }
      return true;
    },
  });
}

const CMD_NAMES = {
  undo: 'Undo', undelete: 'Undelete', cut: 'Cut', copy: 'Copy', paste: 'Paste', save: 'Save', open: 'Open', new: 'New',
  print: 'Print', bold: 'Bold', italic: 'Italic', underline: 'Underline', justCenter: 'Justify Center', justLeft: 'Justify Left',
  justRight: 'Justify Right', justFull: 'Justify Full', pageBreak: 'Page Break', goTo: 'Go To', dateText: 'Date Text',
  dateCode: 'Date Code', reveal: 'Reveal Codes', rulerBar: 'Ruler Bar', speller: 'Speller', help: 'Help', find: 'Find',
  findNext: 'Find Next', findBackward: 'Find Backward', replace: 'Replace', saveAs: 'Save As', close: 'Close', exit: 'Exit',
  indent: 'Indent', center: 'Center', flushRight: 'Flush Right', doubleIndent: 'Double Indent', select: 'Select',
  margins: 'Margins', font: 'Font', menu: 'Menu Bar', cancel: 'Cancel', nextWindow: 'Next Window',
  deleteToLineEnd: 'Delete to End of Line', deleteWord: 'Delete Word', notBuilt: '(not available)',
};

export function keysHelp(app) {
  const map = app.keymap;
  const rows = Object.entries(map)
    .filter(([, c]) => c !== 'notBuilt')
    .sort((a, b) => (CMD_NAMES[a[1]] || a[1]).localeCompare(CMD_NAMES[b[1]] || b[1]))
    .map(([k, c]) => ({ text: `${(CMD_NAMES[c] || c).padEnd(24, ' ')}${keyLabel(k)}`, value: c }));
  const lb = listBox(rows, { rows: 16, cls: 'mono' });
  const name = KEYBOARD_NAMES.find(([v]) => v === app.prefs.keyboard)?.[1];
  const body = h('div', { class: 'keyshelp' }, h('div', { class: 'note' }, `Keyboard: ${name}`), lb.el);
  return dialog(app, { title: 'Hard Return Help - Keystrokes', body, buttons: [{ text: 'OK', id: 'ok', isDefault: true, cancel: true }] });
}

export function about(app) {
  const body = h('div', { class: 'about' },
    h('div', { class: 'logo', html: icon('app') }),
    h('div', {},
      h('div', { class: 'big' }, 'Hard Return'),
      h('div', {}, 'for Windows'),
      h('div', {}, 'Release 1.0'),
      h('hr'),
      h('div', {}, `Keyboard: ${KEYBOARD_NAMES.find(([v]) => v === app.prefs.keyboard)?.[1]}`),
      h('div', {}, `Documents: ${app.displayPath(app.store.home)}`),
      h('div', {}, `Printer: Hard Return PDF`)));
  return dialog(app, { title: 'About Hard Return', body, buttons: [{ text: 'OK', id: 'ok', isDefault: true, cancel: true }] });
}

