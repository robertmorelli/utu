import { expressionFromSource } from './source-expansion.js';
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';
import { sourceTypeStr } from './ir-helpers.js';

const terminals = new Set(['fold', 'each', 'any', 'all', 'count_where', 'first_index', 'last_index', 'sum', 'fast_sum', 'product', 'count', 'collect', 'sort', 'group_by', 'distinct_by', 'partition', 'batched', 'windows', 'min_by', 'max_by', 'first_where', 'reduce', 'bisect']);

// Stages that never produce more values than they consume: a buffer fed by
// them never needs more room than the source range.
const BOUNDED_STAGES = new Set(['map', 'filter', 'skip', 'take', 'skip_while', 'take_while', 'scan', 'zip']);

// Element types with a zero value can be allocated with array.new_default;
// others need a fill element.
const DEFAULTABLE = /^(I32|U32|I64|U64|F32|F64|Bool)$|^\?/;

// Insertion-sorted runs merged bottom-up. Long enough that most merges have
// real work, short enough that insertion sort stays cache- and branch-friendly.
const SORT_RUN = 24;

// Placeholder for the cancellation test in generated loop conditions. It is
// filled in once the whole pipeline is known: pipelines that can never stop
// early get plain counted loops without a flag.
const STOP_CHECK = '__iterator_stop_check__';
// flat_map bodies ending in an array literal of at most this many elements
// pass the elements downstream directly instead of allocating the array.
const FLAT_MAP_INLINE = 4;

// Zero values for scalar accumulators.
const SCALAR_ZERO = { I32: '0', U32: '0', I64: '0', U64: '0', F32: '0.0', F64: '0.0' };

// Radix sort pays for two 64K-entry count tables; below this, merge sort wins.
const RADIX_MIN = 512;

// Placeholder where a stage's position counter goes, if the stage needs one.
const STAGE_HEAD = '__iterator_stage_head__';

// A pipeline is syntax, never a runtime iterator object. Every stage is nested
// inside the consuming loop. Materializing terminals own their native buffers.
export function lowerIterators(doc, parser, createDocument) {
  let serial = 0;
  for (const outer of [...doc.querySelectorAll('ir-iterator')]) {
    if (!outer.closest('ir-source-file') || outer.parentNode.localName === 'ir-iterator') continue;
    try {
      let prefix;
      do { prefix = `__iter_${serial++}_${outer.id || 'x'}_`; } while (doc.querySelector(`[name^="${prefix}"]`));
      outer.replaceWith(lowerPipeline(outer, prefix, parser, createDocument));
    } catch (error) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_ITERATOR_USAGE, error.message, outer);
    }
  }
  // Pipelines in a body or parenthesized source survive as splices.
  if (doc.querySelector('ir-iterator')) {
    lowerIterators(doc, parser, createDocument);
    return;
  }
  const stray = doc.querySelector('ir-range');
  if (stray) {
    throw compilerError(DIAGNOSTIC_KINDS.INVALID_ITERATOR_USAGE,
      'A range like (a..<b) starts an iterator pipeline, e.g. (0..<n) map |i| { … } collect(I32); in a for loop write for (a ..< b)', stray);
  }
}

