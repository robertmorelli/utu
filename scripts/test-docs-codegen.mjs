import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compile } from '../index.js';
import { getRepoRoot, runNamedCases } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const wasmUrl = pathToFileURL(resolve(repoRoot, 'tree-sitter-utu.wasm'));

const cases = [
    {
        name: 'arithmetic-and-locals',
        path: 'examples/ci/codegen_arithmetic_locals.utu',
        snippets: ['(func $add', 'i32.add', '(local $sum i32)', 'local.set $sum', 'i32.shl', 'i32.xor', 'i32.and'],
    },
    {
        name: 'pipes',
        path: 'examples/ci/codegen_pipes.utu',
        snippets: ['(func $use_pipe', 'call $inc', 'call $double', '(func $clamp_unit', 'call $clamp', '(func $scale_then_offset', 'call $affine'],
    },
    {
        name: 'structs',
        path: 'examples/ci/codegen_structs.utu',
        snippets: ['(type $Vec2 (struct', '(type $Todo (struct', 'struct.new $Vec2', 'struct.get $Vec2 $x', 'struct.set $Todo $done'],
    },
    {
        name: 'arrays',
        path: 'examples/ci/codegen_arrays.utu',
        snippets: ['array.new $i32_array', 'array.new_fixed $i32_array 3', 'array.new_default $i32_array', 'array.get $i32_array', 'array.set $i32_array', 'array.len', 'array.copy $i32_array $i32_array', 'array.fill $i32_array'],
    },
    {
        name: 'control-flow',
        path: 'examples/ci/codegen_control_flow.utu',
        snippets: ['(if (result i32)', '(block $__break_', '(loop $__continue_', 'br_if $__break_', '(block $search', 'br $search', '(block $done', 'br $done'],
    },
    {
        name: 'multi-value',
        path: 'examples/ci/codegen_multi_value.utu',
        snippets: ['(func $divmod', 'local.set $r', 'local.set $q', 'local.set $prod', 'local.set $diff', 'local.set $sum'],
    },
    {
        name: 'nullable',
        path: 'examples/ci/codegen_nullable.utu',
        snippets: ['(func $maybe_box', 'ref.null $Box', 'br_on_non_null', 'ref.as_non_null', 'ref.is_null'],
    },
    {
        name: 'import-values',
        path: 'examples/ci/codegen_import_values.utu',
        mode: 'test',
        snippets: [
            '(import "es" "lucky" (global $lucky i32))',
            '(import "es" "label" (global $label externref))',
            '(import "es" "document" (global $document externref))',
            'global.get $lucky',
            'global.get $label',
            'global.get $document',
        ],
        expectedTests: 3,
    },
    {
        name: 'globals',
        path: 'examples/ci/codegen_globals.utu',
        mode: 'test',
        snippets: ['(global $seed i32 i32.const 41)', '(global $banner externref global.get', 'global.get $seed', 'global.get $banner'],
        expectedTests: 3,
    },
    {
        name: 'alt-and-match',
        path: 'examples/ci/codegen_match.utu',
        snippets: [
            '(type $Shape (sub (struct)))',
            '(type $Circle (sub $Shape',
            'br_on_cast',
            'struct.get $Circle $radius',
            'struct.get $Rect $width',
            'struct.get $Triangle $base',
            '(func $tag',
            'local.set $__match_subj_',
            'i32.eq',
        ],
    },
    {
        name: 'scalar-match',
        path: 'examples/ci/codegen_scalar_match.utu',
        mode: 'test',
        snippets: ['(func $pick_bool', '(func $pick_float', '(func $pick_int', 'local.set $__match_subj_', 'f64.eq', 'i32.eq'],
        expectedTests: 4,
    },
    {
        name: 'alt-fallback',
        path: 'examples/ci/codegen_alt_fallback.utu',
        mode: 'test',
        snippets: ['(func $classify', '(func $fallback_score', 'br_on_cast', 'local.set $other', 'call $fallback_score', 'br $__alt_exit_'],
        expectedTests: 3,
    },
    {
        name: 'imports-and-exports',
        path: 'examples/ci/codegen_imports_exports.utu',
        snippets: ['(import "es" "console_log"', '(import "es" "wrap"', '(func $main', 'call $console_log', '(export "main" (func $main))'],
    },
    {
        name: 'break-and-call',
        path: 'examples/ci/codegen_break_and_call.utu',
        snippets: ['(func $add_one', 'i64.const 41', 'call $add_one', '(block $done (result i64)', 'br $done'],
    },
    {
        name: 'refs-and-i31',
        path: 'examples/ci/codegen_refs_i31.utu',
        snippets: ['ref.as_non_null', 'ref.eq', 'ref.is_null', 'ref.i31', 'i31.get_s', 'i31.get_u'],
    },
    {
        name: 'composition',
        path: 'examples/ci/codegen_composition.utu',
        snippets: ['array.new_fixed $Todo_array 3', 'struct.set $Todo $done', 'br_on_cast', 'br_on_non_null', 'call $str.concat'],
    },
    {
        name: 'test-surface',
        path: 'examples/ci/codegen_test_surface.utu',
        mode: 'test',
        snippets: ['(func $__utu_test_0', '(func $__utu_test_1', '(export "__utu_test_0"', '(export "__utu_test_1"', 'unreachable'],
        expectedTests: 2,
    },
    {
        name: 'bench-surface',
        path: 'examples/ci/codegen_test_surface.utu',
        mode: 'bench',
        snippets: ['(func $__utu_bench_0', '(param $iterations i32)', '(export "__utu_bench_0"', 'local.get $iterations', '(loop $__continue_'],
        expectedBenches: 1,
    },
    {
        name: 'traps',
        path: 'examples/ci/codegen_traps.utu',
        snippets: ['(func $fail_now', '(func $assert_even', 'i32.rem_s', 'i32.eqz', 'unreachable', '(export "main" (func $main))'],
    },
];

if (await runNamedCases(cases.map((testCase) => [testCase.name, async () => {
    const source = await readFile(resolve(repoRoot, testCase.path), 'utf8');
    const { wat, metadata } = await compile(source, { wat: true, wasmUrl, mode: testCase.mode ?? 'program' });
    const missing = testCase.snippets.filter((snippet) => !wat.includes(snippet));
    const metadataErrors = [];
    if ('expectedTests' in testCase && metadata.tests.length !== testCase.expectedTests)
        metadataErrors.push(`expected ${testCase.expectedTests} tests, found ${metadata.tests.length}`);
    if ('expectedBenches' in testCase && metadata.benches.length !== testCase.expectedBenches)
        metadataErrors.push(`expected ${testCase.expectedBenches} benches, found ${metadata.benches.length}`);
    if (missing.length || metadataErrors.length)
        throw new Error([missing.length ? `missing snippets: ${missing.join(' | ')}` : '', ...metadataErrors].filter(Boolean).join('\n  '));
}])))
    process.exit(1);
