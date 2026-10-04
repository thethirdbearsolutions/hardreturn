// Modal dialogs in the Windows 3.1 manner: a navy caption with a system
// box, a gray face, controls with underlined access keys, and a column of
// push buttons with a heavy border on the default one.

import { icon } from './icons.js';

// '&Open' -> { html: '<u>O</u>pen', key: 'O' }
export function mnemonic(text) {
  const k = text.indexOf('&');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  if (k < 0 || k === text.length - 1) return { html: esc(text), key: null, plain: text };
  return {
    html: esc(text.slice(0, k)) + '<u>' + esc(text[k + 1]) + '</u>' + esc(text.slice(k + 2)),
    key: text[k + 1].toUpperCase(),
    plain: text.slice(0, k) + text.slice(k + 1),
  };
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

let uid = 0;

// A label whose access key focuses `target`.
export function label(text, target, attrs = {}) {
  const m = mnemonic(text);
  if (!target.id) target.id = `hrc${++uid}`;
  const el = h('label', { for: target.id, html: m.html, ...attrs });
  if (m.key) el.dataset.key = m.key;
  return el;
}

export function textField(value = '', attrs = {}) {
  return h('input', { type: 'text', class: 'field', value, spellcheck: 'false', autocomplete: 'off', ...attrs });
}

export function check(text, checked = false, attrs = {}) {
  const box = h('input', { type: 'checkbox', checked, ...attrs });
  const m = mnemonic(text);
  if (!box.id) box.id = `hrc${++uid}`;
  const l = h('label', { class: 'check', for: box.id }, box, h('span', { html: m.html }));
  if (m.key) l.dataset.key = m.key;
  l.input = box;
  return l;
}

export function radio(name, text, checked = false, value = text) {
  const box = h('input', { type: 'radio', name, checked, value });
  const m = mnemonic(text);
  box.id = `hrc${++uid}`;
  const l = h('label', { class: 'check radio', for: box.id }, box, h('span', { html: m.html }));
  if (m.key) l.dataset.key = m.key;
  l.input = box;
  return l;
}

export function group(title, ...kids) {
  const m = mnemonic(title);
  return h('fieldset', { class: 'group' }, title ? h('legend', { html: m.html }) : null, ...kids);
}

// A list box. items: strings or { text, value, cls }.
export function listBox(items, { selected = 0, rows = 6, onSelect, onActivate, cls = '' } = {}) {
  const el = h('div', { class: `listbox ${cls}`, tabindex: '0', role: 'listbox', style: `height:${rows * 14 + 4}px` });
  const lb = { el, items: [], index: -1 };
  const norm = (it) => (typeof it === 'string' ? { text: it, value: it } : it);
  lb.set = (list, sel = 0) => {
    lb.items = list.map(norm);
    el.innerHTML = '';
    lb.items.forEach((it, k) => {
      const row = h('div', { class: `opt ${it.cls || ''}`, 'data-k': k }, it.text);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); el.focus(); lb.select(k); });
      row.addEventListener('dblclick', () => onActivate?.(lb.value, k));
      el.append(row);
    });
    lb.select(sel, { silent: true });
  };
  lb.select = (k, { silent = false } = {}) => {
    if (!lb.items.length) { lb.index = -1; return; }
    k = Math.max(0, Math.min(lb.items.length - 1, k));
    el.querySelector('.opt.on')?.classList.remove('on');
    const row = el.children[k];
    row.classList.add('on');
    lb.index = k;
    if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight;
    if (!silent) onSelect?.(lb.value, k);
  };
  lb.selectValue = (v, opts) => {
    const k = lb.items.findIndex((it) => String(it.value).toLowerCase() === String(v).toLowerCase());
    if (k >= 0) lb.select(k, opts);
    return k;
  };
  Object.defineProperty(lb, 'value', { get: () => lb.items[lb.index]?.value });
  el.addEventListener('keydown', (e) => {
    const n = lb.items.length;
    let k = lb.index;
    if (e.key === 'ArrowDown') k++;
    else if (e.key === 'ArrowUp') k--;
    else if (e.key === 'Home') k = 0;
    else if (e.key === 'End') k = n - 1;
    else if (e.key === 'PageDown') k += rows - 1;
    else if (e.key === 'PageUp') k -= rows - 1;
    else if (e.key.length === 1 && !e.altKey && !e.ctrlKey) {
      const c = e.key.toLowerCase();
      const from = lb.index + 1;
      for (let j = 0; j < n; j++) {
        const it = lb.items[(from + j) % n];
        if (String(it.text).toLowerCase().startsWith(c)) { k = (from + j) % n; break; }
      }
    } else return;
    e.preventDefault();
    e.stopPropagation();
    lb.select(k);
  });
  lb.set(items, selected);
  return lb;
}

// A push button.
export function button(text, onClick, { isDefault = false, disabled = false, cls = '' } = {}) {
  const m = mnemonic(text);
  const b = h('button', { type: 'button', class: `push ${isDefault ? 'default' : ''} ${cls}`, html: m.html, disabled, onclick: onClick });
  if (m.key) b.dataset.key = m.key;
  return b;
}

