// Generators: `fn name(params) yield T { … yield value; … }`, consumed by
// `for (name(args)) |x| { body }` (or `await for`). The generator's body is
// expanded in place of the loop, with the consumer body at each `yield`:
//
//   { let p = arg; …
//     W: {                                   ← the whole generation
//       … generator code …
//       Y: { let x: T = value; body; };      ← one per yield
//       …
//     };
//   }
//
// W and Y are labeled blocks (data-break-label), not loops: inside the
// consumer body, `continue` resumes the generator after its yield (a break
// targeted at Y) and `break` ends the generation (a break targeted at W). In
// the generator, `return;` also ends it. Generator locals are renamed so they
// can never capture the consumer's names. With no extra loops in the way, the
// generator's own counted loops stay eligible for -O3 unrolling.
//
// There is no frame, no closure, and no call per value: a consumed generator
// costs what the equivalent hand-written loop costs. Because `await` suspends
// the whole wasm stack (JSPI), a generator body may await: `await for` reads
// as Dart's, with the same expansion. Measurements and the alternatives that
// were rejected: benchmarks/control-flow/README.md.
import { expressionFromSource } from './source-expansion.js';
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';
import { childOf, childrenOf, paramsOf, sourceTypeStr } from './ir-helpers.js';

const MAX_EXPANSIONS = 10000;
const LOOPS = new Set(['ir-while', 'ir-for', 'ir-loop-match']);

export function lowerGenerators(doc, parser, createDocument) {
  const root = doc.body.firstChild;
  if (!root) return;
  const generators = new Map([...root.querySelectorAll('ir-fn[data-generator="true"]')].map(fn => [fn.getAttribute('name'), fn]));

  for (const misplaced of root.querySelectorAll('ir-yield')) {
    if (!misplaced.closest('ir-fn[data-generator="true"]')) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'yield can only appear in a generator: declare the function with `yield T` as its return type', misplaced);
    }
    if (misplaced.closest('ir-closure')?.closest('ir-fn') === misplaced.closest('ir-fn[data-generator="true"]')) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'yield cannot appear inside a closure; the generator expands into its consumer', misplaced);
    }
  }

  // `await for (…)` parses as an await of the loop; the loop is the point.
  // Over a generator call it is the generator's loop; over anything else, a
  // stream's (streamLoop).
  let streams = 0;
  for (const awaited of [...root.querySelectorAll('ir-await')]) {
    const loop = awaited.firstElementChild;
    if (loop?.localName !== 'ir-for' || awaited.children.length !== 1) continue;
    awaited.replaceWith(generatorCall(loop, generators) ? loop : streamLoop(loop, `__stream${streams++}_`, parser, createDocument));
  }

  // A generator that delegates to itself is recursive: it runs on an explicit
  // stack (expandRecursiveLoop) rather than expanding inline.
  const recursive = new Set([...generators].filter(([name, fn]) => [...fn.querySelectorAll('ir-for')]
    .some(loop => generatorCall(loop, generators)?.firstElementChild.getAttribute('name') === name)).map(([name]) => name));

  // Consumers outside generators expand first; loops inside a generator body
  // expand once that body has been inlined into a consumer.
  let serial = 0;
  for (;;) {
    const loop = [...root.querySelectorAll('ir-for')]
      .find(node => generatorCall(node, generators) && !node.closest('ir-fn[data-generator="true"]'));
    if (!loop) break;
    const name = generatorCall(loop, generators).firstElementChild.getAttribute('name');
    if (!recursive.has(name) && expansionsAround(loop).includes(name)) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, `generator ${name} consumes itself; generators expand inline, so they cannot recurse`, loop);
    }
    if (++serial > MAX_EXPANSIONS) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'Generator expansion did not finish', loop);
    let expanded;
    try {
      expanded = recursive.has(name)
        ? expandRecursiveLoop(loop, generators, recursive, `__gen${serial}_`, parser, createDocument)
        : expandLoop(loop, generators, `__gen${serial}_`, parser, createDocument);
    } catch (error) {
      throw error.diagnostic ? error : compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, error.message, loop);
    }
    expanded.setAttribute('data-generator-expansion', name);
    loop.replaceWith(expanded);
  }

  // Any remaining call to a generator is not in a for loop.
  for (const call of root.querySelectorAll('ir-call')) {
    const callee = call.firstElementChild;
    if (callee?.localName !== 'ir-ident' || !generators.has(callee.getAttribute('name'))) continue;
    if (call.closest('ir-fn[data-generator="true"]')) continue;
    throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, `${callee.getAttribute('name')} is a generator: consume it with \`for (${callee.getAttribute('name')}(…)) |value| { … }\``, call);
  }
  for (const fn of generators.values()) fn.remove();
  const prune = root.querySelector('ir-prune');
  if (prune) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'prune skips a subtree of a recursive generator; use it in the body of `for (walk(…)) |node| { … }` where walk delegates to itself', prune);
}

