import { callableParts, isNullable, unwrapNullable } from './type-strings.js';
import { isAssignable } from './type-rules.js';
import { paramsOf } from './ir-helpers.js';
const primitive = new Set(['Str', 'F64', 'Bool', 'void']);
const dynamicRefs = new Set(['any', 'unknown']);
const absent = new Set(['null', 'undefined', 'never']);
const json = JSON.stringify;

function member(graph, node) {
  if (!['ir-field-access', 'ir-type-member'].includes(node?.localName)) return null;
  const abi = graph.doc.__utuForeign;
  if (!abi) return null;
  const base = node.firstElementChild;
  const owner = node.localName === 'ir-type-member' ? base?.getAttribute('name') : graph.slots.get(base)?.actual;
  if (owner?.startsWith('?')) return null;
  const key = node.getAttribute('field') ?? node.getAttribute('method');
  const found = abi.lookup(owner, key) ?? primitiveMember(graph, abi, owner, key);
  if (!found) return null;
  const root = found.ref === 'root';
  const schema = abi.schemas[found.index];
  const alias = `__abi${found.index}_${[...key].map(c => c.codePointAt(0).toString(16)).join('_')}`;
  const prologue = root && schema.moduleSpecifier ? `import { ${json(key)} as ${alias} } from ${json(schema.moduleSpecifier)}; ` : '';
  const access = root ? schema.moduleSpecifier ? alias : `globalThis[${json(key)}]` : `self[${json(key)}]`;
  return { ...found, owner, base, root, prologue, access };
}
// UTU strings and numbers are JS strings and numbers, so declared `String` and
// `Number` members apply to them. Native UTU members always take precedence.
const hostPrimitives = { Str: 'String', F64: 'Number' };
function primitiveMember(graph, abi, owner, key) {
  const name = hostPrimitives[owner];
  if (!name || graph.nativeMember?.(owner, key)) return null;
  // Any imported ABI that carries the standard-library interface will do.
  for (const [index, schema] of abi.schemas.entries()) {
    const ref = Object.hasOwn(schema.names, name) ? schema.names[name] : schema.types.findIndex(type => type?.lib === name);
    if (ref === -1) continue;
    const found = abi.lookup(abi.type(index, ref, graph), key);
    if (found?.prop) return found;
  }
  return null;
}

export function contextualType(graph, node) {
  for (const edge of graph.slots.get(node)?.expected ?? []) {
    const type = edge.read();
    if (type && primitive.has(type)) return type;
  }
  const parent = node.parentElement;
  // `json.length.to_i32()`: a UTU method JS values lack reads the receiver as that primitive.
  if (parent?.localName === 'ir-field-access' && parent.firstElementChild === node) {
    const member = parent.getAttribute('field');
    const native = ['F64', 'Str', 'Bool'].find(owner => graph.nativeMember?.(owner, member));
    if (native) return native;
  }
  // The value of `target.prop = value` reads the declared slot directly: the
  // expectation edge is not a dependency, so it may not be known yet.
  if (parent?.localName === 'ir-assign' && parent.lastElementChild === node) {
    const getter = graph.slots.get(parent.firstElementChild)?.foreign;
    if (getter?.index !== undefined && ['get', 'index'].includes(getter.kind)) {
      const type = unwrapNullable(accept(graph, getter.index, getter.prop?.type ?? 'any', node));
      if (primitive.has(type) && type !== 'void') return type;
    }
  }
  if (parent?.localName === 'ir-binary') {
    const other = node === parent.firstElementChild ? parent.lastElementChild : parent.firstElementChild;
    const type = graph.slots.get(other)?.actual;
    if (primitive.has(type) && type !== 'void') return type;
    // Two dynamic operands follow JavaScript: `-` `*` `/` `%` and orderings are
    // numeric; `+` takes the surrounding context, else is numeric too.
    const op = parent.getAttribute('op');
    if (!graph.typeIndex.get(type ?? '')?.foreignDynamic || ['==', '!=', 'and', 'or', 'xor'].includes(op)) return null;
    return op === '+' ? contextualType(graph, parent) ?? 'F64' : 'F64';
  }
  if (parent && (['ir-promote-arm', 'ir-default-arm', 'ir-match-arm', 'ir-alt-arm'].includes(parent.localName)
      || parent.localName === 'ir-block' && parent.lastElementChild === node)) return contextualType(graph, parent);
  // Arms share the construct's context; its subject does not.
  if (parent && ['ir-promote', 'ir-match', 'ir-alt', 'ir-if', 'ir-try'].includes(parent.localName)
      && (node !== parent.firstElementChild || parent.localName === 'ir-try')) return contextualType(graph, parent);
  return null;
}
/**
 * Dynamic and primitive-union results become the primitive their context asks
 * for; the boundary checks the host value's `typeof` before converting.
 */
