import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(path.join(tmpdir(), 'utu-mem-trap-'));
try {
  for (const [name, body] of [['read', 'bytes[1];'], ['write', 'bytes[1] = 3;']]) {
    const file = path.join(dir, `${name}.utu`);
    writeFileSync(file, `mem bytes: U8;\nexport main() void { bytes.resize(1); ${body} }\n`);
    for (const mode of ['small', 'fast']) {
      const run = spawnSync(process.execPath, ['cli/utu.mjs', 'run', file, '-O', mode], { encoding: 'utf8', timeout: 600_000 });
      assert.equal(run.status, 1, `${name} ${mode}: ${run.stderr}`);
      assert.match(run.stderr, /TRAP  Index out of bounds/, `${name} ${mode}`);
      console.log(`${name} ${mode}: Index out of bounds`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