function lowerPipeline(outer, prefix, parser, createDocument) {
  let stages = [];
  let input = outer;
  while (input.localName === 'ir-iterator') {
    stages.unshift(input);
    input = input.firstElementChild;
  }
  // `(xs … collect(T)) …` with side-effect-free inner stages is one pipeline:
  // the intermediate array is never observed, so it is never built.
  for (let inner = fusableCollect(input); inner; inner = fusableCollect(input)) {
    stages = [...inner.stages, ...stages];
    input = inner.input;
  }
  const end = stages.at(-1).getAttribute('op');
  if (!terminals.has(end)) throw new Error(`Iterator pipeline must end with fold, each, collect(Type), or a scalar terminal; found ${end}`);

  const name = suffix => prefix + suffix;
  const splices = new Map();
  const splice = node => { const key = name(`splice${splices.size}`); splices.set(key, node); return key; };
  const source = name('source'), index = name('index'), result = name('result'), stop = name('stop'), stopAt = name('stopAt');
  const lo = name('lo'), hi = name('hi');

  if (end === 'bisect') return lowerBisect(stages, input, { name, splice, source, splices, outer, parser, createDocument });

  let usesStop = false, skipLoop = false;
  const cancel = k => {
    usesStop = true;
    return `${stop} = true; if ${stopAt} < ${k} { ${stopAt} = ${k}; };`;
  };
  // A range source, (a..<b), visits its integers directly: no array.
  const range = input.localName === 'ir-range';
  const setup = range
    ? [`let ${lo}: I32 = ${splice(input.firstElementChild)}; let ${hi}: I32 = ${splice(input.lastElementChild)}${input.getAttribute('inclusive') === 'true' ? ' + 1' : ''}; if ${hi} < ${lo} { ${hi} = ${lo}; };`]
    : [`let ${source} = ${splice(input)};`, `let ${lo}: I32 = 0; let ${hi}: I32 = ${source}.len();`];
  const element = at => (range ? at : `${source}[${at}]`);
  // Cleanup entries may be functions: they read `usesStop` after every stage exists.
  const cleanup = [];
  let finish = result, identityElement = null;
  // Accumulators typed like the element (sum's 0 may need to be an F64 0).
  const elementTyped = [result];

  // Leading skip/take narrow the source range instead of counting per element.
  let first = 0;
  while (first < stages.length - 1 && ['skip', 'take'].includes(stages[first].getAttribute('op'))) {
    const limit = name(`limit${first}`);
    setup.push(`let ${limit}: I32 = ${splice([...stages[first].children][1])};`);
    setup.push(stages[first].getAttribute('op') === 'skip'
      ? `if ${limit} > 0 { ${lo} = if ${limit} > ${hi} - ${lo} { ${hi}; } else { ${lo} + ${limit}; }; };`
      : `if ${limit} <= 0 { ${hi} = ${lo}; } else if ${limit} < ${hi} - ${lo} { ${hi} = ${lo} + ${limit}; };`);
    first++;
  }
  const bounded = stages.slice(first, -1).every(stage => BOUNDED_STAGES.has(stage.getAttribute('op')));
  const bound = bounded ? `${hi} - ${lo}` : null;

  const alloc = (type, length, fill) => (DEFAULTABLE.test(type)
    ? `Array[${type}].new_default(${length})`
    : `Array[${type}].new(${length}, ${fill})`);

  /**
   * A growable native buffer. With a known bound it allocates once, at the
   * first element; otherwise it doubles, moving elements with one bulk copy.
   */
  function buffer(type, label, limit = null) {
    const array = name(label), length = name(label + 'Length'), capacity = name(label + 'Capacity');
    const grown = name(label + 'Grown'), item = name(label + 'Item');
    if (limit && DEFAULTABLE.test(type)) {
      // Bounded and zero-initializable: allocate once before the loop. The
      // bound is never exceeded, so appends need no capacity check.
      setup.push(`let ${capacity}: I32 = ${limit}; let ${array} = Array[${type}].new_default(${capacity}); let ${length}: I32 = 0;`);
      return {
        array, length,
        done: `if ${length} == ${capacity} { ${array}; } else { ${array}.slice(0, ${length}); }`,
        add: value => `${array}[${length}] = ${value}; ${length} += 1;`,
      };
    }
    setup.push(`let ${array}: Array[${type}] = []; let ${length}: I32 = 0; let ${capacity}: I32 = 0;`);
    const initial = limit ? `if ${limit} > 0 { ${limit}; } else { 8; }` : '8';
    return {
      array, length,
      // Trimmed to its length; no copy when the buffer is exactly full.
      done: `if ${length} == ${capacity} { ${array}; } else { ${array}.slice(0, ${length}); }`,
      add(value) {
        return `{ let ${item} = ${value}; if ${length} == ${capacity} {
          ${capacity} = if ${capacity} == 0 { ${initial}; } else { ${capacity} * 2; };
          let ${grown} = ${alloc(type, capacity, item)};
          ${grown}.copy_from(0, ${array}, 0, ${length});
          ${array} = ${grown};
        }; ${array}[${length}] = ${item}; ${length} += 1; };`;
      },
    };
  }

  // A stage's position counter is only emitted when its code reads it
  // (index bindings, take/skip/zip/first_index…). Unused counters would make
  // small loop bodies look large to the -O3 unroller.
  function stageAt(k, value) {
    const counter = name(`n${k}`), ordinal = name(`i${k}`);
    const code = stageCode(k, value);
    if (!code.includes(counter) && !code.includes(ordinal)) return code.replace(STAGE_HEAD, '');
    setup.push(`let ${counter}: I32 = 0;`);
    return code.replace(STAGE_HEAD, `let ${ordinal} = ${counter}; ${counter} += 1;`);
  }

  function stageCode(k, value) {
    const node = stages[k], op = node.getAttribute('op');
    const capture = node.querySelector(':scope > ir-capture');
    const bindings = capture?.getAttribute('names').split(',') ?? [];
    const body = node.querySelector(':scope > ir-block');
    const children = [...node.children];
    const param = children[1];
    const counter = name(`n${k}`), ordinal = name(`i${k}`);
    const head = STAGE_HEAD;
    function bind(values) {
      if (bindings.length < values.length || bindings.length > values.length + 1) throw new Error(`${op} expects ${values.length} value binding(s) and an optional index`);
      return bindings.map((b, j) => `let ${b} = ${j < values.length ? values[j] : `${ordinal}.to_u32().to_u64()`};`).join(' ');
    }
    const next = v => stageAt(k + 1, v);
    if (k < stages.length - 1 && terminals.has(op)) throw new Error(`${op} consumes a pipeline; parenthesize its result to start another`);

    if (op === 'map') {
      const mapped = name(`v${k}`);
      return `${head} { let ${mapped} = { ${bind([value])} ${splice(body)}; }; ${next(mapped)} };`;
    }
    if (op === 'zip') {
      const mapped = name(`v${k}`), other = name(`other${k}`);
      setup.push(`let ${other} = ${splice(param)};`);
      if (k === first) {
        // First stage: stage ordinal = source position - lo, so the shorter
        // input simply bounds the source loop. No per-element guard.
        setup.push(`if ${other}.len() < ${hi} - ${lo} { ${hi} = ${lo} + ${other}.len(); };`);
        return `${head} { let ${mapped} = { ${bind([value, `${other}[${ordinal}]`])} ${splice(body)}; }; ${next(mapped)} };`;
      }
      setup.push(`if ${other}.len() == 0 { ${cancel(k)} };`);
      return `${head} if ${ordinal} >= ${other}.len() { ${cancel(k)} } else { let ${mapped} = { ${bind([value, `${other}[${ordinal}]`])} ${splice(body)}; }; ${next(mapped)} if ${counter} >= ${other}.len() { ${cancel(k)} }; };`;
    }
    if (op === 'flat_map') {
      const literal = body?.lastElementChild;
      if (literal?.localName === 'ir-array-lit' && literal.children.length <= FLAT_MAP_INLINE) {
        // `flat_map |x| { …; [a, b]; }` yields a, then b, without building the
        // array. Elements evaluate in order before any is passed downstream.
        const statements = [...body.children].slice(0, -1).map(statement => `${splice(statement)};`);
        const items = [...literal.children].map((element, j) => ({ name: name(`v${k}_${j}`), element }));
        const lets = items.map(({ name: item, element }) => `let ${item} = ${splice(element)};`);
        // Downstream stages are generated once (their setup runs once) and
        // copied per element, each copy in its own scope.
        const placeholder = name(`flat${k}`);
        const tail = next(placeholder);
        const downstream = items.map(({ name: item }, j) => {
          const copy = tail.replaceAll(placeholder, item);
          return j === 0 ? `{ ${copy} };` : `if true${STOP_CHECK} { ${copy} };`;
        });
        return `${head} { ${bind([value])} ${statements.join(' ')} ${lets.join(' ')} ${downstream.join(' ')} };`;
      }
      const nested = name(`nested${k}`), j = name(`j${k}`), item = name(`v${k}`);
      return `${head} let ${nested} = { ${bind([value])} ${splice(body)}; }; let ${j}: I32 = 0; while (${j} < ${nested}.len()${STOP_CHECK}) { let ${item} = ${nested}[${j}]; ${j} += 1; ${next(item)} };`;
    }
    if (['filter', 'skip_while', 'take_while'].includes(op)) {
      const test = `{ ${bind([value])} ${splice(body)}; }`;
      if (op === 'skip_while') {
        const skipping = name(`skipping${k}`);
        setup.push(`let ${skipping} = true;`);
        return `${head} if ${skipping} { ${skipping} = ${test}; }; if not ${skipping} { ${next(value)} };`;
      }
      if (op === 'filter' && k + 1 === stages.length - 1 && stages[k + 1].getAttribute('op') === 'sum') {
        // filter → sum adds a select (`v` or 0) instead of branching on the
        // test, so unpredictable data costs no mispredictions.
        identityElement = value;
        setup.push(`let ${result} = 0;`);
        return `${head} ${result} += if ${test} { ${value}; } else { 0; };`;
      }
      return `${head} if ${test} { ${next(value)} } ${op === 'take_while' ? `else { ${cancel(k)} }` : ''};`;
    }
    if (op === 'skip' || op === 'take') {
      const limit = name(`limit${k}`);
      setup.push(`let ${limit}: I32 = ${splice(param)};`);
      if (op === 'take') {
        setup.push(`if ${limit} <= 0 { ${cancel(k)} };`);
        return `${head} if ${ordinal} < ${limit} { ${next(value)} }; if ${counter} >= ${limit} { ${cancel(k)} };`;
      }
      return `${head} if ${ordinal} >= ${limit} { ${next(value)} };`;
    }
    if (op === 'repeat') {
      const times = name(`times${k}`), j = name(`repeat${k}`);
      setup.push(`let ${times}: I32 = ${splice(param)};`);
      return `${head} let ${j}: I32 = 0; while (${j} < ${times}${STOP_CHECK}) { ${j} += 1; ${next(value)} };`;
    }
    if (op === 'chain') {
      const other = name(`chain${k}`), j = name(`chainIndex${k}`), item = name(`chainValue${k}`);
      setup.push(`let ${other} = ${splice(param)};`);
      const tail = next(item);
      // Run appended sources in stage order, sharing downstream counters. A
      // cancellation upstream of the chain does not stop the appended source.
      cleanup.unshift(() => (usesStop
        ? `if ${stopAt} <= ${k} { ${stop} = false; ${stopAt} = -1; }; let ${j}: I32 = 0; while (${j} < ${other}.len() and not ${stop}) { let ${item} = ${other}[${j}]; ${j} += 1; ${tail} };`
        : `for (0 ..< ${other}.len()) |${j}| { let ${item} = ${other}[${j}]; ${tail} };`));
      return `${head} let ${item} = ${value}; ${tail}`;
    }
    if (op === 'scan') {
      const acc = name(`acc${k}`), mapped = name(`v${k}`);
      setup.push(`let ${acc} = ${splice(param)};`);
      return `${head} ${acc} = { ${bind([acc, value])} ${splice(body)}; }; let ${mapped} = ${acc}; ${next(mapped)}`;
    }
    if (['first_where', 'min_by', 'max_by', 'reduce'].includes(op)) {
      const type = sourceTypeStr(param);
      setup.push(`let ${result}: ?Found[${type}] = null;`);
      const found = name('found');
      if (op === 'first_where') return `${head} if { ${bind([value])} ${splice(body)}; } { ${result} = Found[${type}].new(${value}); ${cancel(k)} };`;
      if (op === 'reduce' && SCALAR_ZERO[type]) {
        // A scalar accumulator lives in a local; the result is wrapped once.
        const acc = name('acc'), has = name('has');
        setup.push(`let ${acc}: ${type} = ${SCALAR_ZERO[type]}; let ${has} = false;`);
        cleanup.push(`if ${has} { ${result} = Found[${type}].new(${acc}); };`);
        return `${head} if ${has} { ${acc} = { ${bind([acc, value])} ${splice(body)}; }; } else { ${acc} = ${value}; ${has} = true; };`;
      }
      if (op === 'reduce') return `${head} promote ${result} { |${found}| => { ${found}.value = { ${bind([`${found}.value`, value])} ${splice(body)}; }; }, ~> { ${result} = Found[${type}].new(${value}); }, };`;
      if (bindings.length !== 2) throw new Error(`${op} expects |candidate, best| with a Bool comparator`);
      return `${head} promote ${result} { |${found}| => { if { ${bind(op === 'min_by' ? [value, `${found}.value`] : [`${found}.value`, value])} ${splice(body)}; } { ${found}.value = ${value}; }; }, ~> { ${result} = Found[${type}].new(${value}); }, };`;
    }
    if (op === 'partition') {
      const type = sourceTypeStr(param), yes = buffer(type, `yes${k}`, bound), no = buffer(type, `no${k}`, bound);
      finish = `[${yes.done}, ${no.done}]`;
      return `${head} if { ${bind([value])} ${splice(body)}; } { ${yes.add(value)} } else { ${no.add(value)} };`;
    }
    if (op === 'distinct_by' || op === 'group_by') return groupStage(k, value, { node, op, param, body, bind, head, buffer, name, splice, cleanup, alloc, setup, setFinish: text => { finish = text; } });
    if (op === 'batched' || op === 'windows') {
      const type = sourceTypeStr(param), width = name(`width${k}`);
      const arg = node.querySelector(':scope > [iterator-role="param"]');
      setup.push(`let ${width}: I32 = ${splice(arg)}; if ${width} <= 0 { fatal; };`);
      // Directly on the (possibly skip/take-narrowed) source: slice it, with
      // nothing to materialize and no element loop at all.
      const direct = k === first && !range;
      if (direct) skipLoop = true;
      const items = direct ? null : buffer(type, `items${k}`, bound);
      const data = direct ? source : items.array, count = direct ? `(${hi} - ${lo})` : items.length;
      const base = direct ? `${lo} + ` : '';
      const groups = name(`batches${k}`), total = name(`batchCount${k}`), j = name(`batchIndex${k}`), start = name(`batchStart${k}`);
      const span = op === 'windows'
        ? `if ${count} >= ${width} { ${count} - ${width} + 1; } else { 0; }`
        : `(${count} + ${width} - 1) / ${width}`;
      const sliceAt = s => `${data}.slice(${base}${s}, ${base}(if ${width} > ${count} - ${s} { ${count}; } else { ${s} + ${width}; }))`;
      cleanup.push(`let ${total}: I32 = ${span};
        let ${groups}: Array[Array[${type}]] = [];
        if ${total} > 0 { ${groups} = Array[Array[${type}]].new(${total}, ${sliceAt('0')}); };
        for (1 ..< ${total}) |${j}| { let ${start} = ${op === 'windows' ? j : `${j} * ${width}`}; ${groups}[${j}] = ${sliceAt(start)}; };`);
      finish = groups;
      return direct ? `${head} {}` : `${head} ${items.add(value)}`;
    }
    if (op === 'fold') {
      setup.push(`let ${result} = ${splice(param)};`);
      return `${head} ${result} = { ${bind([result, value])} ${splice(body)}; };`;
    }
    if (op === 'each') {
      finish = '{}';
      return `${head} { ${bind([value])} ${splice(body)}; };`;
    }
    if (op === 'collect' || op === 'sort') {
      const type = sourceTypeStr(param), out = buffer(type, `out${k}`, bound);
      if (op === 'collect') {
        finish = out.done;
      } else {
        if (bindings.length !== 2) throw new Error('sort expects |left, right| with a Bool comparator');
        const less = (a, b) => `{ let ${bindings[0]} = ${a}; let ${bindings[1]} = ${b}; ${splice(body)}; }`;
        const order = scalarOrder(body, bindings, type);
        cleanup.push(order
          ? radixSort({ name, type, array: out.array, length: out.length, descending: order === 'descending', fallback: mergeSort({ name, type, array: out.array, length: out.length, less, alloc, result, declare: false }), result })
          : mergeSort({ name, type, array: out.array, length: out.length, less, alloc, result }));
        finish = `if ${result}.len() == ${out.length} { ${result}; } else { ${result}.slice(0, ${out.length}); }`;
      }
      return `${head} ${out.add(value)}`;
    }
    if (op === 'fast_sum') {
      // Four running sums, rotated every element, so each addition waits on
      // the one four elements back instead of the previous one. Integer
      // results are exact; float results may round differently from `sum`.
      identityElement = value;
      const lanes = [1, 2, 3].map(lane => name(`lane${lane}`)), step = name('laneStep');
      elementTyped.push(...lanes);
      setup.push(`let ${result} = 0;`, ...lanes.map(lane => `let ${lane} = 0;`));
      finish = `(${result} + ${lanes[0]}) + (${lanes[1]} + ${lanes[2]})`;
      return `${head} let ${step} = ${result} + ${value}; ${result} = ${lanes[0]}; ${lanes[0]} = ${lanes[1]}; ${lanes[1]} = ${lanes[2]}; ${lanes[2]} = ${step};`;
    }
    if (op === 'sum' || op === 'product') {
      identityElement = value;
      setup.push(`let ${result} = ${op === 'sum' ? '0' : '1'};`);
      return `${head} ${result} ${op === 'sum' ? '+=' : '*='} ${value};`;
    }
    setup.push(`let ${result} = ${op === 'all' ? 'true' : op === 'any' ? 'false' : ['first_index', 'last_index'].includes(op) ? '-1' : '0'};`);
    if (op === 'count') return `${head} ${result} += 1;`;
    const test = `{ ${bind([value])} ${splice(body)}; }`;
    if (op === 'any') return `${head} if ${test} { ${result} = true; ${cancel(k)} };`;
    if (op === 'all') return `${head} if not ${test} { ${result} = false; ${cancel(k)} };`;
    if (op === 'count_where') return `${head} if ${test} { ${result} += 1; };`;
    return `${head} if ${test} { ${result} = ${ordinal}; ${op === 'first_index' ? `${cancel(k)}` : ''} };`;
  }

  const value = name('item');
  const loopBody = stageAt(first, value);
  // Cancellable pipelines test a stop flag; the rest are plain counted loops,
  // which codegen can unroll.
  const loop = skipLoop ? ''
    : usesStop
      ? `let ${index}: I32 = ${lo}; while (${index} < ${hi} and not ${stop}) { let ${value} = ${element(index)}; ${index} += 1; ${loopBody} };`
      : `for (${lo} ..< ${hi}) |${index}| { let ${value} = ${element(index)}; ${loopBody} };`;
  // Setup code (take(0), an empty zip) may already cancel, so the flag comes first.
  if (usesStop) setup.unshift(`let ${stop} = false; let ${stopAt}: I32 = -1;`);
  const cleanupText = cleanup.map(entry => (typeof entry === 'function' ? entry() : entry)).join(' ');
  const sourceText = `{ ${setup.join(' ')} ${loop} ${cleanupText} ${finish}; }`
    .replaceAll(STOP_CHECK, usesStop ? ` and not ${stop}` : '');
  const expanded = expressionFromSource(parser, sourceText, outer, splices, { createDocument });
  if (identityElement) {
    for (const accumulator of elementTyped) {
      const binding = expanded.querySelector(`ir-let[name="${accumulator}"]`);
      if (binding) binding.dataset.iteratorElement = identityElement;
    }
  }
  return expanded;
}

