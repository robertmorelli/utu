// Typed local storage: `@stored/\ Type "key" [manual] [validate fn] default \/`.
//
// Schemas and native/JS conversions are generated at build time. Incoming JSON
// is validated in the host before conversion, so malformed data can never
// partially mutate state; a valid value is copied field by field into the
// existing struct, which keeps references held by views current.
import { expressionFromSource } from './source-expansion.js';
import { childrenOf, sourceTypeStr } from './ir-helpers.js';
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';

const SCALAR_TYPES = new Set(['Str', 'Bool', 'I32', 'F64']);
const MAX_STORED_ARRAY = 100000;

class StoredError extends Error {
  /** @param {number|null} offset body-relative offset of the problem */
  constructor(message, offset = null, length = 1) {
    super(message);
    this.offset = offset;
    this.length = length;
  }
}

export function expandStored(doc, parser, createDocument) {
  let serial = 0;
  const structs = new Map([...doc.querySelectorAll('ir-struct')].map(node => [node.getAttribute('name'), node]));
  for (const site of [...doc.querySelectorAll('ir-dsl[name="stored"]')]) {
    // A recovered literal without a body is already a syntax error.
    if (site.getAttribute('body') == null) continue;
    try {
      const prefix = `__stored${serial++}_`;
      site.replaceWith(expandSite(site, { prefix, structs, parser, createDocument }));
    } catch (error) {
      throw siteDiagnostic(site, error);
    }
  }
}

function siteDiagnostic(site, error) {
  if (error.offset == null) return compilerError(DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, error.message, site);
  const start = Number(site.attr('data-body-inner-start')) + error.offset;
  const lines = (site.ownerDocument.__utuSourceText ?? '').slice(0, start).split('\n');
  const point = site.cloneNode(false);
  point.setAttribute('data-start', start);
  point.setAttribute('data-end', start + error.length);
  point.setAttribute('data-row', lines.length);
  point.setAttribute('data-col', lines.at(-1).length + 1);
  point.setAttribute('data-end-row', point.attr('data-row'));
  point.setAttribute('data-end-col', Number(point.attr('data-col')) + error.length);
  return compilerError(DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, error.message, point);
}

/** Split the literal into its type, key, modifiers, and default, with offsets. */
function parseHeader(raw) {
  const match = /^(\s*)([A-Z]\w*)(\s+)("[^"\n]+")(\s+)([\s\S]+)$/.exec(raw);
  if (!match) throw new StoredError('@stored expects Type "storage-key" default-expression', raw.search(/\S|$/));
  const [, lead, type, gap1, key, gap2] = match;
  let offset = lead.length + type.length + gap1.length + key.length + gap2.length;
  const header = { type, typeOffset: lead.length, key, manual: false, validator: null, validatorOffset: null };
  for (;;) {
    const modifier = /^(manual|validate\s+([a-z_]\w*))\s+/.exec(raw.slice(offset));
    if (!modifier) break;
    if (modifier[1] === 'manual') {
      header.manual = true;
    } else {
      header.validator = modifier[2];
      header.validatorOffset = offset + modifier[0].indexOf(modifier[2], 'validate'.length);
    }
    offset += modifier[0].length;
  }
  header.defaultSource = raw.slice(offset);
  header.defaultOffset = offset;
  return header;
}

