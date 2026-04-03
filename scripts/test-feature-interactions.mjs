import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compile } from '../packages/compiler/index.js';
import { loadNodeModuleFromSource } from '../packages/runtime/loadNodeModuleFromSource.mjs';
import {
  assertManagedTestModule,
  expectEqual,
  loadNodeFileImport,
  runNamedCases,
} from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const failed = await runNamedCases([
  ['cross-file parameterized module protocol arrays share dispatch and getter helpers', async () => {
    const actual = await compileAndRunFiles({
      '_shapes.utu': `mod shapes[T] {
    proto Measure[Self] {
        get value: T,
        measure(Self) T,
    };

    tag struct Box: Measure {
        value: T,
    }

    fun Measure.measure(self: Box) T {
        self.value;
    }
}
`,
      'main.utu': `import shapes from "./_shapes.utu";
construct ints = shapes[i32];

fun main() i32 {
    let xs: array[ints.Measure] = array[ints.Measure].new_default(2);
    xs[0] = ints.Box { value: 9 };
    xs[0].measure() + xs[0].value;
}
`,
    });
    expectEqual(actual, 18);
  }],
  ['cross-file open constructs preserve module-local protocol getters and setters', async () => {
    const actual = await compileAndRunFiles({
      '_boxy.utu': `mod boxy[T] {
    proto CounterOps[Self] {
        get value: T,
        set value: T,
    };

    tag struct Box: CounterOps {
        mut value: T,
    }

    fun bump(box: Box, by: T) T {
        box.value += by;
        box.value;
    }
}
`,
      'main.utu': `import boxy from "./_boxy.utu";
construct boxy[i32];

fun main() i32 {
    let box: Box = Box { value: 5 };
    bump(box, 8) + box.value;
}
`,
    });
    expectEqual(actual, 26);
  }],
  ['cross-file tagged sums keep protocol dispatch through imported modules', async () => {
    const actual = await compileAndRunFiles({
      '_shape.utu': `mod geom {
    proto Measure[Self] {
        measure(Self) i32,
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
}
`,
      'main.utu': `import geom from "./_shape.utu";
construct geom;

fun main() i32 {
    let left: Shape = Box { width: 2, height: 5 };
    let right: Shape = Square { side: 3 };
    left.measure() + right.measure();
}
`,
    });
    expectEqual(actual, 19);
  }],
  ['plain protocol getters survive nullable fallback expressions', async () => {
    const actual = await compileAndRunSource(`proto Value[T] {
    get value: i32,
};

tag struct Box: Value {
    value: i32,
}

fun maybe_box(flag: bool) ?Box {
    if flag { Box { value: 13 }; } else { null; };
}

fun main() i32 {
    (maybe_box(true) \\ Box { value: 1 }).value;
}
`);
    expectEqual(actual, 13);
  }],
  ['module-local protocol getters survive nullable fallback expressions', async () => {
    const actual = await compileAndRunSource(`mod boxy[T] {
    proto Value[Self] {
        get value: T,
    };

    tag struct Box: Value {
        value: T,
    }
}

construct ints = boxy[i32];

fun maybe_box(flag: bool) ?ints.Box {
    if flag { ints.Box { value: 13 }; } else { null; };
}

fun main() i32 {
    (maybe_box(true) \\ ints.Box { value: 1 }).value;
}
`);
    expectEqual(actual, 13);
  }],
  ['module-local explicit protocol calls resolve after nullable fallback expressions', async () => {
    const actual = await compileAndRunSource(`mod boxy[T] {
    proto Measure[Self] {
        measure(Self) T,
    };

    tag struct Box: Measure {
        value: T,
    }

    fun Measure.measure(self: Box) T {
        self.value;
    }
}

construct ints = boxy[i32];

fun maybe_box(flag: bool) ?ints.Box {
    if flag { ints.Box { value: 13 }; } else { null; };
}

fun main() i32 {
    ints.Measure.measure(maybe_box(true) \\ ints.Box { value: 1 });
}
`);
    expectEqual(actual, 13);
  }],
  ['module-local explicit protocol calls resolve for protocol-typed array reads', async () => {
    const actual = await compileAndRunSource(`mod boxy[T] {
    proto Measure[Self] {
        get value: T,
        measure(Self) T,
    };

    tag struct Box: Measure {
        value: T,
    }

    fun Measure.measure(self: Box) T {
        self.value;
    }
}

construct ints = boxy[i32];

fun main() i32 {
    let xs: array[ints.Measure] = array[ints.Measure].new_default(2);
    xs[0] = ints.Box { value: 9 };
    ints.Measure.measure(xs[0]) + xs[0].value;
}
`);
    expectEqual(actual, 18);
  }],
  ['module-local method sugar still works after nullable fallback expressions', async () => {
    const actual = await compileAndRunSource(`mod boxy[T] {
    proto Measure[Self] {
        measure(Self) T,
    };

    tag struct Box: Measure {
        value: T,
    }

    fun Measure.measure(self: Box) T {
        self.value;
    }
}

construct ints = boxy[i32];

fun maybe_box(flag: bool) ?ints.Box {
    if flag { ints.Box { value: 13 }; } else { null; };
}

fun main() i32 {
    (maybe_box(true) \\ ints.Box { value: 1 }).measure();
}
`);
    expectEqual(actual, 13);
  }],
  ['module-local protocol setters still work after nullable fallback expressions', async () => {
    const actual = await compileAndRunSource(`mod boxy[T] {
    proto Value[Self] {
        get value: T,
        set value: T,
    };

    tag struct Box: Value {
        mut value: T,
    }
}

construct ints = boxy[i32];

fun maybe_box(flag: bool) ?ints.Box {
    if flag { ints.Box { value: 13 }; } else { null; };
}

fun main() i32 {
    let box: ints.Box = maybe_box(true) \\ ints.Box { value: 1 };
    box.value += 2;
    box.value;
}
`);
    expectEqual(actual, 15);
  }],
  ['imported module protocols contribute both test and bench surfaces', async () => {
    await withFixtureFiles({
      '_shape.utu': `mod geom {
    proto Measure[Self] {
        measure(Self) i32,
    };

    tag struct Box: Measure {
        value: i32,
    }

    fun Measure.measure(self: Box) i32 {
        self.value;
    }
}
`,
      'main.utu': `import geom from "./_shape.utu";
construct geom;

test "measure works" {
    let box: Box = Box { value: 21 };
    assert box.measure() == 21;
}

bench "measure bench" {
    setup {
        let box: Box = Box { value: 3 };
        measure {
            box.measure();
        }
    }
}
`,
    }, async ({ mainSource, mainUri }) => {
      const testArtifact = await compile(mainSource, {
        mode: 'test',
        uri: mainUri,
        loadImport: loadNodeFileImport,
      });
      expectEqual(testArtifact.metadata.tests.length, 1);
      expectEqual(testArtifact.metadata.benches.length, 0);
      await instantiateAndRunTests(testArtifact.shim, testArtifact.metadata.tests);

      const benchArtifact = await compile(mainSource, {
        mode: 'bench',
        uri: mainUri,
        loadImport: loadNodeFileImport,
      });
      expectEqual(benchArtifact.metadata.tests.length, 0);
      expectEqual(benchArtifact.metadata.benches.length, 1);
      await instantiateAndRunBench(benchArtifact.shim, benchArtifact.metadata.benches[0]?.exportName);
    });
  }],
]);

