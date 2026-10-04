// Boot the text-mode front end.

import { App } from './app.js';
import './commands.js';
import './print.js';
import './format.js';
import './listfiles.js';
import './help.js';
import './spellui.js';
import './menubar.js';
import { KEYMAP } from './commands.js';
import { keyName } from './keys.js';
import { buildTemplate } from './template.js';
import { connectTerrarium } from '../core/terrarium.js';
import { LocalStore, TerrariumStore } from '../core/files.js';
import { lineAt, indexAtX } from '../core/layout.js';

const BASE_W = 720, BASE_H = 400;

async function boot() {
  const screenEl = document.getElementById('screen');
  const frame = document.getElementById('frame');
  const tplEl = document.getElementById('template');
  const client = await connectTerrarium({ title: 'Hard Return', accepts: ['.hr', '.txt'] });
  document.documentElement.classList.toggle('hosted', !!client);
  const store = client ? new TerrariumStore(client) : new LocalStore();
  const app = new App(screenEl, { store, client });
  app.canvas = document.getElementById('view');
  globalThis.hardreturn = app;

  let scale = 1;
  app.pixelScale = () => scale;
  // Whole-pixel cells keep the grid free of seams at any size.
  const fit = () => {
    const tplH = tplEl.offsetHeight;
    const w = window.innerWidth - 8;
    const h = window.innerHeight - tplH - 12;
    const s = Math.max(0.3, Math.min(w / BASE_W, h / BASE_H));
    const cw = Math.max(4, Math.floor(9 * s));
    const ch = Math.max(7, Math.floor(16 * s));
    scale = cw / 9;
    const root = document.documentElement.style;
    root.setProperty('--cw', `${cw}px`);
    root.setProperty('--ch', `${ch}px`);
    root.setProperty('--fs', `${(ch * 20) / 16}px`);
    frame.style.width = `${cw * 80}px`;
    frame.style.height = `${ch * 25}px`;
    if (client) client.notify('resize', { w: window.innerWidth, h: window.innerHeight });
    app.invalidate();
  };

  const tpl = buildTemplate(tplEl, (k) => { app.press(k); }, (k) => !!KEYMAP[k]);
  tplEl.addEventListener('toggle', fit);
  window.addEventListener('resize', fit);
  fit();

  window.addEventListener('keydown', (e) => {
    app.capsLock = e.getModifierState && e.getModifierState('CapsLock');
    const k = keyName(e);
    if (!k) return;
    if (app.press(k)) e.preventDefault();
  });

  // Click a cell to put the cursor there.
  screenEl.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('span[data-r]');
    if (!cell || app.modes.length) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    const L = app.lay();
    const row = L.rows[app.doc.top + r];
    if (!row || row.kind !== 'line' || r >= (app.reveal ? 11 : 24)) return;
    app.ed.setCursor(indexAtX(L.res, row.line, (c + app.doc.hoff) / 10));
    app.render();
    e.preventDefault();
  });
  // Right click shows the menu bar, as the mouse did.
  screenEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!app.modes.length) app.press('A-=');
  });

  if (client) {
    client.on('open-file', (m) => app.openFromShell(m.file));
    if (client.file) app.openFromShell(client.file);
  }
  app.syncShell();
  app.render();
  window.focus();
  void lineAt;
  void tpl;
}

boot();
