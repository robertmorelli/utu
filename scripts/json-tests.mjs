// Typed JSON (`@json/\ decode|encode|error T … \/`) against JavaScript's JSON.
import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';

/** Error-level diagnostics, each with the source text it points at. */
async function errorsOf(compiler, ROOT, source) {
  return withTempUtu(ROOT, 'json_errors_check.utu', source, async (file) => {
    let diagnostics;
    try {
      diagnostics = (await compiler.analyzeFile(file)).artifacts.diagnostics;
    } catch (error) {
      diagnostics = error.artifacts?.diagnostics ?? [error.diagnostic];
    }
    return diagnostics.filter(d => d.severity !== 'warning')
      .map(d => ({ ...d, text: d.primary?.start == null ? null : source.slice(d.primary.start, d.primary.end) }));
  });
}

const SOURCE = `
enum Shape:
    | Circle { r: F64 }
    | Rect { w: I32, h: I32 }
    | Dot

enum Color:
    | Red
    | Green
    | Blue

struct Node:
    | id: I64
    | label: Str
    | children: Array[Node]
    | parent: ?Node
    | shape: Shape
    | color: Color
    | small: F32
    | big: U32
    | flags: Array[Bool]

struct Doc:
    | nodes: Array[Node]
    | title: ?Str

export lib {
    fn roundtrip(text: Str) Str {
        promote @json/\\ decode Doc text \\/ {
            |doc| => @json/\\ encode Doc doc \\/,
            ~> "invalid: " + @json/\\ error Doc text \\/,
        };
    }
    fn valid(text: Str) Bool {
        promote @json/\\ decode Doc text \\/ {
            |doc| => true,
            ~> false,
        };
    }
    fn total_ids(text: Str) I64 {
        promote @json/\\ decode Array[Node] text \\/ {
            |nodes| => {
                let zero: I64 = 0;
                nodes fold(zero) |a, n| { a + n.id; };
            },
            ~> -1,
        };
    }
}
`;

function random(seed) {
  let s = seed;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

const STRINGS = ['', 'plain', 'quote " and \\ backslash', 'line\nbreak\ttab\r', 'ctrl \u0001\u001f', 'unicode é 😀 ✓', '</script>', 'slash /'];
const F64S = [0, -0, 1, -1, 0.5, 0.1, 1e21, 1e-7, 123456789012345, 9007199254740991, -2.5e-300, 3.141592653589793];
const F32S = [0, 1, -2, 0.5, 0.25, -1024, 16777215];

function makeNode(rand, depth) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const kinds = [{ kind: 'Circle', r: pick(F64S) }, { kind: 'Rect', w: Math.floor(rand() * 2 ** 32) - 2 ** 31, h: -7 }, { kind: 'Dot' }];
  return {
    id: Math.floor(rand() * 2 ** 53) * (rand() < 0.5 ? -1 : 1),
    label: pick(STRINGS),
    children: depth > 0 ? Array.from({ length: Math.floor(rand() * 3) }, () => makeNode(rand, depth - 1)) : [],
    parent: depth > 0 && rand() < 0.3 ? makeNode(rand, depth - 1) : null,
    shape: pick(kinds),
    color: pick(['Red', 'Green', 'Blue']),
    small: pick(F32S),
    big: pick([0, 1, 4294967295, 2147483648]),
    flags: Array.from({ length: Math.floor(rand() * 4) }, () => rand() < 0.5),
  };
}

