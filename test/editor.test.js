import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '../src/core/editor.js';
import { code } from '../src/core/codes.js';
import { textOf } from '../src/core/stream.js';
import { layout } from '../src/core/layout.js';
import { T } from './helpers.js';

const txt = (ed) => textOf(ed.items);

test('typing inserts at the cursor', () => {
  const ed = new Editor();
  ed.type('Helo');
  ed.setCursor(3);
  ed.type('l');
  assert.equal(txt(ed), 'Hello');
  assert.equal(ed.cursor, 4);
  assert.ok(ed.dirty);
});

test('newline becomes a hard return code', () => {
  const ed = new Editor();
  ed.type('a\nb');
  assert.deepEqual(ed.items, ['a', code.hrt(), 'b']);
});

test('typeover replaces characters but not codes', () => {
  const ed = new Editor(T('abc\nd'));
  ed.typeover = true;
  ed.type('XYZW');
  assert.deepEqual(ed.items, ['X', 'Y', 'Z', 'W', code.hrt(), 'd']);
});

test('F6 inserts a pair with the cursor between; F6 again steps out', () => {
  const ed = new Editor();
  ed.type('a ');
  assert.equal(ed.toggleAttr('BOLD'), 'in');
  ed.type('bold');
  assert.equal(ed.toggleAttr('BOLD'), 'out');
  ed.type(' c');
  assert.deepEqual(ed.items, ['a', ' ', code.on('BOLD'), 'b', 'o', 'l', 'd', code.off('BOLD'), ' ', 'c']);
  assert.deepEqual(ed.attrs(4), ['BOLD']);
  assert.deepEqual(ed.attrs(9), []);
});

test('attribute on a block wraps it', () => {
  const ed = new Editor(T('one two three'));
  ed.setCursor(4);
  ed.startBlock();
  ed.setCursor(7);
  ed.toggleAttr('UND');
  assert.equal(ed.blockOn, false);
  assert.deepEqual(ed.items.slice(3, 9), [' ', code.on('UND'), 't', 'w', 'o', code.off('UND')]);
});

test('block range is ordered either way', () => {
  const ed = new Editor(T('abcdef'));
  ed.setCursor(5); ed.startBlock(); ed.setCursor(2);
  assert.deepEqual(ed.blockRange(), [2, 5]);
});

test('deleting either half of a pair deletes both', () => {
  const base = () => new Editor(['a', code.on('BOLD'), 'b', code.off('BOLD'), 'c']);
  let ed = base();
  ed.setCursor(1); ed.del();
  assert.deepEqual(ed.items, ['a', 'b', 'c']);
  assert.equal(ed.cursor, 1);
  ed = base();
  ed.setCursor(4); ed.backspace();
  assert.deepEqual(ed.items, ['a', 'b', 'c']);
  assert.equal(ed.cursor, 2);
  ed = base();
  ed.setCursor(3); ed.del();
  assert.deepEqual(ed.items, ['a', 'b', 'c']);
  assert.equal(ed.cursor, 2);
});

test('backspace before and after codes', () => {
  const ed = new Editor(['x', code.tab(), 'y']);
  ed.setCursor(2);
  ed.backspace();
  assert.deepEqual(ed.items, ['x', 'y']);
  assert.equal(ed.cursor, 1);
  ed.setCursor(0);
  assert.deepEqual(ed.backspace(), []);
});

test('block delete that splits a pair removes the partner too', () => {
  const ed = new Editor(['a', code.on('BOLD'), 'b', 'c', code.off('BOLD'), 'd']);
  ed.setCursor(0); ed.startBlock(); ed.setCursor(3);
  ed.deleteBlock();
  assert.deepEqual(ed.items, ['c', 'd']);
  assert.equal(ed.cursor, 0);
});

test('undelete restores the last three deletions, merging runs', () => {
  const ed = new Editor(T('hello world'));
  ed.setCursor(11);
  for (let k = 0; k < 5; k++) ed.backspace();
  assert.equal(txt(ed), 'hello ');
  assert.equal(ed.deletions[0].join(''), 'world');
  ed.setCursor(0);
  ed.del(); ed.del();
  assert.equal(ed.deletions[0].join(''), 'he');
  assert.equal(ed.deletions[1].join(''), 'world');
  ed.setCursor(ed.length);
  ed.restore(1);
  assert.equal(txt(ed), 'llo world');
});

test('a deleted pair alone is not recorded for undelete', () => {
  const ed = new Editor([code.on('BOLD'), 'x', code.off('BOLD')]);
  ed.setCursor(0); ed.del();
  assert.equal(ed.deletions.length, 0);
});

