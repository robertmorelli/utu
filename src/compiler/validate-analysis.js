import { declaredTypeStr, fnReturnType, isFunctionDecl, paramsOf } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';
import { typeEntryDecl } from './link-type-decls.js';
import { retainedGraphs } from './graph-store.js';
import { nodesOf } from './program-index.js';

export function validateAnalysis(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;

  const ctx = { typeIndex, program: retainedGraphs(doc).program };

  // Type compatibility is checked once by checkTypeGraph. What remains here
  // are structural and language-domain validations, not type comparisons.
  validateAssignmentTargets(root, retainedGraphs(doc).scope, ctx.program);
  validateBreakTargets(root, ctx.program);
  validateForSources(root, ctx.program);
  validateGlobalInitializers(root, ctx.program);
  validateDuplicateBindings(root, ctx.program);
  validateStructDeclarations(root, ctx.program);
  validateStructInits(root, typeIndex, ctx.program);
  validateProtocolImplementations(root, ctx.program);
  validateNullableTypes(root, typeIndex, ctx.program);
  validateNullLiterals(root, ctx.program);
  validateIntegerLiterals(root, ctx.program);
  validateArrayDefaultConstruction(root, typeIndex, ctx.program);
  validateExhaustiveAltsAndMatches(root, ctx);
  validateRecursiveStructs(doc, typeIndex);
  validateResidualEsDsls(root, ctx.program);
}

function validateAssignmentTargets(root, scopeGraph, program) {
  for (const assign of program ? nodesOf(program, 'ir-assign') : root.querySelectorAll('ir-assign')) {
    const [lhs, rhs] = [...assign.children];
    if (!lhs || !rhs) continue;
    if (lhs.localName !== 'ir-ident' && lhs.localName !== 'ir-field-access' && lhs.localName !== 'ir-index') {
      stampDiagnostic(lhs, DIAGNOSTIC_KINDS.INVALID_ASSIGNMENT_TARGET, 'Invalid assignment target');
      continue;
    }
    if (lhs.localName === 'ir-ident') {
      const decl = scopeGraph?.resolutions.get(lhs.id);
      if (decl?.localName === 'ir-global' || isFunctionDecl(decl)) {
        stampDiagnostic(lhs, DIAGNOSTIC_KINDS.ASSIGNMENT_TO_IMMUTABLE, `Cannot assign to immutable '${lhs.getAttribute('name')}'`, {
          name: lhs.getAttribute('name'),
          bindingKind: decl.localName,
          relatedNodes: [{ node: decl, label: `'${lhs.getAttribute('name')}' is declared immutable here` }],
        });
      }
    }
  }
}

function validateForSources(root, program) {
  for (const loop of program ? nodesOf(program, 'ir-for') : root.querySelectorAll('ir-for')) {
    const sources = [...loop.querySelectorAll(':scope > ir-for-source')];
    const capture = loop.querySelector(':scope > ir-capture');
    const names = (capture?.getAttribute('names') ?? '').split(',').filter(Boolean);
    if (names.length && names.length !== sources.length) {
      stampDiagnostic(capture, DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE,
        `for has ${sources.length} range source(s) but ${names.length} capture(s)`);
      continue;
    }
    const types = sources.map(source => source.firstElementChild?.dataset.typeName
      ?? source.lastElementChild?.dataset.typeName).filter(Boolean);
    const invalid = types.find(type => !['I32', 'U32', 'I64', 'U64'].includes(type));
    if (invalid) {
      stampDiagnostic(loop, DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE,
        `for range type '${invalid}' is not an integer scalar`, { type: invalid });
      continue;
    }
    if (names.length > 1 && new Set(types).size > 1) {
      stampDiagnostic(loop, DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE,
        'zipped for ranges must use the same integer type', { types });
    }
  }
}

function validateGlobalInitializers(root, program) {
  for (const global of program ? nodesOf(program, 'ir-global') : root.querySelectorAll('ir-global')) {
    const init = global.lastElementChild;
    if (init?.localName === 'ir-lit' || init?.localName === 'ir-null-ref') continue;
    stampDiagnostic(init ?? global, DIAGNOSTIC_KINDS.INVALID_GLOBAL_INITIALIZER,
      `Global '${global.getAttribute('name') ?? ''}' requires a literal constant initializer`, {
        name: global.getAttribute('name') ?? null,
      });
  }
}