// Calls a fusable stage may make: conversions and reads with no effects.
const PURE_METHODS = new Set(['to_i32', 'to_u32', 'to_i64', 'to_u64', 'to_f32', 'to_f64', 'len', 'abs', 'sqrt', 'min', 'max']);

/**
 * A parenthesized `… collect(T)` pipeline whose stages cannot observe being
 * interleaved with the stages that consume it: no assignments outside their
 * own locals, no calls other than pure conversions, no awaits. Returns its
 * stages (without the collect) and source, or null.
 */
function fusableCollect(input) {
  const inner = input?.localName === 'ir-paren' && input.children.length === 1 ? input.firstElementChild : null;
  if (inner?.localName !== 'ir-iterator' || inner.getAttribute('op') !== 'collect') return null;
  const stages = [];
  let source = inner.firstElementChild;
  while (source?.localName === 'ir-iterator') {
    stages.unshift(source);
    source = source.firstElementChild;
  }
  if (!stages.every(stage => !terminals.has(stage.getAttribute('op')) && isPureStage(stage))) return null;
  return { stages, input: source };
}

function isPureStage(stage) {
  // Everything except the first child (the upstream pipeline): parameters, captures, body.
  const parts = [...stage.children].slice(1);
  return parts.every(part => {
    const nodes = [part, ...part.querySelectorAll('*')];
    const locals = new Set(nodes.filter(node => node.localName === 'ir-let').map(node => node.getAttribute('name')));
    for (const node of nodes) {
      if (['ir-await', 'ir-dsl', 'ir-iterator', 'ir-yield', 'ir-return', 'ir-break', 'ir-continue'].includes(node.localName)) return false;
      if (node.localName === 'ir-assign') {
        const target = node.firstElementChild;
        if (target?.localName !== 'ir-ident' || !locals.has(target.getAttribute('name'))) return false;
      }
      if (node.localName === 'ir-call') {
        const callee = node.firstElementChild;
        const method = callee?.getAttribute('field') ?? callee?.getAttribute('method');
        if (!['ir-field-access', 'ir-type-member'].includes(callee?.localName) || !PURE_METHODS.has(method)) return false;
      }
    }
    return true;
  });
}

