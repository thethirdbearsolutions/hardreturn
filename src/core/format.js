// Saved formats. A .hr file is JSON:
//   { "format": "hardreturn", "version": 1, "stream": [ "Dear Ann,", {"c":"HRt"}, … ] }
// Runs of characters are stored as strings; codes as their objects.

import { isChar, isCode } from './codes.js';
import { textOf, itemsOf } from './stream.js';

export const MIME = 'application/x-hardreturn+json';
export const VERSION = 1;

export function toHr(items, meta = {}) {
  const stream = [];
  let run = '';
  for (const it of items) {
    if (isChar(it)) { run += it; continue; }
    if (run) { stream.push(run); run = ''; }
    stream.push(it);
  }
  if (run) stream.push(run);
  return JSON.stringify({ format: 'hardreturn', version: VERSION, ...meta, stream });
}

export function fromHr(str) {
  const doc = JSON.parse(str);
  if (!doc || doc.format !== 'hardreturn' || !Array.isArray(doc.stream)) throw new Error('Not a Hard Return document');
  if (doc.version > VERSION) throw new Error(`Document version ${doc.version} is newer than this program`);
  const items = [];
  for (const s of doc.stream) {
    if (typeof s === 'string') items.push(...Array.from(s));
    else if (isCode(s) && typeof s.c === 'string') items.push({ ...s });
  }
  return items;
}

export const toTxt = (items) => textOf(items);
export const fromTxt = (str) => itemsOf(str);

export function isTextName(name) { return /\.txt$/i.test(name || ''); }

// Parse file content by name, sniffing JSON when the name says nothing.
export function parse(name, content) {
  if (isTextName(name)) return fromTxt(content);
  const t = content.trimStart();
  if (t.startsWith('{')) {
    try { return fromHr(content); } catch (e) { if (/\.hr$/i.test(name || '')) throw e; }
  }
  return fromTxt(content);
}

export function serialize(name, items) {
  return isTextName(name)
    ? { content: toTxt(items), mime: 'text/plain' }
    : { content: toHr(items), mime: MIME };
}