function expandSite(site, { prefix, structs, parser, createDocument }) {
  const raw = site.getAttribute('body').slice(2, -2);
  const header = parseHeader(raw);
  const innerStart = Number(site.attr('data-body-inner-start'));

  function shape(type, visiting = []) {
    if (!type) throw new StoredError('Unsupported type in stored schema', header.typeOffset, header.type.length);
    type = type.trim();
    if (SCALAR_TYPES.has(type)) return { type };
    if (type.startsWith('Array[')) return { type, element: shape(type.slice(6, -1), visiting) };
    if (visiting.includes(type)) throw new StoredError('Stored schemas must be acyclic', header.typeOffset, header.type.length);
    const node = structs.get(type);
    if (!node) {
      throw new StoredError(`Unsupported stored type ${type}; use local structs, Array, Str, Bool, I32, or F64`, header.typeOffset, header.type.length);
    }
    const fields = [...childrenOf(node, 'ir-field')].map(field => {
      const typeNode = field.firstElementChild;
      return [field.getAttribute('name'), shape(sourceTypeStr(typeNode), [...visiting, type])];
    });
    return { type, fields };
  }
  const schema = shape(header.type);
  if (!schema.fields) {
    throw new StoredError(`@stored state must be a struct so updates can apply in place; wrap ${header.type} in a struct field`, header.typeOffset, header.type.length);
  }

  let sequence = 0;
  const fresh = () => prefix + (sequence++);
  const splices = new Map();
  /** Parse a slice of the literal as Utu that keeps its source range. */
  function spliceSource(source, offset, name) {
    const key = prefix + name;
    splices.set(key, expressionFromSource(parser, source, site, new Map(), { sourceStart: innerStart + offset, createDocument }));
    return key;
  }
  let fallback;
  try {
    fallback = spliceSource(header.defaultSource, header.defaultOffset, 'default');
  } catch {
    throw new StoredError('Invalid @stored default expression', header.defaultOffset, header.defaultSource.trimEnd().length);
  }
  const validator = header.validator ? spliceSource(header.validator, header.validatorOffset, 'validator') : null;

  /** A JS predicate checking that `v` matches the schema. */
  function validate(s, v) {
    if (s.element) return `Array.isArray(${v})&&${v}.length<=${MAX_STORED_ARRAY}&&${v}.every(v=>${validate(s.element, 'v')})`;
    if (s.fields) {
      const fields = s.fields.map(([name, field]) => `(${validate(field, `${v}[${JSON.stringify(name)}]`)})`).join('&&');
      return `${v}!==null&&typeof ${v}==='object'&&!Array.isArray(${v})&&${fields}`;
    }
    switch (s.type) {
      case 'Str': return `typeof ${v}==='string'`;
      case 'Bool': return `typeof ${v}==='boolean'`;
      case 'I32': return `Number.isInteger(${v})&&${v}>=-2147483648&&${v}<=2147483647`;
      default: return `typeof ${v}==='number'&&Number.isFinite(${v})`;
    }
  }

  /** Utu converting validated JS data `v` into a native value. */
  function decode(s, v) {
    if (s.fields) return `${s.type} { ${s.fields.map(([name, field]) => `${name}: ${decode(field, `${v}.${name}`)}`).join(', ')} }`;
    if (s.element) {
      const array = fresh(), length = fresh(), i = fresh(), item = fresh();
      const element = s.element.type;
      return `{let ${length}:F64=${v}.length;let ${array}:Array[${element}]=[];
        if ${length}>0.0 {let ${item}=${decode(s.element, `${v}[0]`)};${array}=Array[${element}].new(${length}.to_i32(),${item});let ${i}:I32=1;while(${i}<${length}.to_i32()){${array}[${i}]=${decode(s.element, `${v}[${i}.to_f64()]`)};${i}+=1;};};${array};}`;
    }
    if (s.type === 'I32') return `{let ${prefix}number:F64=${v};${prefix}number.to_i32();}`;
    return v;
  }

  /** Utu converting native value `v` into plain JS data. */
  function encode(s, v) {
    if (s.fields) return `&{ ${s.fields.map(([name, field]) => `${name}: ${encode(field, `${v}.${name}`)}`).join(', ')} }`;
    if (s.element) {
      const array = fresh(), item = fresh();
      return `{let ${array}=Browser.Array();${v} each |${item}|{${array}.push(${encode(s.element, item)});};${array};}`;
    }
    return v;
  }

  const state = prefix + 'state', data = prefix + 'data';
  const load = prefix + 'load', register = prefix + 'register', applyRaw = prefix + 'decode';
  const { type, key } = header;
  const code = `{wutu.storage_init();let ${state}:${type}=${fallback};
    let ${applyRaw}=cl(raw:Str) void {
      let ${prefix}check:fun(Str) Str=@es/\\ raw=>{try{if(!raw)return '';const value=JSON.parse(raw);if(value.version!==1||!(${validate(schema, 'value.data')}))throw Error('Stored schema mismatch');return JSON.stringify(value.data);}catch(e){globalThis.__utuWutu.storageError=String(e.message??e);return '';}} \\/;
      let json=${prefix}check(raw);let candidate:${type}=${fallback};
      if json.len()>0 {let ${data}=Browser.JSON.parse(json);candidate=${decode(schema, data)};};
      ${validator ? `if not ${validator}(candidate) {candidate=${fallback};};` : ''}
      ${schema.fields.map(([name]) => `${state}.${name}=candidate.${name};`).join(' ')}
    };
    let ${load}:fun(Str) Str=@es/\\ key=>{try{return localStorage.getItem(key)??'';}catch(e){globalThis.__utuWutu.storageError=String(e.message??e);return '';}} \\/;
    ${applyRaw}(${load}(${key}));
    let ${register}:fun(Str,cl() Str, Bool,cl(Str) void) void=@es/\\ (key,encode,manual,apply)=>globalThis.__utuWutu.store(key,encode,!!manual,apply) \\/;
    ${register}(${key},cl() Str {Browser.JSON.stringify(&{version:1,data:${encode(schema, state)}});},${header.manual},${applyRaw});
    ${state};}`;
  return expressionFromSource(parser, code, site, splices, { createDocument });
}
