// Typed JSON: `@json/\ decode T text \/`, `@json/\ encode T value \/`, and
// `@json/\ error T text \/`.
//
// Each type gets a generated reader and writer that run entirely in wasm.
// Decoding reads the string's code units directly and builds the native value
// as it goes. There is no JSON.parse, no intermediate JS objects, and no
// boundary call per field. Validation happens during the same pass: the first
// problem stops the read and records its offset. Encoding writes code units into
// a buffer and makes the string once at the end.
//
//   decode T text   → ?T: the value, or null if the text does not match T
//   error T text    → Str: "" if it matches, else the problem and its line/column
//   encode T value  → Str: compact JSON
//
// Supported types: I32, U32, I64, F32, F64, Bool, Str; ?T of a reference type
// (null or a missing field); Array[T]; local structs, which are JSON objects;
// and local enums. Unknown object fields are skipped, so documents may carry
// more than the type describes. Enums whose variants have no fields are
// strings ("Red"). Otherwise every variant is an object whose first field is
// its "kind": {"kind": "Circle", "radius": 3}. Types may be recursive through
// ?T or Array[T].
import { declarationsFromSource, expressionFromSource } from './source-expansion.js';
import { sourceTypeStr } from './ir-helpers.js';
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';

const literal = text => JSON.stringify(text);

const SCALARS = {
  I32: { zero: '0', read: 'i32', write: v => `__json_put_i64(w, ${v}.to_i64());` },
  U32: { zero: '0', read: 'u32', write: v => `__json_put_i64(w, ${v}.to_i64());` },
  I64: { zero: '0', read: 'i64', write: v => `__json_put_i64(w, ${v});` },
  F32: { zero: '0.0', read: 'f32', write: v => `__json_put_f32(w, ${v});` },
  F64: { zero: '0.0', read: 'f64', write: v => `__json_put_f64(w, ${v});` },
  Bool: { zero: 'false', read: 'bool', write: v => `__json_raw(w, if ${v} { "true"; } else { "false"; });` },
  Str: { zero: '""', read: 'str', write: v => `__json_put_str(w, ${v});` },
};

