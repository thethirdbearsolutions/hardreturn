// The Reveal Codes pane: the stream around the cursor, one row per laid-out
// line, codes as pills, the cursor as a red block.

import { isChar, isPair } from '../core/codes.js';
import { lineAt } from '../core/layout.js';
import { pill, SRT } from './codenames.js';

const ATTR_CSS = {
  BOLD: 'font-weight:bold', ITALC: 'font-style:italic', UND: 'text-decoration:underline',
  'DBL UND': 'text-decoration:underline double', STKOUT: 'text-decoration:line-through', REDLN: 'color:#c00000',
};

export class RevealPane {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.body = el.querySelector('.codes');
    this.body.addEventListener('mousedown', (e) => {
      const t = e.target.closest('[data-i]');
      if (!t) return;
      e.preventDefault();
      app.setCursorFromMouse(Number(t.dataset.i), e.shiftKey);
    });
  }

  render() {
    const app = this.app;
    const ed = app.ed;
    const res = app.layout();
    const cur = lineAt(res, ed.cursor);
    const rowH = 16;
    const rows = Math.max(3, Math.ceil(this.body.clientHeight / rowH));
    const from = Math.max(0, cur.index - Math.floor(rows / 2) - 4);
    const to = Math.min(res.lines.length - 1, cur.index + rows + 4);
    const [ba, bb] = ed.blockOn ? ed.blockRange() : app.highlight || [-1, -1];
    const on = new Set(ed.attrs(res.lines[from].start));
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let html = '';
    for (let li = from; li <= to; li++) {
      const line = res.lines[li];
      html += '<div class="rrow">';
      for (let i = line.start; i < line.end; i++) {
        const it = ed.items[i];
        const isCur = i === ed.cursor;
        const sel = i >= ba && i < bb ? ' sel' : '';
        if (isPair(it)) { if (it.on) on.add(it.c); else on.delete(it.c); }
        const soft = isChar(it) && it === ' ' && i === line.end - 1 && line.how === 'soft';
        if (isChar(it) && !soft) {
          const style = [...on].map((a) => ATTR_CSS[a]).filter(Boolean).join(';');
          html += `<span data-i="${i}" class="ch${isCur ? ' rcur' : ''}${sel}"${style ? ` style="${style}"` : ''}>${it === ' ' ? '&nbsp;' : esc(it)}</span>`;
        } else {
          const p = pill(soft ? SRT : it, { full: isCur });
          html += `<span data-i="${i}" class="pill ${p.shape}${isCur ? ' rcur' : ''}${sel}">${esc(p.text)}</span>`;
        }
      }
      if (line.end === ed.length && li === res.lines.length - 1) {
        html += `<span data-i="${ed.length}" class="ch end${ed.cursor === ed.length ? ' rcur' : ''}">&nbsp;</span>`;
      }
      html += '</div>';
    }
    this.body.innerHTML = html;
    const c = this.body.querySelector('.rcur');
    if (c) {
      const top = c.offsetTop, b = this.body;
      if (top < b.scrollTop || top + rowH > b.scrollTop + b.clientHeight) b.scrollTop = Math.max(0, top - b.clientHeight / 2);
    }
  }
}
