// Codes: the non-character items of the code stream.
//
// A document is a flat array of items. A character is a one-character
// string; a code is a plain object with a `c` field naming it. Paired codes
// carry `on: true|false` and show as [BOLD]…[bold] in Reveal Codes.
//
// Codes are treated as immutable values: edit by replacing, never mutating.

export const PAIR_NAMES = [
  'BOLD', 'UND', 'DBL UND', 'ITALC', 'OUTLN', 'SHADW', 'SM CAP', 'REDLN',
  'STKOUT', 'SUPRSCPT', 'SUBSCPT', 'FINE', 'SMALL', 'LARGE', 'VRY LARGE',
  'EXT LARGE',
];
const PAIR_SET = new Set(PAIR_NAMES);

// Size attributes are mutually meaningful for measuring; appearance ones are not.
export const SIZE_NAMES = ['SUPRSCPT', 'SUBSCPT', 'FINE', 'SMALL', 'LARGE', 'VRY LARGE', 'EXT LARGE'];

// Paragraph-level format codes: auto code placement puts them at the start
// of the paragraph. Page-level ones go at the top of the page.
export const PARA_CODES = new Set(['LRMar', 'Just', 'LnSpacing', 'TabSet']);
export const PAGE_CODES = new Set(['TBMar', 'CntrPg', 'PgNum']);

export const JUSTIFY = ['Left', 'Center', 'Right', 'Full'];

export const PGNUM_POSITIONS = {
  None: 'None',
  TopLeft: 'Top Left', TopCenter: 'Top Center', TopRight: 'Top Right',
  BottomLeft: 'Bottom Left', BottomCenter: 'Bottom Center', BottomRight: 'Bottom Right',
};

export const isCode = (it) => typeof it === 'object' && it !== null;
export const isChar = (it) => typeof it === 'string';
export const isPair = (it) => isCode(it) && PAIR_SET.has(it.c);
export const isPairName = (name) => PAIR_SET.has(name);
export const is = (it, c) => isCode(it) && it.c === c;

// Constructors.
export const code = {
  on: (name) => ({ c: name, on: true }),
  off: (name) => ({ c: name, on: false }),
  hrt: () => ({ c: 'HRt' }),
  hpg: () => ({ c: 'HPg' }),
  tab: () => ({ c: 'Tab' }),
  indent: () => ({ c: 'Indent' }),
  lrIndent: () => ({ c: 'LRIndent' }),
  center: () => ({ c: 'Center' }),
  flushRight: () => ({ c: 'FlshRgt' }),
  lrMar: (l, r) => ({ c: 'LRMar', l, r }),
  tbMar: (t, b) => ({ c: 'TBMar', t, b }),
  just: (v) => ({ c: 'Just', v }),
  lnSpacing: (v) => ({ c: 'LnSpacing', v }),
  // tabs: [{ pos: inches from the left edge of the paper, type: 'L'|'C'|'R'|'D' }]
  tabSet: (tabs) => ({ c: 'TabSet', tabs: tabs.map((t) => ({ pos: t.pos, type: t.type || 'L' })) }),
  font: (v) => ({ c: 'Font', v }),
  date: (fmt = '3 1, 4') => ({ c: 'Date', fmt }),
  pgNum: (v) => ({ c: 'PgNum', v }),
  cntrPg: () => ({ c: 'CntrPg' }),
};

// Inches as WP shows them: 1", 1.5", 0.25"
export function inches(v) {
  const r = Math.round(v * 1000) / 1000;
  let s = String(Math.trunc(r * 100 + (r >= 0 ? 1e-6 : -1e-6)) / 100);
  return s + '"';
}

export function defaultTabs(every = 0.5, to = 8.5) {
  const tabs = [];
  for (let p = 0; p <= to + 1e-9; p += every) tabs.push({ pos: Math.round(p * 1000) / 1000, type: 'L' });
  return tabs;
}

function describeTabs(tabs) {
  // Collapse an evenly spaced run of left tabs to "every N".
  if (tabs.length > 3 && tabs.every((t) => t.type === 'L')) {
    const step = tabs[1].pos - tabs[0].pos;
    if (step > 0 && tabs.every((t, i) => Math.abs(t.pos - tabs[0].pos - i * step) < 1e-6)) {
      return `Abs: ${inches(tabs[0].pos)}, every ${inches(step)}`;
    }
  }
  const parts = tabs.map((t) => inches(t.pos) + (t.type === 'L' ? '' : t.type));
  return 'Abs: ' + parts.join(',');
}

const DATE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DATE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// WP date format: 1 day of month, 2 month number, 3 month name, 4 four-digit
// year, 5 two-digit year, 6 day of week, 7 hour (24), 8 hour (12),
// 9 minute, 0 am/pm. Everything else is literal.
export function formatDate(fmt, d = new Date()) {
  let out = '';
  for (const ch of fmt) {
    switch (ch) {
      case '1': out += d.getDate(); break;
      case '2': out += d.getMonth() + 1; break;
      case '3': out += DATE_MONTHS[d.getMonth()]; break;
      case '4': out += d.getFullYear(); break;
      case '5': out += String(d.getFullYear() % 100).padStart(2, '0'); break;
      case '6': out += DATE_DAYS[d.getDay()]; break;
      case '7': out += d.getHours(); break;
      case '8': out += (d.getHours() % 12) || 12; break;
      case '9': out += String(d.getMinutes()).padStart(2, '0'); break;
      case '0': out += d.getHours() < 12 ? 'am' : 'pm'; break;
      default: out += ch;
    }
  }
  return out;
}

// The text inside the brackets in Reveal Codes.
export function label(it) {
  if (!isCode(it)) return it;
  if (isPair(it)) return it.on ? it.c : it.c.toLowerCase();
  switch (it.c) {
    case 'HRt': return 'HRt';
    case 'SRt': return 'SRt';
    case 'HPg': return 'HPg';
    case 'SPg': return 'SPg';
    case 'Tab': return 'Tab';
    case 'Indent': return '→Indent';
    case 'LRIndent': return '→Indent←';
    case 'Center': return 'Center';
    case 'FlshRgt': return 'Flsh Rgt';
    case 'LRMar': return `L/R Mar:${inches(it.l)},${inches(it.r)}`;
    case 'TBMar': return `T/B Mar:${inches(it.t)},${inches(it.b)}`;
    case 'Just': return `Just:${it.v}`;
    case 'LnSpacing': return `Ln Spacing:${it.v}`;
    case 'TabSet': return `Tab Set:${describeTabs(it.tabs)}`;
    case 'Font': return `Font:${it.v}`;
    case 'Date': return `Date:${it.fmt}`;
    case 'PgNum': return `Pg Numbering:${PGNUM_POSITIONS[it.v] || it.v}`;
    case 'CntrPg': return 'Center Pg';
    default: return it.c;
  }
}

// Codes that occupy space or break lines; the rest are invisible in the
// normal editing view.
const VISIBLE = new Set(['HRt', 'HPg', 'Tab', 'Indent', 'LRIndent', 'Date']);
export const isVisible = (it) => isChar(it) || VISIBLE.has(it.c);

export function sameCode(a, b) {
  if (!isCode(a) || !isCode(b)) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