// The reader and writer every generated codec shares, emitted once per program.
const RUNTIME = String.raw`
struct JsonReader__:
    | text: Str
    | at: I32
    | n: I32
    | failed: I32
    | reason: Str
    | ks: I32
    | kl: I32
    | key: Str
    | depth: I32
    | names: Array[I32]
    | where: Str
    | matched: I32

struct JsonWriter__:
    | buf: Array[I32]
    | n: I32
    | names: Array[I32]

let __json_number: fun(Str) F64 = @es/\ s => +s \/;
let __json_float_text: fun(F64) Str = @es/\ x => Number.isFinite(x) ? String(x) : 'null' \/;

fn __json_codes(s: Str) Array[I32] {
    let codes = Array[I32].new_default(s.len());
    for (0..<s.len()) |i| {
        codes[i] = s[i];
    };
    codes;
}

fn __json_reader(text: Str) JsonReader__ {
    JsonReader__ { text: text, at: 0, n: text.len(), failed: 0, reason: "", ks: 0, kl: 0, key: "", depth: 0, names: __json_codes(__json_names()), where: "", matched: 0 };
}

// Start over from the beginning, for the next match arm.
fn __json_restart(r: JsonReader__) void {
    r.at = 0;
    r.failed = 0;
    r.reason = "";
    r.depth = 0;
    r.where = "";
    r.matched = 0;
}

// After one part of a match pattern: count it, or name where it failed.
fn __json_at(r: JsonReader__, was_ok: Bool, where: Str) void {
    if was_ok {
        if r.failed != 0 {
            r.where = where;
        } else {
            r.matched += 1;
        };
    };
}

// Record the first problem; then every later read stops at the end of input.
fn __json_fail(r: JsonReader__, why: Str) void {
    if r.failed == 0 {
        r.failed = r.at + 1;
        r.reason = why;
    };
    r.at = r.n;
}

fn __json_ws(r: JsonReader__) void {
    let t = r.text;
    let n = r.n;
    let i = r.at;
    while (i < n) {
        let c = t[i];
        if c == 32 or c == 10 or c == 13 or c == 9 {
            i += 1;
        } else {
            break;
        };
    };
    r.at = i;
}

fn __json_peek(r: JsonReader__) I32 {
    __json_ws(r);
    if r.at < r.n { r.text[r.at]; } else { -1; };
}

fn __json_open(r: JsonReader__, c: I32, why: Str) void {
    if __json_peek(r) == c {
        r.at += 1;
    } else {
        __json_fail(r, why);
    };
}

fn __json_colon(r: JsonReader__) void {
    __json_open(r, 58, "expected ':'");
}

// After an opening bracket: whether the container has a first element.
fn __json_first(r: JsonReader__, close: I32) Bool {
    if __json_peek(r) == close {
        r.at += 1;
        false;
    } else {
        r.failed == 0;
    };
}

// After an element: whether another one follows.
fn __json_next(r: JsonReader__, close: I32) Bool {
    let c = __json_peek(r);
    if c == 44 {
        r.at += 1;
        true;
    } else {
        if c == close {
            r.at += 1;
        } else {
            __json_fail(r, if close == 125 { "expected ',' or '}'"; } else { "expected ',' or ']'"; });
        };
        false;
    };
}

fn __json_end(r: JsonReader__) void {
    if __json_peek(r) != -1 {
        __json_fail(r, "unexpected text after the value");
    };
}

fn __json_missing(r: JsonReader__, name: Str) void {
    __json_fail(r, "missing field \"" + name + "\"");
}

fn __json_word(r: JsonReader__, word: Str) Bool {
    let n = word.len();
    let ok = r.at + n <= r.n;
    let i = 0;
    while (ok and i < n) {
        ok = r.text[r.at + i] == word[i];
        i += 1;
    };
    if ok {
        r.at += n;
    };
    ok;
}

fn __json_hex(r: JsonReader__, at: I32) I32 {
    let v = 0;
    for (0..<4) |k| {
        let c = if at + k < r.n { r.text[at + k]; } else { 0; };
        let d = if c >= 48 and c <= 57 { c - 48; } else { if c >= 97 and c <= 102 { c - 87; } else { if c >= 65 and c <= 70 { c - 55; } else { -1; }; }; };
        v = if d < 0 or v < 0 { -1; } else { v * 16 + d; };
    };
    v;
}

// Read a string token. Without escapes it stays a span of the input
// (ks, kl); with escapes it is decoded into key and ks is -1.
fn __json_span(r: JsonReader__) void {
    r.ks = 0;
    r.kl = 0;
    if __json_peek(r) != 34 {
        __json_fail(r, "expected a string");
        return;
    };
    let t = r.text;
    let n = r.n;
    let start = r.at + 1;
    let i = start;
    while (i < n) {
        let c = t[i];
        if c == 34 or c == 92 or c < 32 {
            break;
        };
        i += 1;
    };
    if i < n and t[i] == 34 {
        r.ks = start;
        r.kl = i - start;
        r.at = i + 1;
        return;
    };
    let w = __json_writer(i - start + 16);
    for (start..<i) |k| {
        __json_put(w, t[k]);
    };
    let done = false;
    while (not done) {
        if i >= n {
            r.at = n;
            __json_fail(r, "unterminated string");
            done = true;
        } else {
            let c = t[i];
            if c == 34 {
                i += 1;
                done = true;
            } else {
                if c < 32 {
                    r.at = i;
                    __json_fail(r, "control character in string");
                    done = true;
                } else {
                    if c == 92 {
                        let e = if i + 1 < n { t[i + 1]; } else { 0; };
                        i += 2;
                        match e {
                            34 => { __json_put(w, 34); },
                            92 => { __json_put(w, 92); },
                            47 => { __json_put(w, 47); },
                            98 => { __json_put(w, 8); },
                            102 => { __json_put(w, 12); },
                            110 => { __json_put(w, 10); },
                            114 => { __json_put(w, 13); },
                            116 => { __json_put(w, 9); },
                            117 => {
                                let h = __json_hex(r, i);
                                if h < 0 {
                                    r.at = i - 2;
                                    __json_fail(r, "invalid \\u escape");
                                    done = true;
                                } else {
                                    __json_put(w, h);
                                    i += 4;
                                };
                            },
                            ~> {
                                r.at = i - 2;
                                __json_fail(r, "invalid escape");
                                done = true;
                            },
                        };
                    } else {
                        __json_put(w, c);
                        i += 1;
                    };
                };
            };
        };
    };
    if r.failed == 0 {
        r.at = i;
        r.ks = -1;
        r.key = Str.from_codes(w.buf, w.n);
    };
}

// Whether the string just read equals names[at ..< at + n].
fn __json_is(r: JsonReader__, at: I32, n: I32) Bool {
    if r.ks < 0 {
        let ok = r.key.len() == n;
        let i = 0;
        while (ok and i < n) {
            ok = r.key[i] == r.names[at + i];
            i += 1;
        };
        ok;
    } else {
        let ok = r.kl == n;
        let i = 0;
        while (ok and i < n) {
            ok = r.text[r.ks + i] == r.names[at + i];
            i += 1;
        };
        ok;
    };
}

fn __json_str(r: JsonReader__) Str {
    __json_span(r);
    if r.ks < 0 { r.key; } else { r.text.slice(r.ks, r.ks + r.kl); };
}

fn __json_bool(r: JsonReader__) Bool {
    let c = __json_peek(r);
    if c == 116 and __json_word(r, "true") {
        true;
    } else {
        if not (c == 102 and __json_word(r, "false")) {
            __json_fail(r, "expected true or false");
        };
        false;
    };
}

fn __json_null(r: JsonReader__) Bool {
    __json_peek(r) == 110 and __json_word(r, "null");
}

fn __json_digits(r: JsonReader__, at: I32) I32 {
    let i = at;
    while (i < r.n and r.text[i] >= 48 and r.text[i] <= 57) {
        i += 1;
    };
    i;
}

// Scan a number token from r.at. Returns its end, or -1 if it is malformed.
// kl is 1 when it has a fraction or an exponent.
fn __json_number_end(r: JsonReader__) I32 {
    let t = r.text;
    let i = r.at;
    if i < r.n and t[i] == 45 {
        i += 1;
    };
    let whole = i;
    i = __json_digits(r, i);
    if i == whole or (t[whole] == 48 and i - whole > 1) {
        return -1;
    };
    r.kl = 0;
    if i < r.n and t[i] == 46 {
        r.kl = 1;
        let fraction = i + 1;
        i = __json_digits(r, fraction);
        if i == fraction {
            return -1;
        };
    };
    if i < r.n and (t[i] == 101 or t[i] == 69) {
        r.kl = 1;
        i += 1;
        if i < r.n and (t[i] == 43 or t[i] == 45) {
            i += 1;
        };
        let exponent = i;
        i = __json_digits(r, exponent);
        if i == exponent {
            return -1;
        };
    };
    i;
}

fn __json_f64(r: JsonReader__) F64 {
    __json_ws(r);
    let start = r.at;
    let end = __json_number_end(r);
    if end < 0 {
        __json_fail(r, "expected a number");
        return 0.0;
    };
    r.at = end;
    let negative = r.text[start] == 45;
    let whole = if negative { start + 1; } else { start; };
    if r.kl == 0 and end - whole <= 15 {
        // Integers below 10^15 are exact in F64: no host call.
        let v = 0.0;
        for (whole..<end) |k| {
            v = v * 10.0 + (r.text[k] - 48).to_f64();
        };
        if negative { 0.0 - v; } else { v; };
    } else {
        __json_number(r.text.slice(start, end));
    };
}

fn __json_f32(r: JsonReader__) F32 {
    __json_f64(r).to_f32();
}

// Integers are read exactly, digit by digit, on the negative side so that
// the minimum I64 fits.
fn __json_i64(r: JsonReader__) I64 {
    __json_ws(r);
    let start = r.at;
    let end = __json_number_end(r);
    if end < 0 or r.kl != 0 {
        __json_fail(r, "expected an integer");
        return 0;
    };
    let negative = r.text[start] == 45;
    let whole = if negative { start + 1; } else { start; };
    let v: I64 = 0;
    let limit: I64 = -922337203685477580;
    let overflow = false;
    for (whole..<end) |k| {
        let d = (r.text[k] - 48).to_i64();
        if v < limit or (v == limit and d > 8) {
            overflow = true;
        };
        v = v * 10 - d;
    };
    if overflow or (not negative and v == limit * 10 - 8) {
        __json_fail(r, "integer out of range");
        return 0;
    };
    r.at = end;
    if negative { v; } else { 0 - v; };
}

fn __json_i32(r: JsonReader__) I32 {
    let v = __json_i64(r);
    let low: I64 = -2147483648;
    let high: I64 = 2147483647;
    if v < low or v > high {
        __json_fail(r, "integer out of range");
        0;
    } else {
        v.to_i32();
    };
}

fn __json_u32(r: JsonReader__) U32 {
    let v = __json_i64(r);
    let high: I64 = 4294967295;
    if v < 0 or v > high {
        __json_fail(r, "integer out of range");
    };
    v.to_u32();
}

// Skip one value of any shape (unknown fields).
fn __json_skip(r: JsonReader__) void {
    let c = __json_peek(r);
    r.depth += 1;
    if r.depth > 512 {
        __json_fail(r, "nested too deeply");
    };
    if c == 123 {
        r.at += 1;
        let more = __json_first(r, 125);
        while (more) {
            __json_span(r);
            __json_colon(r);
            __json_skip(r);
            more = __json_next(r, 125);
        };
    } else {
        if c == 91 {
            r.at += 1;
            let more = __json_first(r, 93);
            while (more) {
                __json_skip(r);
                more = __json_next(r, 93);
            };
        } else {
            if c == 34 {
                __json_span(r);
            } else {
                if c == 116 or c == 102 {
                    let flag = __json_bool(r);
                } else {
                    if not __json_null(r) {
                        let end = __json_number_end(r);
                        if end < 0 {
                            __json_fail(r, "expected a value");
                        } else {
                            r.at = end;
                        };
                    };
                };
            };
        };
    };
    r.depth -= 1;
}

// Skip the remaining fields of an object whose first field was already read.
fn __json_rest(r: JsonReader__) void {
    let more = __json_next(r, 125);
    while (more) {
        __json_span(r);
        __json_colon(r);
        __json_skip(r);
        more = __json_next(r, 125);
    };
}

fn __json_describe(r: JsonReader__) Str {
    if r.failed == 0 {
        return "";
    };
    let line = 1;
    let column = 1;
    for (0..<(r.failed - 1)) |i| {
        if r.text[i] == 10 {
            line += 1;
            column = 1;
        } else {
            column += 1;
        };
    };
    let place = if r.where.len() > 0 { r.where + ": "; } else { ""; };
    place + r.reason + " at line " + line.to_str() + ", column " + column.to_str();
}

fn __json_writer(capacity: I32) JsonWriter__ {
    JsonWriter__ { buf: Array[I32].new_default(capacity), n: 0, names: __json_codes(__json_names()) };
}

// Make room for count more code units, so writes can skip the check.
fn __json_reserve(w: JsonWriter__, count: I32) void {
    if w.n + count > w.buf.len() {
        let grown = Array[I32].new_default(w.n * 2 + count + 16);
        grown.copy_from(0, w.buf, 0, w.n);
        w.buf = grown;
    };
}

fn __json_put(w: JsonWriter__, c: I32) void {
    __json_reserve(w, 1);
    w.buf[w.n] = c;
    w.n += 1;
}

fn __json_raw(w: JsonWriter__, s: Str) void {
    let n = s.len();
    __json_reserve(w, n);
    for (0..<n) |i| {
        w.buf[w.n + i] = s[i];
    };
    w.n += n;
}

// prefix, then "name": with the name copied from the table in one array.copy.
fn __json_name(w: JsonWriter__, prefix: I32, at: I32, n: I32) void {
    __json_reserve(w, n + 4);
    let o = w.n;
    if prefix != 0 {
        w.buf[o] = prefix;
        o += 1;
    };
    w.buf[o] = 34;
    w.buf.copy_from(o + 1, w.names, at, n);
    w.buf[o + n + 1] = 34;
    w.buf[o + n + 2] = 58;
    w.n = o + n + 3;
}

// "name", as an enum value.
fn __json_tag(w: JsonWriter__, at: I32, n: I32) void {
    __json_reserve(w, n + 2);
    w.buf[w.n] = 34;
    w.buf.copy_from(w.n + 1, w.names, at, n);
    w.buf[w.n + n + 1] = 34;
    w.n += n + 2;
}

fn __json_hex_digit(v: I32) I32 {
    if v < 10 { v + 48; } else { v + 87; };
}

fn __json_put_str(w: JsonWriter__, s: Str) void {
    let n = s.len();
    __json_reserve(w, n + 2);
    w.buf[w.n] = 34;
    w.n += 1;
    let i = 0;
    // Plain characters copy straight into reserved space.
    while (i < n) {
        let c = s[i];
        if c == 34 or c == 92 or c < 32 {
            break;
        };
        w.buf[w.n] = c;
        w.n += 1;
        i += 1;
    };
    for (i..<n) |k| {
        let c = s[k];
        if c == 34 or c == 92 {
            __json_put(w, 92);
            __json_put(w, c);
        } else {
            if c >= 32 {
                __json_put(w, c);
            } else {
                match c {
                    10 => { __json_raw(w, "\\n"); },
                    13 => { __json_raw(w, "\\r"); },
                    9 => { __json_raw(w, "\\t"); },
                    ~> {
                        __json_raw(w, "\\u00");
                        __json_put(w, __json_hex_digit(c >> 4));
                        __json_put(w, __json_hex_digit(c & 15));
                    },
                };
            };
        };
    };
    __json_put(w, 34);
}

fn __json_put_i64(w: JsonWriter__, v: I64) void {
    __json_reserve(w, 20);
    if v < 0 {
        w.buf[w.n] = 45;
        w.n += 1;
    };
    // Digits of |v|, worked out on the negative side so the minimum I64 fits.
    let m = if v < 0 { v; } else { 0 - v; };
    let start = w.n;
    let more = true;
    while (more) {
        w.buf[w.n] = 48 - (m % 10).to_i32();
        w.n += 1;
        m = m / 10;
        more = m != 0;
    };
    let a = start;
    let b = w.n - 1;
    while (a < b) {
        let c = w.buf[a];
        w.buf[a] = w.buf[b];
        w.buf[b] = c;
        a += 1;
        b -= 1;
    };
}

fn __json_put_f64(w: JsonWriter__, x: F64) void {
    if x > -9007199254740992.0 and x < 9007199254740992.0 {
        let whole = x.to_i64();
        if whole.to_f64() == x {
            __json_put_i64(w, whole);
            return;
        };
    };
    __json_raw(w, __json_float_text(x));
}

fn __json_put_f32(w: JsonWriter__, x: F32) void {
    let wide = x.to_f64();
    if wide > -16777216.0 and wide < 16777216.0 and wide.to_i64().to_f64() == wide {
        __json_put_i64(w, wide.to_i64());
    } else {
        if wide - wide == 0.0 {
            __json_raw(w, x.to_str());
        } else {
            __json_raw(w, "null");
        };
    };
}
`;

