// Keyboard events to key names, and the two keyboards: the Windows one
// (CUA) and the one that keeps the DOS function keys.
//
// Names are a single character for typing, otherwise a key with modifier
// prefixes in the order C- A- S-: 'C-B', 'S-Left', 'C-S-F7', 'A-F3'.

const NAMED = {
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Escape: 'Esc',
};

const mods = (e) => (e.ctrlKey ? 'C-' : '') + (e.altKey ? 'A-' : '') + (e.shiftKey ? 'S-' : '');

export function keyName(e) {
  if (e.metaKey) return null;
  if (e.isComposing || e.key === 'Dead' || e.key === 'Unidentified') return null;
  const k = e.key;
  if (/^F\d{1,2}$/.test(k)) return mods(e) + k;
  if (NAMED[k]) return mods(e) + NAMED[k];
  if ([...k].length === 1) {
    // AltGr arrives as Ctrl+Alt on Windows and should type.
    if (e.ctrlKey && e.altKey) return k;
    if (e.ctrlKey || e.altKey) {
      const letter = /^Key([A-Z])$/.exec(e.code)?.[1] || /^Digit(\d)$/.exec(e.code)?.[1] || k.toUpperCase();
      return mods(e) + letter;
    }
    return k;
  }
  return null;
}

export const isTyping = (k) => typeof k === 'string' && [...k].length === 1;

// How menus show a key: 'C-S-F7' -> 'Ctrl+Shift+F7'.
export function keyLabel(k) {
  return k.replace(/^C-/, 'Ctrl+').replace(/(^|\+)A-/, '$1Alt+').replace(/(^|\+)S-/, '$1Shift+');
}

// Keys every keyboard shares.
const COMMON = {
  'C-Z': 'undo', 'C-S-Z': 'undelete', 'C-X': 'cut', 'C-C': 'copy', 'C-V': 'paste',
  'S-Del': 'cut', 'C-Ins': 'copy', 'S-Ins': 'paste',
  'C-S': 'save', 'C-O': 'open', 'C-N': 'new', 'C-P': 'print',
  'C-B': 'bold', 'C-I': 'italic', 'C-U': 'underline',
  'C-E': 'justCenter', 'C-L': 'justLeft', 'C-R': 'justRight', 'C-J': 'justFull',
  'C-Enter': 'pageBreak', 'C-G': 'goTo', 'C-D': 'dateText', 'C-S-D': 'dateCode',
  'A-F3': 'reveal', 'A-S-F3': 'rulerBar', 'C-F1': 'speller',
};

export const CUA = {
  ...COMMON,
  F1: 'help', F2: 'find', 'S-F2': 'findNext', 'C-F2': 'replace', F3: 'saveAs', F4: 'open',
  'C-F4': 'close', 'A-F4': 'exit', F5: 'print', 'S-F5': 'dateText',
  F7: 'indent', 'S-F7': 'center', 'A-F7': 'flushRight', 'C-S-F7': 'doubleIndent',
  F8: 'select', 'C-F8': 'margins', F9: 'font', F10: 'menu', 'S-F10': 'open',
  F12: 'notBuilt', 'C-F12': 'notBuilt',
};

// The DOS function keys, where there is a command for them. They come
// first so the menus show them.
export const WPDOS = {
  F1: 'cancel', F2: 'find', 'S-F2': 'findBackward', 'A-F2': 'replace', 'C-F2': 'speller',
  F3: 'help', 'S-F3': 'nextWindow', F11: 'reveal',
  F4: 'indent', 'S-F4': 'doubleIndent', 'A-F4': 'select', F12: 'select', 'C-F4': 'cut',
  F5: 'open', 'S-F5': 'dateText', F6: 'bold', 'S-F6': 'center', 'A-F6': 'flushRight',
  F7: 'close', 'S-F7': 'print', F8: 'underline', 'S-F8': 'margins', 'C-F8': 'font',
  F10: 'save', 'S-F10': 'open', 'C-End': 'deleteToLineEnd', 'C-Backspace': 'deleteWord',
  'A-=': 'menu',
  ...COMMON,
};

export const KEYBOARDS = { cua: CUA, wpdos: WPDOS };

// The key a keyboard binds to a command, for menus.
export function keyFor(map, cmd) {
  for (const [k, c] of Object.entries(map)) if (c === cmd) return k;
  return null;
}
