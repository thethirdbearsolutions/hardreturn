// The keyboard template: what each function key does with Ctrl (red),
// Shift (green), Alt (blue) and alone (black). Shared by the clickable strip
// and the Help screen.

export const TEMPLATE = {
  F1: { C: 'Shell', S: 'Setup', A: 'Thesaurus', N: 'Cancel' },
  F2: { C: 'Spell', S: '←Search', A: 'Replace', N: 'Search→' },
  F3: { C: 'Screen', S: 'Switch', A: 'Reveal Codes', N: 'Help' },
  F4: { C: 'Move', S: '→Indent←', A: 'Block', N: '→Indent' },
  F5: { C: 'Text In/Out', S: 'Date/Outline', A: 'Mark Text', N: 'List' },
  F6: { C: 'Tab Align', S: 'Center', A: 'Flush Right', N: 'Bold' },
  F7: { C: 'Footnote', S: 'Print', A: 'Columns/Table', N: 'Exit' },
  F8: { C: 'Font', S: 'Format', A: 'Style', N: 'Underline' },
  F9: { C: 'Merge/Sort', S: 'Merge Codes', A: 'Graphics', N: 'End Field' },
  F10: { C: 'Macro Define', S: 'Retrieve', A: 'Macro', N: 'Save' },
  F11: { N: 'Reveal Codes' },
  F12: { N: 'Block' },
};

export const MOD_PREFIX = { C: 'C-', S: 'S-', A: 'A-', N: '' };

// Build the clickable strip. onKey(name) is called with a key name.
export function buildTemplate(root, onKey, implemented) {
  root.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'tpl-bar';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tpl-toggle';
  bar.appendChild(toggle);
  const legend = document.createElement('div');
  legend.className = 'tpl-legend';
  legend.innerHTML = '<span class="lc">Ctrl</span> <span class="ls">Shift</span> <span class="la">Alt</span> <span class="ln">Alone</span>';
  bar.appendChild(legend);
  root.appendChild(bar);

  const body = document.createElement('div');
  body.className = 'tpl-body';
  const groups = [['F1', 'F2', 'F3', 'F4'], ['F5', 'F6', 'F7', 'F8'], ['F9', 'F10', 'F11', 'F12']];
  for (const g of groups) {
    const grp = document.createElement('div');
    grp.className = 'tpl-group';
    for (const f of g) {
      const key = document.createElement('div');
      key.className = 'tpl-key';
      for (const mod of ['C', 'S', 'A', 'N']) {
        const text = TEMPLATE[f][mod];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `tpl-cmd m${mod}`;
        if (text) {
          const name = MOD_PREFIX[mod] + f;
          b.textContent = text;
          b.dataset.key = name;
          b.title = name.replace('C-', 'Ctrl-').replace('S-', 'Shift-').replace('A-', 'Alt-');
          if (implemented && !implemented(name)) b.classList.add('na');
        } else {
          b.disabled = true;
          b.innerHTML = '&nbsp;';
        }
        key.appendChild(b);
      }
      const cap = document.createElement('div');
      cap.className = 'tpl-cap';
      cap.textContent = f;
      key.appendChild(cap);
      grp.appendChild(key);
    }
    body.appendChild(grp);
  }
  const extras = document.createElement('div');
  extras.className = 'tpl-extras';
  for (const [name, text] of [['Esc', 'Esc'], ['Ins', 'Ins'], ['Home', 'Home'], ['Tab', 'Tab'], ['A-=', 'Alt-='], ['C-Home', 'Ctrl-Home']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tpl-extra';
    b.dataset.key = name;
    b.textContent = text;
    extras.appendChild(b);
  }
  bar.insertBefore(extras, legend);
  root.appendChild(body);

  root.addEventListener('mousedown', (e) => {
    // keep focus on the page so the keyboard still reaches the screen
    if (e.target.closest('button')) e.preventDefault();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b === toggle) { setOpen(!open); return; }
    if (b.dataset.key) onKey(b.dataset.key);
  });

  let open = true;
  try { open = localStorage.getItem('hardreturn:template') !== 'closed'; } catch { /* default open */ }
  const setOpen = (v) => {
    open = v;
    root.classList.toggle('closed', !v);
    toggle.textContent = v ? 'Template ▾' : 'Template ▸';
    try { localStorage.setItem('hardreturn:template', v ? 'open' : 'closed'); } catch { /* ignore */ }
    root.dispatchEvent(new Event('toggle'));
  };
  setOpen(open);
  return { setOpen, get open() { return open; } };
}