class JsonError extends Error {
  constructor(message, offset = null, length = 1) {
    super(message);
    this.offset = offset;
    this.length = length;
  }
}

export function expandJson(doc, parser, createDocument) {
  const root = doc.body.firstChild;
  const sites = [...doc.querySelectorAll('ir-dsl[name="json"]')].filter(site => site.getAttribute('body') != null);
  if (!sites.length) return;
  // Generated code lives beside its sites: in their module, or at the top
  // level. Each container gets its own runtime, codecs, and name table.
  const containers = new Map();
  for (const site of sites) {
    const container = site.closest('ir-module') ?? root;
    if (!containers.has(container)) containers.set(container, []);
    containers.get(container).push(site);
  }
  let serial = 0;
  for (const [container, containerSites] of containers) {
    const program = createProgram(container);
    for (const site of containerSites) {
      try {
        site.replaceWith(expandSite(site, program, `__json${serial++}_`, parser, createDocument));
      } catch (error) {
        throw siteDiagnostic(site, error);
      }
    }
    // Declarations go first, once: the runtime (if this is the first
    // expansion), then each type's reader and writer, then the name table,
    // which is rebuilt whenever a later expansion round adds names.
    container.querySelector(':scope > ir-fn[name="__json_names"]')?.remove();
    const table = `fn __json_names() Str {\n    ${literal(program.names.join(''))};\n}\n`;
    const source = (program.hasRuntime ? '' : RUNTIME) + program.functions.join('\n') + table;
    const declarations = declarationsFromSource(parser, source, containerSites[0], { createDocument });
    for (const declaration of declarations.reverse()) container.insertBefore(declaration, container.firstChild);
  }
}

