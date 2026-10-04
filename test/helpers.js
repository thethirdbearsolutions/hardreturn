import { itemsOf } from '../src/core/stream.js';
import { code } from '../src/core/codes.js';
export const T = (s) => itemsOf(s);
export const C = code;
// Lines of a layout as plain strings (chars only).
export function lineTexts(res) {
  return res.lines.map((l) => l.items.map((p) => p.ch ?? p.text ?? '').join('').replace(/ +$/, ''));
}
export function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
