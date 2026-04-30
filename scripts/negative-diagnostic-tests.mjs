import path from 'node:path';

import { negativeDiagnosticCases } from './negative-diagnostic-cases.mjs';
import { formatDiagnostics } from '../src/index.js';

export function registerNegativeDiagnosticTests({ test, makeCompiler, assert }) {
  test('analysis: negative corpus reports specific diagnostics', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const { default: fs } = await import('node:fs/promises');
    const dir = path.join(ROOT, '.tmp', 'negative-corpus');
    await fs.mkdir(dir, { recursive: true });

    try {
      for (let i = 0; i < negativeDiagnosticCases.length; i++) {
        const [name, src, kind, message] = negativeDiagnosticCases[i];
        const file = path.join(dir, `${String(i).padStart(2, '0')}.utu`);
        await fs.writeFile(file, src);
        const diagnostics = await diagnosticsFor(compiler, file);
        const found = diagnostics.find(d => d.kind === kind && d.message.includes(message));
        assert(found, `${name}: expected ${kind} containing ${JSON.stringify(message)}, got:\n${await formatDiagnostics(diagnostics, { readFile: (p) => fs.readFile(p, 'utf8') })}`);
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

async function diagnosticsFor(compiler, file) {
  try {
    return (await compiler.analyzeFile(file)).artifacts.diagnostics;
  } catch (error) {
    return error.artifacts?.diagnostics ?? [];
  }
}
