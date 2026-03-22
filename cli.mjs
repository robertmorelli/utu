#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import grammarWasmPath from "./tree-sitter-utu.wasm" with { type: "file" };
import runtimeWasmPath from "web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };
import data from "./jsondata/cli.data.json" with { type: "json" };

import * as compiler from "./index.js";
import { executeRuntimeBenchmark, executeRuntimeTest, getCallableExport, loadCompiledRuntime, withRuntime } from "./loadCompiledRuntime.mjs";
import { loadNodeModuleFromSource } from "./loadNodeModuleFromSource.mjs";

const help = data.help;

const commands = { compile: compileCmd, run: runCmd, test: testCmd, bench: benchCmd };
const compilerAssetOptions = { wasmUrl: grammarWasmPath, runtimeWasmUrl: runtimeWasmPath };

main().catch(error => {
  console.error(text(error));
  process.exitCode = 1;
});

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || command === "help" || args.includes("--help")) return void console.log(help);
  if (commands[command]) return commands[command](args);
  fail(`Unknown command "${command}".\n\n${help}`);
}

async function compileCmd(args) {
  const { input, outdir, wat, bun } = parseCommandArgs(args, {
    command: "compile",
    missingInput: "compile needs an input file",
    defaults: data.compileDefaults,
    flags: {
      "--wat": booleanFlag("wat"),
      "--bun": booleanFlag("bun"),
      "--outdir": valueFlag("outdir"),
      "--node": unsupportedFlag("compile only supports --wat and --bun"),
    },
  });

  const file = path.resolve(input);
  const source = await readFile(file, "utf8");
  const name = path.basename(file, path.extname(file));
  const { shim, wasm, wat: watText } = await compileSource(source, {
    wat,
    where: bun ? "base64" : "local_file_node",
    moduleFormat: "esm",
  });
  const dir = path.resolve(outdir);
  const base = path.join(dir, name);

  await mkdir(dir, { recursive: true });
  const outputs = [
    !bun && [`${base}.mjs`, shim, "utf8"],
    !bun && [`${base}.wasm`, wasm],
    watText && [`${base}.wat`, watText, "utf8"],
  ].filter(Boolean);
  if (bun) {
    await Promise.all([
      rm(`${base}.mjs`, { force: true }),
      rm(`${base}.wasm`, { force: true }),
      wat ? Promise.resolve() : rm(`${base}.wat`, { force: true }),
    ]);
  }
  await Promise.all(outputs.map(([filePath, data, encoding]) => writeFile(filePath, data, encoding)));
  outputs.forEach(([filePath]) => console.log(`Wrote ${filePath}`));
  if (bun) console.log(`Wrote ${await buildBunExecutable(base, shim)}`);
}

async function runCmd(args) {
  const { input } = parsePathArgs(args, "run");
  await withProgramRuntime(input, {}, async runtime => {
    const result = await getCallableExport(runtime.exports, "main")();
    if (result !== undefined) console.log(result);
  });
}

async function testCmd(args) {
  const { input } = parsePathArgs(args, "test");
  const source = await readFile(path.resolve(input), "utf8");
  const metadata = await getMetadata(source);
  if (!metadata.tests.length) fail("No tests found");
  let failed = false;
  for (const test of metadata.tests) {
    const runtime = await loadRuntime(source, { mode: "test", targetName: test.name });
    try {
      const result = await executeRuntimeTest(runtime, 0, { formatError: text });
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
      if (!result.passed) {
        failed = true;
        console.log(`  ${result.error}`);
      }
    } finally {
      await runtime.cleanup();
    }
  }
  if (failed) process.exitCode = 1;
}

async function benchCmd(args) {
  const { input, seconds, samples, warmup } = parseCommandArgs(args, {
    command: "bench",
    missingInput: "bench needs an input file",
    defaults: data.benchDefaults,
    flags: {
      "--seconds": valueFlag("seconds", value => floatArg(value, "--seconds", 0)),
      "--samples": valueFlag("samples", value => intArg(value, "--samples", 1)),
      "--warmup": valueFlag("warmup", value => intArg(value, "--warmup")),
    },
  });

  const source = await readFile(path.resolve(input), "utf8");
  const metadata = await getMetadata(source);
  if (!metadata.benches.length) fail("No benchmarks found");
  for (const bench of metadata.benches) {
    const runtime = await loadRuntime(source, { mode: "bench", targetName: bench.name });
    try {
      const result = await executeRuntimeBenchmark(runtime, 0, { seconds, samples, warmup });
      console.log(result.summary);
    } finally {
      await runtime.cleanup();
    }
  }
}

