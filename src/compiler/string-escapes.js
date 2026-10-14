// string-escapes.js — what a string literal's or template's text means.
//
// JSON's escapes (`\n`, `\t`, `\r`, `\b`, `\f`, `\uXXXX`), and `\c` as c for
// any other c (so `\"`, `\\`, `` \` ``, and `\$` are those characters).

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

/** The text `raw` means, or null when a `\u` lacks its four hexadecimal digits. */
export function decodeEscapes(raw) {
  let out = '';
  for (let i = 0; i < raw.length;) {
    if (raw[i] !== '\\') { out += raw[i++]; continue; }
    const e = raw[i + 1];
    i += 2;
    if (e === 'u') {
      const hex = raw.slice(i, i + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      out += ESCAPES[e] ?? e;
    }
  }
  return out;
}

export const INVALID_ESCAPE_MESSAGE = 'Invalid escape: \\u takes four hexadecimal digits';