function siteDiagnostic(site, error) {
  if (error.diagnostic) return error;
  if (error.offset == null) return compilerError(DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, error.message, site);
  const start = Number(site.dataset.bodyInnerStart) + error.offset;
  const lines = (site.ownerDocument.__utuSourceText ?? '').slice(0, start).split('\n');
  const point = site.cloneNode(false);
  point.dataset.start = start;
  point.dataset.end = start + error.length;
  point.dataset.row = lines.length;
  point.dataset.col = lines.at(-1).length + 1;
  point.dataset.endRow = point.dataset.row;
  point.dataset.endCol = Number(point.dataset.col) + error.length;
  return compilerError(DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, error.message, point);
}

/** The types visible to codecs in a container, and the functions generated so far. */
function createProgram(container) {
  const declared = new Map();
  const local = container.localName === 'ir-module' ? ':scope > ir-struct, :scope > ir-enum' : 'ir-struct, ir-enum';
  for (const node of container.querySelectorAll(local)) declared.set(node.getAttribute('name'), node);
  // Field and variant names live in one table per container; generated code
  // refers to a name by its offset and length in it.
  const names = container.__utuJsonNames ??= [];
  const offsets = new Map();
  let offset = 0;
  for (const name of names) { offsets.set(name, offset); offset += name.length; }
  return {
    declared,
    names,
    nameRef(name) {
      if (!offsets.has(name)) {
        offsets.set(name, names.reduce((total, known) => total + known.length, 0));
        names.push(name);
      }
      return `${offsets.get(name)}, ${name.length}`;
    },
    // A previous expansion round may already have emitted the runtime or a codec.
    hasRuntime: !!container.querySelector(':scope > ir-struct[name="JsonReader__"]'),
    existing: new Set([...container.querySelectorAll(':scope > ir-fn')].map(fn => fn.getAttribute('name'))),
    generated: new Set(),
    functions: [],
  };
}

/** `decode|encode|error`, a type (with nested brackets), then the expression. */
function parseBody(raw) {
  if (/^\s*match\b/.test(raw)) return parseMatch(raw);
  const head = /^(\s*)(decode|encode|error)(\s+)/.exec(raw);
  if (!head) throw new JsonError('@json expects `decode Type text`, `encode Type value`, `error Type text`, or `match text { … }`', raw.search(/\S|$/));
  const typeStart = head[0].length;
  let i = typeStart, depth = 0;
  while (i < raw.length && (depth > 0 || !/\s/.test(raw[i]))) {
    if (raw[i] === '[') depth++;
    if (raw[i] === ']') depth--;
    i++;
  }
  const type = raw.slice(typeStart, i);
  if (!/^\??[A-Z]\w*(\[.*\])?$/.test(type)) throw new JsonError(`Expected a type after ${head[2]}`, typeStart, Math.max(1, type.length));
  const exprStart = i + (/^\s*/.exec(raw.slice(i))[0].length);
  if (exprStart >= raw.trimEnd().length) throw new JsonError(`@json ${head[2]} needs a ${head[2] === 'encode' ? 'value' : 'text'} expression after the type`, typeStart, type.length);
  return { op: head[2], type, typeStart, expr: raw.slice(exprStart), exprStart };
}

