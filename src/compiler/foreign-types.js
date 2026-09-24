import { hasLexicalShadow } from './hoist-modules.js';
import { createSyntheticNode, replaceNodeMeta } from './ir-helpers.js';
const primitive = new Set(['Str', 'F64', 'Bool', 'void']);
const json = JSON.stringify;

/** Per-compilation foreign identities. No demand or inference state is shared across builds. */
export class ForeignABI {
  constructor(schemas) {
    this.schemas = [...schemas.values()];
    this.paths = new Map([...schemas.keys()].map((path, i) => [path, i]));
    this.values = new Map();
    this.names = new Map();
    this.entries = new Map();
  }
  resolve(index, ref) {
    if (ref?.indexed !== undefined) {
      const object = this.describe(index, ref.indexed);
      const property = ref.key?.literal !== undefined ? object.properties?.[String(ref.key.literal)] : null;
      const found = property?.type ?? object.indexes?.[0]?.type;
      if (found !== undefined) return this.resolve(index, found);
    }
    return ref;
  }
  type(index, ref, graph) {
    if (ref?.external) return this.type(ref.external.index, ref.external.ref, graph);
    if (typeof ref === 'string' && graph?.typeIndex.has(ref)) return ref;
    ref = this.resolve(index, ref);
    if (ref === 'never') return 'void';
    if (primitive.has(ref)) return ref;
    if (ref?.base) return ref.base;
    if (ref?.parameter) return this.type(index, ref.constraint ?? 'any', graph);
    if (ref?.indexed !== undefined && ref.key?.literal !== undefined) {
      const property = this.describe(index, ref.indexed).properties?.[String(ref.key.literal)];
      if (property) return this.type(index, property.type, graph);
    }
    if (ref?.keys !== undefined) return 'Str';
    const desc = this.describe(index, ref);
    if (desc.union) {
      // `any` absorbs a union, as in TypeScript: `any | undefined` is `any`.
      if (desc.union.some(r => ['any', 'unknown'].includes(this.resolve(index, r)))) return this.type(index, 'any', graph);
      const members = desc.union.filter(r => r !== 'never');
      // `null` and `undefined` are both absence; boundary results normalize to null.
      const present = members.filter(r => r !== 'null' && r !== 'undefined');
      if (present.length !== members.length) {
        const value = present.length === 1 ? this.type(index, present[0], graph) : this.type(index, { union: present }, graph);
        return value.startsWith('?') ? value
          : `?${['F64', 'Bool'].includes(value) ? this.type(index, { boxed: value }, graph) : value}`;
      }
      const mapped = [...new Set(members.map(r => typeof r === 'string' || r?.base ? this.type(index, r, graph) : null))];
      if (mapped.length === 1 && mapped[0]) return mapped[0];
      if (members.length === 1) return this.type(index, members[0], graph);
    }
    const key = json(this.canonical(index, ref));
    let name = this.names.get(key);
    if (!name) {
      name = `Foreign${index}T${this.names.size}`;
      this.names.set(key, name); this.values.set(name, { index, ref });
    }
    if (graph) this.entry(name, graph.doc, graph.typeIndex);
    return name;
  }
  entry(name, doc, index) {
    if (!this.values.has(name)) return null;
    let entry = this.entries.get(name);
    if (!entry) {
      const site = doc.body.firstChild;
      const decl = createSyntheticNode(doc, 'ir-type-def', site, 'foreign-abi', 'foreign-type');
      decl.setAttribute('name', name);
      decl.dataset.typeName = name; decl.dataset.typeRepr = 'wasm-externref';
      const foreign = this.values.get(name);
      decl.dataset.displayName = `${this.schemas[foreign.index].prefix}.${this.display(foreign.index, foreign.ref)}`;
      const repr = createSyntheticNode(doc, 'ir-wasm-ref', site, 'foreign-abi', 'foreign-representation');
      repr.setAttribute('type-repr', 'wasm-externref'); decl.appendChild(repr);
      entry = { typeName: name, typeRepr: 'wasm-externref', kind: 'wasm-ref', refBinaryen: 'externref', decl,
        foreign: this.values.get(name), fields: [], abi: this };
      this.entries.set(name, entry);
      const ref = entry.foreign.ref;
      if (ref?.template !== undefined && /^Promise(?:<|$)/.test(this.describe(entry.foreign.index, ref.template).name ?? '')) {
        entry.moduleBase = 'Promise';
        entry.moduleArgs = json([this.type(entry.foreign.index, ref.arguments[0] ?? 'any')]);
      }
      const desc = this.describe(entry.foreign.index, entry.foreign.ref);
      entry.foreignBases = (desc.bases ?? []).map(ref => this.type(entry.foreign.index, ref));
      for (const parent of entry.foreignBases) this.entry(parent, doc, index);
      entry.foreignDynamic = !!desc.dynamic;
      // Instances of one generic declaration, for `any`-argument assignability.
      if (ref?.template !== undefined) {
        entry.foreignTemplate = JSON.stringify(this.canonical(entry.foreign.index, ref.template));
        entry.foreignArguments = ref.arguments.map(arg => this.type(entry.foreign.index, arg));
      }
      // `Function`, `object`, `Object` and `{}` are structural tops in TypeScript.
      entry.foreignTop = desc.name === 'Function' ? 'function'
        : ['object', 'Object', '{}'].includes(desc.name) ? 'object' : null;
      // Reference-represented union members; widening to them needs no conversion.
      entry.foreignUnion = desc.union?.filter(r => !['null', 'undefined', 'never'].includes(r))
        .map(r => this.type(entry.foreign.index, r)).filter(t => !['F64', 'Bool', 'void'].includes(t));
      for (const member of entry.foreignUnion ?? []) this.entry(member.replace(/^\?/, ''), doc, index);
    }
    index?.set(name, entry);
    return entry;
  }
  describe(index, ref) {
    if (ref?.external) return this.describe(ref.external.index, ref.external.ref);
    ref = this.resolve(index, ref);
    if (ref?.parameter) return this.describe(index, ref.constraint ?? 'any');
    if (ref === 'root') return { properties: Object.fromEntries(Object.entries(this.schemas[index].exports).map(([k, type]) => [k, { type, readonly: !this.schemas[index].mutableGlobals?.includes(k) }])) };
    if (ref?.bound !== undefined) return this.bind(index, this.describe(index, ref.bound), ref.bindings);
    if (typeof ref === 'number') return this.schemas[index].types[ref];
    if (Array.isArray(ref?.union)) return { name: ref.union.map(r => this.describe(index, r).name ?? r).join(' | '), union: ref.union };
    if (ref?.template !== undefined) {
      const target = this.describe(index, ref.template);
      const bindings = Object.fromEntries((target.parameters ?? []).map((p, i) => [p, ref.arguments[i] ?? 'any']));
      return this.bind(index, target, bindings);
    }
    return { name: ref?.boxed ?? (typeof ref === 'string' ? ref : undefined), dynamic: ['any', 'unknown'].includes(ref) };
  }
  /** A type as written in UTU source: a bare generic (`Browser.Map`) is its `any` instantiation. */
  written(index, ref) {
    const parameters = typeof ref === 'number' ? this.schemas[index].types[ref]?.parameters : null;
    return parameters?.length ? { template: ref, arguments: parameters.map(() => 'any') } : ref;
  }
  /** An identity key: standard-library types are shared by name, everything else is per ABI. */
  canonical(index, ref) {
    if (ref?.external) return this.canonical(ref.external.index, ref.external.ref);
    if (typeof ref === 'number') {
      const lib = this.schemas[index].types[ref]?.lib;
      return lib ? `lib:${lib}` : `${index}:${ref}`;
    }
    if (ref === 'root') return `${index}:root`;
    if (!ref || typeof ref !== 'object') return ref;
    if (Array.isArray(ref)) return ref.map(r => this.canonical(index, r));
    return Object.fromEntries(Object.entries(ref).map(([k, v]) => [k, k === 'bindings'
      ? Object.fromEntries(Object.entries(v).map(([p, r]) => [p, this.canonical(index, r)])) : this.canonical(index, v)]));
  }
  /**
   * Declared interfaces are structural, as in TypeScript: a value whose type
   * has every required member of an interface satisfies it (`Set` is an
   * `Iterable`). Member names are compared; their types come from the source.
   */
  structurally(source, target) {
    const key = `${source}\0${target}`;
    this.structural ??= new Map();
    if (this.structural.has(key)) return this.structural.get(key);
    this.structural.set(key, false);
    const from = this.values.get(source), to = this.values.get(target);
    const wanted = to && this.describe(to.index, to.ref);
    const required = Object.entries(wanted?.properties ?? {}).filter(([, prop]) => !prop.optional).map(([name]) => name);
    let result = false;
    if (from && wanted && !wanted.union && !wanted.dynamic && required.length && !wanted.calls?.length && !wanted.constructors?.length) {
      const members = new Set(), seen = new Set(), pending = [from];
      while (pending.length) {
        const next = pending.pop();
        const desc = this.describe(next.index, next.ref);
        const id = JSON.stringify(this.canonical(next.index, next.ref));
        if (seen.has(id)) continue;
        seen.add(id);
        for (const name of Object.keys(desc.properties ?? {})) members.add(name);
        for (const base of desc.bases ?? []) pending.push({ index: next.index, ref: base });
      }
      result = required.every(name => members.has(name));
    }
    this.structural.set(key, result);
    return result;
  }
  /** A readable declaration type with its generic arguments, such as `Map<Str, F64>` or `Str[]`. */
  display(index, ref, depth = 0) {
    if (depth > 4) return '…';
    if (ref?.external) return this.display(ref.external.index, ref.external.ref, depth);
    if (typeof ref === 'string') return ref;
    if (ref?.literal !== undefined) return JSON.stringify(ref.literal);
    if (ref?.boxed) return ref.boxed;
    if (ref?.parameter !== undefined) return ref.constraint && !['any', 'unknown'].includes(ref.constraint)
      ? this.display(index, ref.constraint, depth + 1) : ref.parameter;
    if (Array.isArray(ref?.union)) return ref.union.map(r => this.display(index, r, depth + 1)).join(' | ');
    if (ref?.template !== undefined) {
      const base = (this.describe(index, ref.template).name ?? '').replace(/<.*$/, '');
      const args = ref.arguments.map(r => this.display(index, r, depth + 1));
      return base.endsWith('[]') && args.length === 1 ? `${args[0]}[]` : `${base}<${args.join(', ')}>`;
    }
    return this.describe(index, ref).name ?? String(ref);
  }
  /** Generic parameter names an anonymous declaration type still mentions. */
  free(index, ref) { return freeParameters(this.schemas[index], ref); }
  /** Substitute generic bindings, including through numbered types that mention them. */
  bind(index, ref, bindings) {
    const names = Object.keys(bindings ?? {});
    if (!names.length) return ref;
    if (typeof ref === 'number') {
      const free = freeParameters(this.schemas[index], ref);
      return names.some(name => free.has(name)) ? { bound: ref, bindings } : ref;
    }
    if (!ref || typeof ref !== 'object') return ref;
    if (ref.parameter) return Object.hasOwn(bindings, ref.parameter) ? bindings[ref.parameter]
      : { ...ref, constraint: this.bind(index, ref.constraint, bindings) };
    if (Array.isArray(ref)) return ref.map(r => this.bind(index, r, bindings));
    return Object.fromEntries(Object.entries(ref).map(([k, v]) => [k, this.bind(index, v, bindings)]));
  }
  lookup(type, key) {
    const value = this.values.get(type?.replace(/^\?/, ''));
    if (!value) return null;
    const desc = this.describe(value.index, value.ref);
    let prop = Object.hasOwn(desc.properties ?? {}, key) ? desc.properties[key] : undefined;
    // String index signatures make every otherwise-unknown name a property (`dataset.id`).
    const index = !prop && desc.indexes?.find(info => this.type(value.index, info.key) === 'Str');
    if (index) prop = { type: index.type, readonly: index.readonly, optional: true };
    return { ...value, desc, prop, key };
  }
}
const freeMemo = new WeakMap();
/**
 * Generic parameter names reachable from an anonymous declaration type. Named
 * interfaces are closed: their identity never depends on a caller's bindings.
 */
