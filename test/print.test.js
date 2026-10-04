import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, stateAt } from '../src/core/layout.js';
import { print, courier, familyOf, faceName, faceIndex, textWidth, PDF_FONTS } from '../src/core/measure.js';
import { makePdf, pageOps } from '../src/core/pdf.js';
import { code, label } from '../src/core/codes.js';
import { Editor } from '../src/core/editor.js';
import { History } from '../src/core/history.js';
import { T, lineTexts } from './helpers.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg || ''} ${a} != ${b}`);
const TNR = 'Times New Roman 12pt';

test('faces map to the three base-14 families', () => {
  assert.equal(familyOf('Times New Roman 12pt'), 'Times');
  assert.equal(familyOf('Arial 10pt'), 'Helvetica');
  assert.equal(familyOf('Courier New 12pt'), 'Courier');
  assert.equal(familyOf('Courier 10cpi'), 'Courier');
  assert.equal(faceName('Times New Roman 14.5pt'), 'Times New Roman');
  assert.equal(PDF_FONTS[faceIndex({ font: 'Arial 12pt', attrs: ['BOLD', 'ITALC'] })], 'Helvetica-BoldOblique');
  assert.equal(PDF_FONTS[faceIndex({ font: TNR, attrs: ['ITALC'] })], 'Times-Italic');
  assert.equal(PDF_FONTS[faceIndex({ font: 'Courier 10cpi', attrs: [] })], 'Courier');
});

test('print measure: AFM widths for Times and Helvetica, 0.6 em for Courier', () => {
  const s = (font, attrs = []) => ({ font, attrs, key: font });
  near(print.width('W', s(TNR)) * 72, 12 * 0.944);
  near(print.width('i', s(TNR)) * 72, 12 * 0.278);
  near(print.width('W', s(TNR, ['BOLD'])) * 72, 12 * 1.0);
  near(print.width('a', s('Arial 10pt')) * 72, 10 * 0.556);
  near(print.width('é', s('Arial 10pt')) * 72, 10 * 0.556);
  near(print.width('—', s(TNR)) * 72, 12 * 1.0);
  for (const ch of 'Wil.') near(print.width(ch, s('Courier 10cpi')), courier.width(ch, s('Courier 10cpi')));
  near(print.lineHeight(s('Courier 10cpi')), courier.lineHeight(s('Courier 10cpi')));
  near(print.lineHeight(s(TNR)) * 72, 12 * 1.15);
  near(textWidth(4, 'Hi', 12), (12 * (0.722 + 0.278)) / 72);
});

test('proportional text fits more per line than Courier', () => {
  const words = Array(60).fill('little').join(' ');
  const c = layout(T(words), { measure: print });
  const t = layout([code.font(TNR), ...T(words)], { measure: print });
  assert.ok(t.lines.length < c.lines.length, `${t.lines.length} < ${c.lines.length}`);
  for (const l of t.lines) {
    const last = l.items.filter((p) => p.ch && p.ch !== ' ').pop();
    assert.ok(last.x + last.w <= l.right + 1e-6);
  }
});

test('full justification spreads Times lines to the right margin', () => {
  const words = Array(50).fill('justify me').join(' ');
  const r = layout([code.font(TNR), code.just('Full'), ...T(words)], { measure: print, justifyFull: true });
  const l = r.lines[0];
  const last = l.items.filter((p) => p.ch && p.ch !== ' ').pop();
  near(last.x + last.w, l.right);
});

test('pageOps: runs use real widths, and break where layout moved a glyph', () => {
  const r = layout([code.font(TNR), ...T('Hello World')], { measure: print });
  const ops = pageOps(r.pages[0]).filter((o) => o.kind === 'text');
  assert.deepEqual(ops.map((o) => o.text), ['Hello', 'World']);
  assert.equal(ops[0].family, 'Times');
  near(ops[0].adv, textWidth(ops[0].font, 'Hello', 12));
  // the next run starts where layout put it
  const w = r.lines[0].items.find((p) => p.ch === 'W');
  near(ops[1].x, w.x);
});

