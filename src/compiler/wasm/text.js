// wasm/text.js — a Module (module.js) as wasm text, in folded form.
//
// Prints what encoding emits (the elements the exports reach), with names:
// functions, globals, and memories by their names, types by index, labels
// and locals as written.

import { addStartFunction, assignIndices, collectTypes, liveElements } from './encode.js';
import { expandType, none, unreachable } from './types.js';

export function printModule(module) {
  addStartFunction(module);
  const live = liveElements(module);
  const index = assignIndices(module, live);
  const groups = collectTypes(module, live);
  const typeIndex = new Map(groups.flatMap(group => group.types).map((type, i) => [type, i]));
  const p = new Printer(typeIndex);
  const lines = ['(module'];
  for (const group of groups) {
    const types = group.types.map(type => p.typeDefinition(type));
    lines.push(types.length > 1 ? ` (rec\n${types.map(text => `  ${text}`).join('\n')}\n )` : ` ${types[0]}`);
  }
  for (const fn of index.functions.filter(fn => fn.import)) {
    lines.push(` (import ${quote(fn.import.module)} ${quote(fn.import.base)} (func $${fn.name}${p.signature(fn)}))`);
  }
  for (const global of index.globals.filter(global => global.import)) {
    lines.push(` (import ${quote(global.import.module)} ${quote(global.import.base)} (global $${global.name} ${p.globalType(global)}))`);
  }
  for (const tag of index.tags) {
    lines.push(` (import ${quote(tag.import.module)} ${quote(tag.import.base)} (tag $${tag.name}${p.params(tag.params)}))`);
  }
  for (const memory of index.memories) {
    const limits = `${memory.initial}${memory.maximum != null ? ` ${memory.maximum}` : ''}`;
    const exported = memory.exported ? ` (export ${quote(memory.name)})` : '';
    lines.push(memory.import
      ? ` (memory $${memory.name}${exported} (import ${quote(memory.import.module)} ${quote(memory.import.base)}) ${limits})`
      : ` (memory $${memory.name}${exported} ${limits})`);
  }
  for (const segment of module.dataSegments) {
    const bytes = [...segment.bytes].map(byte => `\\${byte.toString(16).padStart(2, '0')}`).join('');
    lines.push(segment.memory == null ? ` (data "${bytes}")` : ` (data (memory $${segment.memory}) (i32.const ${segment.offset}) "${bytes}")`);
  }
  for (const global of index.globals.filter(global => !global.import)) {
    lines.push(` (global $${global.name} ${p.globalType(global)} ${p.expression(global.init, '').trimStart()})`);
  }
  for (const entry of module.exports) lines.push(` (export ${quote(entry.name)} (func $${entry.internal}))`);
  if (module.start) lines.push(` (start $${module.start})`);
  if (live.referenced.size) lines.push(` (elem declare func ${[...live.referenced].map(fn => `$${fn.name}`).join(' ')})`);
  for (const fn of index.functions.filter(fn => !fn.import)) lines.push(p.function(fn));
  lines.push(')');
  return `${lines.join('\n')}\n`;
}

function quote(text) {
  return JSON.stringify(text);
}

// Binaryen's operator names → the names in the wasm text format.
function instructionName(name) {
  return name
    .replace(/^(i32|i64)\.trunc_([su])_sat\.(f32|f64)$/, '$1.trunc_sat_$3_$2')
    .replace(/^(i32|i64)\.trunc_([su])\.(f32|f64)$/, '$1.trunc_$3_$2')
    .replace(/^(f32|f64)\.convert_([su])\.(i32|i64)$/, '$1.convert_$3_$2')
    .replace(/^i32\.wrap$/, 'i32.wrap_i64')
    .replace(/^i64\.extend_([su])$/, 'i64.extend_i32_$1')
    .replace(/^f32\.demote$/, 'f32.demote_f64')
    .replace(/^f64\.promote$/, 'f64.promote_f32')
    .replace(/^i32\.reinterpret$/, 'i32.reinterpret_f32')
    .replace(/^i64\.reinterpret$/, 'i64.reinterpret_f64')
    .replace(/^f32\.reinterpret$/, 'f32.reinterpret_i32')
    .replace(/^f64\.reinterpret$/, 'f64.reinterpret_i64');
}

class Printer {
  constructor(typeIndex) {
    this.typeIndex = typeIndex;
  }

  heapType(heapType) {
    return heapType.abstract ? heapType.name : `$${this.typeIndex.get(heapType)}`;
  }

  type(type) {
    if (type.kind === 'ref') {
      if (type.heap.abstract && type.nullable) return `${type.heap.name}ref`;
      return `(ref ${type.nullable ? 'null ' : ''}${this.heapType(type.heap)})`;
    }
    if (type.kind === 'tuple') return type.types.map(part => this.type(part)).join(' ');
    return type.name;
  }

  field(field) {
    return field.mutable ? `(mut ${this.type(field.type)})` : this.type(field.type);
  }

  typeDefinition(type) {
    let body;
    if (type.kind === 'func') body = `(func${this.params(type.params)}${this.results(type.results)})`;
    else if (type.kind === 'struct') body = `(struct${type.fields.map(field => ` (field ${this.field(field)})`).join('')})`;
    else body = `(array ${this.field(type.element)})`;
    if (type.supertype || !type.final) {
      body = `(sub ${type.final ? 'final ' : ''}${type.supertype ? `${this.heapType(type.supertype)} ` : ''}${body})`;
    }
    return `(type $${this.typeIndex.get(type)} ${body})`;
  }

  params(type) {
    const parts = expandType(type);
    return parts.length ? ` (param ${parts.map(part => this.type(part)).join(' ')})` : '';
  }

