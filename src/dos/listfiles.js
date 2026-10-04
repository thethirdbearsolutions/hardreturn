// List Files (F5).

import { App } from './app.js';
import { parse } from '../core/format.js';
import { layout } from '../core/layout.js';
import { textMode } from '../core/measure.js';
import { COLS } from './screen.js';

const P = App.prototype;
const NA = 'Not available in this version';
const commas = (n) => Math.max(0, Math.round(n)).toLocaleString('en-US');

export function dosStamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const h = d.getHours() % 12 || 12;
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getFullYear() % 100)} ${p(h)}:${p(d.getMinutes())}${d.getHours() < 12 ? 'a' : 'p'}`;
}

function entryText(e) {
  const name = e.name.toUpperCase();
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : '';
  const nm = base.length <= 8 && ext.length <= 3 ? `${base.padEnd(8)}.${ext.padEnd(3)}` : name.slice(0, 12).padEnd(12);
  return `${nm} ${commas(e.size).padStart(8)} ${dosStamp(e.mtime)}`;
}

P.dirDisplay = function (dir) { return this.client ? this.displayName(dir).replace(/\\?$/, '\\') : dir; };

P.dirFromDisplay = function (s) {
  s = s.trim().replace(/\*\.\*$/, '');
  if (!s) return this.cwd;
  if (this.client) {
    const TOP = { DOCUMENTS: 'Documents', LEVELS: 'Levels', PROGRAMS: 'Programs' };
    if (/^[a-z]:\\/i.test(s)) {
      const parts = s.slice(3).split('\\').filter(Boolean);
      return '/' + [TOP[parts[0]?.toUpperCase()] || parts[0] || '', ...parts.slice(1)].join('/') + '/';
    }
    return s.endsWith('/') ? s : s + '/';
  }
  s = s.toUpperCase();
  return s.endsWith('\\') ? s : s + '\\';
};

P.listFiles = function () {
  return this.run(async () => {
    const v = await this.input('Dir ', this.dirDisplay(this.cwd) + '*.*', {
      onKey: (k, f, done) => { if (k === '=' && f.fresh) { done('='); return true; } return false; },
    });
    if (v === null) return;
    if (v === '=') {
      const d = await this.input('New directory = ', this.dirDisplay(this.cwd));
      if (d) this.cwd = this.dirFromDisplay(d);
      return;
    }
    await this.listScreen(this.dirFromDisplay(v));
  });
};

P.listScreen = async function (dir) {
  let entries = [];
  let sel = 2;
  let note = '';
  const load = async () => {
    try { entries = await this.store.list(dir); } catch (e) { entries = []; note = `ERROR: ${e.message}`; }
  };
  await load();
  const all = () => [{ name: '.', dot: 'Current' }, { name: '..', dot: 'Parent' }, ...entries];
  const used = () => entries.reduce((s, e) => s + (e.size || 0), 0);
  const free = () => (this.client ? 0 : 5 * 1024 * 1024 - used());
  sel = Math.min(sel, all().length - 1);
  const ROWS0 = 3, NROWS = 19;
  let first = 0;

  const drawList = (scr) => {
    const list = all();
    scr.put(0, 1, dosStamp(Date.now()));
    scr.put(0, 34, `Directory ${this.dirDisplay(dir)}*.*`);
    const cur = this.doc.ed.length;
    scr.put(1, 1, `Document size: ${commas(cur).padStart(9)}   Free: ${commas(free()).padStart(10)}   Used: ${commas(used()).padStart(9)}    Files: ${String(entries.length).padStart(5)}`);
    scr.put(2, 0, '─'.repeat(COLS));
    const rowOf = (k) => Math.floor(k / 2);
    if (rowOf(sel) < first) first = rowOf(sel);
    if (rowOf(sel) >= first + NROWS) first = rowOf(sel) - NROWS + 1;
    list.forEach((e, k) => {
      const r = rowOf(k) - first;
      if (r < 0 || r >= NROWS) return;
      const col = (k % 2) * 40 + 1;
      const text = e.dot ? `${e.name.padEnd(4)}${e.dot.padEnd(9)}   <Dir>` : entryText(e);
      scr.put(ROWS0 + r, col, text.padEnd(38), k === sel ? 'hl' : '');
    });
    for (let r = 0; r < NROWS; r++) scr.put(ROWS0 + r, 40, '│');
    if (note) scr.put(22, 0, note);
    scr.puts(23, 0, ['1 ', ['R', 'mn'], 'etrieve; 2 ', ['D', 'mn'], 'elete; 3 ', ['M', 'mn'], 'ove/Rename; 4 ', ['P', 'mn'], 'rint; 5 ', ['S', 'mn'], 'hort/Long Display;']);
    const c = scr.puts(24, 0, ['6 ', ['L', 'mn'], 'ook; 7 ', ['O', 'mn'], 'ther Directory; 8 ', ['C', 'mn'], 'opy; 9 ', ['F', 'mn'], 'ind; ', ['N', 'mn'], ' Name Search: 6']);
    scr.setCursor(24, c - 1);
  };
  const bg = this.push({ full: true, draw: drawList, key: () => true });
  try {
    for (;;) {
      const action = await new Promise((resolve) => {
        const done = (v) => { this.pop(m); resolve(v); };
        const m = this.push({
          full: true,
          draw: drawList,
          key: (k) => {
            const n = all().length;
            note = '';
            const u = String(k).toUpperCase();
            if (k === 'Up') sel = Math.max(0, sel - 2);
            else if (k === 'Down') sel = Math.min(n - 1, sel + 2);
            else if (k === 'Left') sel = Math.max(0, sel - 1);
            else if (k === 'Right') sel = Math.min(n - 1, sel + 1);
            else if (k === 'PgUp') sel = Math.max(0, sel - NROWS * 2);
            else if (k === 'PgDn') sel = Math.min(n - 1, sel + NROWS * 2);
            else if (k === 'Home') sel = 0;
            else if (k === 'End') sel = n - 1;
            else if (['F7', 'F1', 'Esc', ' ', '0'].includes(k)) done(null);
            else if (k === 'Enter') done('6');
            else {
              const map = { R: '1', D: '2', M: '3', P: '4', S: '5', L: '6', O: '7', C: '8', F: '9', N: 'N' };
              if (/^[1-9]$/.test(u)) done(u);
              else if (map[u]) done(map[u]);
            }
            return true;
          },
        });
      });
      if (action === null) return;
      const e = all()[sel];
      const isFile = e && !e.dot;
      if (action === '7') {
        const d = await this.input('New directory = ', this.dirDisplay(dir));
        if (d) { dir = this.dirFromDisplay(d); await load(); sel = 2; }
        continue;
      }
      if ((action === '6' || action === '1') && e && e.dot) {
        if (e.name === '..') {
          const up = dir.replace(/[\\/][^\\/]*[\\/]$/, this.client ? '/' : '\\');
          if (up && up !== dir) { dir = up; await load(); sel = 2; }
        }
        continue;
      }
      if (!isFile) continue;
      const disp = this.displayName(e.path);
      if (action === '1') {
        let file;
        try { file = await this.store.read(e.path); } catch { note = `ERROR: File not found -- ${disp}`; continue; }
        if (await this.loadFile(file)) return;
      } else if (action === '2') {
        if (!this.store.canDelete) { note = NA; continue; }
        if (await this.ask(`Delete ${disp}? `, 'N')) { await this.store.remove(e.path); await load(); sel = Math.min(sel, all().length - 1); }
      } else if (action === '3') {
        if (!this.store.canDelete) { note = NA; continue; }
        const to = await this.input('New name: ', disp, { row: 24 });
        if (to && to.trim()) { await this.store.rename(e.path, await this.toPath(to, { ext: '' })); await load(); }
      } else if (action === '6') {
        await this.lookScreen(e);
      } else note = NA;
    }
  } finally { this.pop(bg); }
};

P.lookScreen = async function (e) {
  let file;
  try { file = await this.store.read(e.path); } catch { return; }
  let items;
  try { items = parse(file.name || file.path, file.content); } catch { items = []; }
  const res = layout(items, { measure: textMode, justifyFull: false });
  let top = 0;
  await new Promise((resolve) => {
    const m = this.push({
      full: true,
      draw: (scr) => {
        scr.put(0, 1, `File: ${this.displayName(e.path)}`);
        scr.put(0, 50, `Revised: ${dosStamp(e.mtime || file.mtime || Date.now())}`);
        scr.put(1, 0, '─'.repeat(COLS));
        res.lines.slice(top, top + 21).forEach((line, r) => {
          for (const p of line.items) {
            const g = p.ch ?? p.text;
            if (g !== undefined) scr.put(2 + r, Math.round(p.x * 10), g);
          }
        });
        const c = scr.puts(24, 0, ['Look: 1 ', ['N', 'mn'], 'ext; 2 ', ['P', 'mn'], 'rev: 0']);
        scr.setCursor(24, c - 1);
      },
      key: (k) => {
        if (k === 'Down') top = Math.min(Math.max(0, res.lines.length - 1), top + 1);
        else if (k === 'Up') top = Math.max(0, top - 1);
        else if (k === 'PgDn') top = Math.min(Math.max(0, res.lines.length - 1), top + 21);
        else if (k === 'PgUp') top = Math.max(0, top - 21);
        else { this.pop(m); resolve(); }
        return true;
      },
    });
  });
};
