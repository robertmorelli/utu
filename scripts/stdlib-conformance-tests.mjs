const COVERED_STDLIBS = ['i32', 'u32', 'i64', 'u64', 'f32', 'f64', 'm32', 'm64', 'm128', 'bool', 'str', 'i31', 'v128'];

export function registerStdlibConformanceTests({ test, makeCompiler, assert, assertEq, assertNoErrors }) {
  test('stdlib conformance: scalar intrinsic golden results', async ({ ROOT }) => {
    const { instance } = await compileCases(ROOT, makeCompiler, assertNoErrors, scalarIntrinsicCases(), 'stdlib_scalar_intrinsics');
    await runCases(instance, scalarIntrinsicCases(), assert, assertEq);
  });

  test('stdlib conformance: mask/ref/str/v128 intrinsic golden results (real wasm)', async ({ ROOT }) => {
    const cases = extendedIntrinsicCases();
    await assertStdlibCoverage(ROOT, [...scalarIntrinsicCases(), ...cases], assert);
    const compileOnly = cases.filter((c) => c.compileOnly);
    assert(compileOnly.length === 0, `compileOnly stdlib conformance case(s) are not allowed: ${compileOnly.map((c) => c.name).join(', ')}`);
    const executable = cases.filter((c) => !c.compileOnly);
    const { instance } = await compileCases(ROOT, makeCompiler, assertNoErrors, executable, 'stdlib_extended_intrinsics');
    await runCases(instance, executable, assert, assertEq);
  });
}

async function compileCases(ROOT, makeCompiler, assertNoErrors, cases, name, imports = {}) {
  const { emitBinary, instantiateLowered } = await import('../src/compiler/codegen/index.js');
  const compiler = await makeCompiler({ ROOT, target: 'normal' });
  const tmp = `${ROOT}/.tmp/${name}.utu`;
  const { default: fs } = await import('node:fs/promises');
  await fs.mkdir(`${ROOT}/.tmp`, { recursive: true });

  const helpers = [...new Set(cases.flatMap((c) => c.helpers ?? []))].join('\n');
  const functions = cases.map((c) => `      fn ${c.name}(${c.params}) ${c.returnType} { ${c.expr}; }`).join('\n');
  await fs.writeFile(tmp, `${helpers}\nexport lib {\n${functions}\n    }\n`);

  try {
    const doc = await compiler.compileFile(tmp);
    assertNoErrors(doc);
    const { instance } = await instantiateLowered(emitBinary(doc), imports);
    return { instance };
  } finally {
    if (!process.env.KEEP_TEST_TMP) await fs.unlink(tmp).catch(() => {});
  }
}

async function runCases(instance, cases, assert, assertEq) {
  for (const c of cases) {
    const actual = instance.exports[c.name](...c.args);
    if (c.approx != null) {
      assert(Math.abs(actual - c.expected) <= c.approx, `${c.name}: expected ${c.expected}, got ${actual}`);
    } else {
      assertEq(actual, c.expected, `${c.name}: expected ${String(c.expected)}, got ${String(actual)}`);
    }
  }
}

async function assertStdlibCoverage(ROOT, cases, assert) {
  const { default: fs } = await import('node:fs/promises');
  const malformed = cases.filter((c) => c.stdlib == null || c.op == null);
  assert(malformed.length === 0, `malformed stdlib conformance case(s): ${malformed.map((c) => c.name ?? '<unnamed>').join(', ')}`);
  const covered = new Set(cases.map((c) => `${c.stdlib}:${c.op}`));
  const missing = [];
  for (const stdlib of COVERED_STDLIBS) {
    const src = await fs.readFile(`${ROOT}/std/${stdlib}.utu`, 'utf8');
    for (const op of declaredOps(src)) {
      if (!covered.has(`${stdlib}:${op}`)) missing.push(`${stdlib}:${op}`);
    }
  }
  assert(missing.length === 0, `missing stdlib golden case(s): ${missing.join(', ')}`);
}

