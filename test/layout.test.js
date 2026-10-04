import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, lineAt, caretX, indexAtX, stateAt } from '../src/core/layout.js';
import { courier, textMode } from '../src/core/measure.js';
import { code } from '../src/core/codes.js';
import { T, lineTexts } from './helpers.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);
const words = (n, w = 'word') => Array(n).fill(w).join(' ');

test('empty document has one empty line on page 1 at the margins', () => {
  const r = layout([]);
  assert.equal(r.pages.length, 1);
  assert.equal(r.lines.length, 1);
  const l = r.lines[0];
  near(l.y, 1); near(l.left, 1); near(l.right, 7.5);
  near(caretX(l, 0), 1);
});

test('every item is placed exactly once, in order', () => {
  const it = [...T(words(40)), code.hrt(), code.on('BOLD'), ...T('x'), code.off('BOLD')];
  const r = layout(it);
  const seen = r.lines.flatMap((l) => l.items.map((p) => p.i));
  assert.deepEqual(seen, it.map((_, i) => i));
  r.lines.forEach((l) => l.items.forEach((p, k) => assert.equal(p.i, l.start + k)));
});

test('text wraps at the right margin: 65 columns at 10 cpi with 1" margins', () => {
  const r = layout(T('x'.repeat(10) + ' ' + words(20)));
  const lines = lineTexts(r);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 65, l);
  assert.equal(r.lines[0].how, 'soft');
  // a wrapped line ends with its space ([SRt])
  const first = r.lines[0];
  assert.equal(first.items[first.items.length - 1].ch, ' ');
});

test('exactly 65 characters fit; the 66th wraps', () => {
  const r = layout(T('a'.repeat(60) + ' bcde'));
  assert.equal(r.lines.length, 1);
  const r2 = layout(T('a'.repeat(60) + ' bcdef'));
  assert.deepEqual(lineTexts(r2), ['a'.repeat(60), 'bcdef']);
});

test('a word longer than the line is broken', () => {
  const r = layout(T('z'.repeat(150)));
  assert.deepEqual(lineTexts(r).map((s) => s.length), [65, 65, 20]);
});

test('hard return starts a new line; a trailing one adds an empty line', () => {
  const r = layout(T('one\ntwo\n'));
  assert.deepEqual(lineTexts(r), ['one', 'two', '']);
  assert.equal(r.lines[0].how, 'hard');
  near(r.lines[1].y, 1 + 1 / 6);
  assert.equal(lineAt(r, 8).index, 2);
});

test('margins change wrapping and position', () => {
  const r = layout([code.lrMar(2, 2), ...T(words(30))]);
  near(r.lines[0].left, 2);
  near(r.lines[0].items[1].x, 2);
  for (const l of lineTexts(r)) assert.ok(l.length <= 45, l);
});

test('a margin code mid-document applies from its line on', () => {
  const r = layout([...T('first\n'), code.lrMar(1.5, 1), ...T('second')]);
  near(r.lines[0].left, 1);
  near(r.lines[1].left, 1.5);
  near(caretX(r.lines[1], 7), 1.5);
});

test('tabs go to the next stop every half inch', () => {
  const r = layout([code.tab(), 'a', code.tab(), 'b']);
  const p = r.lines[0].items;
  near(p[0].x, 1); near(p[1].x, 1.5); near(p[3].x, 2);
  const r2 = layout(['a', 'b', 'c', 'd', 'e', 'f', code.tab(), 'x']); // ends at 1.6"
  near(r2.lines[0].items[7].x, 2);
});

test('custom tab set with right and decimal tabs', () => {
  const tabs = code.tabSet([{ pos: 2, type: 'L' }, { pos: 5, type: 'R' }, { pos: 6.5, type: 'D' }]);
  const r = layout([tabs, code.tab(), 'a', code.tab(), ...T('abc'), code.tab(), ...T('12.50')]);
  const p = r.lines[0].items;
  near(p[2].x, 2, 'left tab');
  near(p[4].x, 4.7, 'right tab: abc ends at 5');
  near(p[6].x + 0.1, 5, 'last char of right-aligned run');
  const dot = p.find((q) => q.ch === '.');
  near(dot.x, 6.5, 'decimal point on the stop');
});

test('center centers between the margins', () => {
  const r = layout([code.center(), ...T('TITLE'), code.hrt(), ...T('x')]);
  const p = r.lines[0].items;
  near(p[1].x, 4.25 - 0.25); // 5 chars = .5", centered on 4.25
  near(p[0].x, 1, '[Center] itself stays at the margin');
  near(r.lines[1].items[0].x, 1);
});

test('flush right ends at the right margin', () => {
  const r = layout([code.flushRight(), ...T('Page 1')]);
  const p = r.lines[0].items;
  near(p[p.length - 1].x + 0.1, 7.5);
});

