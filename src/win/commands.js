// Commands by name, for the menus, the Toolbar, the Power Bar and both
// keyboards. Each is { run(app), enabled?(app), checked?(app) }.

import { code, formatDate, isChar } from '../core/codes.js';
import { lineAt } from '../core/layout.js';
import { paragraphStart } from '../core/stream.js';
import * as box from './boxes.js';

const sel = (app) => app.hasSelection;

export const COMMANDS = {
  // File
  new: { run: (app) => { app.newDoc(); } },
  open: { run: (app) => box.openFile(app) },
  close: { run: (app) => box.closeDoc(app) },
  save: { run: (app) => box.save(app) },
  saveAs: { run: (app) => box.saveAs(app) },
  print: { run: (app) => box.printDialog(app) },
  docInfo: { run: (app) => box.docInfo(app) },
  exit: { run: (app) => box.exitApp(app) },

  // Edit
  undo: { run: (app) => { if (app.doc.hist.undo()) app.update({ scroll: true }); }, enabled: (app) => app.doc.hist.canUndo },
  redo: { run: (app) => { if (app.doc.hist.redo()) app.update({ scroll: true }); }, enabled: (app) => app.doc.hist.canRedo },
  undelete: { run: (app) => box.undelete(app), enabled: (app) => app.ed.deletions.length > 0 },
  cut: {
    run: (app) => {
      const text = app.copySelection();
      if (text === null) return;
      writeClipboard(text);
      app.edit(() => app._dropSelection());
    },
    enabled: sel,
  },
  copy: { run: (app) => { const t = app.copySelection(); if (t !== null) writeClipboard(t); }, enabled: sel },
  paste: {
    run: async (app) => {
      let text = null;
      try { text = await navigator.clipboard.readText(); } catch { /* not allowed: use our own */ }
      app.pasteText(text);
    },
  },
  selectSentence: {
    run: (app) => {
      const items = app.ed.items;
      let a = app.ed.cursor, b = a;
      while (a > 0 && !/[.!?]/.test(items[a - 1]) && !(items[a - 1]?.c === 'HRt')) a--;
      while (a < items.length && items[a] === ' ') a++;
      while (b < items.length && !/[.!?]/.test(items[b]) && items[b]?.c !== 'HRt') b++;
      if (b < items.length && isChar(items[b])) b++;
      while (b < items.length && items[b] === ' ') b++;
      app.selectRange(a, b);
    },
  },
  selectParagraph: { run: (app) => app.selectParagraphAt(app.ed.cursor) },
  selectPage: {
    run: (app) => {
      const res = app.layout();
      const p = res.pages[lineAt(res, app.ed.cursor).page];
      app.selectRange(p.lines[0].start, p.lines[p.lines.length - 1].end);
    },
  },
  selectAll: { run: (app) => app.selectRange(0, app.ed.length) },
  select: {
    run: (app) => {
      app.selectMode = !app.selectMode;
      if (app.selectMode && !app.ed.blockOn) app.ed.startBlock();
      if (!app.selectMode) app.ed.endBlock();
      app.update();
    },
    checked: (app) => app.selectMode,
  },
  cancel: {
    run: (app) => {
      if (app.ed.blockOn) { app.clearSelection(); app.update(); } else box.undelete(app);
    },
  },
  find: { run: (app) => box.findReplace(app, { replace: false }) },
  findBackward: { run: (app) => box.findReplace(app, { replace: false, backward: true }) },
  replace: { run: (app) => box.findReplace(app, { replace: true }) },
  findNext: { run: (app) => box.findNext(app, app.lastFind.backward) },
  goTo: { run: (app) => box.goTo(app) },
  lowercase: { run: (app) => convertCase(app, 'lower'), enabled: sel },
  uppercase: { run: (app) => convertCase(app, 'upper'), enabled: sel },
  initialCaps: { run: (app) => convertCase(app, 'initial'), enabled: sel },
  deleteToLineEnd: {
    run: (app) => {
      const ed = app.ed;
      const line = lineAt(app.layout(), ed.cursor);
      const end = line.how === 'hard' || line.how === 'hpg' ? line.end - 1 : line.end;
      app.edit(() => ed.deleteRange(ed.cursor, end));
    },
  },
  deleteWord: { run: (app) => app.edit(() => { if (!app._dropSelection()) app.ed.deleteWord(); }) },

  // View
  draft: { run: (app) => setPref(app, 'mode', 'draft'), checked: (app) => app.prefs.mode === 'draft' },
  page: { run: (app) => setPref(app, 'mode', 'page'), checked: (app) => app.prefs.mode === 'page' },
  zoom: { run: (app) => box.zoomDialog(app) },
  zoomFull: { run: (app) => setPref(app, 'zoom', app.prefs.zoom === 'full' ? 100 : 'full'), checked: (app) => app.prefs.zoom === 'full' },
  toolbar: { run: (app) => togglePref(app, 'toolbar'), checked: (app) => app.prefs.toolbar },
  powerBar: { run: (app) => togglePref(app, 'powerbar'), checked: (app) => app.prefs.powerbar },
  rulerBar: { run: (app) => togglePref(app, 'ruler'), checked: (app) => app.prefs.ruler },
  statusBar: { run: (app) => togglePref(app, 'status'), checked: (app) => app.prefs.status },
  guidelines: { run: (app) => togglePref(app, 'guides'), checked: (app) => app.prefs.guides },
  reveal: { run: (app) => { app.reveal = !app.reveal; app.parts.frame?.layout(); app.update({ scroll: true }); }, checked: (app) => app.reveal },

  // Insert
  bullets: {
    run: (app) => app.edit(() => {
      const ed = app.ed;
      ed.endBlock();
      const at = paragraphStart(ed.items, ed.cursor);
      ed.insertItems(['•', code.indent()], at);
    }),
  },
  dateText: { run: (app) => app.insert([...formatDate('3 1, 4')]) },
  dateCode: { run: (app) => app.insert([code.date('3 1, 4')]) },
  pageBreak: { run: (app) => app.insert([code.hpg()]) },

  // Layout
  font: { run: (app) => box.fontDialog(app) },
  margins: { run: (app) => box.marginsDialog(app) },
  lineSpacing: { run: (app) => box.spacingDialog(app) },
  justLeft: { run: (app) => app.setJust('Left'), checked: (app) => app.cursorInfo().just === 'Left' },
  justRight: { run: (app) => app.setJust('Right'), checked: (app) => app.cursorInfo().just === 'Right' },
  justCenter: { run: (app) => app.setJust('Center'), checked: (app) => app.cursorInfo().just === 'Center' },
  justFull: { run: (app) => app.setJust('Full'), checked: (app) => app.cursorInfo().just === 'Full' },
  bold: { run: (app) => app.toggleAttr('BOLD'), checked: (app) => app.ed.attrs().includes('BOLD') },
  italic: { run: (app) => app.toggleAttr('ITALC'), checked: (app) => app.ed.attrs().includes('ITALC') },
  underline: { run: (app) => app.toggleAttr('UND'), checked: (app) => app.ed.attrs().includes('UND') },
  center: { run: (app) => app.insert([code.center()]) },
  flushRight: { run: (app) => app.insert([code.flushRight()]) },
  indent: { run: (app) => app.insert([code.indent()]) },
  doubleIndent: { run: (app) => app.insert([code.lrIndent()]) },

  // Tools
  speller: { run: (app) => box.speller(app) },
  keyboard: { run: (app) => box.keyboardDialog(app) },

  // Window
  nextWindow: { run: (app) => app.switchTo((app.cur + 1) % app.docs.length), enabled: (app) => app.docs.length > 1 },

  // Help
  help: { run: (app) => box.keysHelp(app) },
  about: { run: (app) => box.about(app) },

  menu: { run: (app) => app.parts.menu?.activate() },
  notBuilt: { run: () => {} },
};