/** Names of the generators whose expansions enclose `node`. */
function expansionsAround(node) {
  const names = [];
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent?.attr?.('data-generator-expansion')) names.push(parent.attr('data-generator-expansion'));
  }
  return names;
}

/** The generator call a `for` loop iterates, if its only source is one. */
function generatorCall(loop, generators) {
  const sources = [...childrenOf(loop, 'ir-for-source')];
  const call = sources.length === 1 && sources[0].children.length === 1 && !sources[0].getAttribute('op') ? sources[0].firstElementChild : null;
  const callee = call?.localName === 'ir-call' ? call.firstElementChild : null;
  return callee?.localName === 'ir-ident' && generators.has(callee.getAttribute('name')) ? call : null;
}

/** The breaks and continues of `body` that belong to it, not to its own loops or closures. */
function ownJumps(body) {
  return [...body.querySelectorAll('ir-break, ir-continue, ir-return')].filter(jump => {
    for (let parent = jump.parentElement; parent && parent !== body; parent = parent.parentElement) {
      if (parent.localName === 'ir-closure') return false;
      if (jump.localName !== 'ir-return' && LOOPS.has(parent.localName)) return false;
    }
    return true;
  });
}

function retag(node, tag) {
  const replacement = node.ownerDocument.createElement(tag);
  for (const attribute of [...node.attributes]) replacement.setAttribute(attribute.name, attribute.value);
  for (const child of [...node.children]) replacement.appendChild(child);
  node.replaceWith(replacement);
  return replacement;
}