  results(type) {
    const parts = type === unreachable ? [] : expandType(type);
    return parts.length ? ` (result ${parts.map(part => this.type(part)).join(' ')})` : '';
  }

  signature(fn) {
    return `${this.params(fn.params)}${this.results(fn.results)}`;
  }

  globalType(global) {
    return global.mutable ? `(mut ${this.type(global.type)})` : this.type(global.type);
  }

  function(fn) {
    const params = expandType(fn.params).map((type, i) => ` (param $${i} ${this.type(type)})`).join('');
    const first = expandType(fn.params).length;
    const locals = fn.vars.map((type, i) => `\n  (local $${first + i} ${this.type(type)})`).join('');
    const body = fn.body.op === 'block' && !fn.body.name
      ? fn.body.kids.map(kid => this.expression(kid, '  ')).join('\n')
      : this.expression(fn.body, '  ');
    return ` (func $${fn.name} (type $${this.typeIndex.get(fn.type)})${params}${this.results(fn.results)}${locals}\n${body}\n )`;
  }

  /** One expression, folded, each line indented by `indent`. */
  expression(e, indent) {
    const head = this.head(e);
    const kids = this.children(e);
    if (!kids.length) return `${indent}(${head})`;
    return `${indent}(${head}\n${kids.map(kid => (typeof kid === 'string' ? `${indent} ${kid}` : this.expression(kid, `${indent} `))).join('\n')}\n${indent})`;
  }

  children(e) {
    switch (e.op) {
      case 'if': {
        const [condition, ifTrue, ifFalse] = e.kids;
        return [condition, wrapped('then', ifTrue), ...(ifFalse ? [wrapped('else', ifFalse)] : [])];
      }
      case 'try': return [wrapped('do', e.kids[0]), ...e.tags.map((tag, i) => wrapped(`catch $${tag}`, e.kids[i + 1]))];
      case 'arm': return e.kids;
      default: return e.kids;
    }
  }

  head(e) {
    const result = e.type === none || e.type === unreachable ? '' : this.results(e.type);
    switch (e.op) {
      case 'block': return `block${e.name ? ` $${e.name}` : ''}${result}`;
      case 'loop': return `loop $${e.name}${result}`;
      case 'if': return `if${result}`;
      case 'try': return `try${result}`;
      case 'arm': return e.label;
      case 'br': return `${e.conditional ? 'br_if' : 'br'} $${e.name}`;
      case 'br_table': return `br_table ${[...e.names, e.defaultName].map(name => `$${name}`).join(' ')}`;
      case 'call': return `call $${e.target}`;
      case 'call_ref': return `call_ref ${this.heapType(e.kids[e.kids.length - 1].type.heap ?? e.kids[0].type)}`;
      case 'local.get': case 'local.set': case 'local.tee': return `${e.op} $${e.index}`;
      case 'global.get': case 'global.set': return `${e.op} $${e.target}`;
      case 'const': return `${e.type.name}.const ${constant(e)}`;
      case 'numeric': return instructionName(e.name);
      case 'load': case 'store':
        return `${e.name}${e.memory ? ` $${e.memory}` : ''}${e.offset ? ` offset=${e.offset}` : ''} align=${e.align}`;
      case 'memory.size': case 'memory.grow': return `${e.op}${e.memory ? ` $${e.memory}` : ''}`;
      case 'ref.null': return `ref.null ${this.heapType(e.type.heap)}`;
      case 'ref.func': return `ref.func $${e.target}`;
      case 'ref.test': case 'ref.cast': return `${e.op} ${this.type(e.castType)}`;
      case 'i31.get': return `i31.get_${e.signed ? 's' : 'u'}`;
      case 'struct.new': return `struct.new ${this.heapType(e.heapType)}`;
      case 'struct.get': case 'struct.set':
        return `${e.op}${e.op === 'struct.get' && e.kids[0].type.heap?.fields?.[e.index]?.type.kind === 'packed' ? (e.signed ? '_s' : '_u') : ''} ${this.heapType(e.kids[0].type.heap ?? e.kids[0].type)} ${e.index}`;
      case 'array.new': case 'array.new_default': return `${e.op} ${this.heapType(e.heapType)}`;
      case 'array.new_fixed': return `array.new_fixed ${this.heapType(e.heapType)} ${e.kids.length}`;
      case 'array.get': case 'array.set': return `${e.op} ${this.heapType(e.kids[0].type.heap ?? e.kids[0].type)}`;
      case 'array.init_data': return `array.init_data ${this.heapType(e.heapType)} ${e.segment}`;
      case 'array.copy': return `array.copy ${this.heapType(e.kids[0].type.heap ?? e.kids[0].type)} ${this.heapType(e.kids[2].type.heap ?? e.kids[2].type)}`;
      case 'tuple.make': return `tuple.make ${e.kids.length}`;
      case 'tuple.extract': return `tuple.extract ${expandType(e.kids[0].type).length} ${e.index}`;
      case 'pop': return `pop ${this.type(e.type)}`;
      default: return e.op;
    }
  }
}

/** An arm of an if or try, printed as `(then …)`. */
function wrapped(label, body) {
  return { op: 'arm', label, kids: body.op === 'block' && !body.name ? body.kids : [body], type: none };
}

function constant(e) {
  if (e.type.name === 'v128') return `i8x16 ${[...e.value].join(' ')}`;
  if (e.type.name === 'f32' || e.type.name === 'f64') {
    if (Number.isNaN(e.value)) return 'nan';
    if (!Number.isFinite(e.value)) return e.value > 0 ? 'inf' : '-inf';
    return Object.is(e.value, -0) ? '-0' : String(e.value);
  }
  return String(e.value);
}