/**
 * distinct_by / group_by: a linear table of keys (O(n·g) comparisons for g
 * distinct keys), outputs and per-group values in growable buffers.
 */
function groupStage(k, value, { node, op, param, body, bind, head, buffer, name, splice, cleanup, alloc, setFinish, setup }) {
  const type = sourceTypeStr(param), keyType = sourceTypeStr(node.querySelector(':scope > [iterator-role="key"]'));
  const keys = buffer(keyType, `keys${k}`), key = name(`key${k}`), j = name(`search${k}`);
  const out = buffer(op === 'group_by' ? `Group[${keyType}, ${type}]` : type, `out${k}`);
  setFinish(out.done);
  const computeKey = `let ${key} = { ${bind([value])} ${splice(body)}; };`;
  let search, inserted = '';
  const hash = HASHED_KEYS[keyType];
  if (hash) {
    // Integer keys: open addressing with linear probing. Slots hold group
    // index + 1, so a zeroed table is empty. Doubles past half full: O(n).
    const slots = name(`slots${k}`), mask = name(`mask${k}`), at = name(`slot${k}`), probe = name(`probe${k}`), g = name(`rehash${k}`);
    const hashOf = v => `(${hash(v, name(`h${k}`))} & ${mask})`;
    setup.push(`let ${mask}: I32 = 15; let ${slots} = Array[I32].new_default(16);`);
    search = `${computeKey} let ${at} = ${hashOf(key)}; let ${j}: I32 = -1;
      while (${j} < 0) {
        let ${probe} = ${slots}[${at}];
        if ${probe} == 0 { ${j} = ${keys.length}; }
        else if ${keys.array}[${probe} - 1] == ${key} { ${j} = ${probe} - 1; }
        else { ${at} = (${at} + 1) & ${mask}; };
      };`;
    inserted = `${slots}[${at}] = ${keys.length};
      if ${keys.length} * 2 > ${mask} {
        ${mask} = ${mask} * 2 + 1;
        ${slots} = Array[I32].new_default(${mask} + 1);
        for (0 ..< ${keys.length}) |${g}| {
          let ${at} = ${hashOf(`${keys.array}[${g}]`)};
          while (${slots}[${at}] != 0) { ${at} = (${at} + 1) & ${mask}; };
          ${slots}[${at}] = ${g} + 1;
        };
      };`;
  } else {
    // Other key types: a linear table, O(n·g) for g distinct keys.
    search = `${computeKey} let ${j}: I32 = 0; while (${j} < ${keys.length}) { if ${keys.array}[${j}] == ${key} { break; }; ${j} += 1; };`;
  }
  if (op === 'distinct_by') return `${head} ${search} if ${j} == ${keys.length} { ${keys.add(key)} ${out.add(value)} ${inserted} };`;
  const group = name(`group${k}`), lengths = buffer('I32', `lengths${k}`);
  const size = name(`size${k}`), grown = name(`groupGrown${k}`);
  cleanup.push(`for (0 ..< ${out.length}) |${j}| { let ${group} = ${out.array}[${j}]; ${group}.values = ${group}.values.slice(0, ${lengths.array}[${j}]); };`);
  return `${head} ${search} if ${j} == ${keys.length} {
    ${keys.add(key)} ${lengths.add('0')} ${out.add(`Group[${keyType}, ${type}].new(${key})`)} ${inserted}
  }; let ${group} = ${out.array}[${j}]; let ${size} = ${lengths.array}[${j}];
  if ${size} == ${group}.values.len() {
    let ${grown} = ${alloc(type, `if ${size} == 0 { 4; } else { ${size} * 2; }`, value)};
    ${grown}.copy_from(0, ${group}.values, 0, ${size});
    ${group}.values = ${grown};
  }; ${group}.values[${size}] = ${value}; ${lengths.array}[${j}] += 1;`;
}

