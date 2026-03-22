#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileUtuSource } from "./lib/compiler.mjs";
import { executeRuntimeTest, getCallableExport, loadCompiledRuntime, withRuntime } from "../../shared/compiledRuntime.mjs";
import { loadNodeModuleFromSource } from "../../shared/moduleLoaders.node.mjs";
import { createCliImports } from "./lib/nodeRuntime.mjs";

const help = `utu Bun CLI

Usage:
  utu compile <input> [--outdir <dir>] [--wat] [--bun]
  utu run <input> [--imports <file>]
  utu test <input> [--imports <file>]
  utu bench <input> [--imports <file>] [--seconds <n>] [--samples <n>] [--warmup <n>]
`;

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
  const { input, outdir, wat, bun } = parseCommandArgs(args, {
    command: "compile",
    missingInput: "compile needs an input file",
    defaults: { outdir: "./dist", wat: false, bun: false },
    flags: {
      "--wat": booleanFlag("wat"),
      "--bun": booleanFlag("bun"),
      "--outdir": valueFlag("outdir"),
      "--node": unsupportedFlag("compile only supports --wat and --bun"),
      "--imports": unsupportedFlag("compile only supports --wat and --bun"),
    },
  });

  const file = path.resolve(input);
  const source = await readFile(file, "utf8");
  const name = path.basename(file, path.extname(file));
  const { shim, wasm, wat: watText } = await compileUtuSource(source, {
    wat,
    shim: bun ? "inline-wasm" : "external-wasm",
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
  await Promise.all(outputs.map(([file, data, encoding]) => writeFile(file, data, encoding)));
  outputs.forEach(([file]) => console.log(`Wrote ${file}`));
  if (bun) console.log(`Wrote ${await buildBunExecutable(base, shim)}`);
}

async function runCmd(args) {
  const { input, importsFile } = parsePathArgs(args, "run");
  await withProgramRuntime(input, { importsFile }, async runtime => {
    const result = await getCallableExport(runtime.exports, "main", "The program does not export a callable main function")();
    if (result !== undefined) console.log(result);
  });
}

async function testCmd(args) {
  const { input, importsFile } = parsePathArgs(args, "test");
  await withProgramRuntime(input, { importsFile, mode: "test" }, async runtime => {
    if (!runtime.metadata.tests.length) fail("No tests found");
    let failed = false;
    for (let ordinal = 0; ordinal < runtime.metadata.tests.length; ordinal += 1) {
      const result = await executeRuntimeTest(runtime, ordinal, { formatError: text });
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
      if (!result.passed) {
        failed = true;
        console.log(`  ${result.error}`);
      }
    }
    if (failed) process.exitCode = 1;
  });
}

async function benchCmd(args) {
  const { input, importsFile, seconds, samples, warmup } = parseCommandArgs(args, {
    command: "bench",
    missingInput: "bench needs an input file",
    defaults: { importsFile: "", seconds: 1, samples: 1, warmup: 1 },
    flags: {
      "--imports": valueFlag("importsFile"),
      "--seconds": valueFlag("seconds", value => floatArg(value, "--seconds", 0)),
      "--samples": valueFlag("samples", value => intArg(value, "--samples", 1)),
      "--warmup": valueFlag("warmup", value => intArg(value, "--warmup")),
    },
  });

  await withProgramRuntime(input, { importsFile, mode: "bench" }, async runtime => {
    if (!runtime.metadata.benches.length) fail("No benchmarks found");
    const targetNs = Math.floor(seconds * 1e9);
    for (const { name, exportName } of runtime.metadata.benches) {
      const bench = getCallableExport(runtime.exports, exportName, `Missing benchmark export "${exportName}"`);
      let estimate = 1;
      for (let i = 0; i < warmup; i++) {
        estimate = await calibrateIterations(bench, targetNs, estimate);
      }
      const runs = [];
      for (let i = 0; i < samples; i++) {
        const iterations = clampIterations(estimate);
        const elapsedNs = await timeInvocation(() => bench(iterations));
        runs.push({ iterations, elapsedNs });
        estimate = projectIterations(iterations, elapsedNs, targetNs);
      }
      const rates = runs.map(run => rate(run.iterations, run.elapsedNs));
      const meanRate = rates.reduce((sum, value) => sum + value, 0) / rates.length;
      const meanNsPerIter = runs.reduce((sum, run) => sum + run.elapsedNs, 0) / runs.reduce((sum, run) => sum + run.iterations, 0);
      console.log(
        `${name}: mean ${itersPerSecond(meanRate)}, min ${itersPerSecond(Math.min(...rates))}, `
        + `max ${itersPerSecond(Math.max(...rates))}, ${ns(meanNsPerIter)}/iter, `
        + `${seconds.toFixed(3)}s target`
      );
    }
  });
}

function parsePathArgs(args, command) {
  return parseCommandArgs(args, {
    command,
    missingInput: `${command} needs an input file`,
    defaults: { importsFile: "" },
    flags: {
      "--imports": valueFlag("importsFile"),
    },
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

async function timeInvocation(run) {
  const start = process.hrtime.bigint();
  await run();
  return Number(process.hrtime.bigint() - start);
}

async function calibrateIterations(bench, targetNs, initialIterations) {
  let iterations = clampIterations(initialIterations);
  let elapsedNs = await timeInvocation(() => bench(iterations));

  // Get the warmup call out of the sub-millisecond noise range before projecting.
  while (elapsedNs < targetNs / 10 && iterations < MAX_BENCH_ITERATIONS) {
    const scale = elapsedNs <= 0 ? 10 : Math.max(2, Math.ceil((targetNs / 10) / elapsedNs));
    const next = clampIterations(iterations * scale);
    if (next === iterations) break;
    iterations = next;
    elapsedNs = await timeInvocation(() => bench(iterations));
  }

  return projectIterations(iterations, elapsedNs, targetNs);
}

function projectIterations(iterations, elapsedNs, targetNs) {
  if (elapsedNs <= 0) return clampIterations(iterations * 10);
  const projected = Math.round(iterations * (targetNs / elapsedNs));
  return clampIterations(projected);
}

function clampIterations(value) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.max(1, Math.min(MAX_BENCH_ITERATIONS, Math.round(value)));
}

function rate(iterations, elapsedNs) {
  return elapsedNs <= 0 ? 0 : iterations / (elapsedNs / 1e9);
}

function itersPerSecond(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(3)}G iter/s`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(3)}M iter/s`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(3)}K iter/s`;
  if (value >= 100) return `${value.toFixed(0)} iter/s`;
  if (value >= 10) return `${value.toFixed(1)} iter/s`;
  return `${value.toFixed(2)} iter/s`;
}

const MAX_BENCH_ITERATIONS = 0x7fffffff;

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
  const packageRoot = getCliPackageRoot();
  const buildRoot = path.join(packageRoot, ".tmp");
  await mkdir(buildRoot, { recursive: true });
  const dir = await mkdtemp(path.join(buildRoot, "utu-bun-"));
  const out = process.platform === "win32" ? `${base}.exe` : base;
  const program = path.join(dir, "program.mjs");
  const runner = path.join(dir, "run.mjs");
  const helperPath = path.join(packageRoot, "src/lib/bunMainRunner.mjs");
  const helperImport = relativeImportSpecifier(dir, helperPath);
  const cleanup = () => rm(dir, { force: true, recursive: true });

  await writeFile(program, js, "utf8");
  await writeFile(runner, `
import { instantiate } from "./program.mjs";
import { runCompiledMain } from ${JSON.stringify(helperImport)};

await runCompiledMain(instantiate);
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

function relativeImportSpecifier(fromDir, targetFile) {
  const specifier = path.relative(fromDir, targetFile).split(path.sep).join("/");
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function getCliPackageRoot() {
  const modulePath = fileURLToPath(import.meta.url);
  if (!modulePath.startsWith("/$bunfs/")) return path.resolve(path.dirname(modulePath), "..");
  return path.resolve(path.dirname(process.execPath), "..");
}

async function withProgramRuntime(input, { importsFile = "", mode = "program" } = {}, run) {
  const source = await readFile(path.resolve(input), "utf8");
  return withRuntime(loadCompiledRuntime({
    source,
    mode,
    compileSource: compileUtuSource,
    loadModule: (shim) => loadNodeModuleFromSource(shim),
    createImports: () => createCliImports(importsFile),
  }), run);
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