if (failed)
  process.exit(1);

async function compileAndRunSource(source) {
  const { shim } = await compile(source, { mode: 'program' });
  return instantiateMain(shim);
}

async function compileAndRunFiles(files) {
  return withFixtureFiles(files, async ({ mainSource, mainUri }) => {
    const { shim } = await compile(mainSource, {
      mode: 'program',
      uri: mainUri,
      loadImport: loadNodeFileImport,
    });
    return instantiateMain(shim);
  });
}

async function instantiateMain(shim) {
  const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-feature-interactions-' });
  try {
    const exports = await compiledModule.module.instantiate();
    if (typeof exports.main !== 'function')
      throw new Error('Missing export "main"');
    return exports.main();
  } finally {
    await compiledModule.cleanup?.();
  }
}

async function instantiateAndRunTests(shim, tests) {
  const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-feature-tests-' });
  try {
    const exports = await compiledModule.module.instantiate();
    for (const test of tests) {
      if (typeof exports[test.exportName] !== 'function')
        throw new Error(`Missing test export "${test.exportName}"`);
      await exports[test.exportName]();
    }
  } finally {
    await compiledModule.cleanup?.();
  }
}

async function instantiateAndRunBench(shim, exportName) {
  const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-feature-benches-' });
  try {
    const exports = await compiledModule.module.instantiate();
    if (typeof exports[exportName] !== 'function')
      throw new Error(`Missing bench export "${exportName}"`);
    exports[exportName](1);
  } finally {
    await compiledModule.cleanup?.();
  }
}

async function withFixtureFiles(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'utu-feature-interactions-'));
  try {
    for (const [name, text] of Object.entries(files))
      await writeFile(join(dir, name), text, 'utf8');
    const mainPath = join(dir, 'main.utu');
    return await run({
      dir,
      mainPath,
      mainSource: files['main.utu'],
      mainUri: pathToFileURL(mainPath).href,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