function expandSite(site, program, prefix, parser, createDocument) {
  const raw = site.getAttribute('body').slice(2, -2);
  const parsed = parseBody(raw);
  if (parsed.op === 'match') return expandMatch(site, parsed, program, prefix, parser, createDocument);
  const { op, type, typeStart, expr, exprStart } = parsed;
  const codec = codecs(program, typeStart, type.length);
  const shape = codec.shape(type);
  if (shape.kind === 'scalar' || shape.kind === 'optional') {
    throw new JsonError(`@json ${op} works on a struct, enum, or Array; wrap ${type} in a struct field`, typeStart, type.length);
  }
  const innerStart = Number(site.dataset.bodyInnerStart);
  const splices = new Map();
  const input = `${prefix}input`;
  try {
    splices.set(input, expressionFromSource(parser, expr, site, new Map(), { sourceStart: innerStart + exprStart, createDocument }));
  } catch {
    throw new JsonError(`Invalid ${op === 'encode' ? 'value' : 'text'} expression`, exprStart, expr.trimEnd().length);
  }
  const r = `${prefix}reader`, w = `${prefix}writer`, value = `${prefix}value`, out = `${prefix}out`;
  let code;
  if (op === 'encode') {
    code = `{ let w = __json_writer(64); ${codec.write(type, input)} Str.from_codes(w.buf, w.n); }`.replaceAll(/\bw\b/g, w);
  } else {
    const read = codec.read(type).replaceAll(/\br\b/g, r);
    code = op === 'decode'
      ? `{ let ${r} = __json_reader(${input}); let ${value} = ${read}; __json_end(${r}); let ${out}: ?${type} = null; if ${r}.failed == 0 { ${out} = ${value}; }; ${out}; }`
      : `{ let ${r} = __json_reader(${input}); let ${value} = ${read}; __json_end(${r}); __json_describe(${r}); }`;
  }
  program.functions.push(...codec.flush());
  return expressionFromSource(parser, code, site, splices, { createDocument });
}

