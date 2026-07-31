// Immutable, source-addressable queries over retained analysis graphs.
//
// Editor integrations consume these DTOs instead of depending on graph Maps,
// live DOM nodes, or compiler phase-local storage shapes.

import { nodeRef } from './diagnostics.js';

export function createAnalysisQueries(doc, graphs, rangeIndex, snippetAt = () => null) {
  const program = graphs.program;
  const types = graphs.types;
  const scope = graphs.scope;
  const calls = graphs.calls;

  const nodeAt = (file, offset) => {
    const hits = rangeIndex(file, offset, offset + 1, { kind: 'ir' });
    const candidates = hits.map(entry => ({ entry, node: nodeForEntry(entry) })).filter(item => item.node);
    candidates.sort((a, b) => ((a.entry.end - a.entry.start) - (b.entry.end - b.entry.start))
      || (domDepth(b.node) - domDepth(a.node)));
    if (candidates[0]) return candidates[0].node;
    return null;
  };

  const nodeForEntry = entry => program?.byId.get(entry?.id)
    ?? program?.byOrigin.get(entry?.originId)?.[0]
    ?? doc?.getElementById?.(entry?.id)
    ?? null;

  const ref = (node, extra = {}) => {
    if (!node) return null;
    const location = nodeRef(node);
    return compact({ ...location, snippet: snippetAt(location.file, location.start, location.end), ...extra });
  };
  const source = edge => typeof edge?.source === 'function' ? edge.source() : edge?.source;
  const displayType = createTypeDisplay(types?.typeIndex);
  const displayNodeName = node => displayName(node, displayType);

  function explainAt(file, offset) {
    const node = nodeAt(file, offset);
    if (!node) return null;
    const slot = types?.slots.get(node);
    const declaration = scope?.resolutions.get(node.id) ?? null;
    const fn = slot?.function ?? calls?.targets.get(node.id) ?? null;
    const field = slot?.field ?? null;
    const surface = node.closest?.('ir-fn, ir-closure, ir-export-main, ir-test, ir-bench');
    const captures = node.localName === 'ir-closure'
      ? scope?.captures.get(node.id)
      : node.closest?.('ir-closure') ? scope?.captures.get(node.closest('ir-closure').id) : null;
    const loopCapture = node.localName === 'ir-capture' ? describeLoopCapture(node) : null;
    const expectations = (slot?.expected ?? []).map(edge => compact({
      type: displayType(edge.read?.() ?? null),
      site: edge.site ?? null,
      mode: edge.mode ?? null,
      label: typeof edge.label === 'function' ? edge.label(edge.read?.()) : edge.label ?? null,
      source: ref(source(edge)),
    })).filter(item => item.type);
    const coercions = (types?.coercions ?? []).filter(item => item.node === node).map(item => compact({
      from: displayType(item.from), to: displayType(item.to), kind: item.kind, site: item.edge?.site ?? null,
    }));
    const backend = graphs.backend;
    return freezeDto(compact({
      node: ref(node, {
        tag: node.localName,
        displayName: displayNodeName(node),
      }),
      actualType: displayType(slot?.actual ?? loopCapture?.bindings[0]?.type ?? backend?.nodeTypes.get(node.id) ?? null),
      internalType: slot?.actual ?? backend?.nodeTypes.get(node.id) ?? null,
      inferenceSource: slot?.inferenceSource ?? slot?.rule?.source ?? null,
      expectations,
      actualTrace: actualTrace(node),
      declaration: ref(declaration, { displayName: displayNodeName(declaration) }),
      resolvedFunction: ref(fn, { displayName: displayNodeName(fn), resolvedAs: slot?.resolution?.resolvedAs ?? null }),
      field: field ? compact({ owner: displayType(field.owner), type: displayType(field.type), index: field.index, declaration: ref(field.declaration) }) : null,
      coercions,
      surface: ref(surface, { displayName: displayName(surface) }),
      effects: surface?.id ? [...(calls?.effects.get(surface.id) ?? [])].sort() : [],
      captures: captures ? [...captures].map(([name, declaration]) => ({ name, declaration: ref(declaration) })) : [],
      loopCapture,
      provenance: provenanceTrace(node),
      representation: node.dataset?.typeRepr ?? null,
      backend: backend ? compact({
        type: displayType(backend.nodeTypes.get(node.id) ?? null),
        expected: displayType(backend.expectations.get(node.id) ?? null),
        callTargetId: backend.callTargets.get(node.id) ?? null,
      }) : null,
    }));
  }

  function describeLoopCapture(capture) {
    const loop = capture.closest?.('ir-for');
    const names = (capture.getAttribute('names') ?? '').split(',').map(name => name.trim()).filter(Boolean);
    const uses = [...(scope?.resolutions ?? [])]
      .filter(([, declaration]) => declaration === capture)
      .map(([id]) => program?.byId.get(id)).filter(Boolean);
    const sources = [...(loop?.querySelectorAll(':scope > ir-for-source') ?? [])].map(sourceNode => {
      const value = sourceNode.firstElementChild ?? sourceNode;
      return compact({ type: displayType(types?.slots.get(value)?.actual), node: ref(value, { displayName: displayNodeName(value) }) });
    });
    return freezeDto({
      kind: 'loop variable',
      bindings: names.map(name => {
        const namedUses = uses.filter(use => use.getAttribute('name') === name);
        const type = namedUses.map(use => types?.slots.get(use)?.actual).find(Boolean) ?? null;
        return { name, type: displayType(type), uses: namedUses.length, references: namedUses.map(use => ref(use)) };
      }),
      sources,
      loop: ref(loop, { displayName: 'for loop' }),
    });
  }

  function actualTrace(start) {
    const trace = [];
    const seen = new Set();
    let node = start;
    while (node && !seen.has(node)) {
      seen.add(node);
      const slot = types?.slots.get(node);
      trace.push(compact({
        type: displayType(slot?.actual ?? null),
        reason: slot?.inferenceSource ?? slot?.rule?.source ?? 'known',
        node: ref(node, { displayName: displayNodeName(node) }),
      }));
      const dependency = slot?.rule?.deps?.find(dep => types?.slots.get(dep)?.actual === slot.actual)
        ?? slot?.rule?.deps?.[0];
      if (!dependency) break;
      node = dependency;
    }
    return trace;
  }

  function provenanceTrace(start) {
    const trace = [];
    const seen = new Set();
    let node = start;
    while (node && !seen.has(node)) {
      seen.add(node);
      const fact = program?.provenance.find(item => item.node === node);
      if (!fact) break;
      trace.push(compact({
        pass: fact.pass,
        kind: fact.rewriteKind,
        generated: ref(node),
        source: ref(fact.source),
      }));
      node = fact.source;
    }
    return trace;
  }

  function definitionAt(file, offset) {
    const node = nodeAt(file, offset);
    if (!node) return null;
    const slot = types?.slots.get(node);
    const target = scope?.resolutions.get(node.id)
      ?? slot?.field?.declaration
      ?? slot?.function
      ?? calls?.targets.get(node.id)
      ?? graphs.elaboration?.requests.get(node.id)?.target
      ?? (node.localName === 'ir-fn-name' ? node.closest?.('ir-fn, ir-extern-fn') : null)
      ?? (node.localName?.startsWith('ir-type-') ? types?.typeIndex?.get(node.getAttribute?.('name'))?.decl : null)
      ?? (isDeclaration(node) ? node : null);
    return freezeDto(ref(target, { displayName: displayNodeName(target) }));
  }

  function referencesAt(file, offset, { includeDeclaration = false } = {}) {
    const declarationRef = definitionAt(file, offset);
    if (!declarationRef?.id) return [];
    const declaration = program?.byId.get(declarationRef.id) ?? doc?.getElementById?.(declarationRef.id);
    if (!declaration) return [];
    const found = new Map();
    const add = node => {
      const value = ref(node);
      if (value?.file && value.start != null) found.set(`${value.file}:${value.start}:${value.end}`, value);
    };
    if (includeDeclaration) add(declaration);
    for (const [id, target] of scope?.resolutions ?? []) if (target === declaration) add(program?.byId.get(id));
    for (const [node, slot] of types?.slots ?? []) {
      if (slot.function === declaration || slot.field?.declaration === declaration) add(node);
    }
    for (const edge of calls?.edges ?? []) if (edge.declaration === declaration) add(edge.call);
    return freezeDto([...found.values()].sort(compareRefs));
  }

  function prepareCallHierarchy(file, offset) {
    const node = nodeAt(file, offset);
    if (!node) return null;
    const slot = types?.slots.get(node);
    const target = slot?.function ?? calls?.targets.get(node.id)
      ?? node.closest?.('ir-fn, ir-closure, ir-export-main, ir-test, ir-bench');
    if (!target?.id || !calls?.functions.has(target.id)) return null;
    return callableDto(target);
  }

  function incomingCalls(id) {
    return groupedCalls((calls?.edges ?? []).filter(edge => edge.to === id), 'from');
  }

  function outgoingCalls(id) {
    return groupedCalls((calls?.edges ?? []).filter(edge => edge.from === id && edge.to), 'to');
  }

  function groupedCalls(edges, endpoint) {
    const groups = new Map();
    for (const edge of edges) {
      const functionFact = calls?.functions.get(edge[endpoint]);
      if (!functionFact) continue;
      const group = groups.get(functionFact.id) ?? { item: callableDto(functionFact.node), sites: [] };
      group.sites.push(ref(edge.call));
      groups.set(functionFact.id, group);
    }
    return freezeDto([...groups.values()]);
  }

  function callableDto(node) {
    return freezeDto(compact({
      ...ref(node, { displayName: displayNodeName(node), tag: node.localName }),
      effects: [...(calls?.effects.get(node.id) ?? [])].sort(),
    }));
  }

  function inlayHintsForFile(file) {
    const hints = [];
    const add = (node, label, kind, tooltip) => {
      const location = ref(node);
      if (location?.file !== file || location.end == null) return;
      hints.push({ position: location.end, label, kind, tooltip, node: location });
    };
    for (const [node, slot] of types?.slots ?? []) {
      if (node.localName === 'ir-let' && slot.actual && !hasExplicitType(node)) {
        add(node, `: ${displayType(slot.actual)}`, 'type', `Inferred from ${slot.inferenceSource ?? slot.rule?.source ?? 'the initializer'}`);
      }
    }
    for (const [id, captures] of scope?.captures ?? []) {
      if (!captures?.size) continue;
      const node = program?.byId.get(id);
      const names = [...captures.keys()];
      add(node, ` captures ${names.join(', ')}`, 'parameter', `Closure environment: ${names.join(', ')}`);
    }
    for (const { node, from, to, kind } of types?.coercions ?? []) {
      add(node, ` → ${displayType(to)}`, 'type', `Implicit ${kind} conversion from ${displayType(from)} to ${displayType(to)}`);
    }
    for (const [id, effects] of calls?.effects ?? []) {
      if (!effects.size) continue;
      const node = calls.functions.get(id)?.node;
      add(node, ` effects: ${[...effects].sort().join(', ')}`, 'parameter', 'Includes transitive effects from callees');
    }
    return freezeDto(hints.sort((a, b) => a.position - b.position));
  }

  return Object.freeze({
    explainAt,
    definitionAt,
    referencesAt,
    prepareCallHierarchy,
    incomingCalls,
    outgoingCalls,
    inlayHintsForFile,
  });
}

