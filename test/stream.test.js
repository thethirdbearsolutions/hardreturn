import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPair, attrsAt, textOf, itemsOf, paragraphStart, paragraphEnd, dropOrphans, nextWordStart, prevWordStart, wordAt } from '../src/core/stream.js';
import { code, label, inches, formatDate, isVisible } from '../src/core/codes.js';
import { T } from './helpers.js';

test('matchPair finds the other half both ways', () => {
  const it = [...T('a'), code.on('BOLD'), ...T('bc'), code.off('BOLD'), ...T('d')];
  assert.equal(matchPair(it, 1), 4);
  assert.equal(matchPair(it, 4), 1);
  assert.equal(matchPair(it, 0), -1);
});

test('matchPair does not cross a different attribute', () => {
  const it = [code.on('BOLD'), code.on('UND'), 'x', code.off('UND'), code.off('BOLD')];
  assert.equal(matchPair(it, 0), 4);
  assert.equal(matchPair(it, 1), 3);
});

test('unmatched halves report -1', () => {
  assert.equal(matchPair([code.on('BOLD'), 'x'], 0), -1);
  assert.equal(matchPair(['x', code.off('BOLD')], 1), -1);
});

test('attrsAt tracks pairs in effect', () => {
  const it = [code.on('BOLD'), 'a', code.on('UND'), 'b', code.off('BOLD'), 'c', code.off('UND')];
  assert.deepEqual(attrsAt(it, 0), []);
  assert.deepEqual(attrsAt(it, 1), ['BOLD']);
  assert.deepEqual(attrsAt(it, 3).sort(), ['BOLD', 'UND']);
  assert.deepEqual(attrsAt(it, 5), ['UND']);
  assert.deepEqual(attrsAt(it, 7), []);
});

test('itemsOf / textOf round-trip text with returns and tabs', () => {
  const s = 'Dear Ann,\n\tHello.\fPage two';
  const it = itemsOf(s);
  assert.deepEqual(it.slice(9, 11), [code.hrt(), code.tab()]);
  assert.equal(textOf(it), s);
  assert.equal(textOf(itemsOf('a\r\nb')), 'a\nb');
});

test('paragraph bounds', () => {
  const it = T('one\ntwo\nthree');
  assert.equal(paragraphStart(it, 5), 4);
  assert.equal(paragraphEnd(it, 5), 7);
  assert.equal(paragraphStart(it, 2), 0);
  assert.equal(paragraphEnd(it, 9), it.length);
});

test('dropOrphans keeps matched pairs only', () => {
  const it = [code.on('BOLD'), 'a', code.on('UND'), 'b', code.off('UND')];
  assert.deepEqual(dropOrphans(it), ['a', code.on('UND'), 'b', code.off('UND')]);
});

test('word motion skips spaces and codes', () => {
  const it = [...T('the '), code.on('BOLD'), ...T('quick'), code.off('BOLD'), ...T(' fox')];
  assert.equal(nextWordStart(it, 0), 5);
  assert.equal(nextWordStart(it, 5), 12);
  assert.equal(prevWordStart(it, 12), 5);
  assert.equal(prevWordStart(it, 3), 0);
  assert.deepEqual(wordAt(it, 7), [5, 10]);
});

test('labels match Reveal Codes', () => {
  assert.equal(label(code.on('BOLD')), 'BOLD');
  assert.equal(label(code.off('BOLD')), 'bold');
  assert.equal(label(code.off('VRY LARGE')), 'vry large');
  assert.equal(label(code.lrMar(1, 1)), 'L/R Mar:1",1"');
  assert.equal(label(code.tbMar(1.5, 0.5)), 'T/B Mar:1.5",0.5"');
  assert.equal(label(code.just('Full')), 'Just:Full');
  assert.equal(label(code.lnSpacing(2)), 'Ln Spacing:2');
  assert.equal(label(code.indent()), '→Indent');
  assert.equal(label(code.lrIndent()), '→Indent←');
  assert.equal(label(code.flushRight()), 'Flsh Rgt');
  assert.equal(label(code.pgNum('BottomCenter')), 'Pg Numbering:Bottom Center');
  assert.match(label(code.tabSet([{ pos: 0 }, { pos: 0.5 }, { pos: 1 }, { pos: 1.5 }])), /every 0.5"/);
  assert.equal(label(code.tabSet([{ pos: 1.5 }, { pos: 4, type: 'R' }])), 'Tab Set:Abs: 1.5",4"R');
});

test('inches formatting truncates like the status line', () => {
  assert.equal(inches(1), '1"');
  assert.equal(inches(1 + 1 / 6), '1.16"');
  assert.equal(inches(1.5), '1.5"');
  assert.equal(inches(7.0), '7"');
});

test('date formats', () => {
  const d = new Date(2026, 9, 4, 15, 7);
  assert.equal(formatDate('3 1, 4', d), 'October 4, 2026');
  assert.equal(formatDate('2/1/5', d), '10/4/26');
  assert.equal(formatDate('6 8:90', d), 'Sunday 3:07pm');
});

test('visibility', () => {
  assert.ok(isVisible('a'));
  assert.ok(isVisible(code.hrt()));
  assert.ok(!isVisible(code.on('BOLD')));
  assert.ok(!isVisible(code.center()));
});
