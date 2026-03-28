#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import data from "../../../jsondata/cli.data.json" with { type: "json" };
import { compileDocument, getDocumentMetadata } from "../../compiler/api/index.js";
import { executeRuntimeBenchmark, executeRuntimeTest, loadCompiledRuntime, loadNodeModuleFromSource, normalizeCompileArtifact, withRuntime } from "../../runtime/node.js";

const help = data.help;
main().catch(error => (console.error(text(error)), process.exitCode = 1));

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || command === "help" || args.includes("--help")) return void console.log(help);
  const run = { compile: compileCmd, run: runCmd, test: testCmd, bench: benchCmd }[command];
  if (run) return run(args);
  return compileCmd(argv);
}

async function compileCmd(args) {
  const { input, outdir, wat, bun, optimize } = parseArgs(args, "compile", "compile needs an input file", data.compileDefaults, { "--wat": ["wat"], "--bun": ["bun", () => true], "--node": ["bun", () => false], "--no-opt": ["optimize", () => false], "--outdir": ["outdir", value => value] });
  const file = path.resolve(input);
  const source = await readFile(file, "utf8");
  const outputDir = outdir ? path.resolve(outdir) : bun ? path.dirname(file) : path.resolve(data.compileNodeDefaults.outdir);
  const base = path.join(outputDir, path.basename(file, path.extname(file)));
  const targetName = path.basename(file, path.extname(file));
  const { shim, wasm, wat: watText } = await compileSource(source, { wat, where: bun ? "bun" : "local_file_node", moduleFormat: "esm", targetName: bun ? targetName : null, optimize });
  await mkdir(path.dirname(base), { recursive: true });
  const outputs = [!bun && [`${base}.mjs`, shim, "utf8"], !bun && [`${base}.wasm`, wasm], watText && [`${base}.wat`, watText, "utf8"]].filter(Boolean);
  if (bun) await Promise.all([rm(`${base}.mjs`, { force: true }), rm(`${base}.wasm`, { force: true }), wat ? undefined : rm(`${base}.wat`, { force: true })]);
  await Promise.all(outputs.map(([filePath, value, encoding]) => writeFile(filePath, value, encoding)));
  outputs.forEach(([filePath]) => console.log(`Wrote ${filePath}`));
  if (bun) console.log(`Wrote ${await buildBunExecutable(base, shim, wasm, targetName)}`);
}

async function runCmd(args) {
  const { input } = parseArgs(args, "run", "run needs an input file");
  const source = await readFile(path.resolve(input), "utf8");
  if (!(await getMetadata(source)).hasMain) fail('UTU run requires `export fun main()` in the input file.');
  return withRuntime(loadRuntime(source), async ({ exports }) => {
    const result = await exports.main();
    if (result !== undefined) console.log(result);
  });
}

async function testCmd(args) {
  const { input } = parseArgs(args, "test", "test needs an input file");
  const source = await readFile(path.resolve(input), "utf8");
  const { tests } = await getMetadata(source);
  if (!tests.length) fail("No tests found");
  let failed = false;
  await withRuntime(loadRuntime(source, { mode: "test" }), async runtime => {
    for (const [ordinal, name] of tests.entries()) {
      const result = await executeRuntimeTest(runtime, ordinal, { formatError: text });
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
      if (!result.passed) failed = console.log(`  ${result.error}`) ?? true;
    }
  });
  if (failed) process.exitCode = 1;
}

async function benchCmd(args) {
  const { input, seconds, samples, warmup } = parseArgs(args, "bench", "bench needs an input file", data.benchDefaults, { "--seconds": ["seconds", value => parseNumber(value, "--seconds", Number.parseFloat, n => n > 0)], "--samples": ["samples", value => parseNumber(value, "--samples", Number.parseInt, n => n >= 1)], "--warmup": ["warmup", value => parseNumber(value, "--warmup", Number.parseInt, n => n >= 0)] });
  const source = await readFile(path.resolve(input), "utf8");
  const { benches } = await getMetadata(source);
  if (!benches.length) fail("No benchmarks found");
  await withRuntime(loadRuntime(source, { mode: "bench" }), async runtime => {
    for (const [ordinal] of benches.entries()) {
      console.log((await executeRuntimeBenchmark(runtime, ordinal, { seconds, samples, warmup })).summary);
    }
  });
}

function parseArgs(args, command, missingInput, defaults = {}, flags = {}) {
  let input = "";
  const parsed = { ...defaults };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const flag = flags[arg];
    if (!flag) {
      if (arg.startsWith("-")) fail(`Unknown flag "${arg}"`);
      if (input) fail(`Too many arguments for ${command}`); else input = arg;
      continue;
    }
    if (typeof flag === "string") fail(flag);
    const [key, read = () => true] = flag;
    const expectsValue = flag.length > 1 && read.length > 0;
    const value = expectsValue ? args[++i] : undefined;
    if (expectsValue && value === undefined) fail(`Missing value for ${arg}`);
    parsed[key] = read(value);
  }
  if (!input) fail(missingInput);
  return { input, ...parsed };
}

function parseNumber(value, flag, parse, valid) {
  const n = parse(value ?? "", 10);
  return Number.isFinite(n) && valid(n) ? n : fail(`Invalid value for ${flag}`);
}

function fail(message) { throw new Error(message); }
function text(error) { return error instanceof Error ? error.message : String(error); }

async function buildBunExecutable(base, shim, wasm, targetName) {
  const buildRoot = path.join(tmpdir(), "utu-bun-build");
  await mkdir(buildRoot, { recursive: true });
  const dir = await mkdtemp(path.join(buildRoot, "utu-bun-"));
  const out = process.platform === "win32" ? `${base}.exe` : base;
  const runner = path.join(dir, "run.mjs");
  await Promise.all([
    writeFile(path.join(dir, "program.mjs"), shim, "utf8"),
    writeFile(path.join(dir, `${targetName}.wasm`), wasm),
    writeFile(runner, 'import { instantiate } from "./program.mjs";\nconst exports = await instantiate();\nconst result = await exports.main();\nif (result !== undefined) console.log(result);\n', "utf8"),
  ]);
  try {
    await exec("bun", ["build", "--compile", "--target=bun", "--outfile", out, runner]);
    return out;
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code ?? 1}`)));
  });
}

function loadRuntime(source, { mode = "program", targetName = null } = {}) {
  return loadCompiledRuntime({ source, mode, compileSource, loadModule: shim => loadNodeModuleFromSource(shim), compileOptions: { targetName, where: "external" } });
}

async function compileSource(source, { wat = false, mode = "program", where = "base64", moduleFormat = "esm", targetName = null, optimize = true } = {}) {
  return normalizeCompileArtifact(await compileDocument({
    uri: "memory://utu-cli",
    sourceText: source,
    compileOptions: { wat, mode, where, moduleFormat, targetName, optimize },
  }));
}

async function getMetadata(source) { return getDocumentMetadata({ sourceText: source }); }
