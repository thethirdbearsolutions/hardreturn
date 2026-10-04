// Layout: a pure function from the code stream and a measure to pages of
// lines, with every item placed at an x in inches from the left edge of the
// paper and every line at a y in inches from the top.
//
// Every item index in [line.start, line.end) has exactly one placement in
// line.items, in order, so item i is line.items[i - line.start]. Codes are
// placed with zero width at the x where they take effect.
//
// line.how is 'hard' (ended by [HRt]), 'hpg' ([HPg]), 'soft' (wrapped; the
// last item is the space that Reveal Codes shows as [SRt]) or 'eof'.

import { isChar, formatDate, defaultTabs } from './codes.js';
import { textMode } from './measure.js';

const EPS = 1e-6;

export const DEFAULTS = Object.freeze({
  pageW: 8.5, pageH: 11,
  lMar: 1, rMar: 1, tMar: 1, bMar: 1,
  just: 'Left', spacing: 1,
  tabs: defaultTabs(),
  font: 'Courier 10cpi',
  pgNum: 'None',
});

function styleCache() {
  const m = new Map();
  return (font, attrs) => {
    const a = [...attrs].sort();
    const key = font + '|' + a.join(',');
    let s = m.get(key);
    if (!s) { s = Object.freeze({ font, attrs: a, key }); m.set(key, s); }
    return s;
  };
}

function nextStop(tabs, x) {
  for (const t of tabs) if (t.pos > x + EPS) return t;
  return null;
}

// Page-level codes at the top of a page apply to that page.
function applyPageCodes(items, i, st) {
  let cntrPg = false;
  for (let j = i; j < items.length; j++) {
    const it = items[j];
    if (isChar(it) || it.c === 'HRt' || it.c === 'HPg') break;
    if (it.c === 'TBMar') { st.tMar = it.t; st.bMar = it.b; }
    else if (it.c === 'PgNum') st.pgNum = it.v;
    else if (it.c === 'CntrPg') cntrPg = true;
  }
  return cntrPg;
}