// Key hashes for open addressing: fold to 32 bits, Fibonacci-multiply, mix.
const HASHED_KEYS = {
  I32: (v, h) => `{ let ${h} = ${v} * -1640531527; ${h} ^ (${h} >>> 15); }`,
  U32: (v, h) => `{ let ${h} = (${v}).to_i32() * -1640531527; ${h} ^ (${h} >>> 15); }`,
  I64: (v, h) => `{ let ${h} = ((${v}) ^ ((${v}) >>> 32)).to_i32() * -1640531527; ${h} ^ (${h} >>> 15); }`,
  U64: (v, h) => `{ let ${h} = ((${v}) ^ ((${v}) >>> 32)).to_i32() * -1640531527; ${h} ^ (${h} >>> 15); }`,
};

/**
 * Stable sort of array[0 .. length): insertion-sort runs of SORT_RUN, then
 * bottom-up merges into a second buffer. Already-ordered neighbouring runs are
 * copied without comparing. `less` must be a strict "left before right".
 * Leaves the sorted values in `result` (which may be longer than `length`).
 */
function mergeSort({ name, type, array, length, less, alloc, result, declare = true }) {
  const n = length, a = name('sortArray');
  const lo = name('sortLo'), hi = name('sortHi'), i = name('sortI'), j = name('sortJ'), k = name('sortK'), x = name('sortValue');
  const from = name('sortFrom'), to = name('sortTo'), width = name('sortWidth'), mid = name('sortMid'), swap = name('sortSwap');
  const left = name('sortLeft'), right = name('sortRight');
  return `let ${a} = ${array}; ${declare ? `let ${result}: Array[${type}] = ${a};` : `${result} = ${a};`}
    if ${n} > 1 {
      let ${lo}: I32 = 0;
      while (${lo} < ${n}) {
        let ${hi} = if ${lo} + ${SORT_RUN} < ${n} { ${lo} + ${SORT_RUN}; } else { ${n}; };
        let ${i} = ${lo} + 1;
        while (${i} < ${hi}) {
          let ${x} = ${a}[${i}];
          let ${j} = ${i};
          while (${j} > ${lo} and ${less(x, `${a}[${j} - 1]`)}) { ${a}[${j}] = ${a}[${j} - 1]; ${j} -= 1; };
          ${a}[${j}] = ${x};
          ${i} += 1;
        };
        ${lo} = ${hi};
      };
      let ${from} = ${a};
      let ${to} = ${alloc(type, n, `${a}[0]`)};
      let ${width}: I32 = ${SORT_RUN};
      while (${width} < ${n}) {
        let ${lo}: I32 = 0;
        while (${lo} < ${n}) {
          let ${mid} = if ${width} < ${n} - ${lo} { ${lo} + ${width}; } else { ${n}; };
          let ${hi} = if ${width} < ${n} - ${mid} { ${mid} + ${width}; } else { ${n}; };
          if ${mid} >= ${hi} or not ${less(`${from}[${mid}]`, `${from}[${mid} - 1]`)} {
            ${to}.copy_from(${lo}, ${from}, ${lo}, ${hi} - ${lo});
          } else {
            // Merge while both runs have elements, then copy the remainder in
            // bulk. (A select-based branchless merge measured slower on both
            // V8 and JSC: it serializes on the comparison result.)
            let ${i} = ${lo};
            let ${j} = ${mid};
            let ${k} = ${lo};
            while (${i} < ${mid} and ${j} < ${hi}) {
              let ${left} = ${from}[${i}];
              let ${right} = ${from}[${j}];
              if ${less(right, left)} {
                ${to}[${k}] = ${right};
                ${j} += 1;
              } else {
                ${to}[${k}] = ${left};
                ${i} += 1;
              };
              ${k} += 1;
            };
            ${to}.copy_from(${k}, ${from}, ${i}, ${mid} - ${i});
            ${to}.copy_from(${k} + ${mid} - ${i}, ${from}, ${j}, ${hi} - ${j});
          };
          ${lo} = ${hi};
        };
        let ${swap} = ${from};
        ${from} = ${to};
        ${to} = ${swap};
        ${width} *= 2;
      };
      ${result} = ${from};
    };`;
}

