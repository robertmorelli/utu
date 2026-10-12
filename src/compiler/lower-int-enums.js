// Integer enums: `enum(U8) Tag: | Leaf | Unary | Eof = 255` declares a type
// whose values are small integers, so they fit in a `mem` and dispatch with
// `match` and `loop match` instead of `alt`.
//
// Each one becomes a scalar module before elaboration:
//
//   mod Tag {
//       type & = i32 scalar          a distinct type: Tag is not I32
//       == != < <= > >=              compare the values
//       t.to_i32()  Tag.from_i32(i)  convert (from_i32 does not check)
//       Tag.count()                  number of variants
//       Tag.name(t)                  the variant's name, for messages
//   }
//
// `Tag.Leaf` becomes `Tag.from_i32(0)`. A match or loop match whose patterns
// name variants matches on `scrutinee.to_i32()` with integer patterns, and the
// values its `continue`s carry are converted the same way, so state machines
// keep their constant-target branches. Values count up from 0, or from the
// previous explicit `= n`.
import { declarationsFromSource, expressionFromSource } from './source-expansion.js';
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';

export const INT_ENUM_REPRS = Object.freeze({
  U8: [0, 255], I8: [-128, 127], U16: [0, 65535], I16: [-32768, 32767],
  I32: [-(2 ** 31), 2 ** 31 - 1], U32: [0, 2 ** 32 - 1],
});