function resultType(graph, index, ref, node) {
  const type = contextualResult(graph, index, ref, node);
  // A dynamic value may be absent: as `promote`'s or `orelse`'s subject it is nullable.
  const parent = node.parentElement;
  const subject = parent?.firstElementChild === node && ['ir-promote', 'ir-else'].includes(parent.localName);
  return subject && graph.typeIndex.get(type)?.foreignDynamic ? `?${type}` : type;
}
function contextualResult(graph, index, ref, node) {
  const abi = graph.doc.__utuForeign;
  ref = abi.resolve(index, ref);
  const slot = graph.slots.get(node);
  if (dynamicRefs.has(ref) || ref?.parameter && dynamicRefs.has(ref.constraint ?? 'any')) {
    const wanted = contextualType(graph, node);
    if (wanted && wanted !== 'void') slot.foreignChecked = true;
    return wanted ?? abi.type(index, 'any', graph);
  }
  const type = abi.type(index, ref, graph);
  // A union `any` absorbed (`V | undefined` with V = any) is dynamic too.
  if (graph.typeIndex.get(type)?.foreignDynamic) {
    const wanted = contextualType(graph, node);
    if (wanted && wanted !== 'void') { slot.foreignChecked = true; return wanted; }
    return type;
  }
  const union = abi.describe(index, ref).union;
  const wanted = union && !type.startsWith('?') && contextualType(graph, node);
  if (wanted && wanted !== 'void' && union.some(member => abi.type(index, member) === wanted)) {
    slot.foreignChecked = true;
    return wanted;
  }
  return type;
}
const typeofNames = { F64: 'number', Str: 'string', Bool: 'boolean' };
const typedArrays = /^(Int8|Uint8|Uint8Clamped|Int16|Uint16|Int32|Uint32|Float16|Float32|Float64|BigInt64|BigUint64)Array$/;
function argumentRef(abi, index, type) {
  const foreign = abi.values.get(type);
  return foreign ? foreign.index === index ? foreign.ref : { external: foreign } : type;
}
const isClosure = (graph, arg) => arg?.localName === 'ir-closure' || callableParts(graph.slots.get(arg)?.actual)?.kind === 'cl';
const isRecord = arg => arg?.localName === 'ir-struct-init' && arg.getAttribute('implicit') === 'true';
/** `[...]`, or a `let` bound to one without an annotation, whose representation context decides. */
function untypedArray(graph, arg) {
  const literal = arg?.localName === 'ir-array-lit' ? arg : null;
  const declaration = arg?.localName === 'ir-ident' ? graph.scopeGraph?.resolutions.get(arg.id) : null;
  const bound = declaration?.localName === 'ir-let' && declaration.children.length === 1 ? declaration.lastElementChild : null;
  const array = literal ?? (bound?.localName === 'ir-array-lit' ? bound : null);
  return !!array && (!array.getAttribute('type-name') || !!graph.typeIndex?.get(array.getAttribute('type-name'))?.foreign);
}
/** The element a JS array must hold to satisfy an array, array-like, or iterable declaration. */
function elementOf(abi, index, ref, seen = new Set()) {
  const desc = abi.describe(index, ref);
  if (desc.dynamic) return 'any';
  if (desc.element !== undefined) return desc.element;
  const numeric = desc.indexes?.find(info => info.key === 'F64');
  if (numeric) return numeric.type;
  if (desc.union) {
    for (const member of desc.union) {
      const key = json(member);
      if (absent.has(member) || seen.has(key)) continue;
      seen.add(key);
      const found = elementOf(abi, index, member, seen);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const iterator = desc.properties?.['@@iterator']?.type;
  if (iterator !== undefined) {
    const next = abi.describe(index, abi.describe(index, iterator).calls?.[0]?.result).properties?.next?.type;
    const result = abi.describe(index, abi.describe(index, next).calls?.[0]?.result);
    const value = result.union?.map(r => abi.describe(index, r).properties?.value?.type).find(t => t !== undefined && t !== 'undefined');
    return value ?? 'any';
  }
  return undefined;
}
const unbound = ref => !!ref && typeof ref === 'object' && (ref.parameter !== undefined || Object.values(ref).some(unbound));

/** Infer generic bindings from an argument, including a callback's return type. */
function unify(graph, index, ref, arg, bindings) {
  const abi = graph.doc.__utuForeign;
  if (arg.localName === 'ir-array-lit') {
    // `[1.0, 2.0]` for `ArrayLike<T>` binds T when every element agrees.
    const element = elementOf(abi, index, abi.bind(index, ref, bindings));
    const types = [...new Set([...arg.children].map(child => graph.slots.get(child)?.actual))];
    if (element?.parameter !== undefined && types.length === 1 && types[0] && !Object.hasOwn(bindings, element.parameter)) {
      bindings[element.parameter] = argumentRef(abi, index, types[0]);
    }
    return;
  }
  const type = graph.slots.get(arg)?.actual;
  if (!type) return;
  if (ref?.parameter !== undefined) {
    if (Object.hasOwn(bindings, ref.parameter) || type === 'null' || type === 'unknown' || callableParts(type)) return;
    // A binding must satisfy the parameter's constraint (`T extends Node`).
    const constraint = abi.resolve(index, abi.bind(index, ref.constraint ?? 'any', bindings));
    if (!dynamicRefs.has(constraint) && constraint?.parameter === undefined
        && !isAssignable(type, abi.type(index, constraint, graph), { typeIndex: graph.typeIndex })) return;
    // Literal types are kept only where the declaration asks for them (`K extends keyof M`).
    const literal = constraint?.keys !== undefined || abi.describe(index, constraint).union?.some(r => r?.literal !== undefined);
    bindings[ref.parameter] = literal && arg.localName === 'ir-lit' && arg.getAttribute('kind') === 'string'
      ? { literal: JSON.parse(arg.getAttribute('value')), base: 'Str' } : argumentRef(abi, index, type);
    return;
  }
  if (!unbound(ref) && typeof ref !== 'number' && ref?.bound === undefined) return;
  const desc = abi.describe(index, abi.bind(index, ref, bindings));
  const parts = callableParts(type);
  if (desc.union) {
    for (const member of desc.union) if (member?.parameter !== undefined || parts && abi.describe(index, member).calls?.length) unify(graph, index, member, arg, bindings);
    return;
  }
  const sig = parts && desc.calls?.[0];
  if (!sig) return;
  const result = abi.resolve(index, sig.result);
  const targets = result?.parameter !== undefined ? [result] : abi.describe(index, result).union?.filter(r => r?.parameter !== undefined) ?? [];
  for (const target of targets) {
    if (!Object.hasOwn(bindings, target.parameter)) bindings[target.parameter] = argumentRef(abi, index, parts.ret);
  }
}

/**
 * A type parameter only the result mentions takes the type its context expects,
 * as in TypeScript: `let input: ?Browser.HTMLInputElement = document.querySelector("#q")`
 * binds `querySelector<E extends Element>`'s E. The constraint still applies.
 */
function bindFromContext(graph, index, ref, node, bindings) {
  const abi = graph.doc.__utuForeign;
  const resolved = abi.resolve(index, ref);
  const parameters = resolved?.parameter !== undefined ? [resolved]
    : abi.describe(index, resolved ?? 'any').union?.filter(member => member?.parameter !== undefined) ?? [];
  const open = parameters.filter(parameter => !Object.hasOwn(bindings, parameter.parameter));
  if (!open.length) return;
  const expected = (graph.slots.get(node)?.expected ?? []).map(edge => edge.read()).filter(Boolean)
    .map(type => type.replace(/^\?/, '')).find(type => graph.typeIndex.get(type)?.foreign);
  if (!expected) return;
  for (const parameter of open) {
    const constraint = abi.resolve(index, abi.bind(index, parameter.constraint ?? 'any', bindings));
    if (dynamicRefs.has(constraint) || isAssignable(expected, abi.type(index, constraint, graph), { typeIndex: graph.typeIndex })) {
      bindings[parameter.parameter] = argumentRef(abi, index, expected);
    }
  }
}

/** A JS callback type: arity follows the UTU closure because JS ignores extra arguments. */
function callbackType(graph, index, ref, arg) {
  const abi = graph.doc.__utuForeign;
  const sig = abi.describe(index, ref).calls?.[0];
  if (!sig) return abi.type(index, ref, graph);
  const actual = callableParts(graph.slots.get(arg)?.actual);
  const closure = closureOf(graph, arg), receiver = takesReceiver(graph, arg);
  const arity = (closure ? paramsOf(closure).length : actual?.params.length ?? sig.params.length) - (receiver ? 1 : 0);
  const fixed = sig.params.filter(p => !p.rest), rest = sig.params.find(p => p.rest);
  if (arity > fixed.length && !rest) return abi.type(index, ref, graph);
  const own = closure ? paramsOf(closure).slice(receiver ? 1 : 0) : [];
  const params = Array.from({ length: arity }, (_, i) => {
    let type = abi.resolve(index, fixed[i]?.type ?? abi.describe(index, rest.type).element ?? 'any');
    if (fixed[i]?.optional) type = abi.describe(index, type).union?.filter(r => r !== 'undefined').at(0) ?? type;
    // An annotation narrows a dynamic slot: `cl(value: F64)` for `(value: unknown) => ...`.
    const annotated = own[i]?.firstElementChild && graph.slots.get(own[i])?.actual;
    if (annotated && (dynamicRefs.has(type) || type?.parameter !== undefined)) return annotated;
    return abi.type(index, type, graph);
  });
  const result = abi.resolve(index, sig.result);
  // The host ignores or dynamically consumes these results; keep the closure's own.
  const loose = result === 'void' || dynamicRefs.has(result) || unbound(result) || result?.bound !== undefined
    || abi.free(index, result).size > 0;
  if (receiver) params.unshift(abi.type(index, sig.receiver ?? 'any', graph));
  return `cl(${params.join(', ')}) ${loose ? actual?.ret ?? 'void' : abi.type(index, result, graph)}`;
}

/** The closure an argument denotes, directly or through a `let` binding. */
function closureOf(graph, arg) {
  if (arg?.localName === 'ir-closure') return arg;
  const declaration = arg?.localName === 'ir-ident' ? graph.scopeGraph?.resolutions.get(arg.id) : null;
  const value = declaration?.localName === 'ir-let' ? declaration.lastElementChild : null;
  return value?.localName === 'ir-closure' ? value : null;
}
/** `cl(this, event) {...}` receives the JS receiver first, like TypeScript's `this:` parameter. */
const takesReceiver = (graph, arg) => paramsOf(closureOf(graph, arg))[0]?.getAttribute('name') === 'this';

/**
 * The parameter type a declaration slot presents to one argument. Unions choose
 * the member the argument satisfies, callbacks match the closure's arity, and
 * dynamic slots adopt the argument's own representation.
 */
export function accept(graph, index, ref, arg, bindings = {}) {
  const abi = graph.doc.__utuForeign;
  const type = arg ? graph.slots.get(arg)?.actual : null;
  ref = abi.resolve(index, abi.bind(index, ref, bindings));
  if (ref?.parameter !== undefined) ref = ref.constraint ?? 'any';
  if (dynamicRefs.has(ref)) {
    if (type === 'null') return `?${abi.type(index, 'any', graph)}`;
    // An array literal given to JS becomes a JS array, never an opaque Wasm array.
    if (untypedArray(graph, arg)) return abi.type(index, 'any', graph);
    // A closure given to a dynamic slot receives dynamic arguments, as in TypeScript.
    const closure = closureOf(graph, arg);
    if (closure) {
      const params = paramsOf(closure).map(param => param.firstElementChild ? graph.slots.get(param)?.actual ?? 'unknown' : abi.type(index, 'any', graph));
      return `cl(${params.join(', ')}) ${callableParts(type)?.ret ?? 'void'}`;
    }
    return type && type !== 'unknown' && !/\bunknown\b/.test(type) ? type : abi.type(index, 'any', graph);
  }
  const desc = abi.describe(index, ref);
  const ctx = { typeIndex: graph.typeIndex };
  if (desc.union) {
    const members = desc.union.filter(r => !absent.has(r));
    const nullable = members.length !== desc.union.length;
    const wrap = t => nullable && !t.startsWith('?') && (type === 'null' || isNullable(type ?? '')) ? `?${t}` : t;
    if (type === 'null' && nullable) return abi.type(index, ref, graph);
    const pick = arg?.localName === 'ir-array-lit' ? members.find(r => elementOf(abi, index, r) !== undefined)
      : isClosure(graph, arg) ? members.find(r => abi.describe(index, r).calls?.length || abi.describe(index, r).name === 'Function')
      : isRecord(arg) ? members.find(r => {
        const d = abi.describe(index, r);
        return !d.calls?.length && [...arg.children].every(f => Object.hasOwn(d.properties ?? {}, f.getAttribute('field')) || d.dynamic || d.indexes?.length);
      }) : null;
    if (pick !== undefined && pick !== null) return wrap(accept(graph, index, pick, arg, bindings));
    // An untyped integer literal adopts a numeric member (`offset(8)` for `number | Options`);
    // a dynamic value meets a primitive member and is checked where it is read.
    const intLiteral = arg?.localName === 'ir-lit' && arg.getAttribute('kind') === 'int' && !arg.getAttribute('type-name');
    const dynamic = graph.typeIndex.get((type ?? '').replace(/^\?/, ''))?.foreignDynamic;
    for (const member of members) {
      const t = wrap(accept(graph, index, member, arg, bindings));
      if (intLiteral && unwrapNullable(t) === 'F64') return t;
      if (dynamic && primitive.has(unwrapNullable(t)) && t !== 'void') return unwrapNullable(t);
      if (type && isAssignable(type, t, ctx)) return type;
    }
    if (members.length === 1) return wrap(accept(graph, index, members[0], arg, bindings));
    return abi.type(index, ref, graph);
  }
  if (desc.calls?.length && isClosure(graph, arg)) return callbackType(graph, index, ref, arg);
  if (desc.name === 'Function' && isClosure(graph, arg)) return type ?? abi.type(index, ref, graph);
  return abi.type(index, ref, graph);
}
export function jsInput(name, type) { return type === 'Bool' ? `!!${name}` : name; }
export function jsOutput(expression, type, checked = false) {
  if (checked && typeofNames[type]) {
    const value = type === 'Bool' ? '+v' : 'v';
    return `(v => typeof v === ${json(typeofNames[type])} ? ${value} : (() => { throw new TypeError(${json(`expected ${typeofNames[type]}`)}); })())(${expression})`;
  }
  if (type === 'Bool') return `(${expression}) ? 1 : 0`;
  // Host APIs signal absence with undefined as often as null; promote tests null.
  return type?.startsWith('?') ? `(${expression}) ?? null` : expression;
}
/**
 * The JS expression passing one UTU value to a declaration slot. Receiver
 * closures become real functions; a null for a slot that admits undefined but
 * not null is passed as undefined.
 */
export function jsArgument(graph, index, ref, arg, name, type) {
  if (takesReceiver(graph, arg)) return `function (...a) { return ${name}(this, ...a); }`;
  const union = graph.doc.__utuForeign.describe(index, ref).union;
  return type?.startsWith('?') && union?.includes('undefined') && !union.includes('null') ? `${name} ?? undefined` : jsInput(name, type);
}

/** Called by type-graph rules: resolving a foreign operation also supplies its lowering plan. */
export function foreignActual(graph, node) {
  const abi = graph.doc.__utuForeign;
  if (!abi) return null;
  const read = n => graph.slots.get(n)?.actual;
  const save = op => { graph.slots.get(node).foreign = op; return op.result; };
  if (node.localName === 'ir-struct-init') {
    const name = node.getAttribute('type-name');
    const value = abi.values.get(name);
    if (!value) return null;
    const desc = abi.describe(value.index, value.ref);
    const fields = [...node.children];
    const args = fields.map(f => f.firstElementChild);
    const slots = fields.map(field => desc.properties?.[field.getAttribute('field')]?.type ?? desc.indexes?.[0]?.type ?? 'any');
    const params = args.map((arg, i) => accept(graph, value.index, slots[i], arg));
    for (const [key, prop] of Object.entries(desc.properties ?? {})) {
      if (!prop.optional && !fields.some(f => f.getAttribute('field') === key)) graph.slots.get(node).foreignError = `Missing foreign property '${key}'`;
    }
    for (const field of fields) {
      if (!Object.hasOwn(desc.properties ?? {}, field.getAttribute('field')) && !desc.dynamic && !desc.indexes?.length) {
        graph.slots.get(node).foreignError = `Unknown foreign property '${field.getAttribute('field')}'`;
      }
    }
    return save({ kind: 'object', result: name, params, args,
      body: `(${params.map((_, i) => `p${i}`).join(',')}) => ({${fields.map((f, i) => `[${json(f.getAttribute('field'))}]:${jsArgument(graph, value.index, slots[i], args[i], `p${i}`, params[i])}`).join(',')}})` });
  }
  if (node.localName === 'ir-binary' && ['==', '!='].includes(node.getAttribute('op'))) {
    // Host references compare by identity, like JavaScript's `===`.
    const [left, right] = [...node.children];
    const host = side => graph.typeIndex.get((read(side) ?? '').replace(/^\?/, ''))?.foreign || read(side) === 'null';
    if (!host(left) || !host(right) || read(left) === 'null' && read(right) === 'null') return null;
    const same = node.getAttribute('op') === '==' ? '===' : '!==';
    return save({ kind: 'call', result: 'Bool', expected: [read(left), read(right)], params: [read(left), read(right)], args: [left, right],
      body: `(a,b) => ${jsOutput(`a ${same} b`, 'Bool')}` });
  }
  if (node.localName === 'ir-array-lit') {
    const name = node.getAttribute('type-name');
    const value = abi.values.get(name);
    if (!value) return null;
    const desc = abi.describe(value.index, value.ref);
    const args = [...node.children];
    const element = elementOf(abi, value.index, value.ref);
    if (element === undefined) {
      graph.slots.get(node).foreignError = `${abi.schemas[value.index].prefix}.${desc.name} is not an array type`;
      return null;
    }
    const params = args.map(arg => accept(graph, value.index, element, arg));
    const items = `[${params.map((t, i) => jsInput(`p${i}`, t)).join(',')}]`;
    // A typed-array slot (`Float64Array`) receives that typed array, not a plain Array.
    const typed = typedArrays.test(desc.lib ?? '') ? desc.lib : null;
    return save({ kind: 'array', result: name, params, args,
      body: `(${params.map((_, i) => `p${i}`).join(',')}) => ${typed ? `new globalThis.${typed}(${items})` : items}` });
  }
  if (['ir-field-access', 'ir-type-member'].includes(node.localName)) {
    const m = member(graph, node);
    if (!m) return null;
    if (!m.prop && !m.desc.dynamic) {
      const owner = m.root ? '' : `${m.desc.name ?? 'value'}.`;
      graph.slots.get(node).foreignError = `Unknown foreign member '${abi.schemas[m.index].prefix}.${owner}${m.key}'`;
      return null;
    }
    if (m.desc.constants && Object.hasOwn(m.desc.constants, m.key)) {
      const value = m.desc.constants[m.key];
      return save({ kind: 'constant', result: typeof value === 'string' ? 'Str' : 'F64', value, params: [], args: [] });
    }
    const ref = m.prop?.type ?? 'any';
    const result = resultType(graph, m.index, ref, node);
    return save({ ...m, kind: 'get', result, params: m.root ? [] : [m.owner], args: m.root ? [] : [m.base],
      body: `${m.prologue}(${m.root ? '' : 'self'}) => ${jsOutput(m.access, result, graph.slots.get(node).foreignChecked)}` });
  }
  if (node.localName === 'ir-index') {
    const [base, key] = [...node.children];
    const value = abi.values.get(read(base));
    if (!value) return null;
    const desc = abi.describe(value.index, value.ref);
    const keyValue = abi.values.get(read(key));
    const symbol = keyValue?.ref?.symbol;
    const symbolic = symbol && desc.properties?.[`@@${symbol}`];
    const info = symbolic ?? desc.indexes?.find(i => abi.type(value.index, i.key, graph) === read(key)) ?? desc.indexes?.[0];
    if (!info && !desc.dynamic) return null;
    const result = resultType(graph, value.index, info?.type ?? 'any', node);
    return save({ ...value, kind: 'index', result, prop: info, params: [read(base), read(key) ?? 'F64'], args: [base, key],
      body: `(self,key) => ${jsOutput('self[key]', result, graph.slots.get(node).foreignChecked)}` });
  }
  if (node.localName === 'ir-call') {
    const callee = node.firstElementChild;
    const m = member(graph, callee);
    const indexed = callee.localName === 'ir-index' ? graph.slots.get(callee)?.foreign : null;
    const value = m ? { index: m.index, ref: m.prop?.type ?? (m.desc.dynamic ? 'any' : null) } : abi.values.get(read(callee));
    if (!value || value.ref === null) return null;
    const desc = abi.describe(value.index, value.ref);
    const args = [...(node.querySelector(':scope > ir-arg-list')?.children ?? [])];
    const constructors = node.getAttribute('construct') === 'true' || !desc.calls?.length && desc.constructors?.length;
    const signatures = (constructors ? desc.constructors : desc.calls) ?? [];
    const candidates = signatures.filter(sig => args.length >= sig.params.filter(p => !p.optional && !p.rest).length
      && (sig.params.at(-1)?.rest || args.length <= sig.params.length));
    const score = sig => args.reduce((n, arg, i) => {
      const p = sig.params[Math.min(i, sig.params.length - 1)];
      if (!p) return n - 100;
      if (p.type?.parameter) {
        const constraint = p.type.constraint;
        const literals = abi.describe(value.index, constraint).union?.filter(r => r?.literal !== undefined);
        if (constraint?.keys !== undefined || literals?.length) {
          if (arg.getAttribute('kind') !== 'string') return n - 100;
          const key = JSON.parse(arg.getAttribute('value'));
          const keyed = constraint?.keys !== undefined ? abi.describe(value.index, constraint.keys) : null;
          // `keyof T` admits T's named properties, or any string when T has a string index signature.
          const accepts = keyed
            ? Object.hasOwn(keyed.properties ?? {}, key) || keyed.dynamic
              || !!keyed.indexes?.some(info => abi.type(value.index, info.key) === 'Str')
            : literals.some(r => r.literal === key);
          return n + (accepts ? 5 : -100);
        }
      }
      if (p.type?.literal !== undefined) return n + (arg.getAttribute('value') === json(p.type.literal) ? 10 : -10);
      const slot = p.rest ? abi.describe(value.index, p.type).element ?? 'any' : p.type;
      // `[...]` belongs in an array-like slot, whatever it would default to natively.
      if (arg.localName === 'ir-array-lit') return n + (elementOf(abi, value.index, slot) !== undefined ? 3 : -100);
      return n + (read(arg) && isAssignable(read(arg), accept(graph, value.index, slot, arg), { typeIndex: graph.typeIndex }) ? 2 : 0);
    }, 0);
    candidates.sort((a, b) => score(b) - score(a));
    const sig = candidates[0];
    if (!sig && !desc.dynamic) {
      graph.slots.get(node).foreignError = `No declaration overload accepts ${args.length} arguments`;
      return null;
    }
    const slotOf = i => {
      const p = sig?.params[Math.min(i, sig.params.length - 1)];
      return p?.rest ? abi.describe(value.index, p.type).element ?? 'any' : p?.type ?? 'any';
    };
    const bindings = {};
    args.forEach((arg, i) => unify(graph, value.index, slotOf(i), arg, bindings));
    const params = args.map((arg, i) => accept(graph, value.index, slotOf(i), arg, bindings));
    bindFromContext(graph, value.index, sig?.result, node, bindings);
    const result = resultType(graph, value.index, abi.bind(value.index, sig?.result ?? 'any', bindings), node);
    const receiver = indexed ? indexed.args : m ? m.root ? [] : [m.base] : [callee];
    const receiverTypes = indexed ? indexed.params : m ? m.root ? [] : [m.owner] : [read(callee)];
    const names = args.map((_, i) => `p${i}`);
    const invocation = `${constructors ? 'new ' : ''}${indexed ? 'self[key]' : m ? m.access : 'self'}(${names.map((n, i) => jsArgument(graph, value.index, abi.bind(value.index, slotOf(i), bindings), args[i], n, params[i])).join(',')})`;
    return save({ kind: 'call', result, expected: params, args: [...receiver, ...args], params: [...receiverTypes, ...params],
      body: `${m?.prologue ?? ''}(${[...(indexed ? ['self', 'key'] : receiver.length ? ['self'] : []), ...names].join(',')}) => ${jsOutput(invocation, result, graph.slots.get(node).foreignChecked)}` });
  }
  return null;
}

