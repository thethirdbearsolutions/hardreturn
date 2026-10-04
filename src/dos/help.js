// Help (F3): an intro screen, a page per function key, an alphabetical
// feature list per letter, and the template.

import { App } from './app.js';
import { TEMPLATE, MOD_PREFIX } from './template.js';
import { isChar as isCharKey, keyLabel } from './keys.js';
import { COLS } from './screen.js';

const P = App.prototype;

export const KEY_HELP = {
  F1: ['Cancel', 'Backs out of a menu or prompt without making a change.', '',
    'When nothing is in progress, Cancel is Undelete: the text you last', 'deleted is shown at the cursor.',
    '', '     1 Restore puts it back.', '     2 Previous Deletion shows the one before (up to three).'],
  F2: ['Search', 'Searches forward for text. Type the text at the  -> Srch:  prompt', 'and press Search again.', '',
    'Lowercase letters match either case; uppercase letters match only', 'uppercase. Press Enter in the prompt to search for a hard return.',
    'Up and Down arrows change the direction of the search.'],
  'S-F2': ['Search (backward)', 'Searches backward from the cursor. See Search.'],
  'A-F2': ['Replace', 'Replaces every occurrence of a string, from the cursor forward.', '',
    'w/Confirm? asks whether to stop at each occurrence. Type the search', 'text, press Search, type the replacement, press Search again.'],
  'C-F2': ['Spell', 'Checks the spelling of a word, a page, or the document against', 'a small built-in word list.', '',
    'When a word is not found, choose a suggestion by its letter, or', 'Skip Once, Skip, Add it to the supplementary list, or Edit it.',
    '6 Count counts the words in the document.'],
  F3: ['Help', 'Shows this help. Press a function key to read about it, a letter for', 'an alphabetical list of features, or Help again for the template.'],
  'S-F3': ['Switch', 'Switches between Doc 1 and Doc 2. With Block on, converts the', 'block to uppercase or lowercase.'],
  'A-F3': ['Reveal Codes', 'Splits the screen. The lower window shows the formatting codes', 'in bold brackets, with the tab ruler above it. The cursor is',
    'highlighted on the code or character it is on; Backspace and Del', 'delete codes without asking. Deleting one half of a paired code',
    'such as [BOLD] deletes the other half too.', '', 'Press Reveal Codes again to restore the screen.'],
  F11: ['Reveal Codes', 'Same as Alt-F3.'],
  F4: ['→Indent', 'Indents every line of the paragraph to the next tab stop until', 'the next hard return.'],
  'S-F4': ['→Indent←', 'Indents the paragraph from both margins by one tab stop.'],
  'A-F4': ['Block', 'Turns Block on. Move the cursor to highlight text, then press a', 'feature key: Bold, Underline, Font, Center, Move, Delete, Save,',
    'Switch (case conversion). Typing a character extends the block to', 'that character. Press Block again to turn it off.'],
  F12: ['Block', 'Same as Alt-F4.'],
  'C-F4': ['Move', 'Moves, copies, deletes or appends a sentence, paragraph, page or', 'block. After Move or Copy, move the cursor and press Enter to',
    'retrieve the text. 4 Retrieve brings back the last moved text.'],
  F5: ['List', 'Lists the files in a directory. Press Enter at the Dir prompt.', '',
    '     1 Retrieve   puts the file into the document at the cursor', '     2 Delete     deletes the file', '     3 Move/Rename',
    '     6 Look       shows the file without retrieving it', '     7 Other Directory'],
  'S-F5': ['Date/Outline', '1 Date Text types today\'s date. 2 Date Code inserts a code that', 'always prints the current date. 3 Date Format sets the pattern.'],
  'C-F5': ['Text In/Out', '1 Dos Text saves or retrieves plain text (CR/LF become [HRt]).'],
  F6: ['Bold', 'Turns bold on; press again to turn it off. With Block on, bolds', 'the block. Inserts [BOLD] and [bold] codes.'],
  'S-F6': ['Center', 'Centers the line between the margins. With Block on, centers', 'every line of the block with [Just:Center].'],
  'A-F6': ['Flush Right', 'Aligns text against the right margin until the next hard return.'],
  F7: ['Exit', 'Saves the document, then clears the screen or leaves.', '', '     Save document? Yes (No)', '     Exit WP? No (Yes)', '',
    'Answering No to the second question clears the screen so you can', 'start a new document.'],
  'S-F7': ['Print', '1 Full Document and 2 Page print to a PDF file. 6 View Document', 'shows the pages as they will print, at 100%, 200%, a full page,',
    'or facing pages. PgUp and PgDn change pages.'],
  F8: ['Underline', 'Turns underline on; press again to turn it off. With Block on,', 'underlines the block.'],
  'S-F8': ['Format', '1 Line      Justification, Line Spacing, Margins Left/Right, Tab Set',
    '2 Page      Center Page, Margins Top/Bottom, Page Numbering', '3 Document  Initial Base Font', '4 Other', '',
    'Line and page codes are placed at the start of the paragraph or the', 'top of the page.'],
  'C-F8': ['Font', '1 Size: Suprscpt, Subscpt, Fine, Small, Large, Vry Large, Ext Large', '2 Appearance: Bold, Undln, Dbl Und, Italc, Outln, Shadw, Sm Cap,',
    '  Redln, Stkout', '3 Normal ends the attributes at the cursor', '4 Base Font changes the font from the cursor on.'],
  F10: ['Save', 'Saves the document. Type a name at  Document to be saved:', 'Names without an extension get .HR. A name ending in .TXT is saved',
    'as plain text. With Block on, saves just the block.'],
  'S-F10': ['Retrieve', 'Retrieves a document. If there is text on the screen, the file', 'is inserted at the cursor.'],
  'C-Home': ['Go To', 'Type a page number and press Enter. Up or Down arrow goes to the', 'top or bottom of the page; a character goes to its next',
    'occurrence; Go To again returns to where the cursor was.'],
  'A-=': ['Menu Bar', 'Shows the pull-down menus. Use the arrows or the bold letters,', 'Enter to choose, Esc to back out.'],
  Esc: ['Repeat', 'Repeats the next key. Type a number, then the key. Enter sets', 'a new default count.'],
  Ins: ['Typeover', 'Switches between inserting and typing over text.'],
  Home: ['Home', 'Home,←/→   edge of the line        Home,Home,↑   top of document',
    'Home,Home,Home,←   before all codes       Home,Home,↓   bottom of document',
    'Home,↑/↓   top or bottom of screen     Ctrl-←/→   word left or right',
    'Ctrl-End   delete to end of line     Ctrl-Backspace   delete word',
    'Ctrl-PgDn  delete to end of page     PgUp/PgDn   previous or next page'],
};