function domDepth(node) {
  let depth = 0;
  for (let current = node?.parentElement; current; current = current.parentElement) depth++;
  return depth;
}

function createTypeDisplay(typeIndex) {
  const exact = new Map();
  const resolving = new Set();
  const displayExact = name => {
    if (!name || exact.has(name)) return exact.get(name) ?? name;
    if (resolving.has(name)) return name;
    resolving.add(name);
    const entry = typeIndex?.get(name);
    let value = entry?.decl?.dataset?.displayName ?? name;
    if (value === name && entry?.moduleBase && entry?.moduleArgs) {
      try {
        const args = JSON.parse(entry.moduleArgs);
        if (Array.isArray(args)) value = `${entry.moduleBase}[${args.map(displayType).join(', ')}]`;
      } catch { /* retain the canonical name */ }
    }
    exact.set(name, value);
    resolving.delete(name);
    return value;
  };
  const names = [...(typeIndex?.keys() ?? [])].filter(name => name.includes('__'))
    .sort((a, b) => b.length - a.length);
  function displayType(type) {
    if (!type) return type;
    if (typeIndex?.has(type)) return displayExact(type);
    let value = String(type);
    for (const name of names) {
      if (!value.includes(name)) continue;
      value = value.split(name).join(displayExact(name));
    }
    return value;
  }
  return displayType;
}

