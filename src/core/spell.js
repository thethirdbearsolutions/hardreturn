// Spell checking against a word list, with suffix rules and edit-distance
// suggestions.

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export class Speller {
  constructor(words = [], extra = []) {
    this.words = new Set();
    for (const w of words) this.words.add(w.toLowerCase());
    this.extra = new Set(extra.map((w) => w.toLowerCase()));
  }

  add(word) { this.extra.add(word.toLowerCase()); }

  _has(w) { return this.words.has(w) || this.extra.has(w); }

  check(word) {
    const w = word.toLowerCase().replace(/[’]/g, "'");
    if (!/[a-z]/.test(w)) return true; // numbers and symbols
    if (this._has(w)) return true;
    const base = w.replace(/'s$|s'$/, '');
    if (base !== w && this._has(base)) return true;
    return this._stems(w).some((s) => this._has(s));
  }

  _stems(w) {
    const out = [];
    const rules = [
      [/ies$/, 'y'], [/es$/, ''], [/s$/, ''],
      [/ied$/, 'y'], [/ed$/, ''], [/ed$/, 'e'], [/d$/, ''],
      [/ing$/, ''], [/ing$/, 'e'],
      [/ily$/, 'y'], [/ly$/, ''], [/ally$/, ''],
      [/ier$/, 'y'], [/er$/, ''], [/er$/, 'e'], [/r$/, ''],
      [/iest$/, 'y'], [/est$/, ''], [/est$/, 'e'],
      [/ness$/, ''], [/ment$/, ''], [/ful$/, ''], [/less$/, ''],
      [/^un/, ''], [/^re/, ''],
    ];
    for (const [re, rep] of rules) {
      if (!re.test(w)) continue;
      const s = w.replace(re, rep);
      if (s.length < 2) continue;
      out.push(s);
      // doubled consonant: stopped -> stop, running -> run
      if (/([b-df-hj-np-tv-z])\1$/.test(s)) out.push(s.slice(0, -1));
    }
    return out;
  }

  static edits(w) {
    const out = new Set();
    for (let i = 0; i <= w.length; i++) {
      const a = w.slice(0, i), b = w.slice(i);
      if (b) out.add(a + b.slice(1));
      if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2));
      for (const c of LETTERS) {
        if (b) out.add(a + c + b.slice(1));
        out.add(a + c + b);
      }
    }
    return out;
  }

  suggest(word, max = 12) {
    const w = word.toLowerCase();
    const found = new Map();
    const e1 = Speller.edits(w);
    for (const c of e1) if (this.check(c) && /^[a-z']+$/.test(c)) found.set(c, 1);
    if (found.size < max && w.length < 12) {
      for (const c of e1) {
        for (const d of Speller.edits(c)) {
          if (!found.has(d) && this._has(d)) found.set(d, 2);
        }
        if (found.size > 40) break;
      }
    }
    const caps = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
    return [...found.entries()]
      .sort((a, b) => a[1] - b[1] || Math.abs(a[0].length - w.length) - Math.abs(b[0].length - w.length) || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([s]) => (caps ? s[0].toUpperCase() + s.slice(1) : s));
  }
}
