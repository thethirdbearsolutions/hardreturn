# Hard Return for Windows

The second front end of Hard Return: WordPerfect 6.1 for Windows as it
looked on Windows 3.1. A WYSIWYG page in Times New Roman, Arial or Courier
New, the Toolbar, Power Bar, Ruler Bar and status bar, pull-down menus,
modal dialogs, and Reveal Codes with the codes as pills.

It edits the same documents as the [DOS front end](../README.md): a `.hr`
saved in one opens in the other with the same code stream.

## Run

Serve the repository root and open `/win/`:

```sh
python3 -m http.server 8000
# open http://localhost:8000/win/
```

Standalone, files live in the same browser storage as the DOS version
(`c:\wp51\`). Inside a Terrarium window it speaks `terrarium/1`: files live
on the shell's disk (`/Documents`, shown as `c:\documents\`), and the shell
is told the title and whether there are unsaved changes.

## Keys

The Common User Access keyboard is the default:

| Key | Command | Key | Command |
|-----|---------|-----|---------|
| Ctrl+B / I / U | Bold / Italic / Underline | F7 | Indent |
| Ctrl+E / L / R / J | Center / Left / Right / Full | Shift+F7 | Center line |
| Ctrl+Z | Undo | Alt+F7 | Flush Right |
| Ctrl+Shift+Z | Undelete | Ctrl+Shift+F7 | Double Indent |
| Ctrl+X / C / V | Cut / Copy / Paste | F8 | Select |
| Ctrl+N / O / S / P | New / Open / Save / Print | F9 | Font |
| F3 | Save As | Ctrl+F8 | Margins |
| F4 | Open | F2 | Find |
| F5 | Print | Ctrl+F2 | Find and Replace |
| Alt+F3 | Reveal Codes | Ctrl+F1 | Speller |
| Ctrl+Enter | Page break | Ctrl+F4 | Close |
| Ctrl+G | Go To | Alt+F4 | Exit |

Alt alone or F10 reaches the menu bar; Alt+letter opens a menu. Shift with
the arrow keys selects. Help ▸ Keystrokes lists the current keyboard.

Tools ▸ Preferences ▸ Keyboard switches to **WPDOS Compatible**, which maps
the 5.1 function keys where there is a command for them: F6 Bold, F8
Underline, Shift+F6 Center, Alt+F6 Flush Right, F4 Indent, Shift+F4 Double
Indent, F10 Save, Shift+F10 Open, Shift+F7 Print, F2 / Shift+F2 Find,
Alt+F2 Replace, Ctrl+F2 Speller, Alt+F4 or F12 Select, F11 Reveal Codes,
Ctrl+F8 Font, Shift+F8 Margins, F7 Close, F1 Cancel / Undelete.

## What it draws

Pages are laid out by the shared core with the print measure (Adobe
Times, Helvetica and Courier advance widths), so the screen and the PDF put
every glyph in the same place. Zoom is 50% to 200%, Margin Width, Page Width
or Full Page; View ▸ Draft shows the text without page edges.

Dragging a margin marker on the Ruler Bar inserts or changes `[Lft Mar]` or
`[Rgt Mar]` at the start of the paragraph, or folds into an `[L/R Mar]`
already there. Font changes insert `[Font]` at the cursor or around the
selection; justification, line spacing and margins go at the start of the
paragraph.

A document with no `[Font]` code starts in Times New Roman 12pt here and in
Courier 10cpi in the DOS version.

## Layout of the code

- `src/win/app.js`: documents, selection, editing with undo, layout cache.
- `src/win/view.js`: the pages on a canvas, the caret, hit testing.
- `src/win/menus.js`, `bars.js`, `ruler.js`, `reveal.js`: the window's parts.
- `src/win/dialogs.js`: the dialog kit; `boxes.js`: the dialogs.
- `src/win/commands.js`, `keys.js`: commands and the two keyboards.
- `src/win/icons.js`: the pixel-art icons.