function parsePathArgs(args, command) {
  return parseCommandArgs(args, {
    command,
    missingInput: `${command} needs an input file`,
    flags: {},
  });
}

function intArg(value, flag, min = 0) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < min) fail(`Invalid value for ${flag}`);
  return n;
}

function floatArg(value, flag, minExclusive = 0) {
  const n = Number.parseFloat(value ?? "");
  if (!Number.isFinite(n) || n <= minExclusive) fail(`Invalid value for ${flag}`);
  return n;
}

function fail(message) {
  throw new Error(message);
}

function text(error) {
  return error instanceof Error ? error.message : String(error);
}

async function buildBunExecutable(base, js) {
  const packageRoot = getCliPackageRoot();
  const buildRoot = path.join(packageRoot, ".tmp");
  await mkdir(buildRoot, { recursive: true });
  const dir = await mkdtemp(path.join(buildRoot, "utu-bun-"));
  const out = process.platform === "win32" ? `${base}.exe` : base;
  const program = path.join(dir, "program.mjs");
  const runner = path.join(dir, "run.mjs");
  const cleanup = () => rm(dir, { force: true, recursive: true });

  await writeFile(program, js, "utf8");
  await writeFile(runner, `
import { instantiate } from "./program.mjs";
const exports = await instantiate();
const result = await exports.main();
if (result !== undefined) console.log(result);
`, "utf8");

  try {
    await exec("bun", ["build", "--compile", "--target=bun", "--outfile", out, runner]);
    return out;
  } finally {
    await cleanup();
  }
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code ?? 1}`)));
  });
}

function getCliPackageRoot() {
  const modulePath = fileURLToPath(import.meta.url);
  if (!modulePath.startsWith("/$bunfs/")) return path.resolve(path.dirname(modulePath), "..");
  return path.resolve(path.dirname(process.execPath), "..");
}

async function withProgramRuntime(input, { mode = "program" } = {}, run) {
  const source = await readFile(path.resolve(input), "utf8");
  return withRuntime(loadRuntime(source, { mode }), run);
}

function loadRuntime(source, { mode = "program", targetName = null } = {}) {
  return loadCompiledRuntime({
    source,
    mode,
    compileSource,
    loadModule: shim => loadNodeModuleFromSource(shim),
    compileOptions: { targetName },
  });
}

async function compileSource(source, { wat = false, mode = "program", where = "base64", moduleFormat = "esm", targetName = null } = {}) {
  await compiler.init(compilerAssetOptions);
  const value = await compiler.compile(source, {
    wat,
    mode,
    where,
    moduleFormat,
    targetName,
    ...compilerAssetOptions,
  });
  return {
    ...value,
    js: value.js ?? value.shim,
    shim: value.shim ?? value.js,
    wasm: value.wasm instanceof Uint8Array ? value.wasm : new Uint8Array(value.wasm),
    metadata: value.metadata ?? {},
  };
}

async function getMetadata(source) {
  await compiler.init(compilerAssetOptions);
  return compiler.get_metadata(source, compilerAssetOptions);
}

function parseCommandArgs(args, { command, missingInput, defaults = {}, flags = {} }) {
  let input = "";
  const parsed = { ...defaults };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const flag = flags[arg];
    if (flag) {
      if (flag.unsupported) fail(flag.unsupported);
      const value = flag.arity === 0 ? undefined : args[++i];
      if (flag.arity === 1 && value === undefined) fail(`Missing value for ${arg}`);
      parsed[flag.key] = flag.read ? flag.read(value) : value;
      continue;
    }
    if (arg.startsWith("-")) fail(`Unknown flag "${arg}"`);
    if (!input) input = arg;
    else fail(`Too many arguments for ${command}`);
  }
  if (!input) fail(missingInput);
  return { input, ...parsed };
}

function booleanFlag(key) {
  return { key, arity: 0, read: () => true };
}

function valueFlag(key, read) {
  return { key, arity: 1, read };
}

function unsupportedFlag(message) {
  return { unsupported: message };
}