// Open a dialog. opts: { title, body (element), buttons: [{ text, id, isDefault, cancel }],
// onButton(id, dlg) -> false keeps it open; init(dlg); layout: 'right' | 'bottom'; at: { x, y } }
// Resolves with the id of the button that closed it ('cancel' for Esc).
export function dialog(app, opts) {
  return new Promise((resolve) => {
    const layer = h('div', { class: 'modal-layer' });
    const buttons = h('div', { class: `dbuttons ${opts.layout === 'bottom' ? 'bottom' : ''}` });
    const dlg = {
      el: null, layer, resolve: null, buttons: {},
      close(id) {
        layer.remove();
        app.modals.splice(app.modals.indexOf(dlg), 1);
        app.restoreFocus();
        resolve(id);
      },
    };
    for (const b of opts.buttons || []) {
      const el = button(b.text, () => press(b), { isDefault: b.isDefault, disabled: b.disabled });
      dlg.buttons[b.id] = el;
      buttons.append(el);
    }
    const press = async (b) => {
      if (opts.onButton) {
        const r = await opts.onButton(b.id, dlg);
        if (r === false) return;
      }
      dlg.close(b.id);
    };
    const title = h('div', { class: 'dtitle' },
      h('span', { class: 'sysbox', html: icon('sysbox'), title: 'Close', onmousedown: (e) => { e.stopPropagation(); }, ondblclick: () => cancel() }),
      h('span', { class: 't' }, opts.title));
    const content = h('div', { class: `dcontent ${opts.layout === 'bottom' ? 'col' : ''}` }, h('div', { class: 'dmain' }, opts.body), buttons);
    const box = h('div', { class: `dialog ${opts.cls || ''}`, role: 'dialog', 'aria-label': opts.title }, title, content);
    dlg.el = box;
    layer.append(box);
    (app.root || document.body).append(layer);
    app.modals.push(dlg);

    const cancel = () => {
      const c = (opts.buttons || []).find((b) => b.cancel);
      if (c) press(c); else dlg.close('cancel');
    };
    dlg.cancel = cancel;
    dlg.press = (id) => { const b = (opts.buttons || []).find((x) => x.id === id); if (b) press(b); };

    // place it centered over the window (or where asked), then let it be dragged
    const place = () => {
      const r = layer.getBoundingClientRect();
      const bw = box.offsetWidth, bh = box.offsetHeight;
      const x = opts.at?.x ?? Math.max(4, (r.width - bw) / 2);
      const y = opts.at?.y ?? Math.max(4, (r.height - bh) / 2.4);
      box.style.left = `${Math.round(Math.min(x, r.width - bw - 4))}px`;
      box.style.top = `${Math.round(Math.max(4, Math.min(y, r.height - bh - 4)))}px`;
    };
    place();
    title.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX - box.offsetLeft, sy = e.clientY - box.offsetTop;
      const mv = (ev) => { box.style.left = `${ev.clientX - sx}px`; box.style.top = `${Math.max(0, ev.clientY - sy)}px`; };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });

    box.addEventListener('keydown', (e) => {
      // the dialog owns the keyboard: nothing reaches the document
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !e.target.closest?.('textarea')) {
        e.preventDefault();
        const d = (opts.buttons || []).find((b) => b.isDefault);
        if (d && !dlg.buttons[d.id].disabled) press(d);
        return;
      }
      if (e.altKey && !e.ctrlKey && /^Key[A-Z]$|^Digit\d$/.test(e.code)) {
        const k = e.code.slice(-1);
        const hit = [...box.querySelectorAll('[data-key]')].find((x) => x.dataset.key === k && !x.disabled);
        if (hit) {
          e.preventDefault();
          if (hit instanceof HTMLButtonElement) hit.click();
          else if (hit.tagName === 'LABEL') {
            const t = document.getElementById(hit.getAttribute('for'));
            if (t && (t.type === 'checkbox' || t.type === 'radio')) { t.focus(); t.click(); } else t?.focus();
          }
        }
        return;
      }
      if (e.key === 'Tab') {
        // keep focus inside the dialog
        const f = [...box.querySelectorAll('input,button,[tabindex="0"],select')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const k = f.indexOf(document.activeElement);
        const next = e.shiftKey ? (k <= 0 ? f.length - 1 : k - 1) : (k + 1) % f.length;
        e.preventDefault();
        f[next].focus();
        if (f[next].select && f[next].type === 'text') f[next].select();
      }
    });
    layer.addEventListener('mousedown', (e) => { if (e.target === layer) { e.preventDefault(); beep(box); } });

    opts.init?.(dlg);
    const first = opts.focus || box.querySelector('input:not([disabled]),.listbox,button.default');
    first?.focus();
    if (first?.select && first.type === 'text') first.select();
  });
}

// Clicking outside a modal dialog flashes its caption.
function beep(box) {
  box.classList.add('flash');
  setTimeout(() => box.classList.remove('flash'), 120);
  setTimeout(() => box.classList.add('flash'), 240);
  setTimeout(() => box.classList.remove('flash'), 360);
}

// A message box. kind: 'info' | 'question' | 'stop' | 'warn'.
// buttons: e.g. [['&Yes', 'yes'], ['&No', 'no'], ['Cancel', 'cancel']]
export function messageBox(app, { title = 'Hard Return', text, kind = 'info', buttons = [['OK', 'ok']], def = 0 }) {
  const glyph = { info: 'i', question: '?', stop: 'x', warn: '!' }[kind];
  const body = h('div', { class: 'msgbox' },
    h('div', { class: `msgicon ${kind}` }, glyph),
    h('div', { class: 'msgtext' }, text));
  return dialog(app, {
    title, body, layout: 'bottom', cls: 'msg',
    buttons: buttons.map(([t, id], k) => ({ text: t, id, isDefault: k === def, cancel: id === 'cancel' || buttons.length === 1 })),
  });
}