function setPref(app, k, v) {
  app.prefs[k] = v;
  app.savePrefs();
  app.parts.frame?.layout();
  app.update({ scroll: true });
}

function togglePref(app, k) { setPref(app, k, !app.prefs[k]); }

function writeClipboard(text) {
  try { navigator.clipboard?.writeText(text).catch(() => {}); } catch { /* not allowed */ }
}

function convertCase(app, mode) {
  const ed = app.ed;
  const [a, b] = ed.blockRange();
  app.edit(() => {
    if (mode === 'initial') {
      let start = true;
      for (let j = a; j < b; j++) {
        const it = ed.items[j];
        if (!isChar(it)) { if (it.c === 'HRt' || it.c === 'Tab') start = true; continue; }
        if (/[\p{L}\p{N}']/u.test(it)) { ed.items[j] = start ? it.toUpperCase() : it.toLowerCase(); start = false; } else start = true;
      }
      ed._changed();
    } else ed.convertCase(a, b, mode);
  });
}

export function isEnabled(app, name) {
  const c = COMMANDS[name];
  if (!c || name === 'notBuilt') return false;
  return c.enabled ? !!c.enabled(app) : true;
}

export function runCommand(app, name) {
  const c = COMMANDS[name];
  if (!c || !isEnabled(app, name)) return false;
  Promise.resolve(c.run(app)).catch((e) => { console.error(e); box.error(app, e.message); });
  return true;
}