function buildLine(ctx, start, st, stopAt) {
  const { items, measure } = ctx;
  const s = { ...st, attrs: st.attrs.slice() };
  let left = s.indL ?? s.lMar;
  let right = s.pageW - (s.indR ?? s.rMar);
  let x = left;
  let style = ctx.style(s.font, s.attrs);
  let lineJust = s.just, lineSpacing = s.spacing;
  const placed = [];
  let lastBreak = -1;
  let glyphs = 0;
  let seg = null;
  let hadSeg = false;
  let maxH = 0;

  const closeSeg = () => {
    if (!seg) return;
    const W = x - seg.startX;
    let ns;
    if (seg.kind === 'center') {
      ns = seg.startX <= left + EPS ? (left + right) / 2 - W / 2 : seg.startX - W / 2;
      ns = Math.max(left, ns);
    } else if (seg.kind === 'flush') {
      ns = Math.max(seg.startX, right - W);
    } else {
      let type = seg.type;
      let anchor = W;
      if (type === 'D') {
        const dot = placed.slice(seg.from).find((p) => p.ch === '.');
        if (dot) anchor = dot.x - seg.startX; else type = 'R';
      }
      if (type === 'C') anchor = W / 2;
      ns = Math.max(seg.startX, seg.stop - anchor);
      placed[seg.from - 1].w = ns - placed[seg.from - 1].x;
    }
    const dx = ns - seg.startX;
    for (let k = seg.from; k < placed.length; k++) placed[k].x += dx;
    x += dx;
    seg = null;
  };

  const finish = (end, how) => {
    closeSeg();
    if (maxH === 0) maxH = measure.lineHeight(style);
    if (!hadSeg && lineJust !== 'Left') {
      let contentEnd = left, firstFree = 0;
      placed.forEach((p, k) => {
        if ((p.ch && p.ch !== ' ') || p.text) contentEnd = p.x + p.w;
        if (p.kind === 'tab') firstFree = k + 1;
      });
      const slack = right - contentEnd;
      if (slack > EPS) {
        if (lineJust === 'Center' || lineJust === 'Right') {
          const dx = lineJust === 'Center' ? slack / 2 : slack;
          for (const p of placed) p.x += dx;
        } else if (lineJust === 'Full' && how === 'soft' && ctx.justifyFull) {
          let lastGlyph = -1;
          placed.forEach((p, k) => { if ((p.ch && p.ch !== ' ') || p.text) lastGlyph = k; });
          let firstGlyph = placed.findIndex((p, k) => k >= firstFree && ((p.ch && p.ch !== ' ') || p.text));
          const gaps = [];
          for (let k = firstGlyph; k >= 0 && k < lastGlyph; k++) if (placed[k].ch === ' ') gaps.push(k);
          if (gaps.length) {
            const per = slack / gaps.length;
            let dx = 0, g = 0;
            for (let k = 0; k < placed.length; k++) {
              placed[k].x += dx;
              if (gaps[g] === k) { placed[k].w += per; dx += per; g++; }
            }
          }
        }
      }
    }
    if (how === 'hard' || how === 'hpg') { s.indL = null; s.indR = null; }
    return { end, how, placed, left, right, h: maxH, spacing: lineSpacing, just: lineJust, state: s };
  };

  const resetLeft = () => {
    left = s.indL ?? s.lMar;
    right = s.pageW - (s.indR ?? s.rMar);
    x = left;
    for (const p of placed) p.x = left;
  };

  for (let i = start; i < items.length; i++) {
    if (i >= stopAt) return finish(i, 'soft');
    const it = items[i];
    if (isChar(it)) {
      const w = measure.width(it, style);
      if (it !== ' ' && glyphs > 0 && x + w > right + EPS) return { overflow: true, at: i, lastBreak };
      placed.push({ i, x, w, ch: it, style });
      x += w;
      glyphs++;
      maxH = Math.max(maxH, measure.lineHeight(style));
      if (it === ' ') lastBreak = i + 1;
      continue;
    }
    switch (it.c) {
      case 'HRt':
      case 'HPg':
        placed.push({ i, x, w: 0, kind: 'hrt', style });
        return finish(i + 1, it.c === 'HPg' ? 'hpg' : 'hard');
      case 'Tab':
      case 'Indent':
      case 'LRIndent': {
        closeSeg();
        const stop = nextStop(s.tabs, x);
        let target = stop ? stop.pos : x + measure.width(' ', style);
        let type = stop && it.c === 'Tab' ? stop.type : 'L';
        if (target > right + EPS) {
          if (glyphs > 0) return { overflow: true, at: i, lastBreak: i };
          target = Math.max(x, right);
          type = 'L';
        }
        if (type === 'L') {
          placed.push({ i, x, w: target - x, kind: 'tab', style });
          x = target;
        } else {
          placed.push({ i, x, w: 0, kind: 'tab', style });
          seg = { kind: 'tab', type, stop: target, from: placed.length, startX: x };
          hadSeg = true;
        }
        glyphs++;
        if (it.c === 'Indent') s.indL = x;
        if (it.c === 'LRIndent') {
          s.indL = x;
          s.indR = (s.indR ?? s.rMar) + (x - left);
          right = s.pageW - s.indR;
        }
        break;
      }
      case 'Center':
      case 'FlshRgt':
        closeSeg();
        seg = { kind: it.c === 'Center' ? 'center' : 'flush', from: placed.length, startX: x };
        hadSeg = true;
        placed.push({ i, x, w: 0, kind: 'code', style });
        break;
      case 'Date': {
        const text = formatDate(it.fmt, ctx.now);
        let w = 0;
        for (const ch of text) w += measure.width(ch, style);
        if (glyphs > 0 && x + w > right + EPS) return { overflow: true, at: i, lastBreak };
        placed.push({ i, x, w, text, kind: 'date', style });
        x += w;
        glyphs++;
        maxH = Math.max(maxH, measure.lineHeight(style));
        break;
      }
      default: {
        if (it.on !== undefined) {
          if (it.on) { if (!s.attrs.includes(it.c)) s.attrs.push(it.c); } else s.attrs = s.attrs.filter((a) => a !== it.c);
          style = ctx.style(s.font, s.attrs);
        } else if (it.c === 'LRMar') {
          s.lMar = it.l; s.rMar = it.r;
          if (glyphs === 0) resetLeft();
        } else if (it.c === 'Just') {
          s.just = it.v;
          if (glyphs === 0) lineJust = it.v;
        } else if (it.c === 'LnSpacing') {
          s.spacing = it.v;
          if (glyphs === 0) lineSpacing = it.v;
        } else if (it.c === 'TabSet') {
          s.tabs = it.tabs;
        } else if (it.c === 'Font') {
          s.font = it.v;
          style = ctx.style(s.font, s.attrs);
        } else if (it.c === 'TBMar') {
          s.tMar = it.t; s.bMar = it.b;
        } else if (it.c === 'PgNum') {
          s.pgNum = it.v;
        }
        placed.push({ i, x, w: 0, kind: 'code', style });
      }
    }
  }
  return finish(items.length, 'eof');
}

