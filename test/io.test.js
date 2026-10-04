import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHr, fromHr, parse, serialize, MIME, toTxt } from '../src/core/format.js';
import { makePdf, pdfString, bytes } from '../src/core/pdf.js';
import { layout } from '../src/core/layout.js';
import { courier } from '../src/core/measure.js';
import { code } from '../src/core/codes.js';
import { Speller } from '../src/core/spell.js';
import { WORDS } from '../src/core/words.js';
import { LocalStore, TerrariumStore } from '../src/core/files.js';
import { connectTerrarium } from '../src/core/terrarium.js';
import { T, memoryStorage } from './helpers.js';

const sample = () => [
  code.lrMar(1.5, 1.5), code.tabSet([{ pos: 2, type: 'L' }, { pos: 6, type: 'R' }]),
  code.center(), code.on('BOLD'), ...T('LETTER'), code.off('BOLD'), code.hrt(),
  code.date(), code.hrt(), ...T('Dear Ann,'), code.hrt(), code.tab(), code.on('UND'), ...T('Hello'),
  code.off('UND'), ...T(' – “quoted” (parens) \\ back'), code.hpg(), code.flushRight(), ...T('two'),
];

test('.hr round-trips the code stream exactly', () => {
  const it = sample();
  const s = toHr(it);
  const doc = JSON.parse(s);
  assert.equal(doc.format, 'hardreturn');
  assert.equal(doc.version, 1);
  assert.equal(typeof doc.stream[0], 'object');
  assert.ok(doc.stream.includes('LETTER'), 'characters are stored as runs');
  assert.deepEqual(fromHr(s), it);
});

test('.hr rejects other JSON and newer versions', () => {
  assert.throws(() => fromHr('{"a":1}'));
  assert.throws(() => fromHr(JSON.stringify({ format: 'hardreturn', version: 99, stream: [] })), /newer/);
});

test('emoji and astral characters survive as single items', () => {
  const it = T('a😀b');
  assert.equal(it.length, 3);
  assert.deepEqual(fromHr(toHr(it)), it);
});

test('.txt import and export', () => {
  assert.equal(toTxt(sample()).split('\n')[2], 'Dear Ann,');
  const it = parse('NOTE.TXT', 'a\r\n\tb\fc');
  assert.deepEqual(it, ['a', code.hrt(), code.tab(), 'b', code.hpg(), 'c']);
  assert.deepEqual(serialize('x.txt', it), { content: 'a\n\tb\fc', mime: 'text/plain' });
  assert.equal(serialize('x.hr', it).mime, MIME);
});

test('parse sniffs .hr content without an extension and treats junk as text', () => {
  assert.deepEqual(parse('LETTER', toHr(T('hi'))), ['h', 'i']);
  assert.deepEqual(parse('LETTER', '{not json'), [...'{not json']);
  assert.throws(() => parse('X.HR', '{not json'));
});

test('pdf strings escape and map to WinAnsi', () => {
  assert.equal(pdfString('a(b)c\\'), '(a\\(b\\)c\\\\)');
  assert.equal(pdfString('“é”'), '(\\223\\351\\224)');
  assert.equal(pdfString('→'), '(?)');
});

function checkPdf(pdf) {
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.endsWith('%%EOF\n'));
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)[1]);
  assert.equal(pdf.slice(startxref, startxref + 4), 'xref');
  const m = /xref\n0 (\d+)\n/.exec(pdf.slice(startxref));
  const n = Number(m[1]);
  const table = pdf.slice(startxref + m[0].length).split('\n').slice(0, n);
  assert.equal(table[0], '0000000000 65535 f ');
  for (let k = 1; k < n; k++) {
    const off = Number(table[k].slice(0, 10));
    assert.equal(table[k].length, 19); // + "\n" = 20 bytes
    assert.equal(pdf.slice(off, off + `${k} 0 obj`.length), `${k} 0 obj`, `object ${k} offset`);
  }
  for (const s of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = s.index + s[0].length;
    assert.equal(pdf.slice(start + Number(s[1]), start + Number(s[1]) + 10), '\nendstream');
  }
  for (let i = 0; i < pdf.length; i++) assert.ok(pdf.charCodeAt(i) < 256);
  return n;
}

test('pdf: structure, xref offsets, stream lengths, page count', () => {
  const res = layout(sample(), { measure: courier });
  const pdf = makePdf(res, { title: 'LETTER.HR' });
  checkPdf(pdf);
  assert.equal(res.pages.length, 2);
  assert.match(pdf, /\/Count 2/);
  assert.match(pdf, /\/BaseFont \/Courier-Bold/);
  assert.match(pdf, /\/F2 12 Tf [\d.]+ [\d.]+ Td \(LETTER\) Tj/);
  assert.match(pdf, /\(Dear\) Tj/);
  assert.match(pdf, / l S/, 'underline drawn as a rule');
  assert.equal(bytes(pdf).length, pdf.length);
});

test('pdf: an empty document is still one valid page', () => {
  const pdf = makePdf(layout([], { measure: courier }));
  checkPdf(pdf);
  assert.match(pdf, /\/Count 1/);
});

test('pdf: full justification places each word where layout put it', () => {
  const res = layout([code.just('Full'), ...T(Array(30).fill('word').join(' '))], { measure: courier });
  const pdf = makePdf(res);
  const xs = [...pdf.matchAll(/ ([\d.]+) 7\d\d(?:\.\d+)? Td \(word\)/g)].map((m) => Number(m[1]));
  assert.ok(xs.length >= 10);
  const lastX = Math.max(...xs);
  assert.ok(Math.abs(lastX + 4 * 7.2 - 7.5 * 72) < 0.05, `last word ends at the margin (${lastX})`);
});

