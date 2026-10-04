// Spell (Ctrl-F2).

import { App } from './app.js';
import { Speller } from '../core/spell.js';
import { WORDS } from '../core/words.js';
import { isWordChar } from '../core/stream.js';
import { COLS } from './screen.js';

const P = App.prototype;
const SUP_KEY = 'hardreturn:supplement';

P.speller = function () {
  if (!this._speller) {
    let extra = [];
    try { extra = JSON.parse(localStorage.getItem(SUP_KEY) || '[]'); } catch { /* none */ }
    this._speller = new Speller(WORDS, extra);
  }
  return this._speller;
};

function nextWord(items, i, end) {
  while (i < end && !isWordChar(items[i])) i++;
  if (i >= end) return null;
  let j = i;
  while (j < end && isWordChar(items[j])) j++;
  // trim apostrophes and hyphens at the edges
  let a = i, b = j;
  while (a < b && /['’-]/.test(items[a])) a++;
  while (b > a && /['’-]/.test(items[b - 1])) b--;
  return { a, b, next: j };
}

P.spell = function () {
  return this.run(async () => {
    const ed = this.ed;
    const sp = this.speller();
    const c = await this.choose('Spell: ', [['1', 'Word', 'W'], ['2', 'Page', 'P'], ['3', 'Document', 'D'], ['4', 'New Sup. Dictionary', 'N'], ['5', 'Look Up', 'L'], ['6', 'Count', 'C']]);
    if (!c) return;
    if (c === '6') { await this.waitKey(`Word count: ${ed.wordCount()}    Press any key to continue`); return; }
    if (c === '4') { this.message('Not available in this version'); return; }
    if (c === '5') {
      const w = await this.input('Word or word pattern: ', '');
      if (w) await this.suggestScreen(w, sp.check(w) ? [w] : sp.suggest(w, 24), 'Press any key to continue');
      return;
    }
    let start, end;
    if (c === '1') {
      start = ed.cursor;
      while (start > 0 && isWordChar(ed.items[start - 1])) start--;
      const w = nextWord(ed.items, start, ed.length);
      end = w ? w.next : ed.length;
    } else if (c === '2') {
      const { page } = this.where();
      start = page.lines[0].start;
      end = page.lines[page.lines.length - 1].end;
    } else { start = 0; end = ed.length; }
    const skip = this._skip || (this._skip = new Set());
    let i = start;
    let count = 0;
    for (;;) {
      const w = nextWord(ed.items, i, end);
      if (!w) break;
      count++;
      const word = ed.items.slice(w.a, w.b).join('');
      i = w.next;
      if (!word || sp.check(word) || skip.has(word.toLowerCase())) continue;
      ed.setCursor(w.a);
      this.highlight = [w.a, w.b];
      const sugg = sp.suggest(word, 24);
      const act = await this.notFound(sugg);
      this.highlight = null;
      if (act === null) { ed.setCursor(w.b); return; }
      if (act.pick) {
        const before = ed.length;
        ed.replaceWord(w.a, w.b, act.pick);
        const d = ed.length - before;
        end += d; i += d;
      } else if (act.op === '2') skip.add(word.toLowerCase());
      else if (act.op === '3') {
        sp.add(word);
        try { localStorage.setItem(SUP_KEY, JSON.stringify([...sp.extra])); } catch { /* not saved */ }
      } else if (act.op === '4') {
        const fixed = await this.input('Edit: ', word, { keepInitial: true });
        if (fixed && fixed !== word) {
          const before = ed.length;
          ed.replaceWord(w.a, w.b, fixed);
          const d = ed.length - before;
          end += d; i = w.a; // check the edited word again
        }
      } else if (act.op === '5') {
        const q = await this.input('Word or word pattern: ', word);
        if (q) await this.suggestScreen(q, sp.suggest(q, 24), 'Press any key to continue');
        i = w.a;
      }
    }
    ed.setCursor(Math.min(end, ed.length));
    if (c !== '1') await this.waitKey(`Word count: ${count}    Press any key to continue`);
  });
};

P.drawSpellTop = function (scr) {
  this.drawEditor(scr, { rows: 12, statusRow: 12 });
  scr.put(13, 0, '═'.repeat(COLS));
};

P.drawSuggestions = function (scr, sugg) {
  sugg.slice(0, 24).forEach((s, k) => {
    const row = 14 + Math.floor(k / 3);
    const col = (k % 3) * 26 + 2;
    scr.put(row, col, `${String.fromCharCode(65 + k)}. ${s}`.slice(0, 25));
  });
};

P.notFound = function (sugg) {
  return new Promise((resolve) => {
    const done = (v) => { this.pop(m); resolve(v); };
    const m = this.push({
      full: true,
      draw: (scr) => {
        this.drawSpellTop(scr);
        this.drawSuggestions(scr, sugg);
        const c = scr.puts(24, 0, ['Not Found: 1 ', ['S', 'mn'], 'kip Once; 2 S', ['k', 'mn'], 'ip; 3 ', ['A', 'mn'], 'dd; 4 ', ['E', 'mn'], 'dit; 5 ', ['L', 'mn'], 'ook Up; 6 ', ['I', 'mn'], 'gnore Numbers: 0']);
        scr.setCursor(24, c - 1);
      },
      key: (k) => {
        if (k === 'F1' || k === 'Esc' || k === 'F7') { done(null); return true; }
        if (/^[1-6]$/.test(k)) { done({ op: k }); return true; }
        if (/^[a-x]$/i.test(k)) {
          const n = k.toUpperCase().charCodeAt(0) - 65;
          if (sugg[n]) done({ pick: sugg[n] });
          return true;
        }
        return true;
      },
    });
  });
};

P.suggestScreen = function (word, sugg, prompt) {
  return new Promise((resolve) => {
    const m = this.push({
      full: true,
      draw: (scr) => {
        this.drawSpellTop(scr);
        if (!sugg.length) scr.put(14, 2, `No matches for ${word}`);
        this.drawSuggestions(scr, sugg);
        const c = scr.put(24, 0, prompt);
        scr.setCursor(24, c);
      },
      key: () => { this.pop(m); resolve(); return true; },
    });
  });
};
