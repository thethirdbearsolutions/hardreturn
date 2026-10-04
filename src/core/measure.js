// Measures: how wide a glyph is and how tall a line is, in inches, for a
// given style. Layout is a pure function of the stream and one of these.
//
// style = { attrs: string[] (active paired codes), font: string, key }

import { AFM_WIDTHS, winAnsiByte } from './afm.js';

export const BASE_FONTS = ['Courier 10cpi', 'Courier 12cpi', 'Courier 15cpi', 'Courier 14pt', 'Courier 18pt', 'Courier 24pt'];

// Point size of a base font name.
export function fontPoints(font) {
  const m = /(\d+(?:\.\d+)?)\s*(cpi|pt)/i.exec(font || '');
  if (!m) return 12;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 'cpi' ? 120 / n : n; // 10cpi Courier = 12pt
}

// Relative sizes, as WP 5.1 printed them.
export const SIZE_RATIO = {
  FINE: 0.6, SMALL: 0.8, LARGE: 1.2, 'VRY LARGE': 1.5, 'EXT LARGE': 2,
  SUPRSCPT: 0.6, SUBSCPT: 0.6,
};

export function sizeOf(style) {
  let pt = fontPoints(style.font);
  for (const a of style.attrs) if (SIZE_RATIO[a]) pt *= SIZE_RATIO[a];
  return pt;
}

// Text mode: every glyph is one 0.1" cell, every line one 1/6" row.
export const textMode = {
  name: 'text',
  width: () => 0.1,
  lineHeight: () => 1 / 6,
};

// Printer: Courier, 0.6 em advance, single spacing at 1 em of leading.
// Superscript and subscript shrink the glyph but not the line.
export const courier = {
  name: 'courier',
  width: (ch, style) => (sizeOf(style) * 0.6) / 72,
  lineHeight: (style) => {
    let pt = fontPoints(style.font);
    for (const a of style.attrs) if (SIZE_RATIO[a] && a !== 'SUPRSCPT' && a !== 'SUBSCPT') pt *= SIZE_RATIO[a];
    return pt / 72;
  },
};

// ---- proportional faces ------------------------------------------------
//
// A Font code's value is a face name and a size, e.g. 'Times New Roman 12pt'
// or 'Courier 10cpi'. The face maps to one of the three base-14 families the
// PDF writer can name without embedding anything.


export const FAMILIES = ['Courier', 'Times', 'Helvetica'];

// PDF base font names, indexed by family * 4 + (bold ? 1 : 0) + (italic ? 2 : 0).
export const PDF_FONTS = [
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
];

// 'Times New Roman 12pt' -> 'Times New Roman'
export function faceName(font) {
  return (font || '').replace(/\s*\d+(?:\.\d+)?\s*(cpi|pt)\s*$/i, '').trim() || 'Courier';
}

export function familyOf(font) {
  const f = faceName(font).toLowerCase();
  if (/^(times|tms|roman|serif|tinos|georgia|cg times|dutch)/.test(f)) return 'Times';
  if (/^(arial|helv|swiss|sans|arimo|univers|cg triumvirate)/.test(f)) return 'Helvetica';
  return 'Courier';
}

export function isBold(attrs) { return attrs.includes('BOLD') || attrs.includes('SHADW'); }
export function isItalic(attrs) { return attrs.includes('ITALC'); }

// Index into PDF_FONTS for a style.
export function faceIndex(style) {
  return FAMILIES.indexOf(familyOf(style.font)) * 4 + (isBold(style.attrs) ? 1 : 0) + (isItalic(style.attrs) ? 2 : 0);
}

// Advance of one character in em, for a PDF_FONTS index.
export function glyphEm(index, ch) {
  if (index < 4) return 0.6;
  return AFM_WIDTHS[PDF_FONTS[index]][winAnsiByte(ch) - 32] / 1000;
}

// Width of a string in inches at pt points.
export function textWidth(index, text, pt) {
  let em = 0;
  for (const ch of text) em += glyphEm(index, ch);
  return (em * pt) / 72;
}

// Leading as a multiple of the point size: Courier sets solid, as the DOS
// printer did; the proportional faces get the usual 115%.
export function leading(font) {
  return familyOf(font) === 'Courier' ? 1 : 1.15;
}

// Printer: the base-14 faces with their real widths. For Courier fonts this
// is the same measure as `courier`.
export const print = {
  name: 'print',
  width: (ch, style) => (sizeOf(style) * glyphEm(faceIndex(style), ch)) / 72,
  lineHeight: (style) => {
    let pt = fontPoints(style.font);
    for (const a of style.attrs) if (SIZE_RATIO[a] && a !== 'SUPRSCPT' && a !== 'SUBSCPT') pt *= SIZE_RATIO[a];
    return (pt * leading(style.font)) / 72;
  },
};
