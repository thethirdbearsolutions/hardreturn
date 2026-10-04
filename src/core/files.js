// Disks. Both stores speak absolute paths in their own convention and
// return file records shaped like terrarium/1 files:
//   { path, name, mime, content, mtime }  and list entries { path, name, size, mtime }.

export class NotFound extends Error {
  constructor(path) { super(`File not found -- ${path}`); this.code = 'ENOENT'; }
}

// A fake DOS disk in localStorage. Paths look like C:\WP51\LETTER.HR and
// are case-insensitive.
export class LocalStore {
  constructor({ storage = globalThis.localStorage, prefix = 'hardreturn:disk:', home = 'C:\\WP51\\' } = {}) {
    this.storage = storage;
    this.prefix = prefix;
    this.home = home;
    this.sep = '\\';
    this.canDelete = true;
  }
  _key(path) { return this.prefix + path.toUpperCase(); }
  join(dir, name) { return dir.endsWith('\\') ? dir + name : dir + '\\' + name; }
  basename(path) { return path.slice(path.lastIndexOf('\\') + 1); }
  dirname(path) { return path.slice(0, path.lastIndexOf('\\') + 1); }
  _all() {
    const out = [];
    try {
      for (let k = 0; k < this.storage.length; k++) {
        const key = this.storage.key(k);
        if (key && key.startsWith(this.prefix)) out.push(key.slice(this.prefix.length));
      }
    } catch { /* storage unavailable */ }
    return out;
  }
  async list(dir) {
    const d = dir.toUpperCase().endsWith('\\') ? dir.toUpperCase() : dir.toUpperCase() + '\\';
    const out = [];
    for (const path of this._all()) {
      if (!path.startsWith(d) || path.slice(d.length).includes('\\')) continue;
      const rec = this._get(path);
      if (rec) out.push({ path, name: this.basename(path), size: rec.content.length, mtime: rec.mtime, dir: false });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  _get(path) {
    try {
      const raw = this.storage.getItem(this._key(path));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  async exists(path) { return !!this._get(path); }
  async read(path) {
    const rec = this._get(path);
    if (!rec) throw new NotFound(path);
    return { path: path.toUpperCase(), name: this.basename(path).toUpperCase(), ...rec };
  }
  async write(path, content, mime = 'text/plain') {
    const rec = { content, mime, mtime: Date.now() };
    this.storage.setItem(this._key(path), JSON.stringify(rec));
    return { path: path.toUpperCase() };
  }
  async remove(path) {
    if (!this._get(path)) throw new NotFound(path);
    this.storage.removeItem(this._key(path));
  }
  async rename(from, to) {
    const rec = this._get(from);
    if (!rec) throw new NotFound(from);
    this.storage.setItem(this._key(to), JSON.stringify(rec));
    if (this._key(from) !== this._key(to)) this.storage.removeItem(this._key(from));
  }
  // Path of an existing file matching case-insensitively, else the joined path.
  async resolve(name, dir = this.home) {
    return (name.includes('\\') ? name : this.join(dir, name)).toUpperCase();
  }
}

// The shell's disk over terrarium/1.
export class TerrariumStore {
  constructor(client, home = '/Documents/') {
    this.client = client;
    this.home = home;
    this.sep = '/';
    this.canDelete = false;
  }
  join(dir, name) { return dir.endsWith('/') ? dir + name : dir + '/' + name; }
  basename(path) { return path.slice(path.lastIndexOf('/') + 1); }
  dirname(path) { return path.slice(0, path.lastIndexOf('/') + 1); }
  async list(dir) {
    const r = await this.client.request('list', { dir: dir.replace(/\/$/, '') || '/' });
    return (r.entries || []).filter((e) => !e.dir).sort((a, b) => a.name.localeCompare(b.name));
  }
  async read(path) {
    try {
      const r = await this.client.request('read', { path });
      return r.file;
    } catch (e) {
      if (e.cancelled) throw e;
      throw new NotFound(path);
    }
  }
  async exists(path) {
    try {
      const ls = await this.list(this.dirname(path));
      return ls.some((e) => e.path.toLowerCase() === path.toLowerCase());
    } catch { return false; }
  }
  async write(path, content, mime) {
    const r = await this.client.request('save', { path, name: this.basename(path), content, mime });
    return { path: r.path || path };
  }
  async remove() { throw new Error('Not supported on this disk'); }
  async rename() { throw new Error('Not supported on this disk'); }
  async resolve(name, dir = this.home) {
    const path = name.includes('/') ? name : this.join(dir, name);
    try {
      const ls = await this.list(this.dirname(path));
      const hit = ls.find((e) => e.path.toLowerCase() === path.toLowerCase());
      if (hit) return hit.path;
    } catch { /* fall through */ }
    return path;
  }
}
