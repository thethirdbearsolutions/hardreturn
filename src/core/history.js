// Undo and redo for an Editor, by snapshots of the item array. Codes are
// immutable values, so a shallow copy of the array is a full snapshot.
//
// Call before(group) ahead of a change and after() once it is done. Changes
// in the same group (typing) with nothing in between undo together.

export class History {
  constructor(ed, { limit = 200 } = {}) {
    this.ed = ed;
    this.limit = limit;
    this.undos = [];
    this.redos = [];
    this._group = null;
    this._rev = null;
    this._cursor = null;
  }

  _snap() {
    const ed = this.ed;
    return { items: ed.items.slice(), cursor: ed.cursor, rev: ed.rev };
  }

  before(group = null) {
    const ed = this.ed;
    if (group && group === this._group && ed.rev === this._rev && ed.cursor === this._cursor) {
      this._pending = false;
      return;
    }
    this.undos.push(this._snap());
    if (this.undos.length > this.limit) this.undos.shift();
    this._pending = true;
    this._group = group;
  }

  after() {
    const ed = this.ed;
    const top = this.undos[this.undos.length - 1];
    if (this._pending && top && top.rev === ed.rev) {
      // nothing changed
      this.undos.pop();
      this._group = null;
    } else if (top && top.rev !== ed.rev) {
      this.redos = [];
    }
    this._pending = false;
    this._rev = ed.rev;
    this._cursor = ed.cursor;
  }

  // Forget the change begun by before(), when it was put back by hand.
  drop() {
    if (this._pending) this.undos.pop();
    this._pending = false;
    this._group = null;
    this._rev = this.ed.rev;
    this._cursor = this.ed.cursor;
  }

  // Run fn as one undoable change.
  change(fn, group = null) {
    this.before(group);
    try { return fn(); } finally { this.after(); }
  }

  get canUndo() { return this.undos.length > 0; }
  get canRedo() { return this.redos.length > 0; }

  _restore(snap) {
    const ed = this.ed;
    ed.items = snap.items.slice();
    ed.anchor = null;
    ed._changed();
    ed.setCursor(snap.cursor);
    this._group = null;
    this._rev = ed.rev;
    this._cursor = ed.cursor;
  }

  undo() {
    const snap = this.undos.pop();
    if (!snap) return false;
    this.redos.push(this._snap());
    this._restore(snap);
    return true;
  }

  redo() {
    const snap = this.redos.pop();
    if (!snap) return false;
    this.undos.push(this._snap());
    this._restore(snap);
    return true;
  }

  clear() {
    this.undos = [];
    this.redos = [];
    this._group = null;
  }
}