test('pdf: names only the faces it uses, base-14 Times and Helvetica', () => {
  const items = [code.font(TNR), ...T('Roman '), code.on('BOLD'), ...T('bold'), code.off('BOLD'), code.hrt(),
    code.font('Arial 12pt'), code.on('ITALC'), ...T('sans'), code.off('ITALC')];
  const pdf = makePdf(layout(items, { measure: print }));
  for (const f of ['Times-Roman', 'Times-Bold', 'Helvetica-Oblique']) assert.ok(pdf.includes(`/BaseFont /${f} `), f);
  assert.ok(!pdf.includes('/BaseFont /Courier'));
  assert.ok(!pdf.includes('/BaseFont /Helvetica ') && !pdf.includes('/BaseFont /Times-Italic'));
  // font resource numbers follow PDF_FONTS
  assert.match(pdf, /\/F5 \d+ 0 R/);
  assert.match(pdf, /\/F11 \d+ 0 R/);
  const empty = makePdf(layout([], { measure: print }));
  assert.ok(empty.includes('/BaseFont /Courier '));
});

test('[Lft Mar] and [Rgt Mar] set one margin each', () => {
  assert.equal(label(code.lMar(1.5)), 'Lft Mar:1.5"');
  assert.equal(label(code.rMar(0.75)), 'Rgt Mar:0.75"');
  const r = layout([code.lMar(1.5), ...T('x'), code.hrt(), code.rMar(2), ...T('y')], { measure: print });
  near(r.lines[0].left, 1.5); near(r.lines[0].right, 7.5);
  near(r.lines[1].left, 1.5); near(r.lines[1].right, 6.5);
  const st = stateAt([code.lrMar(1, 1), code.lMar(2)], 2);
  assert.equal(st.lMar, 2); assert.equal(st.rMar, 1);
});

test('margin codes at a paragraph start replace and fold into each other', () => {
  const ed = new Editor([...T('abc')]);
  ed.setCursor(2);
  ed.insertFormatCode(code.lMar(1.5));
  ed.insertFormatCode(code.lMar(2));
  assert.deepEqual(ed.items[0], code.lMar(2));
  assert.equal(ed.items.filter((it) => it.c === 'LMar').length, 1);
  ed.insertFormatCode(code.lrMar(1, 1));
  assert.deepEqual(ed.items.filter((it) => typeof it === 'object'), [code.lrMar(1, 1)]);
  ed.insertFormatCode(code.rMar(2));
  assert.deepEqual(ed.items.filter((it) => typeof it === 'object'), [code.lrMar(1, 2)]);
  assert.equal(ed.text(), 'abc');
});

test('history: undo and redo restore items and cursor; typing groups', () => {
  const ed = new Editor();
  const h = new History(ed);
  for (const ch of 'abc') h.change(() => ed.type(ch), 'type');
  h.change(() => ed.toggleAttr('BOLD'));
  h.change(() => ed.type('d'), 'type');
  assert.equal(ed.text(), 'abcd');
  assert.ok(h.undo());
  assert.equal(ed.text(), 'abc');
  assert.equal(ed.items.length, 5); // [BOLD][bold] still there
  assert.ok(h.undo());
  assert.equal(ed.items.length, 3);
  assert.ok(h.undo());
  assert.equal(ed.length, 0);
  assert.ok(!h.undo());
  assert.ok(h.redo());
  assert.equal(ed.text(), 'abc');
  assert.equal(ed.cursor, 3);
  // a new change drops the redo stack
  h.change(() => ed.type('x'), 'type');
  assert.ok(!h.canRedo);
});

test('history: no-op changes leave nothing to undo; moving breaks a typing group', () => {
  const ed = new Editor([...T('hello')]);
  const h = new History(ed);
  h.change(() => ed.setCursor(2));
  assert.ok(!h.canUndo);
  h.change(() => ed.type('X'), 'type');
  ed.setCursor(0);
  h.change(() => ed.type('Y'), 'type');
  h.undo();
  assert.equal(ed.text(), 'heXllo');
  h.undo();
  assert.equal(ed.text(), 'hello');
});
