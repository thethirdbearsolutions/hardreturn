// Measures: how wide a glyph is and how tall a line is, in inches, for a
// given style. Layout is a pure function of the stream and one of these.
//
// style = { attrs: string[] (active paired codes), font: string, key }

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