/** JSON with random whitespace between tokens. */
function spaced(value, rand) {
  const gap = () => [' ', '\n', '\t', '\r\n  ', ''][Math.floor(rand() * 5)];
  if (Array.isArray(value)) return `[${gap()}${value.map(v => spaced(v, rand)).join(`${gap()},${gap()}`)}${gap()}]`;
  if (value && typeof value === 'object') {
    return `{${gap()}${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}${gap()}:${gap()}${spaced(v, rand)}`).join(`,${gap()}`)}${gap()}}`;
  }
  return JSON.stringify(value);
}

export function registerJsonTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('json: decode then encode matches JSON.stringify for random documents', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'json_roundtrip.utu', source: SOURCE });
    const { roundtrip } = instance.exports;
    const valid = text => instance.exports.valid(text) === 1;
    const rand = random(17);
    for (let i = 0; i < 300; i++) {
      const doc = { nodes: Array.from({ length: Math.floor(rand() * 4) }, () => makeNode(rand, 2)), title: rand() < 0.5 ? null : STRINGS[i % STRINGS.length] };
      const text = spaced(doc, rand);
      assertEq(roundtrip(text), JSON.stringify(doc), `document ${i}`);
      // Every strict prefix of an object is malformed.
      const cut = Math.floor(rand() * (text.length - 1));
      assertEq(valid(text.slice(0, cut)), false, `prefix ${cut} of document ${i}: …${JSON.stringify(text.slice(Math.max(0, cut - 80), cut))}`);
      // Corruptions JavaScript rejects are rejected too.
      const at = Math.floor(rand() * text.length);
      const corrupt = text.slice(0, at) + '{]:,"\\x'[Math.floor(rand() * 7)] + text.slice(at + 1);
      let parses = true;
      try { JSON.parse(corrupt); } catch { parses = false; }
      if (!parses) assertEq(valid(corrupt), false, `corruption at ${at} of document ${i}: ${corrupt.slice(Math.max(0, at - 20), at + 20)}`);
    }
  });

  test('json: unknown fields are skipped, optional fields may be missing, field order is free', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'json_shape.utu', source: SOURCE });
    const node = '{"flags":[],"big":3,"small":1.5,"color":"Blue","shape":{"kind":"Dot","ignored":[1,{"a":"}"}]},"children":[],"label":"x","id":5,"extra":{"deep":[[[null]]]}}';
    assertEq(instance.exports.roundtrip(`{"nodes":[${node}],"unknown":"\\"}"}`),
      '{"nodes":[{"id":5,"label":"x","children":[],"parent":null,"shape":{"kind":"Dot"},"color":"Blue","small":1.5,"big":3,"flags":[]}],"title":null}');
    assertEq(instance.exports.total_ids(`[${node}, ${node.replace('"id":5', '"id":-9007199254740993')}]`), -9007199254740988n,
      'I64 integers are exact beyond 2^53');
  });

  test('json: errors name the problem and its line and column', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'json_errors.utu', source: SOURCE });
    const { roundtrip } = instance.exports;
    const node = '{"id":1,"label":"a","children":[],"shape":{"kind":"Dot"},"color":"Red","small":0,"big":0,"flags":[]}';
    const cases = [
      ['{"nodes": [], "title": 3}', 'expected a string at line 1, column 24'],
      ['{"nodes": []}\n  x', 'unexpected text after the value at line 2, column 3'],
      [`{"nodes": [${node.replace('"Red"', '"Purple"')}]}`, 'unknown Color variant'],
      [`{"nodes": [${node.replace('"id":1', '"id":1.5')}]}`, 'expected an integer'],
      [`{"nodes": [${node.replace('"big":0', '"big":-1')}]}`, 'integer out of range'],
      [`{"nodes": [${node.replace('"big":0', '"big":4294967296')}]}`, 'integer out of range'],
      [`{"nodes": [${node.replace('"id":1', '"id":9223372036854775808')}]}`, 'integer out of range'],
      [`{"nodes": [${node.replace('{"kind":"Dot"}', '{"r":1,"kind":"Circle"}')}]}`, 'expected "kind" as the first field'],
      [`{"nodes": [${node.replace('"label":"a",', '')}]}`, 'missing field "label"'],
      ['{"nodes": [], "title": "bad \\q escape"}', 'invalid escape'],
      ['{"nodes": [], "title": "\\u12G4"}', 'invalid \\u escape'],
      ['{"nodes": [01]}', 'expected an object'],
      ['{"nodes": [] "title": null}', "expected ',' or '}'"],
      [`{"nodes": [${'['.repeat(600)}`, 'expected an object'],
      [`{"nodes": [], "deep": ${'['.repeat(600)}${']'.repeat(600)}}`, 'nested too deeply'],
    ];
    for (const [text, expected] of cases) {
      const result = roundtrip(text);
      assert(result.startsWith('invalid: ') && result.includes(expected), `${text.slice(0, 60)} → ${result} (expected ${expected})`);
    }
  });

  test('json: match patterns pick the first matching arm, skip unlisted fields, and explain failures', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'json_match.utu', source: `
      struct Item:
          | id: I32
          | price: F64

      export lib {
          fn describe(text: Str) Str {
              @json/\\ match text {
                  { status: "ok", user: { name: |name| Str, age: |age| I32 = 18 }, plan: { tier: |tier| ?Str } } => name + " " + age.to_str() + " " + (tier orelse "free"),
                  { status: "error", message: |message| Str } => "error: " + message,
                  { items: |items| Array[Item] } => "items " + items.len().to_str() + " " + items[1].price.to_str(),
                  { "content-type": |kind| Str, retry: true, limit: 2.5, cursor: null } => "literal " + kind,
                  ~> |error| "no match: " + error,
              }\\/;
          }
          fn first_wins(text: Str) I32 {
              @json/\\ match text {
                  { a: |a| I32 } => 1,
                  { a: |a| I32, b: |b| I32 } => 2,
                  ~> 0,
              }\\/;
          }
      }
    `});
    const { describe, first_wins } = instance.exports;
    const cases = [
      [{ status: 'ok', extra: [1, { a: '}' }], user: { age: 41, name: 'Ada', more: true }, plan: { tier: 'pro' } }, 'Ada 41 pro'],
      [{ status: 'ok', user: { name: 'Bo' } }, 'Bo 18 free'],
      [{ status: 'ok', user: { name: 'Bo' }, plan: { tier: null } }, 'Bo 18 free'],
      [{ status: 'error', message: 'nope' }, 'error: nope'],
      [{ items: [{ id: 1, price: 2 }, { id: 2, price: 3.5 }] }, 'items 2 3.5'],
      [{ 'content-type': 'json', retry: true, limit: 2.5, cursor: null }, 'literal json'],
      [{ status: 'ok', user: { name: 'Cy', age: 'old' } }, 'no match: user.age: expected an integer at line 1, column 42'],
      [{ status: 'ok', user: { age: 3 } }, 'no match: user: missing field "name"'],
      [{ status: 'ok', user: { name: 'Bo' }, plan: 3 }, 'no match: plan: expected an object'],
      [{ 'content-type': 'json', retry: false, limit: 2.5, cursor: null }, 'no match: retry: expected true'],
      [[1, 2], 'no match: expected an object at line 1, column 1'],
    ];
    for (const [value, expected] of cases) {
      const result = describe(JSON.stringify(value));
      assert(result.startsWith(expected), `${JSON.stringify(value)} → ${result} (expected ${expected})`);
    }
    assertEq(describe('{"status": "ok", "user": {"name": "Al"}} trailing'), 'no match: unexpected text after the value at line 1, column 42');
    assertEq(first_wins('{"a": 1, "b": 2}'), 1, 'arms are tried in order');
    assertEq(first_wins('{"b": 2}'), 0);
  });

  test('json: malformed match sites are compile errors', async ({ compiler, ROOT }) => {
    const site = body => `export main() I32 { @json/\\ match "{}" { ${body} }\\/; }`;
    const cases = [
      [site('{ a: |a| I32 } => a,'), 'needs a ~> arm'],
      [site('~> 0,'), 'at least one pattern arm'],
      [site('~> 0, { a: |a| I32 } => a,'), '~> arm must be last'],
      [site('{ a: |x| I32, b: |x| I32 } => x, ~> 0,'), 'x is captured twice'],
      [site('{ a: |a| I32, a: |b| I32 } => a, ~> 0,'), 'Field a appears twice'],
      [site('{ a: |a| Missing } => 1, ~> 0,'), '@json cannot use Missing'],
      [site('{ a: ? } => 1, ~> 0,'), 'Expected {…}, |name| Type, or a literal'],
    ];
    for (const [source, expected] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      assert(errors.some(e => e.message.includes(expected)), `${expected}: got ${errors.map(e => e.message).join('; ') || 'no errors'}`);
    }
  });

  test('json: codecs inside a module stay in that module', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'json_module.utu', source: `
      mod store {
          struct Row:
              | id: I32
              | tags: ?Array[Str]
          struct Table:
              | rows: Array[Row]
          fn count(text: Str) I32 {
              promote @json/\\ decode Table text \\/ {
                  |t| => t.rows.len(),
                  ~> -1,
              };
          }
      }
      struct Row:
          | name: Str
      export lib {
          fn rows(text: Str) I32 { store.count(text); }
          fn name(text: Str) Str { promote @json/\\ decode Row text \\/ { |r| => r.name, ~> "?", }; }
      }
    `});
    assertEq(instance.exports.rows('{"rows": [{"id": 1, "tags": null}, {"id": 2, "tags": ["a"]}]}'), 2);
    assertEq(instance.exports.name('{"name": "top"}'), 'top', 'a top-level type with the same name has its own codec');
  });

  test('json: unsupported types and malformed sites are compile errors at the type', async ({ compiler, ROOT }) => {
    const cases = [
      ['struct A:\n    | x: ?I32\nexport main() void { let a = @json/\\ decode A "{}" \\/; }', '?I32 is not supported', 'A'],
      ['struct A:\n    | a: A\nexport main() void { let a = @json/\\ decode A "{}" \\/; }', 'A contains itself', 'A'],
      ['export main() void { let a = @json/\\ decode I32 "1" \\/; }', 'works on a struct, enum, or Array', 'I32'],
      ['export main() void { let a = @json/\\ decode Array[Missing] "1" \\/; }', '@json cannot use Missing', 'Array[Missing]'],
      ['export main() void { let a = @json/\\ parse Missing "1" \\/; }', '@json expects', 'p'],
      ['enum E:\n    | V { kind: I32 }\nexport main() void { let a = @json/\\ decode Array[E] "[]" \\/; }', 'field named kind', 'Array[E]'],
      ['struct A:\n    | x: I32\nexport main() void { let a = @json/\\ decode A \\/; }', 'needs a text expression', 'A'],
    ];
    for (const [source, expected, text] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      const error = errors.find(e => e.message.includes(expected));
      assert(error, `${expected}: got ${errors.map(e => e.message).join('; ') || 'no errors'}`);
      assertEq(error.text, text, `${expected} points at the type`);
    }
  });
}