function freeParameters(schema, root) {
  let memo = freeMemo.get(schema);
  if (!memo) freeMemo.set(schema, memo = new Map());
  const visit = ref => {
    if (typeof ref === 'number') {
      if (memo.has(ref)) return memo.get(ref);
      const found = new Set();
      memo.set(ref, found);
      const desc = schema.types[ref];
      if (desc && !desc.bases) for (const name of visit(Object.values(desc))) found.add(name);
      return found;
    }
    const found = new Set();
    if (!ref || typeof ref !== 'object') return found;
    if (ref.parameter) found.add(ref.parameter);
    for (const value of Array.isArray(ref) ? ref : Object.values(ref)) for (const name of visit(value)) found.add(name);
    return found;
  };
  return visit(root);
}

/** Resolve module aliases before module flattening, retaining canonical foreign identities. */
export function prepareForeignImports(documents, imports, abi) {
  for (const { from, to, node: using } of imports) {
    const index = abi.paths.get(to);
    if (index === undefined) continue;
    const owner = using.getAttribute('alias') ?? using.getAttribute('module');
    const doc = documents.get(from), schema = abi.schemas[index];
    for (const node of [...doc.querySelectorAll('ir-field-access')]) {
      if (node.firstElementChild?.getAttribute('name') !== owner || hasLexicalShadow(node, owner)
          || !Object.hasOwn(schema.exports, node.getAttribute('field'))) continue;
      const member = replaceNodeMeta(doc.createElement('ir-type-member'), node, 'foreign-abi', 'namespace-alias');
      member.setAttribute('method', node.getAttribute('field'));
      const ref = createSyntheticNode(doc, 'ir-type-ref', node, 'foreign-abi', 'namespace-root');
      ref.setAttribute('name', abi.type(index, 'root')); member.appendChild(ref); node.replaceWith(member);
    }
    for (const node of doc.querySelectorAll('ir-type-member')) {
      let base = node.firstElementChild;
      const parts = base?.getAttribute('raw')?.split('.');
      if (parts?.length > 1 && parts[0] === owner && Object.hasOwn(schema.exports, parts[1])) {
        let value = createSyntheticNode(doc, 'ir-type-member', base, 'foreign-abi', 'namespace-value');
        value.setAttribute('method', parts[1]);
        const ref = createSyntheticNode(doc, 'ir-type-ref', base, 'foreign-abi', 'namespace-root');
        ref.setAttribute('name', abi.type(index, 'root')); value.appendChild(ref);
        for (const key of parts.slice(2)) {
          const field = createSyntheticNode(doc, 'ir-field-access', base, 'foreign-abi', 'namespace-member');
          field.setAttribute('field', key); field.appendChild(value); value = field;
        }
        const field = replaceNodeMeta(doc.createElement('ir-field-access'), node, 'foreign-abi', 'namespace-member');
        field.setAttribute('field', node.getAttribute('method')); field.appendChild(value); node.replaceWith(field);
        continue;
      }
      if (base?.getAttribute('name') !== owner) continue;
      const memberName = node.getAttribute('method');
      if (!Object.hasOwn(schema.exports, memberName)
          && documents.get(to)?.querySelector(`ir-global[name="${memberName}"]`)) continue;
      base.setAttribute('name', abi.type(index, 'root'));
    }
    for (const node of doc.querySelectorAll('ir-struct-init[type-name]')) {
      const name = node.getAttribute('type-name');
      if (name.startsWith(owner + '.') && Object.hasOwn(schema.names, name.slice(owner.length + 1))) {
        node.setAttribute('type-name', abi.type(index, schema.names[name.slice(owner.length + 1)]));
      }
    }
    // `alt value { Browser.HTMLInputElement |input| => ... }` narrows by runtime class.
    for (const arm of doc.querySelectorAll('ir-alt-arm[variant]')) {
      const [prefix, name, extra] = arm.getAttribute('variant').split('.');
      if (prefix !== owner || extra !== undefined || !Object.hasOwn(schema.names, name)) continue;
      arm.setAttribute('variant', abi.type(index, schema.names[name]));
      arm.dataset.foreignClass = name;
      arm.dataset.foreignIndex = String(index);
    }
    for (const node of [...doc.querySelectorAll('ir-type-qualified')]) {
      const base = node.firstElementChild;
      if ((base?.getAttribute('name') ?? base?.getAttribute('module') ?? base?.getAttribute('raw')) !== owner) continue;
      const name = node.getAttribute('type-name');
      if (!Object.hasOwn(schema.names, name)) continue;
      const ref = replaceNodeMeta(doc.createElement('ir-type-ref'), node, 'foreign-abi', 'foreign-type-name');
      ref.setAttribute('name', abi.type(index, abi.written(index, schema.names[name]))); node.replaceWith(ref);
    }
  }
}