export const FEATURES = [
  ['Appearance', 'Font', 'C-F8'], ['Attributes', 'Font', 'C-F8'], ['Backspace', 'Delete', 'Backspace'],
  ['Base Font', 'Font', 'C-F8'], ['Block', 'Block', 'A-F4'], ['Bold', 'Bold', 'F6'], ['Cancel', 'Cancel', 'F1'],
  ['Center Line', 'Center', 'S-F6'], ['Center Page', 'Format', 'S-F8'], ['Codes', 'Reveal Codes', 'A-F3'],
  ['Convert Case', 'Switch', 'S-F3'], ['Copy', 'Move', 'C-F4'], ['Cut', 'Move', 'C-F4'], ['Date Code', 'Date/Outline', 'S-F5'],
  ['Date Format', 'Date/Outline', 'S-F5'], ['Date Text', 'Date/Outline', 'S-F5'], ['Delete Block', 'Block, Del', 'A-F4'],
  ['Delete File', 'List', 'F5'], ['Delete to End of Line', 'Ctrl-End', 'C-End'], ['Directory', 'List', 'F5'],
  ['Dos Text', 'Text In/Out', 'C-F5'], ['Double Underline', 'Font', 'C-F8'], ['Exit', 'Exit', 'F7'], ['Extra Large', 'Font', 'C-F8'],
  ['Fine Print', 'Font', 'C-F8'], ['Flush Right', 'Flush Right', 'A-F6'], ['Font', 'Font', 'C-F8'], ['Format', 'Format', 'S-F8'],
  ['Full Justification', 'Format', 'S-F8'], ['Go To', 'Ctrl-Home', 'C-Home'], ['Hard Page', 'Ctrl-Enter', 'C-Enter'], ['Help', 'Help', 'F3'],
  ['Indent', '→Indent', 'F4'], ['Insert', 'Typeover', 'Ins'], ['Italics', 'Font', 'C-F8'], ['Justification', 'Format', 'S-F8'],
  ['Large Print', 'Font', 'C-F8'], ['Left/Right Indent', '→Indent←', 'S-F4'], ['Line Spacing', 'Format', 'S-F8'],
  ['List Files', 'List', 'F5'], ['Look', 'List', 'F5'], ['Margins', 'Format', 'S-F8'], ['Menu Bar', 'Alt-=', 'A-='], ['Move', 'Move', 'C-F4'],
  ['Normal', 'Font', 'C-F8'], ['Outline Print', 'Font', 'C-F8'], ['Page Numbering', 'Format', 'S-F8'], ['Paste', 'Move', 'C-F4'],
  ['Print', 'Print', 'S-F7'], ['Redline', 'Font', 'C-F8'], ['Rename File', 'List', 'F5'], ['Repeat', 'Esc', 'Esc'], ['Replace', 'Replace', 'A-F2'],
  ['Retrieve', 'Retrieve', 'S-F10'], ['Reveal Codes', 'Reveal Codes', 'A-F3'], ['Save', 'Save', 'F10'], ['Search', 'Search', 'F2'],
  ['Shadow Print', 'Font', 'C-F8'], ['Small Caps', 'Font', 'C-F8'], ['Small Print', 'Font', 'C-F8'], ['Spell', 'Spell', 'C-F2'],
  ['Strikeout', 'Font', 'C-F8'], ['Subscript', 'Font', 'C-F8'], ['Superscript', 'Font', 'C-F8'], ['Switch Documents', 'Switch', 'S-F3'],
  ['Tab Set', 'Format', 'S-F8'], ['Template', 'Help, Help', 'F3'], ['Top/Bottom Margins', 'Format', 'S-F8'], ['Typeover', 'Ins', 'Ins'],
  ['Underline', 'Underline', 'F8'], ['Undelete', 'Cancel', 'F1'], ['Uppercase', 'Switch', 'S-F3'], ['View Document', 'Print', 'S-F7'],
  ['Very Large', 'Font', 'C-F8'], ['Word Count', 'Spell', 'C-F2'], ['Words', 'Ctrl-←/→', 'C-Right'],
];