/** Shapes, readers, writers, and defaults for the types one site uses. */
function codecs(program, typeOffset, typeLength) {
  const fail = message => { throw new JsonError(message, typeOffset, typeLength); };
  const pending = [];
  const mangle = type => type.replace(/\?/g, 'opt_').replace(/[^\w]/g, '_');

  function shape(type) {
    type = type.replace(/\s+/g, '');
    if (SCALARS[type]) return { kind: 'scalar', type };
    if (type.startsWith('?')) {
      const inner = shape(type.slice(1));
      if (inner.kind === 'scalar' && inner.type !== 'Str') fail(`${type} is not supported: only reference types (Str, structs, enums, arrays) can be null`);
      if (inner.kind === 'optional') fail(`${type} is not supported`);
      return { kind: 'optional', type, inner };
    }
    if (type.startsWith('Array[') && type.endsWith(']')) return { kind: 'array', type, inner: shape(type.slice(6, -1)) };
    const node = program.declared.get(type);
    if (!node) fail(`@json cannot use ${type}: use a local struct or enum, Array, ?T, Str, Bool, I32, U32, I64, F32, or F64`);
    if (node.querySelector(':scope > ir-type-params, :scope > ir-generic-params')) fail(`@json cannot use generic type ${type}`);
    const fieldsOf = owner => [...owner.querySelectorAll(':scope > ir-field')].map(field => ({ name: field.getAttribute('name'), type: (sourceTypeStr(field.firstElementChild) ?? '').replace(/\s+/g, '') }));
    if (node.localName === 'ir-struct') return { kind: 'struct', type, fields: fieldsOf(node) };
    const variants = [...node.querySelectorAll(':scope > ir-variant')].map(variant => ({ name: variant.getAttribute('name'), fields: fieldsOf(variant) }));
    for (const variant of variants) {
      if (variant.fields.some(field => field.name === 'kind')) fail(`${type}.${variant.name} has a field named kind, which @json uses to name the variant`);
    }
    return { kind: 'enum', type, variants, tagged: variants.some(variant => variant.fields.length) };
  }

  /** Generate a function once, by name, unless the program already has it. */
  function define(name, source) {
    if (program.generated.has(name) || program.existing.has(name)) return;
    program.generated.add(name);
    pending.push(source());
  }

  function zero(type, visiting = []) {
    const s = shape(type);
    if (s.kind === 'scalar') return SCALARS[s.type].zero;
    if (s.kind === 'optional') return 'null';
    if (s.kind === 'array') return '[]';
    if (visiting.includes(s.type)) fail(`${s.type} contains itself; make the recursive field ?${s.type} or an Array`);
    const name = `__json_zero_${mangle(s.type)}`;
    const next = [...visiting, s.type];
    const construct = fields => fields.map(field => `${field.name}: ${zero(field.type, next)}`).join(', ');
    let body;
    if (s.kind === 'struct') body = `${s.type} { ${construct(s.fields)} }`;
    else {
      const usable = s.variants.find(variant => { try { construct(variant.fields); return true; } catch { return false; } });
      if (!usable) fail(`${s.type} has no variant without a recursive field`);
      body = `${usable.name} { ${construct(usable.fields)} }`;
    }
    define(name, () => `fn ${name}() ${s.type} {\n    ${body};\n}`);
    return `${name}()`;
  }

  /** Read a value of `type` from reader `r`. */
  function read(type) {
    const s = shape(type);
    if (s.kind === 'scalar') return `__json_${SCALARS[s.type].read}(r)`;
    const name = `__json_read_${mangle(s.type)}`;
    define(name, () => {
      if (s.kind === 'optional') {
        return `fn ${name}(r: JsonReader__) ${s.type} {\n    let out: ${s.type} = null;\n    if not __json_null(r) {\n        out = ${read(s.inner.type)};\n    };\n    out;\n}`;
      }
      if (s.kind === 'array') return arrayReader(name, s);
      if (s.kind === 'struct') return `fn ${name}(r: JsonReader__) ${s.type} {\n${fieldsReader(s.fields, `${s.type} { ${s.fields.map((f, i) => `${f.name}: f${i}`).join(', ')} }`, true)}\n}`;
      return enumReader(name, s);
    });
    return `${name}(r)`;
  }

  function arrayReader(name, s) {
    const element = s.inner.type;
    return `fn ${name}(r: JsonReader__) ${s.type} {
    let out: ${s.type} = [];
    __json_open(r, 91, "expected an array");
    if __json_first(r, 93) {
        let first = ${read(element)};
        let items = Array[${element}].new(8, first);
        let count = 1;
        while (__json_next(r, 93)) {
            let item = ${read(element)};
            if count == items.len() {
                let grown = Array[${element}].new(count * 2, first);
                grown.copy_from(0, items, 0, count);
                items = grown;
            };
            items[count] = item;
            count += 1;
        };
        out = if count == items.len() { items; } else { items.slice(0, count); };
    };
    out;
}`;
  }

  /**
   * The body of an object reader: one local per field, matched by name, then
   * required-field checks and `result`. With `open`, it reads the `{` and the
   * first field; otherwise the object is already open (after an enum's kind).
   */
  function fieldsReader(fields, result, open) {
    const locals = fields.map((field, i) => `    let f${i}: ${field.type} = ${zero(field.type)};\n    let s${i} = false;`).join('\n');
    const match = fields.map((field, i) => `if __json_is(r, ${program.nameRef(field.name)}) {\n            f${i} = ${read(field.type)};\n            s${i} = true;\n        } else `).join('')
      + `{\n            __json_skip(r);\n        };`;
    const required = fields.map((field, i) => (field.type.startsWith('?') ? '' : `    if not s${i} {\n        __json_missing(r, ${literal(field.name)});\n    };\n`)).join('');
    const start = open ? `    __json_open(r, 123, "expected an object");\n    let more = __json_first(r, 125);` : '    let more = __json_next(r, 125);';
    return `${locals}
${start}
    while (more) {
        __json_span(r);
        __json_colon(r);
        ${match}
        more = __json_next(r, 125);
    };
${required}    ${result};`;
  }

  function enumReader(name, s) {
    const zeroValue = zero(s.type);
    if (!s.tagged) {
      const arms = s.variants.map(variant => `if __json_is(r, ${program.nameRef(variant.name)}) {\n        out = ${variant.name} {};\n    } else `).join('');
      return `fn ${name}(r: JsonReader__) ${s.type} {
    let out: ${s.type} = ${zeroValue};
    __json_span(r);
    ${arms}{
        __json_fail(r, ${literal(`unknown ${s.type} variant`)});
    };
    out;
}`;
    }
    const arms = s.variants.map(variant => {
      const reader = `__json_variant_${mangle(s.type)}_${variant.name}`;
      define(reader, () => `fn ${reader}(r: JsonReader__) ${s.type} {\n${fieldsReader(variant.fields, `${variant.name} { ${variant.fields.map((f, i) => `${f.name}: f${i}`).join(', ')} }`, false)}\n}`);
      return `if __json_is(r, ${program.nameRef(variant.name)}) {\n            out = ${reader}(r);\n        } else `;
    }).join('');
    return `fn ${name}(r: JsonReader__) ${s.type} {
    let out: ${s.type} = ${zeroValue};
    __json_open(r, 123, "expected an object");
    if __json_first(r, 125) {
        __json_span(r);
        if not __json_is(r, ${program.nameRef('kind')}) {
            __json_fail(r, "expected \\"kind\\" as the first field");
        };
        __json_colon(r);
        __json_span(r);
        ${arms}{
            __json_fail(r, ${literal(`unknown ${s.type} variant`)});
        };
    } else {
        __json_fail(r, "expected \\"kind\\" as the first field");
    };
    out;
}`;
  }

  /** Statements writing `value` (of `type`) to writer `w`. */
  function write(type, value) {
    const s = shape(type);
    if (s.kind === 'scalar') return SCALARS[s.type].write(value);
    const name = `__json_write_${mangle(s.type)}`;
    define(name, () => {
      let body;
      if (s.kind === 'optional') {
        body = `promote v {\n        |x| => {\n            ${write(s.inner.type, 'x')}\n        },\n        ~> {\n            __json_raw(w, "null");\n        },\n    };`;
      } else if (s.kind === 'array') {
        body = `__json_put(w, 91);\n    for (0..<v.len()) |i| {\n        if i > 0 {\n            __json_put(w, 44);\n        };\n        ${write(s.inner.type, 'v[i]')}\n    };\n    __json_put(w, 93);`;
      } else if (s.kind === 'struct') {
        body = objectWriter(s.fields, 'v', true);
      } else {
        const arms = s.variants.map(variant => {
          const tag = `__json_tag(w, ${program.nameRef(variant.name)});`;
          if (!s.tagged) return `        ${variant.name} => {\n            ${tag}\n        },`;
          const kind = `__json_name(w, 123, ${program.nameRef('kind')});\n            ${tag}`;
          if (!variant.fields.length) return `        ${variant.name} => {\n            ${kind}\n            __json_put(w, 125);\n        },`;
          return `        ${variant.name} |x| => {\n            ${kind}\n            ${objectWriter(variant.fields, 'x', false)}\n        },`;
        }).join('\n');
        body = `alt v {\n${arms}\n        ~> {},\n    };`;
      }
      return `fn ${name}(w: JsonWriter__, v: ${s.type}) void {\n    ${body}\n}`;
    });
    return `${name}(w, ${value});`;
  }

  /** Fields as "name":value pairs; `opens` writes the `{` (else the object already has a field). */
  function objectWriter(fields, value, opens) {
    if (!fields.length) return opens ? '__json_raw(w, "{}");' : '__json_put(w, 125);';
    const parts = fields.map((field, i) => `__json_name(w, ${i === 0 && opens ? 123 : 44}, ${program.nameRef(field.name)});\n    ${write(field.type, `${value}.${field.name}`)}`);
    return `${parts.join('\n    ')}\n    __json_put(w, 125);`;
  }

  return {
    shape,
    read,
    write,
    zeroOf: type => zero(type),
    flush: () => pending.splice(0),
  };
}