function expandLoop(loop, generators, prefix, parser, createDocument) {
  const call = generatorCall(loop, generators);
  const generator = generators.get(call.firstElementChild.getAttribute('name'));
  const names = (childOf(loop, 'ir-capture')?.getAttribute('names') ?? '').split(',').filter(Boolean);
  if (names.length > 1) throw new Error('a generator loop binds one value: for (gen()) |value| { … }');
  const consumer = childOf(loop, 'ir-block');
  const args = [...(childOf(call, 'ir-arg-list')?.children ?? [])];
  const params = paramsOf(generator);
  if (args.length !== params.length) throw new Error(`${generator.getAttribute('name')} expects ${params.length} argument(s), got ${args.length}`);

  const whole = `${prefix}generation`;
  const value = names[0] ?? `${prefix}value`;
  const elementType = sourceTypeStr([...generator.children].find(child => child.localName.startsWith('ir-type-'))) ?? null;

  // Rename every binding the generator declares, so its locals and the
  // consumer body (spliced inside it) can never refer to each other by accident.
  const body = childOf(generator, 'ir-block').cloneNode(true);
  const declared = new Set([
    ...params.map(param => param.getAttribute('name')),
    ...[...body.querySelectorAll('ir-let[name], ir-param[name]')].map(node => node.getAttribute('name')),
    ...[...body.querySelectorAll('ir-capture[names]')].flatMap(node => node.getAttribute('names').split(',')),
  ].filter(Boolean));
  const renamed = name => (declared.has(name) ? prefix + name : name);
  for (const node of body.querySelectorAll('ir-let[name], ir-param[name], ir-ident[name]')) node.setAttribute('name', renamed(node.getAttribute('name')));
  for (const node of body.querySelectorAll('ir-capture[names]')) node.setAttribute('names', node.getAttribute('names').split(',').map(renamed).join(','));

  // `return;` in the generator ends the generation.
  for (const jump of ownJumps(body).filter(node => node.localName === 'ir-return')) {
    if (jump.children.length) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'a generator ends with `return;`, without a value', jump);
    retag(jump, 'ir-break').setAttribute('data-loop-target', whole);
  }

  const splices = new Map();
  const splice = node => { const key = `${prefix}splice${splices.size}`; splices.set(key, node); return key; };
  // Each yield gets its own copy of the consumer body.
  let yieldIndex = 0;
  for (const yielded of [...body.querySelectorAll('ir-yield')]) {
    const resume = `${prefix}yield${yieldIndex++}`;
    const step = consumer.cloneNode(true);
    for (const jump of ownJumps(step)) {
      if (jump.localName === 'ir-break') jump.setAttribute('data-loop-target', whole);
      else if (jump.localName === 'ir-continue') retag(jump, 'ir-break').setAttribute('data-loop-target', resume);
    }
    const annotation = elementType ? `: ${elementType}` : '';
    const produced = yielded.firstElementChild;
    if (!produced) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'yield needs a value', yielded);
    const code = `{ let ${value}${annotation} = ${splice(produced)}; ${splice(step)}; }`;
    yielded.replaceWith(labeledBlock(expressionFromSource(parser, code, yielded, splices, { createDocument }), resume));
  }

  const bindings = params.map((param, index) => {
    const type = sourceTypeStr([...param.children].find(child => child.localName.startsWith('ir-type-')));
    return `let ${renamed(param.getAttribute('name'))}${type ? `: ${type}` : ''} = ${splice(args[index])};`;
  });
  const code = `{ ${bindings.join(' ')} ${splice(body)}; }`;
  const expanded = expressionFromSource(parser, code, loop, splices, { createDocument });
  const statements = childOf(expanded, 'ir-block') ?? expanded;
  labeledBlock(statements.lastElementChild, whole);
  return expanded;
}

/**
 * `await for (s) |v| { body }` over a Stream[T] (std:Stream) is
 *
 *   { let it = s.iterator();
 *     while (true) { let r = await s.next(it); if s.done(r) { break; }; let v = s.value(r); body; };
 *     s.close(it); }
 *
 * so `break` and `continue` in the body are the loop's, and v has the type
 * of s's values.
 */
function streamLoop(loop, prefix, parser, createDocument) {
  const sources = [...childrenOf(loop, 'ir-for-source')];
  if (sources.length !== 1 || sources[0].children.length !== 1 || sources[0].getAttribute('op')) {
    throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'await for reads a generator call or a stream: `await for (ticks()) |t| { … }`', loop);
  }
  const names = (childOf(loop, 'ir-capture')?.getAttribute('names') ?? '').split(',').filter(Boolean);
  if (names.length > 1) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'a stream loop binds one value: await for (s) |value| { … }', loop);
  const splices = new Map();
  const splice = node => { const key = `${prefix}splice${splices.size}`; splices.set(key, node); return key; };
  const [stream, iterator, result] = ['stream', 'iterator', 'result'].map(name => prefix + name);
  const value = names[0] ?? `${prefix}value`;
  const code = `{ let ${stream} = ${splice(sources[0].firstElementChild)}; let ${iterator} = ${stream}.iterator(); `
    + `while (true) { let ${result} = await ${stream}.next(${iterator}); if ${stream}.done(${result}) { break; }; `
    + `let ${value} = ${stream}.value(${result}); ${splice(childOf(loop, 'ir-block'))}; }; ${stream}.close(${iterator}); }`;
  return expressionFromSource(parser, code, loop, splices, { createDocument });
}

const SCALARS = new Set(['I32', 'U32', 'I64', 'U64', 'M32', 'M64', 'M128', 'F32', 'F64', 'V128', 'Bool']);
const STACK_START = 16;

