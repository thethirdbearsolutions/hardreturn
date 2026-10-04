# Hard Return

A word processor for the browser that recreates WordPerfect 5.1 for DOS:
the blue 80x25 screen, the function keys, the status-line prompts, and the
code stream you see in Reveal Codes.

No build step and no runtime dependencies. Plain ES modules, static files.

There is also a [Windows front end](win/README.md) at `/win/`, after
WordPerfect 6.1 for Windows. It opens the same documents.

## Run

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Any static host works (`index.html` is at the root). Files are kept in your
browser's localStorage, in `C:\WP51\`. Inside a Terrarium window it speaks
`terrarium/1` instead: files live on the shell's disk (`/Documents`, shown as
`C:\DOCUMENTS\`), and the shell is told the title and whether there are
unsaved changes.

## Keys

| Key | Alone | Shift | Alt | Ctrl |
|-----|-------|-------|-----|------|
| F1  | Cancel / Undelete | | | |
| F2  | Search forward | Search backward | Replace | Spell |
| F3  | Help | Switch Doc 1/2 | Reveal Codes | |
| F4  | →Indent | →Indent← | Block | Move |
| F5  | List Files | Date/Outline | | Text In/Out |
| F6  | Bold | Center | Flush Right | |
| F7  | Exit | Print | | |
| F8  | Underline | Format | | Font |
| F10 | Save | Retrieve | | |
| F11 | Reveal Codes | | | |
| F12 | Block | | | |

Also: `Alt-=` menu bar (right-click works too), `Ins` Typeover, `Esc`
repeat (`Repeat Value = 8`), `Home,Home,↑/↓` top/bottom of document,
`Home,Home,←/→` line ends, `Home,Home,Home,←` before codes, `Ctrl-←/→`
words, `PgUp/PgDn` pages, `Ctrl-Home` Go To, `Ctrl-Enter` hard page,
`Ctrl-End` delete to end of line, `Ctrl-Backspace` delete word.

Function keys are awkward on laptops and some are taken by the browser
(F11 full screen, F12 developer tools, and on Windows Ctrl-F4 and Alt-F4).
Every command is on the keyboard template under the screen; click an entry
to send that key. Alternatives: Alt-F3 for F11, Alt-F4 or F12 for Block,
and the menu bar (`Alt-=`, Edit) for Move.

Print (Shift-F7) writes a PDF in the document's fonts (Courier unless it
has a Times or Arial `[Font]` code): 1 Full Document, 2 Page, and
6 View Document for an on-screen preview at 100%, 200%, full page or
facing pages.

## Files

`.hr` is JSON (`application/x-hardreturn+json`):

```json
{ "format": "hardreturn", "version": 1,
  "stream": ["Dear Ann,", {"c": "HRt"}, {"c": "BOLD", "on": true}, "Hi", {"c": "BOLD", "on": false}] }
```

Names saved without an extension get `.HR`. A name ending in `.TXT` is
saved and retrieved as plain text.

## Layout of the code

- `src/core/` knows nothing about screens: the code stream (`codes.js`,
  `stream.js`), editing (`editor.js`), layout (`layout.js`, a pure function
  of the stream and a measure), measures (`measure.js`), file formats,
  the PDF writer, spelling, disks and the terrarium/1 client.
- `src/dos/` is the text-mode front end.
- `src/win/` is the Windows front end (`win/index.html`).
- `test/` runs with node's built-in runner.

## Tests

```sh
node --test
```
