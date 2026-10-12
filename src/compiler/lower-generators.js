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
import { paramsOf, sourceTypeStr } from './ir-helpers.js';

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
  for (const awaited of [...root.querySelectorAll('ir-await')]) {
    const loop = awaited.firstElementChild;
    if (loop?.localName !== 'ir-for' || awaited.children.length !== 1) continue;
    const call = generatorCall(loop, generators);
    if (!call) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'await for iterates a generator call: `await for (ticks()) |t| { … }`', awaited);
    awaited.replaceWith(loop);
  }

  // Consumers outside generators expand first; loops inside a generator body
  // expand once that body has been inlined into a consumer.
  let serial = 0;
  for (;;) {
    const loop = [...root.querySelectorAll('ir-for')]
      .find(node => generatorCall(node, generators) && !node.closest('ir-fn[data-generator="true"]'));
    if (!loop) break;
    const name = generatorCall(loop, generators).firstElementChild.getAttribute('name');
    if (expansionsAround(loop).includes(name)) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, `generator ${name} consumes itself; generators expand inline, so they cannot recurse`, loop);
    }
    if (++serial > MAX_EXPANSIONS) throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, 'Generator expansion did not finish', loop);
    let expanded;
    try {
      expanded = expandLoop(loop, generators, `__gen${serial}_`, parser, createDocument);
    } catch (error) {
      throw error.diagnostic ? error : compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, error.message, loop);
    }
    expanded.dataset.generatorExpansion = name;
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
}

/** Names of the generators whose expansions enclose `node`. */
function expansionsAround(node) {
  const names = [];
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (parent.dataset?.generatorExpansion) names.push(parent.dataset.generatorExpansion);
  }
  return names;
}

/** The generator call a `for` loop iterates, if its only source is one. */
function generatorCall(loop, generators) {
  const sources = [...loop.querySelectorAll(':scope > ir-for-source')];
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
  const names = (loop.querySelector(':scope > ir-capture')?.getAttribute('names') ?? '').split(',').filter(Boolean);
  if (names.length > 1) throw new Error('a generator loop binds one value: for (gen()) |value| { … }');
  const consumer = loop.querySelector(':scope > ir-block');
  const args = [...(call.querySelector(':scope > ir-arg-list')?.children ?? [])];
  const params = paramsOf(generator);
  if (args.length !== params.length) throw new Error(`${generator.getAttribute('name')} expects ${params.length} argument(s), got ${args.length}`);

  const whole = `${prefix}generation`;
  const value = names[0] ?? `${prefix}value`;
  const elementType = sourceTypeStr([...generator.children].find(child => child.localName.startsWith('ir-type-'))) ?? null;

  // Rename every binding the generator declares, so its locals and the
  // consumer body (spliced inside it) can never refer to each other by accident.
  const body = generator.querySelector(':scope > ir-block').cloneNode(true);
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
    retag(jump, 'ir-break').dataset.loopTarget = whole;
  }

  const splices = new Map();
  const splice = node => { const key = `${prefix}splice${splices.size}`; splices.set(key, node); return key; };
  // Each yield gets its own copy of the consumer body.
  let yieldIndex = 0;
  for (const yielded of [...body.querySelectorAll('ir-yield')]) {
    const resume = `${prefix}yield${yieldIndex++}`;
    const step = consumer.cloneNode(true);
    for (const jump of ownJumps(step)) {
      if (jump.localName === 'ir-break') jump.dataset.loopTarget = whole;
      else if (jump.localName === 'ir-continue') retag(jump, 'ir-break').dataset.loopTarget = resume;
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
  const statements = expanded.querySelector(':scope > ir-block') ?? expanded;
  labeledBlock(statements.lastElementChild, whole);
  return expanded;
}

/**
 * Mark the block a jump may target. Block expressions parse as a block
 * wrapping the statement block; the label goes on the statements.
 */
function labeledBlock(node, label) {
  const block = node.localName === 'ir-block' && node.children.length === 1 && node.firstElementChild.localName === 'ir-block'
    ? node.firstElementChild : node;
  block.dataset.breakLabel = label;
  return node;
}