// A recursive generator delegates to itself with `for (walk(…)) |v| { yield v; }`.
// Inlining would never finish, so it runs on an explicit stack instead:
//
//   items   one per yield (a value) or delegation (the call's arguments), in
//           parallel arrays: kind, arg0, arg1, … and val, unless a
//           parameter has the yield type, in which case values share its array
//   frames  one per running call: [cursor, end) over its contiguous items; the
//           running frame's pair lives in locals, the suspended ones in arrays
//
//   loop {
//     take the next item of the running frame (or resume the suspended one)
//     call  → run the generator body once with its arguments; its yields and
//             delegations push items, which become a new frame
//     value → run the consumer body
//   }
//
// A call's body runs to completion before any of its values are consumed, so
// its effects come before the consumer sees its first value. Values still
// arrive in depth-first order. The generator body and the consumer body each
// appear once, whatever the depth. `prune;` in the consumer skips the
// delegations that follow the current value's yield, up to that call's next yield.
//
// Pre-order walks yield a value and then delegate on that same value
// (`yield c; for (walk(c)) |d| { yield d; };`). That pair is one item: it is
// consumed as a value and then, unless pruned, runs as the call.
function expandRecursiveLoop(loop, generators, recursive, prefix, parser, createDocument) {
  const call = generatorCall(loop, generators);
  const name = call.firstElementChild.getAttribute('name');
  const generator = generators.get(name);
  const names = (childOf(loop, 'ir-capture')?.getAttribute('names') ?? '').split(',').filter(Boolean);
  if (names.length > 1) throw new Error('a generator loop binds one value: for (gen()) |value| { … }');
  const consumer = childOf(loop, 'ir-block');
  const args = [...(childOf(call, 'ir-arg-list')?.children ?? [])];
  const params = paramsOf(generator);
  if (args.length !== params.length) throw new Error(`${name} expects ${params.length} argument(s), got ${args.length}`);

  const s = `${prefix}s_`;        // scaffolding; generator locals get `${prefix}u_`
  const whole = `${s}generation`, frameLabel = `${s}frame`, resume = `${s}resume`;
  const value = names[0] ?? `${s}value`;
  const elementType = sourceTypeStr([...generator.children].find(child => child.localName.startsWith('ir-type-')));
  const paramTypes = params.map(param => sourceTypeStr([...param.children].find(child => child.localName.startsWith('ir-type-'))));
  if (!elementType || paramTypes.some(type => !type)) throw new Error(`${name} needs written types for its parameters and yield`);
  // Values share a parameter's array when the types agree. Otherwise reference
  // values are stored nullable, so their array can start empty.
  const shared = paramTypes.indexOf(elementType);
  const stored = SCALARS.has(elementType) || elementType.startsWith('?') ? elementType : `?${elementType}`;
  const valArray = shared >= 0 ? `${s}arg${shared}` : `${s}val`;
  const unwrap = shared >= 0 || stored === elementType ? '' : ' orelse fatal';

  const body = childOf(generator, 'ir-block').cloneNode(true);
  const renamed = renameLocals(body, params, `${prefix}u_`);
  for (const jump of ownJumps(body).filter(node => node.localName === 'ir-return')) {
    if (jump.children.length) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'a generator ends with `return;`, without a value', jump);
    retag(jump, 'ir-break').setAttribute('data-loop-target', frameLabel);
  }

  const splices = new Map();
  const splice = node => { const key = `${prefix}splice${splices.size}`; splices.set(key, node); return key; };
  const grow = (top, arrays) => `if (${top} == ${arrays[0][0]}.len()) {
    ${arrays.map(([array, type, fill]) => `let ${array}_grown: Array[${type}] = Array[${type}]${fill ? `.new(${top} * 2, ${fill})` : `.new_default(${top} * 2)`};
    ${array}_grown.copy_from(0, ${array}, 0, ${top}); ${array} = ${array}_grown;`).join('\n    ')}
  };`;
  const itemArrays = [[`${s}kind`, 'I32'], ...(shared >= 0 ? [] : [[`${s}val`, stored]]), ...paramTypes.map((type, i) => [`${s}arg${i}`, type, `${s}arg${i}[0]`])];
  const growItems = grow(`${s}top`, itemArrays);

  // Delegations push a call item; every other yield pushes a value item.
  const VALUE = 0, CALL = 1, VALUE_THEN_CALL = 2;
  for (const inner of [...body.querySelectorAll('ir-for')]) {
    const innerCall = generatorCall(inner, generators);
    if (innerCall?.firstElementChild.getAttribute('name') !== name || !body.contains(inner)) continue;
    if (!isDelegation(inner)) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, `a recursive generator passes its own values straight through: \`for (${name}(…)) |v| { yield v; }\``, inner);
    }
    const innerArgs = [...(childOf(innerCall, 'ir-arg-list')?.children ?? [])];
    if (innerArgs.length !== params.length) throw new Error(`${name} expects ${params.length} argument(s), got ${innerArgs.length}`);
    const yielded = inner.previousElementSibling;
    const same = params.length === 1 && shared === 0 && yielded?.localName === 'ir-yield'
      && yielded.firstElementChild?.localName === 'ir-ident' && innerArgs[0].localName === 'ir-ident'
      && yielded.firstElementChild.getAttribute('name') === innerArgs[0].getAttribute('name');
    if (same) yielded.remove();
    const code = `{ ${innerArgs.map((arg, i) => `let ${s}a${i}: ${paramTypes[i]} = ${splice(arg)};`).join(' ')}
      ${growItems}
      ${s}kind[${s}top] = ${same ? VALUE_THEN_CALL : CALL};
      ${innerArgs.map((_, i) => `${s}arg${i}[${s}top] = ${s}a${i};`).join(' ')}
      ${s}top += 1; }`;
    inner.replaceWith(expressionFromSource(parser, code, inner, splices, { createDocument }));
  }
  for (const yielded of [...body.querySelectorAll('ir-yield')]) {
    const produced = yielded.firstElementChild;
    if (!produced) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'yield needs a value', yielded);
    const code = `{ let ${s}v: ${elementType} = ${splice(produced)};
      ${growItems}
      ${s}kind[${s}top] = ${VALUE}; ${valArray}[${s}top] = ${s}v; ${s}top += 1; }`;
    yielded.replaceWith(expressionFromSource(parser, code, yielded, splices, { createDocument }));
  }

  // The consumer appears once. `prune;` belongs to the innermost recursive
  // generator loop around it.
  const step = consumer.cloneNode(true);
  for (const jump of ownJumps(step)) {
    if (jump.localName === 'ir-break') jump.setAttribute('data-loop-target', whole);
    else if (jump.localName === 'ir-continue') retag(jump, 'ir-break').setAttribute('data-loop-target', resume);
  }
  for (const prune of [...step.querySelectorAll('ir-prune')]) {
    if (prune.closest('ir-closure') && step.contains(prune.closest('ir-closure'))) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'prune cannot appear inside a closure', prune);
    }
    let owned = true;
    for (let parent = prune.parentElement; parent && parent !== step; parent = parent.parentElement) {
      const nested = parent.localName === 'ir-for' ? generatorCall(parent, generators) : null;
      if (nested && recursive.has(nested.firstElementChild.getAttribute('name'))) { owned = false; break; }
    }
    if (owned) prune.replaceWith(expressionFromSource(parser, `${s}pruned = true`, prune, new Map(), { createDocument }));
  }

  const roots = args.map((arg, i) => `let ${s}root${i}: ${paramTypes[i]} = ${splice(arg)};`).join('\n');
  const code = `{
    ${roots}
    let ${s}kind: Array[I32] = Array[I32].new(${STACK_START}, ${CALL});
    ${shared >= 0 ? '' : `let ${s}val: Array[${stored}] = Array[${stored}].new_default(${STACK_START});`}
    ${paramTypes.map((type, i) => `let ${s}arg${i}: Array[${type}] = Array[${type}].new(${STACK_START}, ${s}root${i});`).join('\n')}
    let ${s}top: I32 = 1;
    let ${s}cur: I32 = 0;
    let ${s}end: I32 = 1;
    let ${s}fcur: Array[I32] = Array[I32].new_default(${STACK_START});
    let ${s}fend: Array[I32] = Array[I32].new_default(${STACK_START});
    let ${s}fsp: I32 = 0;
    ${splice(labeledBlock(expressionFromSource(parser, `{ while (true) {
      if (${s}cur == ${s}end) {
        if (${s}fsp == 0) { break; };
        ${s}fsp -= 1;
        ${s}cur = ${s}fcur[${s}fsp];
        ${s}end = ${s}fend[${s}fsp];
        ${s}top = ${s}end;
      } else {
        let ${s}i: I32 = ${s}cur;
        ${s}cur = ${s}i + 1;
        let ${s}k: I32 = ${s}kind[${s}i];
        let ${s}call: Bool = ${s}k == ${CALL};
        if (not ${s}call) {
          let ${value}: ${elementType} = ${valArray}[${s}i]${unwrap};
          let ${s}pruned: Bool = false;
          ${splice(labeledBlock(step, resume))};
          if (${s}pruned) {
            while (${s}cur < ${s}end and ${s}kind[${s}cur] == ${CALL}) { ${s}cur += 1; };
          } else {
            ${s}call = ${s}k == ${VALUE_THEN_CALL};
          };
        };
        if (${s}call) {
          ${params.map((param, i) => `let ${renamed(param.getAttribute('name'))}: ${paramTypes[i]} = ${s}arg${i}[${s}i];`).join(' ')}
          let ${s}start: I32 = ${s}top;
          ${splice(labeledBlock(body, frameLabel))};
          if (${s}top > ${s}start) {
            ${grow(`${s}fsp`, [[`${s}fcur`, 'I32'], [`${s}fend`, 'I32']])}
            ${s}fcur[${s}fsp] = ${s}cur; ${s}fend[${s}fsp] = ${s}end; ${s}fsp += 1;
            ${s}cur = ${s}start; ${s}end = ${s}top;
          };
        };
      };
    }; }`, loop, splices, { createDocument }), whole))};
  }`;
  return expressionFromSource(parser, code, loop, splices, { createDocument });
}