P.help = function () {
  return this.run(async () => {
    let view = { kind: 'intro' };
    for (;;) {
      const k = await new Promise((resolve) => {
        const m = this.push({
          full: true,
          draw: (scr) => this.drawHelp(scr, view),
          key: (key) => { this.pop(m); resolve(key); return true; },
        });
      });
      if (k === 'Enter' || k === ' ' || k === 'Esc' || k === 'F1' || k === 'F7') return;
      if (k === 'F3') { view = view.kind === 'template' ? { kind: 'intro' } : { kind: 'template' }; continue; }
      if (isCharKey(k) && /[a-z]/i.test(k)) { view = { kind: 'letter', letter: k.toUpperCase() }; continue; }
      if (KEY_HELP[k]) { view = { kind: 'key', key: k }; continue; }
      view = { kind: 'key', key: k, none: true };
    }
  });
};

P.drawHelp = function (scr, view) {
  scr.put(0, 0, 'Help', 'b');
  const exit = '(Press ENTER to exit Help)';
  if (view.kind === 'intro') {
    const lines = [
      '', 'Press any letter to get an alphabetical list of features.', '',
      '     The list will include the features that start with that letter,',
      '     along with the name of the key where the feature can be found.',
      '     You can then press that key to get a description of how the',
      '     feature works.', '',
      'Press any function key to get information about the use of the key.', '',
      '     Some keys may let you choose from a menu of options.  The',
      '     help page lists what each option does.', '',
      'Press HELP again to display the template.',
    ];
    lines.forEach((t, r) => scr.put(2 + r, 2, t));
    scr.put(23, COLS - exit.length - 1, exit);
    const c = scr.put(24, 0, 'Selection: 0');
    scr.setCursor(24, c - 1);
    return;
  }
  if (view.kind === 'key') {
    const h = KEY_HELP[view.key];
    if (!h || view.none) {
      scr.put(2, 2, `${keyLabel(view.key)}`, 'b');
      scr.put(4, 2, 'There is no feature on this key in this version.');
    } else {
      scr.put(0, 6, h[0], 'b');
      scr.put(0, COLS - keyLabel(view.key).length - 1, keyLabel(view.key));
      h.slice(1).forEach((t, r) => scr.put(2 + r, 2, t));
    }
    scr.put(23, COLS - exit.length - 1, exit);
    const c = scr.put(24, 0, 'Selection: 0');
    scr.setCursor(24, c - 1);
    return;
  }
  if (view.kind === 'letter') {
    const list = FEATURES.filter(([f]) => f[0].toUpperCase() === view.letter);
    scr.put(1, 1, `Features [${view.letter}]`, 'b');
    scr.put(1, 34, 'Key Name', 'b');
    scr.put(1, 58, 'Keystrokes', 'b');
    if (!list.length) scr.put(3, 1, `No features start with ${view.letter}.`);
    list.slice(0, 20).forEach(([f, name, key], r) => {
      scr.put(3 + r, 1, f);
      scr.put(3 + r, 34, name);
      scr.put(3 + r, 58, keyLabel(key));
    });
    const c = scr.put(24, 0, 'Type a menu option or press a function key for help: 0');
    scr.setCursor(24, c - 1);
    scr.put(23, COLS - exit.length - 1, exit);
    return;
  }
  // template
  scr.clear('tplbg');
  scr.put(0, 0, 'Help', 'tplbg b');
  const groups = [['F1', 'F2', 'F3', 'F4'], ['F5', 'F6', 'F7', 'F8'], ['F9', 'F10', 'F11', 'F12']];
  groups.forEach((g, gi) => {
    g.forEach((f, ki) => {
      const col = 2 + ki * 19;
      const row = 2 + gi * 7;
      ['C', 'S', 'A', 'N'].forEach((mod, r) => {
        const t = TEMPLATE[f][mod];
        if (t) scr.put(row + r, col, t.padEnd(17).slice(0, 17), `tplbg t${mod}`);
      });
      scr.put(row + 4, col, ` ${f} `, 'tplcap');
    });
  });
  scr.puts(23, 2, [['Ctrl', 'tplbg tC'], ['  ', 'tplbg'], ['Shift', 'tplbg tS'], ['  ', 'tplbg'], ['Alt', 'tplbg tA'], ['  ', 'tplbg'], ['Alone', 'tplbg tN']]);
  const c = scr.put(24, 0, 'Press Help again for the intro; ENTER to exit.', 'tplbg');
  scr.setCursor(24, c);
};

export { MOD_PREFIX };