// ── match: structural patterns over JSON ─────────────────────────────────────
//
//   @json/\ match text {
//       { status: "ok", user: { name: |name| Str, age: |age| I32 = 0 } } => greet(name, age),
//       { status: "error", message: |message| Str } => show(message),
//       ~> |error| show(error),
//   }\/
//
// Patterns list only what the program needs: other fields are skipped without
// being decoded. A capture binds a typed value (any @json type, so a struct or
// Array capture decodes that whole subtree). ?T captures may be missing or
// null; `= default` fills a missing field; every other part is required.
// Literals ("ok", 3, true, null) must match exactly. Arms are tried in order;
// if none matches, the required ~> arm runs, optionally binding the error of
// the arm that got furthest, with the path where it failed.

/** A scanner over the match body that skips strings and comments. */
function scanner(raw, start) {
  let i = start;
  const ws = () => {
    for (;;) {
      while (i < raw.length && /\s/.test(raw[i])) i++;
      if (raw.startsWith('//', i)) { while (i < raw.length && raw[i] !== '\n') i++; continue; }
      return i;
    }
  };
  const expect = (text, what = `'${text}'`) => {
    ws();
    if (!raw.startsWith(text, i)) throw new JsonError(`Expected ${what} in @json match`, i, 1);
    i += text.length;
  };
  /** Source up to the first of `stops` at nesting depth 0. */
  const until = stops => {
    ws();
    const from = i;
    let depth = 0;
    while (i < raw.length) {
      const c = raw[i];
      if (c === '"') { i++; while (i < raw.length && raw[i] !== '"') i += raw[i] === '\\' ? 2 : 1; i++; continue; }
      if (raw.startsWith('//', i)) { while (i < raw.length && raw[i] !== '\n') i++; continue; }
      if (depth === 0 && stops.includes(c)) break;
      if ('([{'.includes(c)) depth++;
      if (')]}'.includes(c)) depth--;
      if (depth < 0) break;
      i++;
    }
    return { text: raw.slice(from, i).trimEnd(), start: from };
  };
  return {
    ws, expect, until,
    get at() { return i; },
    set at(value) { i = value; },
    peek: text => { ws(); return raw.startsWith(text, i); },
    word: pattern => { ws(); const m = pattern.exec(raw.slice(i)); if (!m) return null; const start = i; i += m[0].length; return { text: m[0], start }; },
  };
}

function parseMatch(raw) {
  const s = scanner(raw, raw.indexOf('match') + 5);
  const text = s.until(['{']);
  if (!text.text) throw new JsonError('@json match needs the text to match: `match text { … }`', s.at, 1);
  s.expect('{');
  const arms = [];
  let fallback = null;
  while (!s.peek('}')) {
    if (s.peek('~>')) {
      if (fallback) throw new JsonError('@json match has more than one ~> arm', s.at, 2);
      const start = s.at;
      s.expect('~>');
      let binding = null;
      if (s.peek('|')) {
        s.expect('|');
        binding = s.word(/^[a-z_]\w*/);
        if (!binding) throw new JsonError('Expected a name for the error: ~> |error| …', s.at, 1);
        s.expect('|');
      }
      fallback = { binding: binding?.text, body: s.until([',', '}']), start };
    } else {
      if (fallback) throw new JsonError('The ~> arm must be last in @json match', s.at, 1);
      const pattern = parsePattern(s, raw);
      s.expect('=>');
      arms.push({ pattern, body: s.until([',', '}']) });
    }
    if (!s.peek('}')) s.expect(',');
  }
  s.expect('}');
  if (s.ws() < raw.length) throw new JsonError('Unexpected text after @json match', s.at, 1);
  if (!arms.length) throw new JsonError('@json match needs at least one pattern arm', s.at, 1);
  if (!fallback) throw new JsonError('@json match needs a ~> arm for text that matches no pattern', s.at, 1);
  return { op: 'match', text, arms, fallback };
}

function parsePattern(s, raw) {
  s.ws();
  const start = s.at;
  if (s.peek('{')) {
    s.expect('{');
    const fields = [];
    while (!s.peek('}')) {
      const key = s.word(/^"(?:[^"\\]|\\.)*"/) ?? s.word(/^[A-Za-z_]\w*/);
      if (!key) throw new JsonError('Expected a field name in @json pattern', s.at, 1);
      const name = key.text.startsWith('"') ? JSON.parse(key.text) : key.text;
      if (fields.some(field => field.name === name)) throw new JsonError(`Field ${name} appears twice in this pattern`, key.start, key.text.length);
      s.expect(':');
      fields.push({ name, pattern: parsePattern(s, raw) });
      if (!s.peek('}')) s.expect(',');
    }
    s.expect('}');
    return { kind: 'object', fields, start };
  }
  if (s.peek('|')) {
    s.expect('|');
    const name = s.word(/^[a-z_]\w*/);
    if (!name) throw new JsonError('Expected a capture name: |name| Type', s.at, 1);
    s.expect('|');
    s.ws();
    const typeStart = s.at;
    const type = s.word(/^\??[A-Z]\w*(?:\[[^\]]*(?:\[[^\]]*\])?[^\]]*\])?/);
    if (!type) throw new JsonError(`Expected a type for capture ${name.text}`, s.at, 1);
    let fallback = null;
    if (s.peek('=') && !s.peek('=>')) {
      s.expect('=');
      fallback = s.until([',', '}']);
    }
    return { kind: 'capture', name: name.text, nameStart: name.start, type: type.text, typeStart, fallback, start };
  }
  const literalToken = s.word(/^"(?:[^"\\]|\\.)*"/) ?? s.word(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/) ?? s.word(/^(?:true|false|null)\b/);
  if (!literalToken) throw new JsonError('Expected {…}, |name| Type, or a literal in @json pattern', s.at, 1);
  const value = JSON.parse(literalToken.text);
  return { kind: 'literal', value, text: literalToken.text, start };
}

/** Whether a pattern can be satisfied when its field is absent. */
function optional(pattern) {
  if (pattern.kind === 'capture') return pattern.type.startsWith('?') || pattern.fallback != null;
  if (pattern.kind === 'object') return pattern.fields.every(field => optional(field.pattern));
  return false;
}