function validateBreakTargets(root, program) {
  for (const node of program ? nodesOf(program, 'ir-break') : root.querySelectorAll('ir-break')) {
    let parent = node.parentElement;
    let loop = null;
    while (parent) {
      if (parent.localName === 'ir-while' || parent.localName === 'ir-for') { loop = parent; break; }
      if (parent.localName === 'ir-fn' || parent.localName === 'ir-closure') break;
      parent = parent.parentElement;
    }
    if (!loop) stampDiagnostic(node, DIAGNOSTIC_KINDS.INVALID_BREAK, 'break must appear inside a loop');
  }
}

function validateResidualEsDsls(root, program) {
  const nodes = program ? nodesOf(program, 'ir-dsl') : root.querySelectorAll('ir-dsl');
  for (const node of nodes) {
    if (node.getAttribute('name') !== 'es') continue;
    stampDiagnostic(node, DIAGNOSTIC_KINDS.INVALID_DSL_USAGE, '@es DSL must appear on the right-hand side of a typed let binding (let X: T = @es/\\...\\/)', {
      name: 'es',
    });
  }
}


function validateDuplicateBindings(root, program) {
  for (const params of root.querySelectorAll('ir-param-list')) {
    diagnoseDuplicateNames([...params.querySelectorAll(':scope > ir-param')], 'parameter');
  }
  for (const block of program ? nodesOf(program, 'ir-block') : root.querySelectorAll('ir-block')) {
    diagnoseDuplicateNames([...block.children].filter(child => child.localName === 'ir-let'), 'local binding');
  }
}

function diagnoseDuplicateNames(nodes, label) {
  const seen = new Map();
  for (const node of nodes) {
    const name = node.getAttribute('name');
    if (!name) continue;
    const first = seen.get(name);
    if (!first) { seen.set(name, node); continue; }
    stampDiagnostic(node, DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION,
      `Duplicate ${label} '${name}'`, { name, relatedNodes: [{ node: first, label: `First '${name}' is here` }] });
  }
}

function validateStructDeclarations(root, program) {
  for (const decl of program ? nodesOf(program, 'ir-struct', 'ir-variant', 'ir-enum') : root.querySelectorAll('ir-struct, ir-variant, ir-enum')) {
    if (decl.localName === 'ir-enum') {
      diagnoseDuplicateNames([...decl.querySelectorAll(':scope > ir-variant')], 'variant');
      continue;
    }
    const seen = new Set();
    for (const field of decl.querySelectorAll(':scope > ir-field')) {
      const name = field.getAttribute('name');
      if (!name || !seen.has(name)) { if (name) seen.add(name); continue; }
      stampDiagnostic(field, DIAGNOSTIC_KINDS.DUPLICATE_FIELD,
        `Duplicate field '${name}' in ${decl.getAttribute('name') ?? 'type'}`, { field: name, type: decl.getAttribute('name') });
    }
  }
}

function validateProtocolImplementations(root, program) {
  const protocols = new Map([...root.querySelectorAll(':scope > ir-proto')]
    .map(proto => [proto.getAttribute('name'), proto]));
  const functions = [...root.querySelectorAll(':scope > ir-fn')];
  const implementors = [...root.querySelectorAll(':scope > ir-struct'),
    ...[...root.querySelectorAll(':scope > ir-enum')].flatMap(type => [...type.querySelectorAll(':scope > ir-variant')])];
  for (const type of implementors) {
    const typeName = type.getAttribute('name');
    const declaration = type.localName === 'ir-variant' ? type.parentElement : type;
    const implemented = (declaration.querySelector(':scope > ir-impl-list')?.getAttribute('impls') ?? '')
      .split(',').map(name => name.trim()).filter(Boolean);
    for (const protocolName of implemented) {
      const protocol = protocols.get(protocolName);
      if (!protocol) continue;
      for (const member of protocol.children) {
        const name = member.getAttribute('name');
        if (!name) continue;
        if (member.localName === 'ir-proto-get' || member.localName === 'ir-proto-set'
          || member.localName === 'ir-proto-get-set') {
          const field = [...type.querySelectorAll(':scope > ir-field')].find(item => item.getAttribute('name') === name);
          if (!field || declaredTypeStr(field) !== declaredTypeStr(member)) {
            stampDiagnostic(type, DIAGNOSTIC_KINDS.UNKNOWN_METHOD,
              `${typeName} does not implement protocol getter '${protocolName}.${name}'`, { protocol: protocolName, member: name });
          }
          continue;
        }
        if (member.localName !== 'ir-proto-method') continue;
        const implementation = functions.find(fn => {
          const fnName = fn.querySelector(':scope > ir-fn-name');
          return fnName?.getAttribute('receiver') === protocolName
            && fnName.getAttribute('name') === name
            && fnName.querySelector(':scope > ir-type-args')?.firstElementChild?.getAttribute('name') === typeName;
        });
        if (!implementation) {
          stampDiagnostic(type, DIAGNOSTIC_KINDS.UNKNOWN_METHOD,
            `${typeName} does not implement protocol method '${protocolName}.${name}'`, { protocol: protocolName, member: name });
          continue;
        }
        const expected = paramsOf(member).map(declaredTypeStr);
        const actual = paramsOf(implementation).map(declaredTypeStr);
        if (expected.length !== actual.length || expected.some((value, i) => value !== actual[i])
          || fnReturnType(implementation) !== declaredTypeStr(member)) {
          stampDiagnostic(implementation, DIAGNOSTIC_KINDS.TYPE_MISMATCH,
            `Implementation '${protocolName}[${typeName}].${name}' does not match the protocol signature`,
            { protocol: protocolName, member: name, expectedParams: expected, actualParams: actual,
              expectedReturn: declaredTypeStr(member), actualReturn: fnReturnType(implementation) });
        }
      }
    }
  }
}

