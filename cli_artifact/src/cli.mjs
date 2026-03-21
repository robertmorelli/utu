#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { compileUtuSource } from "./lib/compiler.mjs";

const help = `utu Bun CLI

Usage:
  utu compile <input> [--outdir <dir>] [--wat] [--bun]
  utu run <input> [--imports <file>]
  utu test <input> [--imports <file>]
  utu bench <input> [--imports <file>] [--iterations <n>] [--samples <n>] [--warmup <n>]
`;

const imports = {
  console_log: value => console.log(value),
  i64_to_string: value => String(value),
  f64_to_string: value => String(value),
  math_sin: value => Math.sin(value),
  math_cos: value => Math.cos(value),
  math_sqrt: value => Math.sqrt(value),
};
const commands = { compile: compileCmd, run: runCmd, test: testCmd, bench: benchCmd };

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
  let input = "", outdir = "./dist", wat = false, bun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--wat") wat = true;
    else if (arg === "--bun") bun = true;
    else if (arg === "--outdir") outdir = args[++i] ?? fail("Missing value for --outdir");
    else if (arg.startsWith("-")) fail(`Unknown flag "${arg}"`);
    else if (!input) input = arg;
    else fail("Too many arguments for compile");
  }
  if (!input) fail("compile needs an input file");

  const file = path.resolve(input);
  const name = path.basename(file, path.extname(file));
  const { js, wasm, wat: watText } = await compileUtuSource(await readFile(file, "utf8"), { wat });
  const dir = path.resolve(outdir);
  const base = path.join(dir, name);

  await mkdir(dir, { recursive: true });
  const outputs = [
    [`${base}.mjs`, js, "utf8"],
    [`${base}.wasm`, wasm],
    watText && [`${base}.wat`, watText, "utf8"],
  ].filter(Boolean);
  await Promise.all(outputs.map(([file, data, encoding]) => writeFile(file, data, encoding)));
  outputs.forEach(([file]) => console.log(`Wrote ${file}`));
  if (bun) console.log(`Wrote ${await buildBunExecutable(base, js)}`);
}

async function runCmd(args) {
  const { input, importsFile } = parsePathArgs(args, "run");
  await withExports(input, { importsFile }, async ({ exports }) => {
    const result = await fn(exports, "main", "The program does not export a callable main function")();
    if (result !== undefined) console.log(result);
  });
}

async function testCmd(args) {
  const { input, importsFile } = parsePathArgs(args, "test");
  await withExports(input, { importsFile, mode: "test" }, async ({ exports, metadata }) => {
    if (!metadata.tests.length) fail("No tests found");
    let failed = false;
    for (const { name, exportName } of metadata.tests) {
      try {
        await fn(exports, exportName, `Missing test export "${exportName}"`)();
        console.log(`PASS ${name}`);
      } catch (error) {
        failed = true;
        console.log(`FAIL ${name}`);
        console.log(`  ${text(error)}`);
      }
    }
    if (failed) process.exitCode = 1;
  });
}

async function benchCmd(args) {
  let input = "", importsFile = "", iterations = 1000, samples = 10, warmup = 2;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--imports") importsFile = args[++i] ?? fail("Missing value for --imports");
    else if (arg === "--iterations") iterations = intArg(args[++i], "--iterations", 1);
    else if (arg === "--samples") samples = intArg(args[++i], "--samples", 1);
    else if (arg === "--warmup") warmup = intArg(args[++i], "--warmup");
    else if (arg.startsWith("-")) fail(`Unknown flag "${arg}"`);
    else if (!input) input = arg;
    else fail("Too many arguments for bench");
  }
  if (!input) fail("bench needs an input file");

  await withExports(input, { importsFile, mode: "bench" }, async ({ exports, metadata }) => {
    if (!metadata.benches.length) fail("No benchmarks found");
    for (const { name, exportName } of metadata.benches) {
      const bench = fn(exports, exportName, `Missing benchmark export "${exportName}"`);
      for (let i = 0; i < warmup; i++) await bench(iterations);
      const times = [];
      for (let i = 0; i < samples; i++) {
        const start = process.hrtime.bigint();
        await bench(iterations);
        times.push(Number(process.hrtime.bigint() - start));
      }
      const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
      console.log(`${name}: mean ${ns(mean)}, min ${ns(Math.min(...times))}, max ${ns(Math.max(...times))}, ${ns(mean / iterations)}/iter`);
    }
  });
}

function parsePathArgs(args, command) {
  let input = "", importsFile = "";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--imports") importsFile = args[++i] ?? fail("Missing value for --imports");
    else if (arg.startsWith("-")) fail(`Unknown flag "${arg}"`);
    else if (!input) input = arg;
    else fail(`Too many arguments for ${command}`);
  }
  if (!input) fail(`${command} needs an input file`);
  return { input, importsFile };
}

async function loadExports(input, { importsFile = "", mode = "program" } = {}) {
  const { js, metadata } = await compileUtuSource(await readFile(path.resolve(input), "utf8"), { mode });
  const dir = await mkdtemp(path.join(tmpdir(), "utu-cli-"));
  const file = path.join(dir, "module.mjs");
  const cleanup = () => rm(dir, { force: true, recursive: true });
  await writeFile(file, js, "utf8");

  try {
    const mod = await import(pathToFileURL(file).href);
    return {
      exports: await mod.instantiate(await loadImports(importsFile)),
      metadata,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function withExports(input, options, run) {
  const loaded = await loadExports(input, options);
  try { return await run(loaded); } finally { await loaded.cleanup(); }
}

async function loadImports(file) {
  if (!file) return imports;
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  return { ...imports, ...(mod.default ?? mod.imports ?? mod) };
}

function fn(exports, name, message = `Missing export "${name}"`) {
  if (typeof exports[name] !== "function") fail(message);
  return exports[name];
}

function intArg(value, flag, min = 0) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < min) fail(`Invalid value for ${flag}`);
  return n;
}

function ns(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(3)}ms`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(3)}us`;
  return `${value.toFixed(0)}ns`;
}

function fail(message) {
  throw new Error(message);
}

function text(error) {
  return error instanceof Error ? error.message : String(error);
}

async function buildBunExecutable(base, js) {
  const dir = await mkdtemp(path.join(tmpdir(), "utu-bun-"));
  const out = process.platform === "win32" ? `${base}.exe` : base;
  const program = path.join(dir, "program.mjs");
  const runner = path.join(dir, "run.mjs");
  const cleanup = () => rm(dir, { force: true, recursive: true });

  await writeFile(program, js, "utf8");
  await writeFile(runner, `
import { instantiate } from "./program.mjs";

const imports = {
  console_log: value => console.log(value),
  i64_to_string: value => String(value),
  f64_to_string: value => String(value),
  math_sin: value => Math.sin(value),
  math_cos: value => Math.cos(value),
  math_sqrt: value => Math.sqrt(value),
};

const exports = await instantiate(imports);
if (typeof exports.main !== "function") throw new Error("The program does not export a callable main function");
const result = await exports.main();
if (result !== undefined) console.log(result);
`, "utf8");

  try {
    await exec(process.execPath, ["build", "--compile", "--target=bun", "--outfile", out, runner]);
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