// opts: { measure, justifyFull (default true), defaults, now }
export function layout(items, opts = {}) {
  const measure = opts.measure || textMode;
  const defs = { ...DEFAULTS, ...(opts.defaults || {}) };
  const ctx = {
    items, measure, style: styleCache(),
    justifyFull: opts.justifyFull ?? true,
    now: opts.now || new Date(),
  };
  let st = { ...defs, attrs: [], indL: null, indR: null };
  const pages = [];
  const lines = [];
  let page = null;
  let y = 0;

  const newPage = (i, hardBefore) => {
    const cntrPg = applyPageCodes(items, i, st);
    page = {
      index: pages.length, n: pages.length + 1, w: st.pageW, h: st.pageH,
      tMar: st.tMar, bMar: st.bMar, lMar: st.lMar, rMar: st.rMar,
      pgNum: st.pgNum, cntrPg, hardBefore, lines: [],
    };
    pages.push(page);
    y = page.tMar;
  };

  const push = (r, start) => {
    const line = {
      index: lines.length, page: page.index, start, end: r.end, y,
      h: r.h, adv: r.h * r.spacing, items: r.placed, left: r.left, right: r.right,
      how: r.how, just: r.just,
    };
    page.lines.push(line);
    lines.push(line);
    y += line.adv;
  };

  newPage(0, false);
  const len = items.length;
  let i = 0;
  for (;;) {
    let r = buildLine(ctx, i, st, Infinity);
    if (r.overflow) {
      const stop = r.lastBreak > i ? r.lastBreak : r.at;
      r = buildLine(ctx, i, st, stop);
      if (r.overflow) r = buildLine(ctx, i, st, Math.max(i + 1, r.at));
    }
    if (page.lines.length && y + r.h > page.h - page.bMar + EPS) {
      newPage(i, false);
      // page codes may have changed the top margin; the line is unchanged
    }
    push(r, i);
    st = r.state;
    i = r.end;
    if (r.how === 'hpg') newPage(i, true);
    if (i >= len) {
      if (r.how === 'hard' || r.how === 'hpg') {
        const empty = buildLine(ctx, i, st, Infinity);
        if (page.lines.length && y + empty.h > page.h - page.bMar + EPS) newPage(i, false);
        push(empty, i);
      }
      break;
    }
  }

  const base = ctx.style(defs.font, []);
  for (const p of pages) {
    if (p.cntrPg && p.lines.length) {
      const last = p.lines[p.lines.length - 1];
      const used = last.y + last.h - p.tMar;
      const dy = Math.max(0, (p.h - p.tMar - p.bMar - used) / 2);
      for (const l of p.lines) l.y += dy;
    }
    if (p.pgNum && p.pgNum !== 'None') {
      const text = String(p.n);
      let w = 0;
      for (const ch of text) w += measure.width(ch, base);
      const h = measure.lineHeight(base);
      const top = p.pgNum.startsWith('Top');
      const pos = p.pgNum.replace(/^(Top|Bottom)/, '');
      const x = pos === 'Left' ? p.lMar : pos === 'Right' ? p.w - p.rMar - w : (p.w - w) / 2;
      p.folio = { text, x, w, h, style: base, y: top ? Math.max(0, p.tMar / 2 - h / 2) : p.h - p.bMar / 2 - h / 2 };
    }
  }

  return { pages, lines, length: len, measure: measure.name };
}

// The line holding insertion point i.
export function lineAt(res, i) {
  const ls = res.lines;
  let lo = 0, hi = ls.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ls[mid].start <= i) lo = mid; else hi = mid - 1;
  }
  return ls[lo];
}

// x of the insertion point i on its line.
export function caretX(line, i) {
  const k = i - line.start;
  if (k >= 0 && k < line.items.length) return line.items[k].x;
  const last = line.items[line.items.length - 1];
  return last ? last.x + last.w : line.left;
}

// The insertion point on `line` nearest to x (first index on ties).
export function indexAtX(res, line, x) {
  let best = line.start, bestD = Infinity;
  for (let k = 0; k < line.items.length; k++) {
    const d = Math.abs(line.items[k].x - x);
    if (d < bestD - 1e-9) { bestD = d; best = line.start + k; }
  }
  if (line.end === res.length && line.how !== 'hard' && line.how !== 'hpg') {
    const d = Math.abs(caretX(line, line.end) - x);
    if (d < bestD - 1e-9) best = line.end;
  }
  return best;
}

// Last insertion point on the line (before [HRt] or the [SRt] space).
export function lineEndIndex(res, line) {
  if (line.how === 'hard' || line.how === 'hpg') return Math.max(line.start, line.end - 1);
  if (line.how === 'soft') {
    const last = line.items[line.items.length - 1];
    return last && last.ch === ' ' ? line.end - 1 : line.end;
  }
  return line.end;
}

// The state in force at the start of a line (margins, tabs) for rulers.
export function stateAt(items, i, defaults = {}) {
  const s = { ...DEFAULTS, ...defaults };
  for (let j = 0; j < i && j < items.length; j++) {
    const it = items[j];
    if (isChar(it)) continue;
    if (it.c === 'LRMar') { s.lMar = it.l; s.rMar = it.r; }
    else if (it.c === 'TBMar') { s.tMar = it.t; s.bMar = it.b; }
    else if (it.c === 'Just') s.just = it.v;
    else if (it.c === 'LnSpacing') s.spacing = it.v;
    else if (it.c === 'TabSet') s.tabs = it.tabs;
    else if (it.c === 'Font') s.font = it.v;
    else if (it.c === 'PgNum') s.pgNum = it.v;
  }
  return s;
}