test('indent holds the left edge for wrapped lines until the hard return', () => {
  const r = layout([code.indent(), ...T(words(30)), code.hrt(), ...T('next')]);
  near(r.lines[0].items[1].x, 1.5);
  near(r.lines[1].left, 1.5);
  const last = r.lines[r.lines.length - 1];
  near(last.left, 1);
});

test('left-right indent narrows both sides', () => {
  const r = layout([code.lrIndent(), ...T(words(30))]);
  near(r.lines[1].left, 1.5);
  near(r.lines[1].right, 7);
});

test('justification: center, right, full (only on wrapped lines)', () => {
  let r = layout([code.just('Right'), ...T('abc')]);
  near(r.lines[0].items[3].x + 0.1, 7.5);
  r = layout([code.just('Center'), ...T('abcd')]);
  near(r.lines[0].items[1].x, 4.25 - 0.2);
  r = layout([code.just('Full'), ...T(words(30))]);
  const l0 = r.lines[0];
  const lastGlyph = [...l0.items].reverse().find((p) => p.ch && p.ch !== ' ');
  near(lastGlyph.x + lastGlyph.w, 7.5, 'full line reaches the margin');
  const last = r.lines[r.lines.length - 1];
  near(last.items[0].x, 1, 'last line stays left');
  r = layout([code.just('Full'), ...T(words(30))], { justifyFull: false });
  const g = [...r.lines[0].items].reverse().find((p) => p.ch && p.ch !== ' ');
  assert.ok(g.x + g.w < 7.5 - 1e-6, 'text mode can show it ragged');
});

test('line spacing advances by multiples', () => {
  const r = layout([code.lnSpacing(2), ...T('a\nb')]);
  near(r.lines[1].y - r.lines[0].y, 2 / 6);
});

test('pages break after 54 lines at 6 lpi with 1" margins', () => {
  const r = layout(T(Array(60).fill('line').join('\n')));
  assert.equal(r.pages.length, 2);
  assert.equal(r.pages[0].lines.length, 54);
  near(r.pages[1].lines[0].y, 1);
  assert.equal(r.pages[1].hardBefore, false);
});

test('hard page code forces a page', () => {
  const r = layout([...T('one'), code.hpg(), ...T('two')]);
  assert.equal(r.pages.length, 2);
  assert.equal(r.pages[1].hardBefore, true);
  assert.equal(r.lines[0].how, 'hpg');
  assert.deepEqual(lineTexts(r), ['one', 'two']);
});

test('top/bottom margins change lines per page', () => {
  const r = layout([code.tbMar(2, 2), ...T(Array(60).fill('l').join('\n'))]);
  assert.equal(r.pages[0].lines.length, 42);
  near(r.pages[0].lines[0].y, 2);
});

test('center page moves lines down', () => {
  const r = layout([code.cntrPg(), ...T('a\nb')]);
  assert.ok(r.lines[0].y > 5);
});

test('page numbering produces a folio', () => {
  const r = layout([code.pgNum('BottomCenter'), ...T('x'), code.hpg(), ...T('y')]);
  assert.equal(r.pages[1].folio.text, '2');
  near(r.pages[1].folio.x, 4.2);
  assert.ok(r.pages[1].folio.y > 10);
});

test('date code expands to text', () => {
  const r = layout([code.date('3 1, 4')], { now: new Date(2026, 0, 2) });
  assert.equal(r.lines[0].items[0].text, 'January 2, 2026');
  near(r.lines[0].items[0].w, 1.5);
});

test('the courier measure scales large text and changes wrapping', () => {
  const r = layout([code.on('LARGE'), ...T(words(60)), code.off('LARGE')], { measure: courier });
  near(r.lines[0].items[1].w, 0.12);
  near(r.lines[0].h, 14.4 / 72);
  const plain = layout(T(words(60)), { measure: courier });
  near(plain.lines[0].items[0].w, 0.1);
  assert.ok(r.lines.length > plain.lines.length);
});

test('caret and hit testing round-trip on a line', () => {
  const r = layout(T('hello world'));
  const l = r.lines[0];
  near(caretX(l, 6), 1.6);
  assert.equal(indexAtX(r, l, 1.62), 6);
  assert.equal(indexAtX(r, l, 9), 11);
});

test('stateAt reports margins and tabs in force', () => {
  const tabs = [{ pos: 3, type: 'L' }];
  const s = stateAt([code.lrMar(2, 1.5), code.tabSet(tabs), 'x'], 3);
  assert.equal(s.lMar, 2);
  assert.equal(s.rMar, 1.5);
  assert.deepEqual(s.tabs, tabs);
});

test('layout is pure: same input, same output', () => {
  const it = [code.just('Full'), ...T(words(50))];
  const a = JSON.stringify(layout(it, { measure: textMode }).lines.map((l) => [l.start, l.end, l.y]));
  const b = JSON.stringify(layout(it, { measure: textMode }).lines.map((l) => [l.start, l.end, l.y]));
  assert.equal(a, b);
});
