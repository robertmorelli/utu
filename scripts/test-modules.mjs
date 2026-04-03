import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile, validateWat } from '../packages/compiler/index.js';
import binaryen from 'binaryen';
import { loadNodeModuleFromSource } from '../packages/runtime/loadNodeModuleFromSource.mjs';
import { assertManagedTestModule, firstLine, getRepoRoot, loadNodeFileImport, runNamedCases } from './test-helpers.mjs';

import { binaryenCompileFailureCases, binaryenValidationCases } from './test-module-cases/binaryen-cases.mjs';
import { failureCases } from './test-module-cases/failure-cases.mjs';
import { moduleProtocolSuccessCases } from './test-module-cases/module-protocol-success-cases.mjs';
import { successCases } from './test-module-cases/success-cases.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const cases = [
    ...moduleProtocolSuccessCases.map((testCase) => [testCase.name, async () => {
        const actual = await compileAndRun(testCase.source);
        if (actual !== testCase.expectedReturn)
            throw new Error(`Expected return ${testCase.expectedReturn}, got ${actual}`);
    }]),
    ...successCases.map((testCase) => [testCase.name, async () => {
        const actual = await compileAndRun(testCase.source);
        if (actual !== testCase.expectedReturn)
            throw new Error(`Expected return ${testCase.expectedReturn}, got ${actual}`);
    }]),
    ['method-sugar-does-not-add-struct-fields', async () => {
        const source = `struct Vec {
    x: i32,
    y: i32,
}

fun Vec.new(x: i32, y: i32) Vec {
    Vec { x: x, y: y };
}

fun Vec.sum(self: Vec) i32 {
    self.x + self.y;
}

fun main() i32 {
    let v: Vec = Vec.new(3, 4);
    v.sum();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        const structBody = wat.match(/\(type \$Vec \(struct([\s\S]*?)\)\s*\)/)?.[1] ?? '';
        const fieldCount = (structBody.match(/\(field /g) ?? []).length;
        if (fieldCount !== 2)
            throw new Error(`Vec struct has ${fieldCount} WAT field(s), expected exactly 2. Method sugar must not add implicit fields to the struct.`);
    }],
    ['tagged-structs-add-hidden-tags-and-emit-call-indirect-dispatch', async () => {
        const source = `proto Measure[T] {
    measure(T) i32,
};

tag struct Box: Measure {
    width: i32,
    height: i32,
}

tag struct Square: Measure {
    side: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

fun Measure.measure(self: Square) i32 {
    self.side * self.side;
}

fun main() i32 {
    let box: Box = Box { width: 2, height: 3 };
    box.measure();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        if (!wat.includes('(field $__tag'))
            throw new Error('Expected tagged structs to lower a hidden $__tag field');
        if (!wat.includes('(table $__utu_proto_table_measure_measure '))
            throw new Error('Expected a dedicated protocol dispatch table for Measure.measure');
        if (!wat.includes('(elem $__utu_proto_elem_measure_measure (table $__utu_proto_table_measure_measure)'))
            throw new Error('Expected Measure.measure elements to be attached to its own table');
        if (!wat.includes('call_indirect $__utu_proto_table_measure_measure'))
            throw new Error('Expected protocol dispatch to use call_indirect');
    }],
    ['tagged-sum-parent-protocol-helpers-lower-to-bare-table-dispatch', async () => {
        const source = `proto Measure[T] {
    measure(T) i32,
};

tag type Shape: Measure =
    | Box { width: i32, height: i32 }
    | Square { side: i32 };

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

fun Measure.measure(self: Square) i32 {
    self.side * self.side;
}

fun main() i32 {
    let shape: Shape = Box { width: 2, height: 3 };
    shape.measure();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        if (wat.includes('ref.test'))
            throw new Error('Expected tagged-sum protocol helpers to avoid ref.test ladders entirely');
        if (!wat.includes('struct.get $Shape $__tag'))
            throw new Error('Expected tagged-sum protocol helpers to read the parent tag field directly');
        if (!wat.includes('call_indirect $__utu_proto_table_measure_measure'))
            throw new Error('Expected tagged-sum protocol helpers to dispatch via the method table');
    }],
    ['protocol-getter-sugar-always-goes-through-the-protocol-helper', async () => {
        const source = `proto Area[T] {
    get area: i32,
};

tag struct Rect: Area {
    area: i32,
}

        fun main() i32 {
    let rect: Rect = Rect { area: 12 };
    rect.area;
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        const mainStart = wat.indexOf('(func $main');
        const mainEnd = wat.indexOf('\n  (export "main"', mainStart);
        const mainBody = mainStart >= 0 && mainEnd >= 0 ? wat.slice(mainStart, mainEnd) : '';
        if (!mainBody.includes('call $__utu_proto_dispatch_area_area_'))
            throw new Error('Expected concrete getter sugar to call the protocol dispatch helper');
        if (mainBody.includes('struct.get $Rect $area'))
            throw new Error('Expected concrete getter sugar to avoid direct struct.get bypasses');
    }],
    ['protocol-typed-arrays-lower-to-the-shared-tagged-storage-shape', async () => {
        const source = `proto P[T] {
    get x: i32,
    perimeter(T) i32,
};

tag struct Line: P {
    x: i32,
    y: i32,
};

fun P.perimeter(self: Line) i32 {
    self.x + self.y;
}

fun main() i32 {
    let xs: array[P] = array[P].new_default(2);
    xs[0] = Line { x: 3, y: 4 };
    xs[0].perimeter();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        if (!wat.includes('(type $P_array (array (mut (ref $__utu_tagged))))'))
            throw new Error('Expected array[P] to lower to an array over the shared tagged root');
        if (!wat.includes('(type $__utu_proto_default_p (sub $__utu_tagged (struct'))
            throw new Error('Expected protocol arrays to materialize an explicit default tagged value type');
        if (!wat.includes('struct.new $__utu_proto_default_p'))
            throw new Error('Expected array[P].new_default to fill from the explicit protocol default value');
        if (!wat.includes('call $__utu_proto_dispatch_p_perimeter_'))
            throw new Error('Expected protocol-typed array reads to dispatch through the protocol helper');
    }],
    ['unresolved-field-call-throws-instead-of-emitting-call-ref', async () => {
        try {
            await compile(`fun main() i32 { let x: i32 = 0; x.ghost(); }`, { mode: 'program' });
        } catch (error) {
            if (String(error?.message ?? error).includes('ghost')) return;
            throw new Error(`Expected error mentioning 'ghost', got: ${error?.message}`);
        }
        throw new Error('Expected compile to fail for unresolved method call');
    }],
    ['binaryen-strips-unused-instantiated-functions', async () => {
        const single = await inspectOptimizedModule(makeBinaryenDceSource(1));
        const many = await inspectOptimizedModule(makeBinaryenDceSource(50));
        if (many.functionCount !== single.functionCount)
            throw new Error(`Expected 50 instantiations to keep ${single.functionCount} optimized function(s), got ${many.functionCount}`);
    }],
    ['no-opt-compiles-preserve-unoptimized-module-duplication', async () => {
        const optimized = await inspectOptimizedModule(makeBinaryenDceSource(50), { optimize: true });
        const raw = await inspectOptimizedModule(makeBinaryenDceSource(50), { optimize: false });
        if (raw.functionCount <= optimized.functionCount)
            throw new Error(`Expected --no-opt compilation to keep more functions than the optimized build, got raw=${raw.functionCount} optimized=${optimized.functionCount}`);
    }],
    ['provided-wasm-bytes-shim-stays-minimal-and-host-driven', async () => {
        const { shim, metadata } = await compile('fun main() i32 { 7; }', { mode: 'program', provided_wasm_bytes: true });
        if (!shim.includes('export async function instantiate(__wasm_bytes, __hostImports = {})'))
            throw new Error('Expected provided_wasm_bytes shims to require __wasm_bytes directly');
        if (!shim.includes('WebAssembly.instantiate(__wasm_bytes, {})'))
            throw new Error('Expected provided_wasm_bytes shims to instantiate the host-supplied bytes directly');
        for (const forbidden of ['__wasmOverride', 'node:fs/promises', 'fetch(', 'atob(', "__wasmBytes"]) {
            if (shim.includes(forbidden))
                throw new Error(`Expected provided_wasm_bytes shims to omit ${JSON.stringify(forbidden)}, got ${JSON.stringify(shim)}`);
        }
        if (metadata.artifact?.where !== 'provided_wasm_bytes')
            throw new Error(`Expected artifact.where to be "provided_wasm_bytes", got ${JSON.stringify(metadata.artifact?.where)}`);
    }],
    ['cross-file-imports-inline-and-run-through-transitive-module-dependencies', async () => {
        const entryPath = resolve(repoRoot, 'examples/multi_file/main.utu');
        const source = await readFile(entryPath, 'utf8');
        const actual = await compileAndRun(source, { uri: pathToFileURL(entryPath).href, loadImport: loadNodeFileImport });
        if (actual !== 43)
            throw new Error(`Expected return 43, got ${actual}`);
    }],
    ['cross-file-imports-rename-module-promotion-before-tests-run', async () => {
        const entryPath = resolve(repoRoot, 'examples/multi_file/tests.utu');
        const source = await readFile(entryPath, 'utf8');
        const { shim, metadata } = await compile(source, { mode: 'test', uri: pathToFileURL(entryPath).href, loadImport: loadNodeFileImport });
        const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-modules-' });
        try {
            const exports = await compiledModule.module.instantiate();
            for (const test of metadata.tests) {
                if (typeof exports[test.exportName] !== 'function')
                    throw new Error(`Missing export ${test.exportName}`);
                await exports[test.exportName]();
            }
        } finally {
            await compiledModule.cleanup?.();
        }
    }],
    ...binaryenValidationCases.map((testCase) => [testCase.name, async () => {
        const result = await validateWat(testCase.wat);
        if (!result) throw new Error('Expected WAT validation to fail');
        if (result.message.includes('WebAssembly.Module'))
            throw new Error(`Expected Binaryen diagnostic, got: ${JSON.stringify(firstLine(result.message))}`);
        if (!result.message.includes(testCase.message))
            throw new Error(`Expected message to include ${JSON.stringify(testCase.message)}, got ${JSON.stringify(firstLine(result.message))}`);
        if (!result.binaryenOutput.join('\n').includes(testCase.message))
            throw new Error(`Expected binaryen output to include ${JSON.stringify(testCase.message)}, got ${JSON.stringify(result.binaryenOutput)}`);
    }]),
    ...binaryenCompileFailureCases.map((testCase) => [testCase.name, async () => {
        const source = await readFile(new URL(`../${testCase.path}`, import.meta.url), 'utf8');
        try {
            await compile(source, { mode: 'program' });
        } catch (error) {
            const message = String(error?.message ?? error);
            if (message.includes('WebAssembly.Module'))
                throw new Error(`Expected Binaryen diagnostic, got: ${JSON.stringify(firstLine(message))}`);
            if (!message.includes('Generated Wasm failed validation:'))
                throw new Error(`Expected compiler-facing validation prefix, got ${JSON.stringify(firstLine(message))}`);
            if (message.includes(testCase.message)) return;
            throw new Error(`Expected ${JSON.stringify(testCase.message)}, got ${JSON.stringify(firstLine(message))}`);
        }
        throw new Error('Expected compile to fail');
    }]),
    ...failureCases.map((testCase) => [testCase.name, async () => {
        try {
            await compile(testCase.source, { mode: 'program' });
        } catch (error) {
            const message = String(error?.message ?? error);
            if (message.includes(testCase.message)) return;
            throw new Error(`Expected ${JSON.stringify(testCase.message)}, got ${JSON.stringify(firstLine(message))}`);
        }
        throw new Error('Expected compile to fail');
    }]),
];

if (await runNamedCases(cases))
    process.exit(1);

async function compileAndRun(source, compileOptions = {}) {
    const { shim } = await compile(source, { mode: 'program', ...compileOptions });
    const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-modules-' });
    try {
        const exports = await compiledModule.module.instantiate();
        if (typeof exports.main !== 'function')
            throw new Error('Missing export "main"');
        return exports.main();
    } finally {
        await compiledModule.cleanup?.();
    }
}

async function inspectOptimizedModule(source, { optimize = true } = {}) {
    const { wasm } = await compile(source, { mode: 'program', optimize });
    const mod = binaryen.readBinary(wasm);
    try {
        return { functionCount: mod.getNumFunctions() };
    } finally {
        mod.dispose();
    }
}

function makeBinaryenDceSource(count) {
    const types = Array.from({ length: count }, (_, index) => `struct T${index} {\n    value: i32,\n}`).join('\n\n');
    const constructs = Array.from({ length: count }, (_, index) => `construct foo_${index} = foo[T${index}];`).join('\n');
    return `escape |41| input: i32;

mod foo[T] {
    fun bar(value: T) T {
        value;
    }
}

${types}

${constructs}

fun main() i32 {
    foo_0.bar(T0 { value: input }).value;
}`;
}