function validateNullableTypes(root, typeIndex, program) {
  const nullableTypes = program ? nodesOf(program, 'ir-type-nullable') : root.querySelectorAll('ir-type-nullable');
  for (const nullable of nullableTypes) {
    const name = nullable.firstElementChild?.getAttribute('name');
    if (!name || typeIndex.get(name)?.kind !== 'wasm-scalar') continue;
    stampDiagnostic(nullable, DIAGNOSTIC_KINDS.INVALID_NULLABLE_TYPE,
      `Scalar type '${name}' cannot be nullable`, { type: name });
  }
}

function validateNullLiterals(root, program) {
  for (const literal of program ? nodesOf(program, 'ir-lit') : root.querySelectorAll('ir-lit')) {
    if (literal.getAttribute('kind') !== 'null') continue;
    const expected = literal.dataset.expect ?? literal.dataset.expectedType;
    if (expected?.startsWith('?')) continue;
    stampDiagnostic(literal, DIAGNOSTIC_KINDS.INVALID_NULLABLE_TYPE,
      'Bare null requires a nullable type context');
  }
}

function validateIntegerLiterals(root, program) {
  const ranges = {
    I32: [-(1n << 31n), (1n << 31n) - 1n], U32: [0n, (1n << 32n) - 1n],
    I64: [-(1n << 63n), (1n << 63n) - 1n], U64: [0n, (1n << 64n) - 1n],
  };
  for (const literal of program ? nodesOf(program, 'ir-lit') : root.querySelectorAll('ir-lit')) {
    if (literal.getAttribute('kind') !== 'int' || literal.dataset.originFile?.startsWith('std:')) continue;
    const type = literal.dataset.typeName ?? literal.getAttribute('type-name');
    const range = ranges[type];
    if (!range) continue;
    let value;
    try { value = BigInt(literal.getAttribute('value')); } catch { continue; }
    const call = literal.closest('ir-call');
    const sourceNegation = (type === 'I32' || type === 'I64')
      && call?.dataset.operatorName === 'neg' && call.querySelector(':scope > ir-arg-list')?.firstElementChild === literal;
    const comparable = sourceNegation && value >= 0n ? -value : value;
    if (comparable >= range[0] && comparable <= range[1]) continue;
    stampDiagnostic(literal, DIAGNOSTIC_KINDS.INTEGER_LITERAL_OUT_OF_RANGE,
      `Integer literal ${sourceNegation ? '-' : ''}${value} is out of range for ${type}`,
      { type, value: `${sourceNegation ? '-' : ''}${value}`, min: String(range[0]), max: String(range[1]) });
  }
}

function validateArrayDefaultConstruction(root, typeIndex, program) {
  for (const call of program ? nodesOf(program, 'ir-call') : root.querySelectorAll('ir-call')) {
    const callee = call.firstElementChild;
    const method = callee?.getAttribute('method') ?? call.dataset.resolvedName?.split('.').at(-1);
    if (method !== 'new_default') continue;
    const arrayType = callee?.getAttribute('type') ?? callee?.getAttribute('type-name') ?? call.dataset.typeName;
    const elementType = typeIndex.get(arrayType)?.arrayElem;
    if (!elementType || isDefaultableType(elementType, typeIndex)) continue;
    stampDiagnostic(call, DIAGNOSTIC_KINDS.NON_DEFAULTABLE_TYPE,
      `Array element type '${elementType}' has no default value; use Array[${elementType}].new(length, fill)`,
      { type: elementType, arrayType });
  }
}

