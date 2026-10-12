// Build the Rust implementation: wasm32 release, then wasm-bindgen for Node.
// Uses rustup's stable toolchain (Homebrew's rustc has no wasm target).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../rust');
const tool = name => execFileSync('rustup', ['which', name, '--toolchain', 'stable'], { encoding: 'utf8' }).trim();
const env = { ...process.env, RUSTC: tool('rustc') };
const run = (command, args) => execFileSync(command, args, { cwd: RUST, env, stdio: 'inherit' });

run(tool('cargo'), ['build', '--release', '--target', 'wasm32-unknown-unknown', '--lib']);
run('wasm-bindgen', ['--target', 'nodejs', '--out-dir', 'pkg-node', 'target/wasm32-unknown-unknown/release/foundry.wasm']);
fs.writeFileSync(path.join(RUST, 'pkg-node/package.json'), '{ "type": "commonjs" }\n');
