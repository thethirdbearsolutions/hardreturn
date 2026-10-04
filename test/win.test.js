import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyName, keyLabel, keyFor, CUA, WPDOS } from '../src/win/keys.js';
import { pill } from '../src/win/codenames.js';
import { COMMANDS } from '../src/win/commands.js';
import { menuDefs } from '../src/win/menus.js';
import { ICONS } from '../src/win/icons.js';
import { code } from '../src/core/codes.js';

const ev = (key, o = {}) => ({ key, code: o.code || '', ctrlKey: !!o.ctrl, altKey: !!o.alt, shiftKey: !!o.shift, metaKey: !!o.meta });

test('win key names keep Shift on every named key', () => {
  assert.equal(keyName(ev('a')), 'a');
  assert.equal(keyName(ev('A', { shift: true })), 'A');
  assert.equal(keyName(ev('ArrowLeft', { shift: true })), 'S-Left');
  assert.equal(keyName(ev('ArrowRight', { ctrl: true, shift: true })), 'C-S-Right');
  assert.equal(keyName(ev('F7', { ctrl: true, shift: true })), 'C-S-F7');
  assert.equal(keyName(ev('b', { ctrl: true, code: 'KeyB' })), 'C-B');
  assert.equal(keyName(ev('∫', { alt: true, code: 'KeyB' })), 'A-B');
  assert.equal(keyName(ev('Z', { ctrl: true, shift: true, code: 'KeyZ' })), 'C-S-Z');
  assert.equal(keyName(ev('@', { ctrl: true, alt: true, code: 'KeyQ' })), '@');
  assert.equal(keyName(ev('c', { meta: true })), null);
});

test('menus show keys the Windows way', () => {
  assert.equal(keyLabel('C-S-F7'), 'Ctrl+Shift+F7');
  assert.equal(keyLabel('A-S-F3'), 'Alt+Shift+F3');
  assert.equal(keyLabel('C-B'), 'Ctrl+B');
  assert.equal(keyLabel('F9'), 'F9');
  assert.equal(keyFor(CUA, 'reveal'), 'A-F3');
  assert.equal(keyFor(WPDOS, 'bold'), 'F6');
  assert.equal(keyFor(WPDOS, 'underline'), 'F8');
  assert.equal(keyFor(CUA, 'bold'), 'C-B');
});

test('both keyboards bind only commands that exist', () => {
  for (const [name, map] of [['CUA', CUA], ['WPDOS', WPDOS]]) {
    for (const [k, c] of Object.entries(map)) assert.ok(COMMANDS[c], `${name} ${k} -> ${c}`);
  }
  // the DOS function keys where they are cheap
  assert.equal(WPDOS.F6, 'bold');
  assert.equal(WPDOS.F8, 'underline');
  assert.equal(WPDOS['S-F7'], 'print');
  assert.equal(WPDOS.F10, 'save');
  assert.equal(CUA.F7, 'indent');
  assert.equal(CUA.F8, 'select');
  assert.equal(CUA['C-F1'], 'speller');
});

test('every menu item names a command that exists, or is grayed', () => {
  const app = { docs: [{}, {}], cur: 0, docTitle: () => 'Document1', switchTo() {} };
  const walk = (items) => {
    for (const it of items) {
      if (it === '-') continue;
      if (it.sub) { walk(it.sub); continue; }
      if (it.cmd) assert.ok(COMMANDS[it.cmd], it.t);
    }
  };
  const defs = menuDefs(app);
  assert.deepEqual(defs.map((m) => m.t.replace('&', '')), ['File', 'Edit', 'View', 'Insert', 'Layout', 'Tools', 'Graphics', 'Table', 'Window', 'Help']);
  for (const m of defs) walk(m.items);
  // access keys are unique on the bar
  const keys = defs.map((m) => m.t[m.t.indexOf('&') + 1].toUpperCase());
  assert.equal(new Set(keys).size, keys.length);
});

test('Reveal Codes pills: partial names, opened up under the cursor', () => {
  assert.deepEqual(pill(code.on('BOLD')), { text: 'Bold', shape: 'on' });
  assert.deepEqual(pill(code.off('BOLD')), { text: 'Bold', shape: 'off' });
  assert.equal(pill(code.lMar(1.5)).text, 'Lft Mar');
  assert.equal(pill(code.lMar(1.5), { full: true }).text, 'Lft Mar: 1.5"');
  assert.equal(pill(code.font('Arial 14pt'), { full: true }).text, 'Font: Arial 14pt');
  assert.equal(pill(code.lrMar(1, 1.25), { full: true }).text, 'Lft/Rgt Mar: 1", 1.25"');
  assert.equal(pill(code.hrt(), { full: true }).text, 'HRt');
  assert.equal(pill(code.indent()).text, 'Hd Left Ind');
});

test('icons are rectangular grids in the palette', () => {
  for (const [name, art] of Object.entries(ICONS)) {
    const rows = art.replace(/^\n/, '').split('\n');
    const w = rows[0].length;
    rows.forEach((r, k) => assert.equal(r.length, w, `${name} row ${k}`));
    assert.ok(/^[.kwglyonbrRctGem\n]+$/.test(art), name);
  }
});
