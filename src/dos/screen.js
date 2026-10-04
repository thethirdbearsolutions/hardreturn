// An 80x25 text-mode screen of DOM cells. Draw into the back buffer with
// put/fill, then flush() to update only the cells that changed.

export const COLS = 80;
export const ROWS = 25;

export class Screen {
  constructor(el) {
    this.el = el;
    this.cells = [];
    this.ch = new Array(COLS * ROWS).fill(' ');
    this.cls = new Array(COLS * ROWS).fill('');
    this.shownCh = new Array(COLS * ROWS).fill(null);
    this.shownCls = new Array(COLS * ROWS).fill(null);
    this.cursor = { row: 0, col: 0, on: false };
    const frag = document.createDocumentFragment();
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      for (let c = 0; c < COLS; c++) {
        const s = document.createElement('span');
        s.dataset.r = r;
        s.dataset.c = c;
        row.appendChild(s);
        this.cells.push(s);
      }
      frag.appendChild(row);
    }
    el.appendChild(frag);
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'cursor';
    el.appendChild(this.cursorEl);
  }

  clear(cls = '') {
    this.ch.fill(' ');
    this.cls.fill(cls);
    this.cursor.on = false;
  }

  put(row, col, text, cls = '') {
    if (row < 0 || row >= ROWS) return col;
    for (const ch of text) {
      if (col >= 0 && col < COLS) {
        const k = row * COLS + col;
        this.ch[k] = ch;
        this.cls[k] = cls;
      }
      col++;
    }
    return col;
  }

  // Segments: [[text, cls], …] or strings; returns the next column.
  puts(row, col, segs, cls = '') {
    for (const s of segs) col = typeof s === 'string' ? this.put(row, col, s, cls) : this.put(row, col, s[0], s[1] ?? cls);
    return col;
  }

  fill(row, col, len, ch = ' ', cls = '') { this.put(row, col, ch.repeat(Math.max(0, len)), cls); }

  // Change the class of existing cells (for highlights).
  paint(row, col, len, cls) {
    for (let c = col; c < col + len && c < COLS; c++) if (c >= 0 && row >= 0 && row < ROWS) this.cls[row * COLS + c] = cls;
  }

  addClass(row, col, len, extra) {
    for (let c = col; c < col + len && c < COLS; c++) {
      if (c < 0 || row < 0 || row >= ROWS) continue;
      const k = row * COLS + c;
      this.cls[k] = this.cls[k] ? this.cls[k] + ' ' + extra : extra;
    }
  }

  box(row, col, h, w, cls = '', double = false) {
    const [tl, tr, bl, br, hz, vt] = double ? '╔╗╚╝═║' : '┌┐└┘─│';
    this.put(row, col, tl + hz.repeat(w - 2) + tr, cls);
    for (let r = row + 1; r < row + h - 1; r++) {
      this.put(r, col, vt, cls);
      this.fill(r, col + 1, w - 2, ' ', cls);
      this.put(r, col + w - 1, vt, cls);
    }
    this.put(row + h - 1, col, bl + hz.repeat(w - 2) + br, cls);
  }

  setCursor(row, col) { this.cursor = { row, col, on: true }; }

  textAt(row) {
    return this.ch.slice(row * COLS, row * COLS + COLS).join('');
  }

  flush() {
    for (let k = 0; k < this.ch.length; k++) {
      if (this.ch[k] !== this.shownCh[k]) { this.cells[k].textContent = this.ch[k]; this.shownCh[k] = this.ch[k]; }
      if (this.cls[k] !== this.shownCls[k]) { this.cells[k].className = this.cls[k]; this.shownCls[k] = this.cls[k]; }
    }
    const c = this.cursor;
    this.cursorEl.style.display = c.on ? 'block' : 'none';
    if (c.on) {
      this.cursorEl.style.left = `calc(var(--cw) * ${c.col})`;
      this.cursorEl.style.top = `calc(var(--ch) * ${c.row})`;
      // restart the blink so the cursor is visible right after it moves
      this.cursorEl.style.animation = 'none';
      void this.cursorEl.offsetWidth;
      this.cursorEl.style.animation = '';
    }
  }
}
