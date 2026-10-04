// The Ruler Bar: inch scale, margin markers you can drag, tab markers.

import { stateAt } from '../core/layout.js';
import { inches } from '../core/codes.js';

const H = 28;
const SNAP = 0.05;

export class Ruler {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.drag = null;
    this.canvas.addEventListener('mousedown', (e) => this.down(e));
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.drag) this.canvas.style.cursor = this.markerAt(e) ? 'ew-resize' : 'default';
    });
  }

  state() {
    const ed = this.app.ed;
    return stateAt(ed.items, ed.cursor, this.app.layoutDefaults());
  }

  xOf(inch) {
    const v = this.app.view;
    const g = v.geometry();
    return g.x0 + inch * g.ppi - v.scroller.scrollLeft;
  }

  markerAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (y > 11) return null;
    const st = this.state();
    if (Math.abs(x - this.xOf(st.lMar)) <= 5) return 'l';
    if (Math.abs(x - this.xOf(st.pageW - st.rMar)) <= 5) return 'r';
    return null;
  }

  down(e) {
    const which = this.markerAt(e);
    if (!which) return;
    e.preventDefault();
    const st = this.state();
    const g = this.app.view.geometry();
    const r = this.canvas.getBoundingClientRect();
    this.drag = { which, value: which === 'l' ? st.lMar : st.rMar, st };
    const move = (ev) => {
      const xin = (ev.clientX - r.left - (g.x0 - this.app.view.scroller.scrollLeft)) / g.ppi;
      let v = which === 'l' ? xin : st.pageW - xin;
      v = Math.round(v / SNAP) * SNAP;
      const other = which === 'l' ? st.rMar : st.lMar;
      v = Math.max(0, Math.min(st.pageW - other - 0.5, v));
      this.drag.value = v;
      this.app.view.showGuide(which === 'l' ? v : st.pageW - v);
      this.app.statusNote(`${which === 'l' ? 'Left' : 'Right'} Margin: ${inches(v)}`);
      this.render();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.app.view.showGuide(null);
      this.app.statusNote(null);
      const d = this.drag;
      this.drag = null;
      const was = which === 'l' ? st.lMar : st.rMar;
      if (Math.abs(d.value - was) > 1e-9) this.app.setMargin(which, d.value);
      else this.render();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    move(e);
  }

  render() {
    const cv = this.canvas;
    const w = this.el.clientWidth;
    const dpr = globalThis.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${H}px`;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, 0, w, H);
    const st = this.drag ? { ...this.drag.st, [this.drag.which === 'l' ? 'lMar' : 'rMar']: this.drag.value } : this.state();
    const g = this.app.view.geometry();
    const ppi = g.ppi;
    const X = (inch) => Math.round(this.xOf(inch));
    const x0 = X(0), x1 = X(st.pageW);
    const lx = X(st.lMar), rx = X(st.pageW - st.rMar);
    // margin band
    ctx.fillStyle = '#808080';
    ctx.fillRect(x0, 2, lx - x0, 8);
    ctx.fillRect(rx, 2, x1 - rx, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(lx, 2, rx - lx, 8);
    // scale
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0, 11, x1 - x0, 10);
    ctx.fillStyle = '#000';
    ctx.fillRect(x0, 20, x1 - x0, 1);
    ctx.font = '9px "Microsoft Sans Serif", "MS Sans Serif", Tahoma, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const step = ppi >= 60 ? 8 : ppi >= 30 ? 4 : 2;
    for (let k = 0; k <= st.pageW * step + 1e-9; k++) {
      const x = X(k / step) + 0.5;
      const major = k % step === 0, half = step >= 2 && k % (step / 2) === 0;
      const len = major ? 0 : half ? 5 : 3;
      if (!major) { ctx.fillRect(Math.floor(x), 20 - len, 1, len); continue; }
      const n = k / step;
      if (n > 0 && n < st.pageW) ctx.fillText(String(n), x, 19);
    }
    // margin markers
    const marker = (x, left) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 1, 1, 3, 10);
      ctx.fillStyle = '#808080';
      ctx.fillRect(left ? x + 2 : x - 4, 3, 2, 6);
    };
    marker(lx, true);
    marker(rx, false);
    // tab markers: a small left-tab triangle under the scale
    ctx.fillStyle = '#000';
    for (const t of st.tabs) {
      if (t.pos <= st.lMar + 1e-6 || t.pos >= st.pageW - st.rMar - 1e-6) continue;
      const x = X(t.pos);
      ctx.beginPath();
      if (t.type === 'R') { ctx.moveTo(x + 1, 22); ctx.lineTo(x + 1, 27); ctx.lineTo(x - 4, 27); }
      else if (t.type === 'C' || t.type === 'D') { ctx.moveTo(x, 22); ctx.lineTo(x + 3, 27); ctx.lineTo(x - 3, 27); }
      else { ctx.moveTo(x, 22); ctx.lineTo(x, 27); ctx.lineTo(x + 5, 27); }
      ctx.closePath();
      ctx.fill();
      if (t.type === 'D') { ctx.fillStyle = '#fff'; ctx.fillRect(x, 25, 1, 1); ctx.fillStyle = '#000'; }
    }
  }
}