test('speller accepts words, inflections, numbers; suggests fixes', () => {
  const sp = new Speller(WORDS);
  for (const w of ['the', 'The', 'letters', 'walked', 'running', 'stopped', 'quickly', "company's", '1989', 'happiest', 'replies'])
    assert.ok(sp.check(w), w);
  for (const w of ['teh', 'recieve', 'xqzv']) assert.ok(!sp.check(w), w);
  assert.ok(sp.suggest('teh').includes('the'));
  assert.ok(sp.suggest('recieve').includes('receive'));
  assert.equal(sp.suggest('Teh')[0][0], 'T');
  sp.add('Ethan');
  assert.ok(sp.check('ethan'));
});

test('local store: a fake C:\\WP51 directory', async () => {
  const st = new LocalStore({ storage: memoryStorage() });
  assert.equal(st.home, 'C:\\WP51\\');
  await st.write('C:\\WP51\\LETTER.HR', '{"x":1}', MIME);
  await st.write('C:\\WP51\\memo.txt', 'hi', 'text/plain');
  await st.write('C:\\OTHER\\A.TXT', 'no', 'text/plain');
  const ls = await st.list('C:\\WP51\\');
  assert.deepEqual(ls.map((e) => e.name), ['LETTER.HR', 'MEMO.TXT']);
  assert.equal(ls[1].size, 2);
  assert.equal((await st.read('c:\\wp51\\memo.txt')).content, 'hi');
  assert.ok(await st.exists('C:\\WP51\\MEMO.TXT'));
  await st.rename('C:\\WP51\\MEMO.TXT', 'C:\\WP51\\NOTE.TXT');
  assert.ok(!(await st.exists('C:\\WP51\\MEMO.TXT')));
  await st.remove('C:\\WP51\\NOTE.TXT');
  await assert.rejects(st.read('C:\\WP51\\NOTE.TXT'), /not found/);
  assert.equal(await st.resolve('x.hr'), 'C:\\WP51\\X.HR');
});

// A fake shell for terrarium/1.
function fakeShell(files = {}) {
  const sent = [];
  const listeners = [];
  const parent = {};
  const win = {
    parent,
    addEventListener: (t, fn) => listeners.push(fn),
  };
  const deliver = (data) => listeners.forEach((fn) => fn({ data, source: parent }));
  parent.postMessage = (msg) => {
    sent.push(msg);
    queueMicrotask(() => {
      if (msg.type === 'hello') deliver({ terrarium: 1, type: 'welcome', windowId: 'w1', file: null });
      if (msg.type === 'list') deliver({ terrarium: 1, type: 'reply', id: msg.id, ok: true, entries: Object.keys(files).map((p) => ({ path: p, name: p.split('/').pop(), dir: false, size: files[p].length, mtime: 1 })) });
      if (msg.type === 'read') {
        if (files[msg.path]) deliver({ terrarium: 1, type: 'reply', id: msg.id, ok: true, file: { path: msg.path, name: msg.path.split('/').pop(), content: files[msg.path] } });
        else deliver({ terrarium: 1, type: 'reply', id: msg.id, ok: false, error: 'not found' });
      }
      if (msg.type === 'save') { files[msg.path] = msg.content; deliver({ terrarium: 1, type: 'reply', id: msg.id, ok: true, path: msg.path }); }
      if (msg.type === 'open') deliver({ terrarium: 1, type: 'reply', id: msg.id, ok: false, error: 'cancelled' });
    });
  };
  return { win, sent, deliver, files };
}

test('terrarium: hello carries accepts; requests get replies', async () => {
  const shell = fakeShell({ '/Documents/Letter.hr': 'x' });
  const client = await connectTerrarium({ title: 'Hard Return', accepts: ['.hr', '.txt'], win: shell.win });
  assert.ok(client);
  assert.deepEqual(shell.sent[0], { terrarium: 1, type: 'hello', title: 'Hard Return', accepts: ['.hr', '.txt'] });
  const store = new TerrariumStore(client);
  assert.equal(await store.resolve('LETTER.HR'), '/Documents/Letter.hr');
  assert.equal((await store.read('/Documents/Letter.hr')).content, 'x');
  await store.write('/Documents/new.hr', 'y', MIME);
  assert.equal(shell.files['/Documents/new.hr'], 'y');
  assert.equal(shell.sent.at(-1).mime, MIME);
  await assert.rejects(client.request('open', {}), (e) => e.cancelled === true);
  let opened = null;
  client.on('open-file', (m) => { opened = m.file; });
  shell.deliver({ terrarium: 1, type: 'open-file', file: { name: 'a.txt' } });
  assert.equal(opened.name, 'a.txt');
  client.notify('dirty', { dirty: true });
  assert.deepEqual(shell.sent.at(-1), { terrarium: 1, type: 'dirty', dirty: true });
});

test('terrarium: standalone resolves null', async () => {
  const win = {}; win.parent = win;
  assert.equal(await connectTerrarium({ win }), null);
  const silent = { parent: { postMessage() {} }, addEventListener() {} };
  assert.equal(await connectTerrarium({ win: silent, timeout: 10 }), null);
});