/** `for (gen(…)) |v| { yield v; }`, and nothing else. */
function isDelegation(loop) {
  const name = childOf(loop, 'ir-capture')?.getAttribute('names');
  const elements = [...childOf(loop, 'ir-block').querySelectorAll('*')].filter(node => node.localName !== 'ir-block');
  return elements.length === 2 && elements[0].localName === 'ir-yield'
    && elements[1].localName === 'ir-ident' && elements[1].getAttribute('name') === name;
}

/** Prefix every binding `body` declares; returns the renaming for its parameters. */
function renameLocals(body, params, prefix) {
  const declared = new Set([
    ...params.map(param => param.getAttribute('name')),
    ...[...body.querySelectorAll('ir-let[name], ir-param[name]')].map(node => node.getAttribute('name')),
    ...[...body.querySelectorAll('ir-capture[names]')].flatMap(node => node.getAttribute('names').split(',')),
  ].filter(Boolean));
  const renamed = name => (declared.has(name) ? prefix + name : name);
  for (const node of body.querySelectorAll('ir-let[name], ir-param[name], ir-ident[name]')) node.setAttribute('name', renamed(node.getAttribute('name')));
  for (const node of body.querySelectorAll('ir-capture[names]')) node.setAttribute('names', node.getAttribute('names').split(',').map(renamed).join(','));
  return renamed;
}

/**
 * Mark the block a jump may target. Block expressions parse as a block
 * wrapping the statement block; the label goes on the statements.
 */
function labeledBlock(node, label) {
  const block = node.localName === 'ir-block' && node.children.length === 1 && node.firstElementChild.localName === 'ir-block'
    ? node.firstElementChild : node;
  block.setAttribute('data-break-label', label);
  return node;
}
