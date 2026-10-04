// Boot the Windows front end.

import { WinApp } from './app.js';
import { PageView } from './view.js';
import { RevealPane } from './reveal.js';
import { Ruler } from './ruler.js';
import { MenuBar } from './menus.js';
import { Frame, Toolbar, PowerBar, StatusBar, dropOpen, closeDrop } from './bars.js';
import { runCommand } from './commands.js';
import { loadFile } from './boxes.js';
import { keyName } from './keys.js';
import { connectTerrarium } from '../core/terrarium.js';
import { LocalStore, TerrariumStore } from '../core/files.js';

async function boot() {
  const client = await connectTerrarium({ title: 'Hard Return', accepts: ['.hr', '.txt'] });
  document.documentElement.classList.toggle('hosted', !!client);
  const store = client ? new TerrariumStore(client) : new LocalStore();
  const win = document.getElementById('win');
  const app = new WinApp({ store, client, root: document.body });
  globalThis.hardreturn = app;

  const q = (s) => win.querySelector(s);
  const sink = q('.sink');
  app.parts.focus = () => sink.focus({ preventScroll: true });
  app.parts.frame = new Frame(app, win);
  app.parts.menu = new MenuBar(app, q('.menubar'));
  app.parts.toolbar = new Toolbar(app, q('.toolbar'));
  app.parts.power = new PowerBar(app, q('.powerbar'));
  app.parts.status = new StatusBar(app, q('.statusbar'));
  app.parts.bars = { render: () => { app.parts.toolbar.render(); app.parts.power.render(); app.parts.status.render(); } };
  app.view = new PageView(app, q('.docarea'));
  app.parts.ruler = new Ruler(app, q('.ruler'));
  app.parts.reveal = new RevealPane(app, q('.reveal'));
  app.parts.frame.layout();

  // ---- keyboard ----
  let altAlone = false;
  window.addEventListener('keydown', (e) => {
    if (app.modals.length) return; // the dialog has it
    if (e.key === 'Alt') { altAlone = !e.repeat; e.preventDefault(); return; }
    altAlone = false;
    const k = keyName(e);
    if (!k) return;
    if (dropOpen()) { if (k === 'Esc') { closeDrop(); e.preventDefault(); } return; }
    const menu = app.parts.menu;
    if (menu.isOpen) { if (menu.key(k)) e.preventDefault(); return; }
    // Copy, cut and paste: do it here, and also let the browser fire its
    // clipboard events where Ctrl is its clipboard key (not on a Mac)
    if (k === 'C-C' || k === 'C-X') {
      const text = app.hasSelection ? app.ed.text(...app.ed.blockRange()) : '';
      sink.focus({ preventScroll: true });
      sink.value = text || ' ';
      sink.select();
      if (text) runCommand(app, k === 'C-C' ? 'copy' : 'cut');
      return;
    }
    if (k === 'C-V') {
      sink.focus({ preventScroll: true });
      sink.value = '';
      pasted = false;
      setTimeout(() => { if (!pasted) runCommand(app, 'paste'); }, 60);
      return;
    }
    if (/^A-[A-Z]$/.test(k) && menu.openByKey(k.slice(2))) { e.preventDefault(); return; }
    if (k === 'A-Space') { e.preventDefault(); return; }
    const cmd = app.keymap[k];
    if (cmd) {
      e.preventDefault();
      runCommand(app, cmd);
      app.update({ scroll: true });
      return;
    }
    if (app.editorKey(k)) e.preventDefault();
    else if (/^(C-|A-)*F\d+$/.test(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt' || app.modals.length) return;
    if (altAlone) {
      e.preventDefault();
      if (app.parts.menu.isOpen) app.parts.menu.close(); else app.parts.menu.activate();
    }
    altAlone = false;
  });
  let pasted = false;
  sink.addEventListener('copy', (e) => {
    const t = app.copySelection();
    if (t === null) return;
    e.clipboardData.setData('text/plain', t);
    e.preventDefault();
  });
  sink.addEventListener('cut', (e) => {
    const t = app.copySelection();
    if (t === null) return;
    e.clipboardData.setData('text/plain', t);
    e.preventDefault();
    app.edit(() => app._dropSelection());
  });
  sink.addEventListener('paste', (e) => {
    e.preventDefault();
    pasted = true;
    app.pasteText(e.clipboardData.getData('text/plain'));
  });

  // ---- mouse in the document ----
  const scroller = app.view.scroller;
  scroller.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // the scrollbars
    if (e.offsetX > scroller.clientWidth || e.offsetY > scroller.clientHeight) return;
    e.preventDefault();
    app.parts.focus();
    const i = app.view.hit(e.clientX, e.clientY);
    if (e.detail === 2) { app.selectWordAt(i); return; }
    if (e.detail >= 3) { app.selectParagraphAt(i); return; }
    app.selectMode = false;
    app.setCursorFromMouse(i, e.shiftKey);
    if (!e.shiftKey) app.ed.startBlock();
    let lastY = e.clientY, lastX = e.clientX;
    let timer = 0;
    const extend = () => {
      app.ed.setCursor(app.view.hit(lastX, lastY));
      app.update({ scroll: true });
    };
    const move = (ev) => { lastX = ev.clientX; lastY = ev.clientY; extend(); };
    // keep scrolling while the mouse is held past the edge
    timer = setInterval(() => {
      const r = scroller.getBoundingClientRect();
      if (lastY < r.top || lastY > r.bottom) extend();
    }, 60);
    const up = () => {
      clearInterval(timer);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const ed = app.ed;
      if (ed.blockOn && ed.anchor === ed.cursor) ed.endBlock();
      app.update();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  // ---- the Reveal Codes splitter ----
  q('.splitter').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = app.prefs.revealH;
    const area = q('.docarea');
    const max = area.clientHeight + h0 - 40;
    const move = (ev) => {
      app.prefs.revealH = Math.max(40, Math.min(max, h0 - (ev.clientY - y0)));
      app.parts.frame.layout();
      app.update();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      app.savePrefs();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  window.addEventListener('resize', () => app.update());
  document.fonts?.ready.then(() => app.update());
  // keep the keyboard on the document when the frame is clicked
  win.addEventListener('mouseup', () => { if (!app.modals.length && !app.parts.menu.isOpen) setTimeout(() => app.restoreFocus(), 0); });

  if (client) {
    client.on('open-file', (m) => loadFile(app, m.file));
    if (client.file) loadFile(app, client.file);
  }
  app.render({ scroll: true });
  app.restoreFocus();
}

boot();