function displayName(node, displayType = value => value) {
  if (!node) return '';
  const named = node.dataset?.displayName
    ?? (node.localName === 'ir-capture' ? node.getAttribute?.('names') : null)
    ?? node.getAttribute?.('name')
    ?? node.getAttribute?.('field')
    ?? node.getAttribute?.('label');
  if (named) {
    const dot = named.indexOf('.');
    if (dot > 0) return `${displayType(named.slice(0, dot))}${named.slice(dot)}`;
    return displayType(named);
  }
  const operator = node.getAttribute?.('operator') ?? node.getAttribute?.('op');
  if (operator) return `${operator} expression`;
  return ({
    'ir-export-main': 'main',
    'ir-binary': 'binary expression',
    'ir-unary': 'unary expression',
    'ir-lit': `${node.getAttribute?.('kind') ?? ''} literal`.trim(),
    'ir-call': 'function call',
    'ir-closure': 'closure',
    'ir-block': 'block result',
    'ir-return': 'return value',
    'ir-if': 'conditional expression',
    'ir-match': 'match expression',
    'ir-alt': 'enum alternative',
    'ir-await': 'awaited value',
  })[node.localName] ?? node.localName?.replace(/^ir-/, '').replace(/-/g, ' ') ?? '';
}

function isDeclaration(node) {
  return /^(ir-(fn|extern-fn|let|global|param|self-param|capture|struct|enum|protocol|module)|ir-export-main)$/.test(node?.localName ?? '');
}

function hasExplicitType(node) {
  return [...(node?.children ?? [])].some(child => child.localName?.startsWith('ir-type-'));
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ''));
}

function freezeDto(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) freezeDto(child);
  return Object.freeze(value);
}

function compareRefs(a, b) {
  return String(a.file).localeCompare(String(b.file)) || (a.start - b.start) || (a.end - b.end);
}
