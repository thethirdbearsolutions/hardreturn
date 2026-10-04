// A minimal PDF writer for laid-out pages. Uses the standard Courier
// faces (nothing embedded) with WinAnsiEncoding. Returns a latin1 string:
// one char per byte, ready for a Blob or a terrarium save.

import { sizeOf, fontPoints } from './measure.js';

const WINANSI = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86,
  '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

export function winAnsiByte(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 32 && c < 127) || (c >= 0xa0 && c <= 0xff)) return c;
  return WINANSI[ch] ?? 63;
}

export function pdfString(s) {
  let o = '(';
  for (const ch of s) {
    const b = winAnsiByte(ch);
    if (b === 40 || b === 41 || b === 92) o += '\\' + String.fromCharCode(b);
    else if (b < 32 || b > 126) o += '\\' + b.toString(8).padStart(3, '0');
    else o += String.fromCharCode(b);
  }
  return o + ')';
}

const n2 = (v) => (Math.round(v * 100) / 100).toString();

const FONT_NAMES = ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'];

function fontIndex(attrs) {
  const bold = attrs.includes('BOLD') || attrs.includes('SHADW');
  const ital = attrs.includes('ITALC');
  return (bold ? 1 : 0) + (ital ? 2 : 0);
}

// Drawing instructions for one page, shared with any canvas preview so the
// two agree: [{ kind: 'text', x, y (baseline, inches), pt, font, text, attrs }]
// and [{ kind: 'rule', x1, x2, y, w }].
export function pageOps(page) {
  const ops = [];
  const rules = [];
  for (const line of page.lines) {
    const base = line.y + line.h * 0.78;
    let run = null;
    const flush = () => { if (run) ops.push(run); run = null; };
    for (const p of line.items) {
      const glyph = p.ch !== undefined ? p.ch : p.text;
      if (glyph === undefined) continue;
      const a = p.style.attrs;
      let pt = sizeOf(p.style);
      let text = glyph;
      if (a.includes('SM CAP') && text !== text.toUpperCase()) { text = text.toUpperCase(); pt *= 0.8; }
      const basePt = fontPoints(p.style.font);
      const rise = a.includes('SUPRSCPT') ? basePt * 0.33 / 72 : a.includes('SUBSCPT') ? -basePt * 0.2 / 72 : 0;
      const y = base - rise;
      const font = fontIndex(a);
      if (glyph === ' ') {
        flush();
      } else {
        const adv = (pt * 0.6 / 72) * [...text].length;
        if (run && run.font === font && run.pt === pt && run.y === y && run.key === p.style.key &&
            Math.abs(run.x + run.adv - p.x) < 1e-4) {
          run.text += text; run.adv += adv;
        } else {
          flush();
          run = { kind: 'text', x: p.x, y, pt, font, text, attrs: a, key: p.style.key, adv };
        }
      }
      const thick = Math.max(0.5, pt / 24) / 72;
      if (a.includes('UND') || a.includes('DBL UND')) rules.push({ kind: 'rule', x1: p.x, x2: p.x + p.w, y: base + pt * 0.12 / 72, w: thick });
      if (a.includes('DBL UND')) rules.push({ kind: 'rule', x1: p.x, x2: p.x + p.w, y: base + pt * 0.22 / 72, w: thick });
      if (a.includes('STKOUT')) rules.push({ kind: 'rule', x1: p.x, x2: p.x + p.w, y: base - pt * 0.25 / 72, w: thick });
    }
    flush();
  }
  // merge touching rules
  const merged = [];
  for (const r of rules) {
    const m = merged.find((q) => q.y === r.y && q.w === r.w && Math.abs(q.x2 - r.x1) < 1e-4);
    if (m) m.x2 = r.x2; else merged.push({ ...r });
  }
  if (page.folio) {
    const f = page.folio;
    ops.push({ kind: 'text', x: f.x, y: f.y + f.h * 0.78, pt: sizeOf(f.style), font: 0, text: f.text, attrs: [] });
  }
  return ops.concat(merged.filter((r) => r.x2 - r.x1 > 1e-4));
}

function contentStream(page) {
  const H = page.h * 72;
  const out = [];
  for (const op of pageOps(page)) {
    if (op.kind === 'rule') {
      out.push(`${n2(op.w * 72)} w ${n2(op.x1 * 72)} ${n2(H - op.y * 72)} m ${n2(op.x2 * 72)} ${n2(H - op.y * 72)} l S`);
      continue;
    }
    const x = n2(op.x * 72), y = n2(H - op.y * 72);
    const color = op.attrs.includes('REDLN') ? '0.8 0 0 rg ' : '';
    if (op.attrs.includes('SHADW')) {
      out.push(`BT 0.6 g /F${op.font + 1} ${n2(op.pt)} Tf ${n2(op.x * 72 + op.pt * 0.06)} ${n2(H - op.y * 72 - op.pt * 0.06)} Td ${pdfString(op.text)} Tj ET`);
    }
    const tr = op.attrs.includes('OUTLN') ? '1 Tr 0.3 w ' : '';
    out.push(`BT ${color || '0 g '}${tr}/F${op.font + 1} ${n2(op.pt)} Tf ${x} ${y} Td ${pdfString(op.text)} Tj ET`);
  }
  return out.join('\n');
}

export function makePdf(res, { title = 'Untitled', producer = 'Hard Return' } = {}) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null);
  const pagesId = add(null);
  const fontIds = FONT_NAMES.map((name) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`));
  const info = add(`<< /Title ${pdfString(title)} /Producer ${pdfString(producer)} >>`);
  const fontDict = '<< ' + fontIds.map((id, k) => `/F${k + 1} ${id} 0 R`).join(' ') + ' >>';
  const kids = [];
  for (const page of res.pages) {
    const stream = contentStream(page);
    const cid = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pid = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n2(page.w * 72)} ${n2(page.h * 72)}] /Resources << /Font ${fontDict} >> /Contents ${cid} 0 R >>`);
    kids.push(pid);
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((body, k) => {
    offsets.push(out.length);
    out += `${k + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += String(o).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

// latin1 string -> bytes, for Blobs.
export function bytes(str) {
  const b = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff;
  return b;
}