/**
 * `sort(I32) |a, b| { a < b; }` (or `>`) on a bare 32-bit integer: equal
 * elements are indistinguishable, so stability is unobservable and an O(n)
 * radix sort gives the same result as the stable merge sort.
 */
function scalarOrder(body, bindings, type) {
  if (type !== 'I32' && type !== 'U32') return null;
  const statements = [...(body?.children ?? [])];
  const comparison = statements.length === 1 ? statements[0] : null;
  if (comparison?.localName !== 'ir-binary' || !['<', '>'].includes(comparison.getAttribute('op'))) return null;
  const [left, right] = [...comparison.children];
  const names = [left, right].map(node => (node?.localName === 'ir-ident' ? node.getAttribute('name') : null));
  if (names[0] !== bindings[0] || names[1] !== bindings[1]) return null;
  return comparison.getAttribute('op') === '<' ? 'ascending' : 'descending';
}

/**
 * LSD radix sort of array[0 .. length) in two passes of 16 bits. Signed keys
 * flip their top bit so negative numbers order first. Short inputs use the
 * merge sort instead. Leaves the result in `result`.
 */
function radixSort({ name, type, array, length, descending, fallback, result }) {
  const n = length, a = name('radixArray'), tmp = name('radixTemp'), counts = name('radixCounts');
  const i = name('radixI'), digit = name('radixDigit'), value = name('radixValue'), half = name('radixHalf');
  const flip = type === 'I32' ? ' ^ 32768' : '';
  // Digits index the count table, which takes I32.
  const index = text => (type === 'U32' ? `(${text}).to_i32()` : `(${text})`);
  const pass = (from, to, key) => `
      ${counts} = Array[I32].new_default(65537);
      for (0 ..< ${n}) |${i}| { ${counts}[${key(`${from}[${i}]`)} + 1] += 1; };
      for (1 ..< 65537) |${digit}| { ${counts}[${digit}] += ${counts}[${digit} - 1]; };
      for (0 ..< ${n}) |${i}| {
        let ${value} = ${from}[${i}];
        let ${digit} = ${key(value)};
        ${to}[${counts}[${digit}]] = ${value};
        ${counts}[${digit}] += 1;
      };`;
  const reverse = descending ? `
      for (0 ..< ${n} / 2) |${i}| {
        let ${value} = ${a}[${i}];
        ${a}[${i}] = ${a}[${n} - 1 - ${i}];
        ${a}[${n} - 1 - ${i}] = ${value};
      };` : '';
  return `let ${result}: Array[${type}] = ${array};
    if ${n} >= ${RADIX_MIN} {
      let ${a} = ${array};
      let ${tmp} = Array[${type}].new_default(${n});
      let ${counts} = Array[I32].new_default(0);
      ${pass(a, tmp, v => index(`${v} & 65535`))}
      ${pass(tmp, a, v => index(`(${v} >>> 16)${flip}`))}
      ${reverse}
      ${result} = ${a};
    } else {
      ${fallback}
    };`;
}

