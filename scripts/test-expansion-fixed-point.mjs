import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../packages/document/default-wasm.js';
import { createUtuTreeSitterParser, parseTree } from '../packages/document/index.js';
import { runExpansionFixedPoint } from '../packages/compiler/expansion-fixed-point.js';
import { materializeExpandedSource } from '../packages/compiler/edit-materialize-expanded-source.js';
import { createExpansionSession } from '../packages/compiler/expansion-session.js';
import {
  assertManagedTestModule,
  expectDeepEqual,
  expectEqual,
  loadNodeFileImport,
  runNamedCases,
} from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const parser = await createUtuTreeSitterParser({
  wasmUrl: DEFAULT_GRAMMAR_WASM,
  runtimeWasmUrl: DEFAULT_RUNTIME_WASM,
});

const nestedNamespaceSource = `mod leaf[T] {
    struct Box {
        value: T,
    }

    fun Box.new(value: T) Box {
        Box { value: value };
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}

mod wrapper[T] {
    fun make(value: T) leaf[T].Box {
        leaf[T].Box.new(value);
    }
}

construct ints = wrapper[i32];

fun main() i32 {
    ints.make(7).get();
}
`;

try {
  const failed = await runNamedCases([
    ['expansion fixed-point and pipeline modules import cleanly', async () => {
      await import('../packages/compiler/expansion-fixed-point.js');
      await import('../packages/compiler/pipeline.js');
    }],
    ['nested namespace discovery reaches a fixed point before emission', async () => {
      await withExpansionSession(nestedNamespaceSource, {}, async (state) => {
        await runExpansionFixedPoint(state);
        expectEqual(state.fixedPoint?.converged, true);
        expectDeepEqual(
          state.expander.namespaceOrder.map((namespace) => namespace.displayText),
          ['wrapper[i32]', 'leaf[i32]'],
        );
        const materialized = await materializeExpandedSource(state);
        expectEqual(typeof materialized.source, 'string');
        if (!materialized.source.includes('Utu'))
          throw new Error('Expected materialized expansion output to include mangled namespace declarations.');
      });
    }],
    ['repeated fixed-point runs terminate and stay cached after convergence', async () => {
      await withExpansionSession(nestedNamespaceSource, {}, async (state) => {
        await runExpansionFixedPoint(state);
        const iterations = state.iteration;
        const passRunCount = state.fixedPointPassRuns.length;
        if (iterations < 1 || iterations >= state.maxIterations)
          throw new Error(`Expected a bounded iteration count, got ${iterations} with max ${state.maxIterations}.`);
        await runExpansionFixedPoint(state);
        expectEqual(state.iteration, iterations);
        expectEqual(state.fixedPointPassRuns.length, passRunCount);
      });
    }],
    ['transitive file imports discover nested namespaces through imported modules', async () => {
      await withFixtureFiles({
        '_leaf.utu': `mod leaf[T] {
    struct Box {
        value: T,
    }

    fun Box.new(value: T) Box {
        Box { value: value };
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}
`,
        '_wrapper.utu': `import leaf from "./_leaf.utu";

mod wrapper[T] {
    fun make(value: T) leaf[T].Box {
        leaf[T].Box.new(value);
    }
}
`,
        'main.utu': `import wrapper from "./_wrapper.utu";

construct ints = wrapper[i32];

fun main() i32 {
    ints.make(9).get();
}
`,
      }, async ({ mainSource, mainUri }) => {
        await withExpansionSession(mainSource, { uri: mainUri, loadImport: loadNodeFileImport }, async (state) => {
          await runExpansionFixedPoint(state);
          expectDeepEqual(
            state.expander.namespaceOrder.map((namespace) => namespace.displayText),
            ['wrapper[i32]', 'leaf[i32]'],
          );
        });
      });
    }],
    ['non-convergence reports a diagnostic', async () => {
      await withExpansionSession(nestedNamespaceSource, { maxIterations: 1 }, async (state) => {
        try {
          await runExpansionFixedPoint(state);
        } catch (error) {
          const message = String(error?.message ?? error);
          if (!message.includes('did not converge'))
            throw new Error(`Expected non-convergence error, got ${JSON.stringify(message)}`);
          if (!state.diagnostics.some((diagnostic) => diagnostic?.message?.includes('did not converge')))
            throw new Error('Expected non-convergence to publish a diagnostic.');
          return;
        }
        throw new Error('Expected expansion fixed point to fail when maxIterations is too low.');
      });
    }],
  ]);

  if (failed)
    process.exit(1);
} finally {
  parser.delete();
}

async function withExpansionSession(source, { uri = null, loadImport = null, maxIterations = null } = {}, callback) {
  const parsed = parseTree(parser, source);
  const state = createExpansionSession({
    treeOrNode: parsed.tree.rootNode,
    source,
    uri,
    loadImport,
    parseSource: async (sourceText) => {
      const imported = parseTree(parser, sourceText);
      return {
        root: imported.tree.rootNode,
        dispose: imported.dispose,
      };
    },
    expandOptions: maxIterations == null ? {} : { maxIterations },
  });
  try {
    return await callback(state);
  } finally {
    state.dispose();
    parsed.dispose();
  }
}

async function withFixtureFiles(files, callback) {
  const dir = await mkdtemp(join(tmpdir(), 'utu-expansion-fixed-point-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      await writeFile(join(dir, name), source, 'utf8');
    }
    const mainUri = pathToFileURL(join(dir, 'main.utu')).href;
    return await callback({
      mainSource: files['main.utu'],
      mainUri,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
