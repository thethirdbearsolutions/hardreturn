// Reveal Codes in the Windows style: each code is a pill with a short name,
// and the code under the cursor opens up to show its settings.

import { isPair, label, PAIR_NAMES } from '../core/codes.js';

const PAIR_SHORT = {
  BOLD: 'Bold', UND: 'Und', 'DBL UND': 'Dbl Und', ITALC: 'Italc', OUTLN: 'Outln', SHADW: 'Shadw',
  'SM CAP': 'Sm Cap', REDLN: 'Redln', STKOUT: 'StkOut', SUPRSCPT: 'Suprscpt', SUBSCPT: 'Subscpt',
  FINE: 'Fine', SMALL: 'Small', LARGE: 'Large', 'VRY LARGE': 'Vry Large', 'EXT LARGE': 'Ext Large',
};

const SHORT = {
  HRt: 'HRt', SRt: 'SRt', HPg: 'HPg', SPg: 'SPg', Tab: 'Left Tab',
  Indent: 'Hd Left Ind', LRIndent: 'Hd Left/Right Ind', Center: 'Hd Center on Marg', FlshRgt: 'Hd Flush Right',
  LRMar: 'Lft/Rgt Mar', LMar: 'Lft Mar', RMar: 'Rgt Mar', TBMar: 'Top/Bot Mar',
  Just: 'Just', LnSpacing: 'Ln Spacing', TabSet: 'Tab Set', Font: 'Font', Date: 'Date',
  PgNum: 'Pg Num Pos', CntrPg: 'Cntr Cur Pg',
};

for (const n of PAIR_NAMES) PAIR_SHORT[n] ??= n;

// { text, shape } where shape is 'on' (points right), 'off' (points left) or
// 'pill'. full: the expanded form shown when the cursor is on the code.
export function pill(it, { full = false } = {}) {
  if (isPair(it)) return { text: PAIR_SHORT[it.c], shape: it.on ? 'on' : 'off' };
  const short = SHORT[it.c] || it.c;
  if (!full) return { text: short, shape: 'pill' };
  const l = label(it);
  const k = l.indexOf(':');
  return { text: k < 0 ? short : `${short}: ${l.slice(k + 1).replace(/,(?=\S)/g, ', ')}`, shape: 'pill' };
}

export const SRT = { c: 'SRt' };