function expandMatch(site, parsed, program, prefix, parser, createDocument) {
  const innerStart = Number(site.dataset.bodyInnerStart);
  const splices = new Map();
  let serial = 0;
  const fresh = name => `${prefix}${name}${serial++}`;
  /** Parse a slice of the body as Utu, keeping its source range. */
  const splice = ({ text, start }, what) => {
    const key = fresh('splice');
    try {
      splices.set(key, expressionFromSource(parser, text, site, new Map(), { sourceStart: innerStart + start, createDocument }));
    } catch {
      throw new JsonError(`Invalid ${what} in @json match`, start, Math.max(1, text.length));
    }
    return key;
  };
  const r = fresh('reader');
  const captures = new Map();

  /** Statements reading `pattern` from r, assigning its captures. */
  function readPattern(pattern, path, armCaptures) {
    const where = literal(path);
    if (pattern.kind === 'capture') {
      if (captures.has(pattern.name) || armCaptures.has(pattern.name)) {
        throw new JsonError(`${pattern.name} is captured twice in this pattern`, pattern.nameStart, pattern.name.length);
      }
      const codec = codecs(program, pattern.typeStart, pattern.type.length);
      codec.shape(pattern.type);
      const local = fresh(`capture_${pattern.name}_`);
      armCaptures.set(pattern.name, { local, pattern });
      const ok = fresh('ok');
      const read = codec.read(pattern.type).replaceAll(/\br\b/g, r);
      const zero = codec.zeroOf(pattern.type);
      program.functions.push(...codec.flush());
      return { declare: `let ${local}: ${pattern.type} = ${zero};`,
        read: `let ${ok} = ${r}.failed == 0; ${local} = ${read}; __json_at(${r}, ${ok}, ${where});` };
    }
    if (pattern.kind === 'literal') {
      const ok = fresh('ok');
      const expected = literal(`expected ${pattern.text}`);
      const check = typeof pattern.value === 'string'
        ? `__json_span(${r}); if ${r}.failed == 0 and not __json_is(${r}, ${program.nameRef(pattern.value)}) { __json_fail(${r}, ${expected}); };`
        : typeof pattern.value === 'number'
          ? `if __json_f64(${r}) != ${Number.isInteger(pattern.value) ? `${pattern.value}.0` : pattern.value} { __json_fail(${r}, ${expected}); };`
          : typeof pattern.value === 'boolean'
            ? `if __json_bool(${r}) != ${pattern.value} { __json_fail(${r}, ${expected}); };`
            : `if not __json_null(${r}) { __json_fail(${r}, ${expected}); };`;
      return { declare: '', read: `let ${ok} = ${r}.failed == 0; ${check} __json_at(${r}, ${ok}, ${where});` };
    }
    // An object: one pass over its fields, matching the ones the pattern names.
    const more = fresh('more');
    const parts = pattern.fields.map(field => ({ field, seen: fresh('seen'), ...readPattern(field.pattern, path ? `${path}.${field.name}` : field.name, armCaptures) }));
    const arms = parts.map(part => `if __json_is(${r}, ${program.nameRef(part.field.name)}) { ${part.read} ${part.seen} = true; } else `).join('');
    const required = parts.filter(part => !optional(part.field.pattern))
      .map(part => `if not ${part.seen} { if ${r}.failed == 0 { ${r}.where = ${where}; }; __json_missing(${r}, ${literal(part.field.name)}); };`).join(' ');
    const ok = fresh('ok');
    return {
      declare: parts.map(part => `${part.declare} let ${part.seen} = false;`).join(' '),
      read: `let ${ok} = ${r}.failed == 0; __json_open(${r}, 123, "expected an object"); __json_at(${r}, ${ok}, ${where});
        let ${more} = __json_first(${r}, 125);
        while (${more}) { __json_span(${r}); __json_colon(${r}); ${arms}{ __json_skip(${r}); }; ${more} = __json_next(${r}, 125); };
        ${required}`,
    };
  }

  // When nothing matches, report the arm that matched the most of its pattern
  // before failing (ties: the one that read furthest).
  const best = fresh('error'), bestAt = fresh('errorAt'), bestMatched = fresh('errorMatched');
  const fallbackBody = splice(parsed.fallback.body, 'fallback');
  let code = `{ ${parsed.fallback.binding ? `let ${parsed.fallback.binding} = ${best};` : ''} ${fallbackBody}; }`;
  // Build from the last arm outward: each arm's failure runs the next one.
  for (let index = parsed.arms.length - 1; index >= 0; index--) {
    const arm = parsed.arms[index];
    const armCaptures = new Map();
    const { declare, read } = readPattern(arm.pattern, '', armCaptures);
    const defaults = [...armCaptures.values()].filter(({ pattern }) => pattern.fallback)
      .map(({ local, pattern }) => `${local} = ${splice(pattern.fallback, `default for ${pattern.name}`)};`);
    // Defaults fill captures whose field was absent: track presence per capture.
    const present = new Map([...armCaptures.values()].map(({ local }) => [local, fresh('has')]));
    const marked = [...armCaptures.values()].reduce((text, { local }) => text.replace(`${local} = `, `${present.get(local)} = true; ${local} = `), read);
    const fill = [...armCaptures.values()].filter(({ pattern }) => pattern.fallback)
      .map(({ local, pattern }, i) => `if not ${present.get(local)} { ${defaults[i]} };`).join(' ');
    const bind = [...armCaptures.entries()].map(([name, { local, pattern }]) => `let ${name}: ${pattern.type} = ${local};`).join(' ');
    const body = splice(arm.body, 'arm body');
    code = `{ ${index > 0 ? `__json_restart(${r});` : ''}
      ${declare} ${[...present.values()].map(has => `let ${has} = false;`).join(' ')}
      ${marked}
      __json_end(${r});
      if ${r}.failed == 0 { ${fill} ${bind} ${body}; } else {
        if ${r}.matched > ${bestMatched} or (${r}.matched == ${bestMatched} and ${r}.failed > ${bestAt}) {
          ${bestMatched} = ${r}.matched; ${bestAt} = ${r}.failed; ${best} = __json_describe(${r});
        };
        ${code};
      };
    }`;
  }
  code = `{ let ${r} = __json_reader(${splice(parsed.text, 'text expression')}); let ${best} = ""; let ${bestAt} = 0; let ${bestMatched} = -1; ${code}; }`;
  return expressionFromSource(parser, code, site, splices, { createDocument });
}