test('format codes go to the paragraph start and replace their kind', () => {
  const ed = new Editor(T('one\ntwo three'));
  ed.setCursor(8);
  ed.insertFormatCode(code.lrMar(1.5, 1.5));
  assert.deepEqual(ed.items[4], code.lrMar(1.5, 1.5));
  assert.equal(ed.cursor, 9);
  ed.insertFormatCode(code.lrMar(2, 2));
  assert.deepEqual(ed.items[4], code.lrMar(2, 2));
  assert.equal(ed.items.filter((i) => i.c === 'LRMar').length, 1);
  ed.insertFormatCode(code.just('Center'));
  assert.equal(ed.items.filter((i) => typeof i === 'object' && i.c !== 'HRt').length, 2);
});

test('page codes go to the given page start', () => {
  const ed = new Editor(T('abc'));
  ed.setCursor(2);
  ed.insertFormatCode(code.tbMar(2, 2), 0);
  assert.deepEqual(ed.items[0], code.tbMar(2, 2));
});

test('cursor motion skips invisible codes unless revealing', () => {
  const ed = new Editor(['a', code.on('BOLD'), 'b', code.off('BOLD'), 'c']);
  ed.setCursor(1);
  ed.right();
  assert.equal(ed.cursor, 3);
  ed.setCursor(1);
  ed.right({ reveal: true });
  assert.equal(ed.cursor, 2);
  ed.setCursor(4);
  ed.left();
  assert.equal(ed.cursor, 2);
  ed.left({ reveal: true });
  assert.equal(ed.cursor, 1);
});

test('vertical motion keeps the goal column', () => {
  const ed = new Editor(T('abcdefgh\nab\nabcdefgh'));
  const res = layout(ed.items);
  ed.setCursor(6);
  ed.vertical(res, 1);
  assert.equal(ed.cursor, 11); // end of "ab"
  ed.vertical(res, 1);
  assert.equal(ed.cursor, 18); // back to column 6
  assert.equal(ed.vertical(res, 1), false);
});

test('line home and end', () => {
  const ed = new Editor([code.on('BOLD'), ...T('abc'), code.off('BOLD'), code.hrt(), ...T('x')]);
  const res = layout(ed.items);
  ed.setCursor(2);
  ed.lineHome(res);
  assert.equal(ed.cursor, 1);
  ed.lineHome(res, { beforeCodes: true });
  assert.equal(ed.cursor, 0);
  ed.lineEnd(res);
  assert.equal(ed.cursor, 5);
});

test('search: lowercase matches any case, uppercase only uppercase', () => {
  const ed = new Editor(T('The cat. THE end. the'));
  assert.deepEqual(ed.find('the', 0), { start: 0, end: 3 });
  assert.deepEqual(ed.find('the', 1), { start: 9, end: 12 });
  assert.deepEqual(ed.find('THE', 0), { start: 9, end: 12 });
  assert.deepEqual(ed.find('The', 1), { start: 9, end: 12 }, 'T only matches T, h/e any case');
  assert.deepEqual(ed.find('the', 21, true), { start: 18, end: 21 });
  assert.equal(ed.find('dog'), null);
});

test('search sees through codes and matches hard returns', () => {
  const ed = new Editor(['a', code.on('BOLD'), 'b', code.off('BOLD'), 'c', code.hrt(), 'd']);
  assert.deepEqual(ed.find('abc', 0), { start: 0, end: 5 });
  assert.deepEqual(ed.find('c\nd', 0), { start: 4, end: 7 });
});

test('replace keeps codes inside the match', () => {
  const ed = new Editor(['a', code.on('BOLD'), 'b', code.off('BOLD'), 'c']);
  const m = ed.find('abc', 0);
  ed.replaceMatch(m, 'xy');
  assert.deepEqual(ed.items, ['x', 'y', code.on('BOLD'), code.off('BOLD')]);
});

test('delete word and convert case', () => {
  const ed = new Editor(T('one two three'));
  ed.setCursor(5);
  ed.deleteWord();
  assert.equal(txt(ed), 'one three');
  ed.convertCase(0, 3, 'upper');
  assert.equal(txt(ed), 'ONE three');
});

test('word count ignores codes', () => {
  const ed = new Editor(['a', 'b', ' ', code.on('BOLD'), 'c', code.off('BOLD'), 'd', ' ', 'e']);
  assert.equal(ed.wordCount(), 3);
});

test('load marks clean; edits mark dirty; markSaved clears', () => {
  const ed = new Editor();
  ed.load(T('x'));
  assert.equal(ed.dirty, false);
  ed.type('y');
  assert.equal(ed.dirty, true);
  ed.markSaved();
  assert.equal(ed.dirty, false);
});
