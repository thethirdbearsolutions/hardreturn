// Keyboard events to key names: a single character for typing, otherwise
// a name with modifier prefixes in the order C- A- S-, e.g. 'S-F7', 'C-Left'.

const NAMED = {
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Escape: 'Esc',
};

// Shift matters for these; for the rest it is dropped.
const SHIFTED = new Set(['Tab']);

export function keyName(e) {
  if (e.metaKey) return null;
  if (e.isComposing || e.key === 'Dead' || e.key === 'Unidentified') return null;
  const k = e.key;
  if (/^F\d{1,2}$/.test(k)) return (e.ctrlKey ? 'C-' : '') + (e.altKey ? 'A-' : '') + (e.shiftKey ? 'S-' : '') + k;
  if (e.altKey && !e.ctrlKey && e.code === 'Equal') return 'A-=';
  if (NAMED[k]) {
    return (e.ctrlKey ? 'C-' : '') + (e.altKey ? 'A-' : '') + (e.shiftKey && SHIFTED.has(NAMED[k]) ? 'S-' : '') + NAMED[k];
  }
  // AltGr arrives as Ctrl+Alt on Windows and should type.
  if (k.length === 1 || [...k].length === 1) {
    if (e.ctrlKey && e.altKey) return k;
    if (e.ctrlKey || e.altKey) {
      const letter = /^Key([A-Z])$/.exec(e.code)?.[1] || /^Digit(\d)$/.exec(e.code)?.[1] || k.toUpperCase();
      return (e.ctrlKey ? 'C-' : '') + (e.altKey ? 'A-' : '') + letter;
    }
    return k;
  }
  return null;
}

export const isChar = (k) => typeof k === 'string' && [...k].length === 1;

// How the template and help name keys.
export function keyLabel(k) {
  return k.replace(/^C-/, 'Ctrl-').replace(/^A-/, 'Alt-').replace(/^S-/, 'Shft-').replace('-A-', '-Alt-').replace('-S-', '-Shft-');
}