/** Binary partition search over a materialized array: first index where the predicate is false. */
function lowerBisect(stages, input, { name, splice, source, splices, outer, parser, createDocument }) {
  if (stages.length !== 1) throw new Error('bisect requires a materialized sorted array; parenthesize a collect or sort first');
  const node = stages[0], bindings = node.querySelector(':scope > ir-capture').getAttribute('names').split(',');
  if (bindings.length < 1 || bindings.length > 2) throw new Error('bisect expects |value, index| (index optional) and a monotone true-prefix predicate');
  const base = name('base'), size = name('size'), half = name('half'), mid = name('mid'), n = name('n');
  // Over a range (a..<b) the values are a + position, and the result is a position.
  const range = input.localName === 'ir-range';
  const start = name('start');
  const predicate = at => `{ let ${bindings[0]} = ${range ? `${start} + ${at}` : `${source}[${at}]`}; ${bindings[1] ? `let ${bindings[1]} = ${at}.to_u32().to_u64();` : ''} ${splice(node.querySelector(':scope > ir-block'))}; }`;
  // Branchless search: the answer stays in [base, base + size]. Each probe
  // moves base with a select instead of a data-dependent branch, so random
  // queries cost no mispredictions. The predicate runs about log2(n) + 1 times.
  const head = range
    ? `let ${start}: I32 = ${splice(input.firstElementChild)}; let ${n}: I32 = ${splice(input.lastElementChild)}${input.getAttribute('inclusive') === 'true' ? ' + 1' : ''} - ${start}; if ${n} < 0 { ${n} = 0; };`
    : `let ${source} = ${splice(input)}; let ${n} = ${source}.len();`;
  const code = `{ ${head}
    if ${n} == 0 { 0; } else {
      let ${base}: I32 = 0;
      let ${size} = ${n};
      while (${size} > 1) {
        let ${half} = ${size} >>> 1;
        let ${mid} = ${base} + ${half};
        ${base} = if ${predicate(mid)} { ${mid}; } else { ${base}; };
        ${size} -= ${half};
      };
      ${base} + (if ${predicate(base)} { 1; } else { 0; });
    }; }`;
  return expressionFromSource(parser, code, outer, splices, { createDocument });
}
