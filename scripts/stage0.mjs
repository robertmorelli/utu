// Refresh and verify the checked-in bootstrap compiler.
// node scripts/stage0.mjs --reason "..." | --verify | --verify-chain
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bootstrap } from './selfhost-bootstrap.mjs';
import { buildWith, instantiateBuilt, joinSelfhost, STAGE0 } from './selfhost.mjs';
import { sourcesRecord } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metaFile = path.join(ROOT, 'stage0', 'stage0.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trimEnd();
const gitBytes = (...args) => execFileSync('git', args, { cwd: ROOT });
const equal = (actual, expected, name) => {
  if (Buffer.compare(Buffer.from(actual), Buffer.from(expected)) !== 0) throw new Error(`${name} differs`);
};

function sourceAt(commit) {
  const tree = git('rev-parse', `${commit}:selfhost`);
  const names = git('show', `${commit}:selfhost/files.txt`).split('\n').map(line => line.trim()).filter(Boolean);
  const source = names.map(name => {
    let text = gitBytes('show', `${commit}:selfhost/${name}`).toString('utf8');
    if (!text.endsWith('\n')) text += '\n';
    return text;
  }).join('');
  return { tree, source };
}

async function buildWithBytes(wasm, spec, source) {
  const compiler = (await instantiateBuilt(wasm, spec)).instance.exports;
  return buildWith(compiler, { source });
}

function assertRecord(meta, wasm, source, tree) {
  if (meta.selfhostTree !== tree) throw new Error('stage0 source tree differs from provenance');
  if (meta.sourcesHash !== sourcesRecord(source).hash) throw new Error('stage0 source hash differs from provenance');
  if (meta.sha256 !== sha256(wasm) || meta.bytes !== wasm.length) throw new Error('stage0 wasm differs from provenance');
}

async function verify() {
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const wasm = fs.readFileSync(STAGE0);
  const spec = JSON.parse(fs.readFileSync(STAGE0.replace(/\.wasm$/, '.host.json'), 'utf8'));
  const { tree, source } = sourceAt(meta.commit);
  assertRecord(meta, wasm, source, tree);
  const built = await buildWithBytes(wasm, spec, source);
  equal(built.wasm, wasm, 'stage0 wasm rebuilt from recorded sources');
  equal(Buffer.from(JSON.stringify(built.spec)), Buffer.from(JSON.stringify(spec)), 'stage0 spec rebuilt from recorded sources');
  console.log(`stage0 verified: ${meta.commit} ${meta.sha256}`);
}

async function verifyChain() {
  const commits = git('log', '--format=%H', '--', 'stage0/stage0.json').split('\n').filter(Boolean);
  if (!commits.length) throw new Error('stage0 has no recorded refresh commits');
  for (const commit of commits) {
    const meta = JSON.parse(git('show', `${commit}:stage0/stage0.json`));
    const wasm = gitBytes('show', `${commit}:stage0/utu.wasm`);
    const spec = JSON.parse(git('show', `${commit}:stage0/utu.host.json`));
    const previous = gitBytes('show', `${commit}^:stage0/utu.wasm`);
    const previousSpec = JSON.parse(git('show', `${commit}^:stage0/utu.host.json`));
    const { tree, source } = sourceAt(meta.commit);
    assertRecord(meta, wasm, source, tree);
    if (meta.builtBy !== sha256(previous)) throw new Error(`${commit}: builtBy differs from previous stage0`);
    const first = await buildWithBytes(previous, previousSpec, source);
    const second = await buildWithBytes(first.wasm, first.spec, source);
    equal(second.wasm, wasm, `${commit}: stage 2 wasm`);
    equal(Buffer.from(JSON.stringify(second.spec)), Buffer.from(JSON.stringify(spec)), `${commit}: stage 2 spec`);
    console.log(`verified chain link ${commit}`);
  }
}

async function refresh(reason) {
  if (!reason) throw new Error('refresh requires --reason "..."');
  const dirty = git('status', '--porcelain', '--', 'selfhost', 'src/selfhost', 'scripts/selfhost.mjs', 'scripts/selfhost-bootstrap.mjs');
  if (dirty) throw new Error(`commit compiler sources and driver before refreshing stage0:\n${dirty}`);
  const commit = git('rev-parse', 'HEAD');
  const selfhostTree = git('rev-parse', `${commit}:selfhost`);
  const old = fs.readFileSync(STAGE0);
  const stage2 = await bootstrap();
  const wasm = Buffer.from(stage2.wasm);
  const meta = {
    commit, selfhostTree, sourcesHash: sourcesRecord(joinSelfhost().text).hash,
    sha256: sha256(wasm), bytes: wasm.length, builtBy: sha256(old),
    node: process.version, date: new Date().toISOString(), reason,
  };
  fs.writeFileSync(STAGE0, wasm);
  fs.writeFileSync(STAGE0.replace(/\.wasm$/, '.host.json'), JSON.stringify(stage2.spec));
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  await verify();
  console.log(`suggested commit: stage0: refresh to ${commit.slice(0, 7)} (${reason})`);
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--verify') await verify();
  else if (args.length === 1 && args[0] === '--verify-chain') await verifyChain();
  else if (args.length === 2 && args[0] === '--reason') await refresh(args[1]);
  else throw new Error('usage: node scripts/stage0.mjs --reason "..." | --verify | --verify-chain');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