function declaredOps(src) {
  const ops = [];
  const re = /\bfn\s+(?:&:)?([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let match;
  while ((match = re.exec(src))) ops.push(match[1]);
  return ops;
}

function scalarIntrinsicCases() {
  return [
    ...integerCases({ type: 'i32', signed: true, bigint: false, div: -3, rem: -1, shr: -4, ushr: 2147483644 }),
    ...integerCases({ type: 'u32', signed: false, bigint: false, div: 2000000000, rem: 2, shr: 1073741824, ushr: 1073741824 }),
    ...integerCases({ type: 'i64', signed: true, bigint: true, div: -3n, rem: -1n, shr: -4n, ushr: 9223372036854775804n }),
    ...integerCases({ type: 'u64', signed: false, bigint: true, div: 9223372036854775807n, rem: 1n, shr: 4611686018427387904n, ushr: 4611686018427387904n }),
    ...floatCases('f32', 0),
    ...floatCases('f64'),
  ];
}

function extendedIntrinsicCases() {
  return [
    ...maskCases32('m32'),
    ...maskCases64('m64'),
    ...boolCases(),
    ...strCases(),
    ...i31Cases(),
    ...v128Cases('v128'),
    ...v128Cases('m128'),
  ];
}

function integerCases({ type, signed, bigint, div, rem, shr, ushr }) {
  const word = (n) => bigint ? BigInt(n) : n;
  const neg = bigint ? -5n : -5;
  const bnot = bigint ? -1n : -1;
  const allOnes = bigint ? '18446744073709551615' : '0xFFFFFFFF';
  const highBit = bigint ? '0x8000000000000000' : '0x80000000';
  const addA = signed ? '10' : (bigint ? '9223372036854775807' : '4000000000');
  const addB = signed ? '-3' : (bigint ? '2' : '7');

  const cases = [
    ['add', bin(type, addA, addB, '+'), signed ? word(7) : (bigint ? -9223372036854775807n : -294967289)],
    ['sub', bin(type, '10', signed ? '-3' : '12', '-'), signed ? word(13) : word(-2)],
    ['mul', bin(type, signed ? '-7' : (bigint ? '4294967296' : '65536'), signed ? '6' : (bigint ? '4294967296' : '65536'), '*'), signed ? word(-42) : word(0)],
    ['div', bin(type, signed ? '-7' : (bigint ? '18446744073709551614' : '4000000000'), '2', '/'), div],
    ['rem', bin(type, signed ? '-7' : (bigint ? allOnes : '4000000001'), signed ? '2' : (bigint ? '2' : '3'), '%'), rem],
    ['band', bin(type, '42', '28', '&'), word(8)],
    ['bor', bin(type, '42', '28', '|'), word(62)],
    ['bxor', bin(type, '42', '28', '^'), word(54)],
    ['shl', bin(type, '3', '4', '<<'), word(48)],
    ['shr', bin(type, signed ? '-8' : highBit, '1', '>>'), shr],
    ['ushr', bin(type, signed ? '-8' : highBit, '1', '>>>'), ushr],
    ['eq', bin(type, '5', '5', '=='), true],
    ['ne', bin(type, '5', '6', '!='), true],
    ['lt', bin(type, signed ? '-1' : '1', signed ? '1' : allOnes, '<'), true],
    ['le', bin(type, signed ? '-1' : allOnes, signed ? '-1' : allOnes, '<='), true],
    ['gt', bin(type, signed ? '2' : allOnes, signed ? '-1' : '1', '>'), true],
    ['ge', bin(type, signed ? '2' : allOnes, signed ? '2' : allOnes, '>='), true],
    ['neg', unary(type, '5', '-a'), neg],
    ['bnot', unary(type, '0', '~a'), bnot],
  ];
  if (type === 'i32') {
    cases.push(
      ['clz', callUnary(type, 'clz', '16'), 27],
      ['ctz', callUnary(type, 'ctz', '16'), 4],
      ['popcnt', callUnary(type, 'popcnt', '0xF0F0'), 8],
    );
  }
  return typedCases(type, type, cases, null, type);
}

function maskCases32(type) {
  return typedCases(type, type, [
    ['band', bin(type, '42', '28', '&'), 8],
    ['bor', bin(type, '42', '28', '|'), 62],
    ['bxor', bin(type, '42', '28', '^'), 54],
    ['bnot', unary(type, '0', '~a'), -1],
    ['shl', bin(type, '1', '31', '<<'), -2147483648],
    ['shr', bin(type, '0x80000000', '31', '>>'), 1],
    ['ushr', bin(type, '0x80000000', '31', '>>>'), 1],
    ['eq', bin(type, '0xF0F0', '0xF0F0', '=='), true],
    ['ne', bin(type, '0xF0F0', '0x0F0F', '!='), true],
  ], null, type);
}

function maskCases64(type) {
  return typedCases(type, type, [
    ['band', bin(type, '42', '28', '&'), 8n],
    ['bor', bin(type, '42', '28', '|'), 62n],
    ['bxor', bin(type, '42', '28', '^'), 54n],
    ['bnot', unary(type, '0', '~a'), -1n],
    ['shl', bin(type, '1', '63', '<<'), -9223372036854775808n],
    ['shr', bin(type, '0x8000000000000000', '63', '>>'), 1n],
    ['ushr', bin(type, '0x8000000000000000', '63', '>>>'), 1n],
    ['eq', bin(type, '0xF0F0', '0xF0F0', '=='), true],
    ['ne', bin(type, '0xF0F0', '0x0F0F', '!='), true],
  ], null, type);
}

function boolCases() {
  return typedCases('bool', 'bool', [
    ['eq', bin('bool', 'true', 'true', '=='), true],
    ['ne', bin('bool', 'true', 'false', '!='), true],
    ['and', bin('bool', 'true', 'false', 'and'), false],
    ['or', bin('bool', 'true', 'false', 'or'), true],
    ['xor', bin('bool', 'true', 'false', 'xor'), true],
    ['not', unary('bool', 'false', 'not a'), true],
  ], null, 'bool');
}

function strCases() {
  return [
    stdCase('str', 'add', 'std_str_add_len', '', 'i32', 'str.len("ut" + "u")', [], 3),
    stdCase('str', 'add', 'std_str_add_eq', '', 'i32', 'if "a" + "b" == "ab" { 1; } else { 0; }', [], 1),
    stdCase('str', 'eq', 'std_str_eq', '', 'i32', 'if "same" == "same" { 1; } else { 0; }', [], 1),
    stdCase('str', 'ne', 'std_str_ne', '', 'i32', 'if "same" != "diff" { 1; } else { 0; }', [], 1),
    stdCase('str', 'len', 'std_str_len', '', 'i32', 'str.len("hello")', [], 5),
    stdCase('str', 'len', 'std_str_len_non_ascii', '', 'i32', 'str.len("hé")', [], 2),
    stdCase('str', 'slice', 'std_str_slice_roundtrip', '', 'i32', 'if str.slice("hello", 1, 3) == "el" { 1; } else { 0; }', [], 1),
    stdCase('str', 'get', 'std_str_get', '', 'i32', 'str.get("hello", 4)', [], 111),
  ];
}

function i31Cases() {
  return [
    stdCase('i31', 'from_i32', 'std_i31_from_i32_get_s', 'x: i32', 'i32', 'i31.get_s(i31.from_i32(x))', [123], 123),
    stdCase('i31', 'get_s', 'std_i31_get_s_sign', '', 'i32', 'i31.get_s(i31.from_i32(1073741824))', [], -1073741824),
    stdCase('i31', 'get_u', 'std_i31_get_u_sign', '', 'i32', 'i31.get_u(i31.from_i32(1073741824))', [], 1073741824),
    stdCase('i31', 'eq', 'std_i31_eq', '', 'i32', 'if i31.from_i32(7) == i31.from_i32(7) { 1; } else { 0; }', [], 1),
    stdCase('i31', 'ne', 'std_i31_ne', '', 'i32', 'if i31.from_i32(7) != i31.from_i32(8) { 1; } else { 0; }', [], 1),
  ];
}

function v128Cases(type) {
  const zero = `${type}.zero()`;
  const ones = `${type}.ones()`;
  const anyTrue = `${type}.any_true`;
  return [
    stdCase(type, 'zero', `std_${type}_zero`, '', 'i32', boolExpr(`${anyTrue}(${zero})`), [], 0),
    stdCase(type, 'ones', `std_${type}_ones`, '', 'i32', boolExpr(`${anyTrue}(${ones})`), [], 1),
    stdCase(type, 'band', `std_${type}_band_any`, '', 'i32', boolExpr(`${anyTrue}(${ones} & ${zero})`), [], 0),
    stdCase(type, 'bor', `std_${type}_bor_any`, '', 'i32', boolExpr(`${anyTrue}(${zero} | ${ones})`), [], 1),
    stdCase(type, 'bxor', `std_${type}_bxor_zero`, '', 'i32', boolExpr(`${anyTrue}(${ones} ^ ${ones})`), [], 0),
    stdCase(type, 'bnot', `std_${type}_bnot_zero`, '', 'i32', boolExpr(`${anyTrue}(~${zero})`), [], 1),
    stdCase(type, 'eq', `std_${type}_eq_any`, '', 'i32', boolExpr(`${anyTrue}(${ones} == ${ones})`), [], 1),
    stdCase(type, 'ne', `std_${type}_ne_any`, '', 'i32', boolExpr(`${anyTrue}(${ones} != ${zero})`), [], 1),
    stdCase(type, 'andnot', `std_${type}_andnot`, '', 'i32', boolExpr(`${anyTrue}(${type}.andnot(${ones}, ${ones}))`), [], 0),
    stdCase(type, 'bitselect', `std_${type}_bitselect`, '', 'i32', boolExpr(`${anyTrue}(${type}.bitselect(${ones}, ${zero}, ${ones}))`), [], 1),
    stdCase(type, 'any_true', `std_${type}_any_true`, '', 'i32', boolExpr(`${anyTrue}(${ones})`), [], 1),
  ];
}

function boolExpr(expr) {
  return `if ${expr} { 1; } else { 0; }`;
}

function floatCases(type, approx = null) {
  return typedCases(type, type, [
    ['add', bin(type, '1.5', '2.25', '+'), 3.75],
    ['sub', bin(type, '5.5', '2.25', '-'), 3.25],
    ['mul', bin(type, '-3.0', '2.5', '*'), -7.5],
    ['div', bin(type, '7.5', '2.5', '/'), 3],
    ['eq', bin(type, '1.5', '1.5', '=='), true],
    ['ne', bin(type, '1.5', '2.5', '!='), true],
    ['lt', bin(type, '-1.0', '1.0', '<'), true],
    ['le', bin(type, '-1.0', '-1.0', '<='), true],
    ['gt', bin(type, '2.0', '-1.0', '>'), true],
    ['ge', bin(type, '2.0', '2.0', '>='), true],
    ['neg', unary(type, '5.5', '-a'), -5.5],
    ['abs', callUnary(type, 'abs', '-4.5'), 4.5],
    ['sqrt', callUnary(type, 'sqrt', '9.0'), 3],
    ['ceil', callUnary(type, 'ceil', '2.25'), 3],
    ['floor', callUnary(type, 'floor', '2.75'), 2],
    ['trunc', callUnary(type, 'trunc', '-2.75'), -2],
    ['nearest', callUnary(type, 'nearest', '2.75'), 3],
    ['min', callBinary(type, 'min', '-2.0', '3.0'), -2],
    ['max', callBinary(type, 'max', '-2.0', '3.0'), 3],
  ], approx, type);
}

function typedCases(type, returnType, cases, approx = null, stdlib = null) {
  return cases.map(([op, body, expected]) => {
    const boolReturn = typeof expected === 'boolean';
    return {
      stdlib,
      op,
      name: `std_${type}_${op}`,
      returnType: boolReturn ? 'i32' : returnType,
      params: body.params,
      expr: boolReturn ? `if ${body.expr} { 1; } else { 0; }` : body.expr,
      args: body.args,
      expected: boolReturn ? (expected ? 1 : 0) : expected,
      approx,
    };
  });
}

function stdCase(stdlib, op, name, params, returnType, expr, args, expected) {
  return { stdlib, op, name, params, returnType, expr, args, expected };
}

function bin(type, a, b, op) {
  return { params: `a: ${type}, b: ${type}`, expr: `a ${op} b`, args: [arg(type, a), arg(type, b)] };
}

function unary(type, a, expr) {
  return { params: `a: ${type}`, expr, args: [arg(type, a)] };
}

function callUnary(type, op, a) {
  return { params: `a: ${type}`, expr: `${type}.${op}(a)`, args: [arg(type, a)] };
}

function callBinary(type, op, a, b) {
  return { params: `a: ${type}, b: ${type}`, expr: `${type}.${op}(a, b)`, args: [arg(type, a), arg(type, b)] };
}

function arg(type, value) {
  if (type === 'i64' || type === 'u64' || type === 'm64') return intLiteral(value);
  if (type === 'f32' || type === 'f64') return Number(value);
  if (type === 'bool') return value === 'true' ? 1 : 0;
  return Number(intLiteral(value));
}

function intLiteral(value) {
  const text = String(value);
  const sign = text.startsWith('-') ? -1n : 1n;
  return sign * BigInt(text.startsWith('-') ? text.slice(1) : text);
}
