// The document area: laid-out pages drawn on a canvas the size of the
// window, over a scroller whose spacer is the size of all the pages at the
// current zoom. Text is drawn glyph by glyph at the advances the PDF uses,
// so the screen and the printout agree.

import { pageOps } from '../core/pdf.js';
import { glyphEm } from '../core/measure.js';
import { lineAt, caretX, indexAtX } from '../core/layout.js';

export const CSS_FAMILY = {
  Courier: '"Courier New", Cousine, Courier, monospace',
  Times: '"Times New Roman", Tinos, Times, serif',
  Helvetica: 'Arial, Arimo, Helvetica, sans-serif',
};

const PAD = 12; // px around the pages
const GAP = 12; // px between pages

export class PageView {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.scroller = el.querySelector('.scroller');
    this.spacer = el.querySelector('.spacer');
    this.canvas = el.querySelector('canvas');
    this.caret = el.querySelector('.caret');
    this.guide = el.querySelector('.guide');
    this.ppi = 96;
    this._ops = { rev: -1, pages: new Map() };
    this._caretKey = '';
    this.scroller.addEventListener('scroll', () => this.draw());
  }

  get draft() { return this.app.prefs.mode === 'draft'; }

  // Pixels per inch for the zoom setting and the window width.
  computePpi(res) {
    const z = this.app.prefs.zoom;
    const vw = Math.max(100, this.scroller.clientWidth);
    const vh = Math.max(100, this.scroller.clientHeight);
    const p = res.pages[0];
    if (z === 'margin') {
      const textW = Math.max(1, p.w - p.lMar - p.rMar);
      return (vw - 2 * 20) / textW;
    }
    if (z === 'page') return (vw - 2 * PAD - 4) / p.w;
    if (z === 'full') return Math.min((vh - 2 * PAD - 4) / p.h, (vw - 2 * PAD - 4) / p.w);
    return (96 * z) / 100;
  }

  // Where each page sits, in px of the scroller's content.
  geometry() {
    const res = this.app.layout();
    const key = `${this.app.doc.ed.rev}|${this.app.prefs.zoom}|${this.app.prefs.mode}|${this.scroller.clientWidth}|${this.scroller.clientHeight}|${this.app.cur}`;
    if (this._geo && this._geo.key === key) return this._geo;
    const ppi = this.ppi = this.computePpi(res);
    const vw = this.scroller.clientWidth;
    const boxes = [];
    let y = this.draft ? 0 : PAD;
    let maxW = 0;
    for (const p of res.pages) {
      let y0 = 0, hIn = p.h;
      if (this.draft) {
        const last = p.lines[p.lines.length - 1];
        y0 = Math.min(p.tMar, p.lines[0]?.y ?? p.tMar);
        const bottom = Math.max(p.h - p.bMar, last ? last.y + last.adv : 0);
        hIn = bottom - y0;
      }
      const box = { page: p, top: y, y0, hIn, h: hIn * ppi };
      boxes.push(box);
      y += box.h + (this.draft ? 0 : GAP);
      maxW = Math.max(maxW, p.w);
    }
    const pageW = maxW * ppi;
    let x0, contentW;
    if (this.app.prefs.zoom === 'margin') {
      const p = res.pages[0];
      x0 = 20 - p.lMar * ppi;
      contentW = vw;
    } else {
      x0 = Math.max(PAD, (vw - pageW) / 2);
      contentW = Math.max(vw, pageW + 2 * PAD);
    }
    const contentH = y + (this.draft ? 0 : PAD - GAP);
    this._geo = { key, ppi, boxes, x0, contentW, contentH, res };
    this.spacer.style.width = `${Math.ceil(contentW)}px`;
    this.spacer.style.height = `${Math.ceil(contentH)}px`;
    return this._geo;
  }

  pageOps(page) {
    const rev = this.app.doc.ed.rev + ':' + this.app.cur;
    if (this._ops.rev !== rev) this._ops = { rev, pages: new Map() };
    let ops = this._ops.pages.get(page.index);
    if (!ops) { ops = pageOps(page); this._ops.pages.set(page.index, ops); }
    return ops;
  }

  // Screen box of an insertion point, in scroller content px.
  caretBox(i = this.app.ed.cursor) {
    const g = this.geometry();
    const line = lineAt(g.res, i);
    const box = g.boxes[line.page];
    const x = caretX(line, i);
    return {
      x: g.x0 + x * g.ppi,
      y: box.top + (line.y - box.y0) * g.ppi,
      h: Math.max(2, line.h * g.ppi),
      line,
    };
  }

  // The insertion point nearest a point in the scroller's client area.
  hit(clientX, clientY) {
    const g = this.geometry();
    const r = this.scroller.getBoundingClientRect();
    const cx = clientX - r.left + this.scroller.scrollLeft;
    const cy = clientY - r.top + this.scroller.scrollTop;
    let box = g.boxes[g.boxes.length - 1];
    for (const b of g.boxes) { if (cy < b.top + b.h + GAP / 2) { box = b; break; } }
    const yin = box.y0 + (cy - box.top) / g.ppi;
    const xin = (cx - g.x0) / g.ppi;
    const lines = box.page.lines;
    let line = lines[lines.length - 1];
    for (const l of lines) { if (yin < l.y + l.adv) { line = l; break; } }
    return indexAtX(g.res, line, xin);
  }

  ensureVisible() {
    const c = this.caretBox();
    const s = this.scroller;
    const vh = s.clientHeight, vw = s.clientWidth;
    if (c.y < s.scrollTop + 4) s.scrollTop = Math.max(0, c.y - 24);
    else if (c.y + c.h > s.scrollTop + vh - 4) s.scrollTop = c.y + c.h - vh + 24;
    if (c.x < s.scrollLeft + 4) s.scrollLeft = Math.max(0, c.x - 40);
    else if (c.x > s.scrollLeft + vw - 8) s.scrollLeft = c.x - vw + 40;
  }

  draw() {
    const app = this.app;
    const g = this.geometry();
    const s = this.scroller;
    const vw = s.clientWidth, vh = s.clientHeight;
    const dpr = globalThis.devicePixelRatio || 1;
    const cv = this.canvas;
    if (cv.width !== Math.round(vw * dpr) || cv.height !== Math.round(vh * dpr)) {
      cv.width = Math.round(vw * dpr);
      cv.height = Math.round(vh * dpr);
      cv.style.width = `${vw}px`;
      cv.style.height = `${vh}px`;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.draft ? '#fff' : '#808080';
    ctx.fillRect(0, 0, vw, vh);
    const st = s.scrollTop, sl = s.scrollLeft;
    const ed = app.ed;
    const [sa, sb] = ed.blockOn ? ed.blockRange() : app.highlight || [-1, -1];
    const ppi = g.ppi;
    for (const box of g.boxes) {
      if (box.top + box.h < st - GAP || box.top > st + vh + GAP) continue;
      const p = box.page;
      const px = Math.round(g.x0 - sl), py = Math.round(box.top - st);
      const pw = Math.round(p.w * ppi), ph = Math.round(box.h);
      const X = (x) => px + x * ppi;
      const Y = (y) => py + (y - box.y0) * ppi;
      if (!this.draft) {
        ctx.fillStyle = '#000';
        ctx.fillRect(px + 3, py + 3, pw, ph);
        ctx.fillStyle = '#fff';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
        if (app.prefs.guides !== false) {
          // margin guidelines, dotted
          ctx.save();
          ctx.strokeStyle = '#a0a0a0';
          ctx.setLineDash([1, 2]);
          ctx.beginPath();
          const gx1 = Math.round(X(p.lMar)) + 0.5, gx2 = Math.round(X(p.w - p.rMar)) + 0.5;
          const gy1 = Math.round(Y(p.tMar)) + 0.5, gy2 = Math.round(Y(p.h - p.bMar)) + 0.5;
          ctx.moveTo(gx1, py); ctx.lineTo(gx1, py + ph);
          ctx.moveTo(gx2, py); ctx.lineTo(gx2, py + ph);
          ctx.moveTo(px, gy1); ctx.lineTo(px + pw, gy1);
          ctx.moveTo(px, gy2); ctx.lineTo(px + pw, gy2);
          ctx.stroke();
          ctx.restore();
        }
      } else if (p.index > 0) {
        // page break: a single line for a soft break, double for a hard one
        ctx.fillStyle = '#000';
        ctx.fillRect(0, py, vw, 1);
        if (p.hardBefore) ctx.fillRect(0, py + 2, vw, 1);
      }
      this.drawText(ctx, p, X, Y, ppi);
      if (sa < sb) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#fff';
        for (const line of p.lines) {
          if (line.end <= sa || line.start >= sb) continue;
          const a = Math.max(sa, line.start), b = Math.min(sb, line.end);
          const x1 = caretX(line, a);
          let x2;
          if (b < line.end) x2 = caretX(line, b);
          else {
            const last = line.items[line.items.length - 1];
            x2 = last ? last.x + last.w : line.left;
            if (line.how === 'hard' || line.how === 'hpg') x2 += 0.06;
          }
          const y1 = Math.round(Y(line.y)), y2 = Math.round(Y(line.y + line.adv));
          ctx.fillRect(Math.round(X(x1)), y1, Math.max(1, Math.round(X(x2)) - Math.round(X(x1))), y2 - y1);
        }
        ctx.restore();
      }
    }
    this.placeCaret();
  }

  drawText(ctx, page, X, Y, ppi) {
    let font = '';
    ctx.textBaseline = 'alphabetic';
    // unhinted outlines, so glyphs sit where the advances put them
    if ('textRendering' in ctx) ctx.textRendering = 'geometricPrecision';
    if ('fontKerning' in ctx) ctx.fontKerning = 'none';
    for (const op of this.pageOps(page)) {
      if (op.kind === 'rule') {
        ctx.fillStyle = '#000';
        const h = Math.max(1, Math.round(op.w * ppi));
        ctx.fillRect(Math.round(X(op.x1)), Math.round(Y(op.y) - h / 2), Math.max(1, Math.round((op.x2 - op.x1) * ppi)), h);
        continue;
      }
      const bold = op.font & 1, ital = op.font & 2;
      const px = (op.pt / 72) * ppi;
      const f = `${ital ? 'italic ' : ''}${bold ? 'bold ' : ''}${px.toFixed(2)}px ${CSS_FAMILY[op.family] || CSS_FAMILY.Courier}`;
      if (f !== font) { ctx.font = f; font = f; }
      const y = Y(op.y);
      const color = op.attrs.includes('REDLN') ? '#c00000' : '#000';
      // a run is drawn whole, squeezed or stretched to the printer's width
      // when the screen face sets it a little differently; glyph by glyph
      // when it is far off
      const shadow = op.attrs.includes('SHADW'), outline = op.attrs.includes('OUTLN');
      const put = (text, sx) => {
        if (shadow) { ctx.fillStyle = '#909090'; ctx.fillText(text, sx + px * 0.06, y + px * 0.06); }
        if (outline) { ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.5, px / 30); ctx.strokeText(text, sx, y); }
        else { ctx.fillStyle = color; ctx.fillText(text, sx, y); }
      };
      const want = op.adv * ppi;
      const got = ctx.measureText(op.text).width;
      if (Math.abs(got - want) <= 0.75) { put(op.text, X(op.x)); continue; }
      const k = want / got;
      if (got > 0 && k > 0.88 && k < 1.12) {
        const x0 = X(op.x);
        ctx.save();
        ctx.translate(x0, 0);
        ctx.scale(k, 1);
        put(op.text, 0);
        ctx.restore();
        continue;
      }
      let x = op.x;
      for (const ch of op.text) {
        put(ch, X(x));
        x += (glyphEm(op.font, ch) * op.pt) / 72;
      }
    }
  }

  placeCaret() {
    const c = this.caretBox();
    const s = this.scroller;
    const x = Math.round(c.x - s.scrollLeft), y = Math.round(c.y - s.scrollTop), h = Math.round(c.h);
    const el = this.caret;
    const key = `${x},${y},${h}`;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.height = `${h}px`;
    if (key !== this._caretKey) {
      // restart the blink so the caret shows while it moves
      this._caretKey = key;
      el.classList.remove('blink');
      void el.offsetWidth;
      el.classList.add('blink');
    }
  }

  // A dotted guide while dragging a ruler marker (x in inches, or null).
  showGuide(xin) {
    if (xin === null) { this.guide.hidden = true; return; }
    const g = this.geometry();
    this.guide.hidden = false;
    this.guide.style.transform = `translateX(${Math.round(g.x0 + xin * g.ppi - this.scroller.scrollLeft)}px)`;
  }
}
