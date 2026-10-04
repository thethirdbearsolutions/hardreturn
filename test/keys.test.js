import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyName, keyLabel } from '../src/dos/keys.js';

const ev = (key, mods = {}, codeName = '') => ({ key, code: codeName, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('function keys carry modifiers in C- A- S- order', () => {
  assert.equal(keyName(ev('F7')), 'F7');
  assert.equal(keyName(ev('F7', { shiftKey: true })), 'S-F7');
  assert.equal(keyName(ev('F4', { ctrlKey: true })), 'C-F4');
  assert.equal(keyName(ev('F3', { altKey: true })), 'A-F3');
});

test('characters type; shift does not prefix them', () => {
  assert.equal(keyName(ev('a')), 'a');
  assert.equal(keyName(ev('A', { shiftKey: true })), 'A');
  assert.equal(keyName(ev(' ')), ' ');
  assert.equal(keyName(ev('é')), 'é');
});

test('named keys', () => {
  assert.equal(keyName(ev('ArrowLeft', { ctrlKey: true })), 'C-Left');
  assert.equal(keyName(ev('ArrowLeft', { shiftKey: true })), 'Left');
  assert.equal(keyName(ev('Delete')), 'Del');
  assert.equal(keyName(ev('Insert')), 'Ins');
  assert.equal(keyName(ev('PageDown', { ctrlKey: true })), 'C-PgDn');
  assert.equal(keyName(ev('Enter', { ctrlKey: true })), 'C-Enter');
  assert.equal(keyName(ev('Tab', { shiftKey: true })), 'S-Tab');
});

test('Alt-= by physical key, whatever the layout types', () => {
  assert.equal(keyName(ev('≠', { altKey: true }, 'Equal')), 'A-=');
});

test('Ctrl letters by physical key; AltGr still types; Cmd is left to the browser', () => {
  assert.equal(keyName(ev('r', { ctrlKey: true }, 'KeyR')), 'C-R');
  assert.equal(keyName(ev('@', { ctrlKey: true, altKey: true }, 'KeyQ')), '@');
  assert.equal(keyName(ev('c', { metaKey: true }, 'KeyC')), null);
  assert.equal(keyName(ev('Dead')), null);
});

test('labels', () => {
  assert.equal(keyLabel('S-F7'), 'Shft-F7');
  assert.equal(keyLabel('C-F4'), 'Ctrl-F4');
  assert.equal(keyLabel('A-='), 'Alt-=');
});