export function lowerIntEnums(doc, parser, createDocument) {
  const root = doc.body.firstChild;
  if (!root) return;
  const nested = root.querySelector('ir-module ir-enum[repr]');
  if (nested) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'integer enums are declared at the top level', nested);
  const decls = [...root.querySelectorAll(':scope > ir-enum[repr]')];
  if (!decls.length) return;

  const enums = new Map();
  for (const decl of decls) {
    const info = describe(decl);
    enums.set(info.name, info);
  }
  const replace = (node, code, splices = new Map()) => {
    const replacement = expressionFromSource(parser, code, node, splices, { createDocument });
    node.replaceWith(replacement);
    return replacement;
  };

  // Matches first, so their continues still see `Tag.X` and become literals.
  for (const match of [...root.querySelectorAll('ir-match, ir-loop-match')].reverse()) {
    const arms = [...match.querySelectorAll(':scope > ir-match-arm')];
    const named = arms.filter(arm => /^[A-Z][A-Za-z0-9_]*\.[A-Z][A-Za-z0-9_]*$/.test(arm.getAttribute('pattern') ?? ''));
    if (!named.length) continue;
    const enumName = named[0].getAttribute('pattern').split('.')[0];
    const info = enums.get(enumName);
    if (!info) throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_TYPE, `${enumName} is not an integer enum; patterns like ${named[0].getAttribute('pattern')} name integer enum variants`, named[0]);
    const covered = new Set();
    for (const arm of arms) {
      const pattern = arm.getAttribute('pattern') ?? '';
      const [owner, variant] = pattern.split('.');
      if (!variant || owner !== enumName) {
        throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Pattern ${pattern} is not a ${enumName} variant; every pattern of this match must be`, arm);
      }
      if (!info.values.has(variant)) {
        throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_TYPE, `${enumName} has no variant ${variant}`, arm);
      }
      covered.add(variant);
      arm.setAttribute('pattern', String(info.values.get(variant)));
    }
    if (!match.querySelector(':scope > ir-default-arm')) {
      const missing = [...info.values.keys()].filter(name => !covered.has(name));
      if (missing.length) {
        throw compilerError(DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH, `Missing variant '${missing[0]}' in match over ${enumName}`, match);
      }
      // Every variant is named; another value can only come from from_i32.
      const fallback = expressionFromSource(parser, 'fatal', match, new Map(), { createDocument });
      const arm = match.ownerDocument.createElement('ir-default-arm');
      arm.appendChild(fallback);
      match.appendChild(arm);
    }
    if (match.localName === 'ir-loop-match') {
      for (const jump of match.querySelectorAll('ir-continue')) {
        const value = jump.firstElementChild;
        if (!value || jump.parentElement?.closest('ir-loop-match') !== match) continue;
        const variant = variantOf(value, enumName, info);
        replace(value, variant != null ? String(info.values.get(variant)) : '__enum_value.to_i32()', new Map([['__enum_value', value]]));
      }
    }
    const scrutinee = match.firstElementChild;
    replace(scrutinee, '__enum_value.to_i32()', new Map([['__enum_value', scrutinee]]));
  }

  // `Tag.Leaf` anywhere else is that variant's value.
  for (const member of [...root.querySelectorAll('ir-type-member')]) {
    const owner = member.querySelector(':scope > ir-type-ref')?.getAttribute('name');
    const info = enums.get(owner);
    const variant = member.getAttribute('method');
    if (!info || !info.values.has(variant)) continue;
    if (member.parentElement?.localName === 'ir-call' && member.parentElement.firstElementChild === member) continue;
    replace(member, `${owner}.from_i32(${info.values.get(variant)})`);
  }

  for (const info of enums.values()) {
    const [module] = declarationsFromSource(parser, scalarModule(info), info.decl, { createDocument });
    info.decl.replaceWith(module);
  }
  root.dataset.intEnums = JSON.stringify(Object.fromEntries([...enums.values()].map(info => [info.name, info.repr])));
}

function describe(decl) {
  const name = decl.getAttribute('name');
  const repr = decl.getAttribute('repr');
  const range = INT_ENUM_REPRS[repr];
  if (!range) {
    throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_TYPE,
      `enum(${repr}) ${name}: an integer enum is stored as one of ${Object.keys(INT_ENUM_REPRS).join(', ')}`, decl);
  }
  if (decl.querySelector('ir-nom-qualifier, ir-impl-list')) {
    throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, `enum(${repr}) ${name} cannot be tag, rec, or implement protocols`, decl);
  }
  const values = new Map();
  const taken = new Map();
  let next = 0;
  for (const variant of decl.querySelectorAll(':scope > ir-variant')) {
    const variantName = variant.getAttribute('name');
    if (variant.querySelector('ir-field')) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, `${name}.${variantName}: integer enum variants have no fields`, variant);
    }
    const value = variant.hasAttribute('value') ? Number(variant.getAttribute('value')) : next;
    if (!Number.isSafeInteger(value) || value < range[0] || value > range[1]) {
      throw compilerError(DIAGNOSTIC_KINDS.TYPE_MISMATCH, `${name}.${variantName} = ${value} does not fit in ${repr}`, variant);
    }
    if (values.has(variantName)) throw compilerError(DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION, `${name}.${variantName} is declared twice`, variant);
    if (taken.has(value)) {
      throw compilerError(DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION, `${name}.${variantName} and ${name}.${taken.get(value)} are both ${value}`, variant);
    }
    values.set(variantName, value);
    taken.set(value, variantName);
    next = value + 1;
  }
  if (!values.size) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, `enum(${repr}) ${name} has no variants`, decl);
  // U32 above 2^31 is stored as the same i32 bits.
  for (const [variant, value] of values) values.set(variant, value > 2 ** 31 - 1 ? value - 2 ** 32 : value);
  return { name, repr, values, decl };
}

function variantOf(node, enumName, info) {
  if (node.localName !== 'ir-type-member') return null;
  const owner = node.querySelector(':scope > ir-type-ref')?.getAttribute('name');
  const variant = node.getAttribute('method');
  return owner === enumName && info.values.has(variant) ? variant : null;
}

function scalarModule({ name, repr, values }) {
  const op = (tag, ...args) => `@ir/\\ <ir-i32-${tag}>${args.join('')}</ir-i32-${tag}> \\/;`;
  const ident = id => `<ir-ident name="${id}"/>`;
  const same = id => op('or', ident(id), '<ir-lit kind="int" value="0"/>');
  const unsigned = repr === 'U32' ? '_u' : '_s';
  const compare = (fn, wasm) => `    fn &:${fn} |a, b| Bool { ${op(wasm, ident('a'), ident('b'))} }`;
  const names = [...values].map(([variant, value]) => `${value} => "${variant}",`).join(' ');
  return `mod ${name} {
    type & = @ir/\\ <ir-wasm-scalar type-repr="wasm-i32"/> \\/
${compare('eq', 'eq')}
${compare('ne', 'ne')}
${compare('lt', `lt${unsigned}`)}
${compare('le', `le${unsigned}`)}
${compare('gt', `gt${unsigned}`)}
${compare('ge', `ge${unsigned}`)}
    fn &.to_i32 |self| () I32 { ${same('self')} }
    fn from_i32(i: I32) & { ${same('i')} }
    fn count() I32 { ${values.size}; }
    fn name(t: &) Str { match t.to_i32() { ${names} ~> "?", }; }
}`;
}

// Distinct types: `type NodeId = distinct I32;` is a scalar module with the
// base's representation and comparisons, and explicit conversions:
// `NodeId.from_i32(i)` and `id.to_i32()`. A mem can hold one.
const DISTINCT_BASES = {
  I32: { wasm: 'i32', repr: 'wasm-i32', sign: '_s' }, U32: { wasm: 'i32', repr: 'wasm-i32', sign: '_u' },
  I64: { wasm: 'i64', repr: 'wasm-i64', sign: '_s' }, U64: { wasm: 'i64', repr: 'wasm-i64', sign: '_u' },
  F32: { wasm: 'f32', repr: 'wasm-f32', sign: '' }, F64: { wasm: 'f64', repr: 'wasm-f64', sign: '' },
};

export function lowerDistinctTypes(doc, parser, createDocument) {
  const root = doc.body.firstChild;
  if (!root) return;
  const decls = [...root.querySelectorAll(':scope > ir-distinct')];
  if (!decls.length) return;
  const distinct = {};
  for (const decl of decls) {
    const name = decl.getAttribute('name');
    const base = decl.getAttribute('base');
    const info = DISTINCT_BASES[base];
    if (!info) {
      throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_TYPE,
        `type ${name} = distinct ${base}: a distinct type wraps one of ${Object.keys(DISTINCT_BASES).join(', ')}`, decl);
    }
    if (Object.hasOwn(distinct, name)) throw compilerError(DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION, `type ${name} is declared twice`, decl);
    distinct[name] = base;
    const [module] = declarationsFromSource(parser, distinctModule(name, base, info), decl, { createDocument });
    decl.replaceWith(module);
  }
  root.dataset.distinctTypes = JSON.stringify(distinct);
}

function distinctModule(name, base, { wasm, repr, sign }) {
  const op = (tag, ...args) => `@ir/\\ <ir-${wasm}-${tag}>${args.join('')}</ir-${wasm}-${tag}> \\/;`;
  const ident = id => `<ir-ident name="${id}"/>`;
  // An exact identity (x * 1 keeps -0) that still gives the value its new type.
  const same = id => (wasm.startsWith('f') ? op('mul', ident(id), `<ir-lit kind="float" type-name="${base}" value="1.0"/>`)
    : op('or', ident(id), `<ir-lit kind="int" type-name="${base}" value="0"/>`));
  const compare = (fn, tag) => `    fn &:${fn} |a, b| Bool { ${op(tag, ident('a'), ident('b'))} }`;
  const order = tag => (sign ? `${tag}${sign}` : tag);
  const lower = base.toLowerCase();
  return `mod ${name} {
    type & = @ir/\\ <ir-wasm-scalar type-repr="${repr}"/> \\/
${compare('eq', 'eq')}
${compare('ne', 'ne')}
${compare('lt', order('lt'))}
${compare('le', order('le'))}
${compare('gt', order('gt'))}
${compare('ge', order('ge'))}
    fn &.to_${lower} |self| () ${base} { ${same('self')} }
    fn from_${lower}(value: ${base}) & { ${same('value')} }
}`;
}