function isDefaultableType(type, typeIndex) {
  if (type.startsWith('?')) return true;
  const entry = typeIndex.get(type);
  return entry?.kind === 'wasm-scalar' || entry?.kind === 'wasm-ref'
    || entry?.decl?.localName === 'ir-proto' || type.startsWith('cl(');
}

function validateStructInits(root, typeIndex, program) {
  for (const init of program ? nodesOf(program, 'ir-struct-init') : root.querySelectorAll('ir-struct-init')) {
    const typeName = init.getAttribute('type-name');
    const decl = typeEntryDecl(typeIndex.get(typeName));
    if (decl?.localName !== 'ir-struct' && decl?.localName !== 'ir-variant') continue;
    const fields = new Set([...decl.querySelectorAll(':scope > ir-field')]
      .map(field => field.getAttribute('name')).filter(Boolean));
    const seen = new Set();
    for (const fieldInit of init.querySelectorAll(':scope > ir-field-init')) {
      const name = fieldInit.getAttribute('field');
      if (seen.has(name)) {
        stampDiagnostic(fieldInit, DIAGNOSTIC_KINDS.DUPLICATE_FIELD, `Duplicate field '${name}'`, { field: name, type: typeName });
        continue;
      }
      seen.add(name);
      if (!fields.has(name)) {
        stampDiagnostic(fieldInit, DIAGNOSTIC_KINDS.UNKNOWN_FIELD,
          `Unknown field '${name}' for ${typeName}`, { field: name, type: typeName });
      }
    }
    for (const name of fields) {
      if (!seen.has(name)) {
        stampDiagnostic(init, DIAGNOSTIC_KINDS.MISSING_FIELD, `Missing field '${name}' for ${typeName}`, { field: name, type: typeName });
        break;
      }
    }
  }
}

function validateExhaustiveAltsAndMatches(root, ctx) {
  const nodes = ctx.program ? nodesOf(ctx.program, 'ir-alt', 'ir-match') : root.querySelectorAll('ir-alt, ir-match');
  for (const node of nodes) {
    const isMatch = node.localName === 'ir-match';
    const armTag = isMatch ? 'ir-match-arm' : 'ir-alt-arm';
    const attribute = isMatch ? 'pattern' : 'variant';
    const seen = new Set();
    for (const arm of node.querySelectorAll(`:scope > ${armTag}`)) {
      const key = arm.getAttribute(attribute);
      if (!key || !seen.has(key)) { if (key) seen.add(key); continue; }
      stampDiagnostic(arm, DIAGNOSTIC_KINDS.DUPLICATE_DECLARATION,
        `Duplicate ${isMatch ? 'match pattern' : 'alt variant'} '${key}'`, { pattern: key });
    }
    if (hasDefaultArm(node)) continue;
    const type = node.firstElementChild?.dataset['typeName'];
    const cases = type === 'Bool' && isMatch ? ['true', 'false'] : enumVariants(type, ctx.typeIndex);
    if (!cases) {
      if (isMatch) stampDiagnostic(node, DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH,
        `Match over ${type ?? 'unknown type'} requires a default arm`, { type: type ?? null });
      continue;
    }
    const covered = new Set([...node.querySelectorAll(`:scope > ${armTag}`)]
      .map(arm => arm.getAttribute(attribute)).filter(Boolean));
    const missing = cases.filter(name => !covered.has(name));
    if (!missing.length) continue;
    const message = type === 'Bool'
      ? `Missing Bool case '${missing[0]}' in match`
      : `Missing variant '${missing[0]}' in ${isMatch ? 'match' : 'alt'} over enum ${type}`;
    stampDiagnostic(node, DIAGNOSTIC_KINDS.NON_EXHAUSTIVE_MATCH, message, { type, missing });
  }
}

function hasDefaultArm(node) {
  return Boolean(node.querySelector(':scope > ir-default-arm'));
}

function enumVariants(typeName, typeIndex) {
  const decl = typeEntryDecl(typeName ? typeIndex.get(typeName) : null);
  if (decl?.localName !== 'ir-enum') return null;
  return [...decl.querySelectorAll(':scope > ir-variant')]
    .map(variant => variant.getAttribute('name'))
    .filter(Boolean);
}



function validateRecursiveStructs(doc, typeIndex) {
  const graph = retainedGraphs(doc).declarations;
  for (const [name, entry] of typeIndex) {
    const decl = typeEntryDecl(entry);
    if (decl?.localName === 'ir-struct' && graph.reaches(name, name)) {
      stampDiagnostic(decl, DIAGNOSTIC_KINDS.RECURSIVE_TYPE,
        `Recursive type '${name}' must use a nullable or indirect field`, { type: name });
    }
  }
}

