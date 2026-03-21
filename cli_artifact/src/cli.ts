#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { compileUtuSource } from "./lib/compiler.ts";

const mainHelp = `utu Bun CLI

Usage:
  utu compile <input> [--outdir <dir>] [--wat]
  utu run <input>
`;

const runtimeImports = {
  console_log: (value: unknown) => console.log(value),
  i64_to_string: (value: bigint | number) => String(value),
  f64_to_string: (value: number) => String(value),
  math_sin: (value: number) => Math.sin(value),
  math_cos: (value: number) => Math.cos(value),
  math_sqrt: (value: number) => Math.sqrt(value),
};

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  if (!command || command === "help" || args.includes("--help")) {
    console.log(mainHelp);
    return;
  }

  if (command === "compile") {
    await compile(args);
    return;
  }

  if (command === "run") {
    await run(args);
    return;
  }

  fail(`Unknown command "${command}".\n\n${mainHelp}`);
}

async function compile(args: string[]) {
  let input = "";
  let outdir = "./dist";
  let wat = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--wat") {
      wat = true;
    } else if (arg === "--outdir") {
      outdir = args[++i] ?? fail("Missing value for --outdir");
    } else if (arg.startsWith("-")) {
      fail(`Unknown flag "${arg}"`);
    } else if (!input) {
      input = arg;
    } else {
      fail("Too many arguments for compile");
    }
  }

  if (!input) {
    fail("compile needs an input file");
  }

  const filePath = path.resolve(input);
  const source = await readFile(filePath, "utf8");
  const name = path.basename(filePath, path.extname(filePath));
  const result = await compileUtuSource(source, wat);
  const targetDir = path.resolve(outdir);

  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, `${name}.mjs`), result.js, "utf8");
  await writeFile(path.join(targetDir, `${name}.wasm`), result.wasm);
  if (result.wat) {
    await writeFile(path.join(targetDir, `${name}.wat`), result.wat, "utf8");
  }

  console.log(`Wrote ${path.join(targetDir, `${name}.mjs`)}`);
  console.log(`Wrote ${path.join(targetDir, `${name}.wasm`)}`);
  if (result.wat) {
    console.log(`Wrote ${path.join(targetDir, `${name}.wat`)}`);
  }
}

async function run(args: string[]) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    fail("run needs exactly one input file");
  }

  const source = await readFile(path.resolve(args[0]), "utf8");
  const { wasm } = await compileUtuSource(source);

  const module = await WebAssembly.compile(wasm, { builtins: ["js-string"] }).catch(error => {
    fail(`Compiled wasm could not be compiled in Bun: ${message(error)}`);
  });

  const { exports } = await WebAssembly.instantiate(module, { es: runtimeImports }).catch(error => {
    fail(`Compiled wasm failed to instantiate in Bun: ${message(error)}`);
  });

  if (typeof exports.main !== "function") {
    fail("The program does not export a callable main function");
  }

  const result = await exports.main();
  if (result !== undefined) {
    console.log(result);
  }
}

function fail(message: string): never {
  throw new Error(message);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

main().catch(error => {
  console.error(message(error));
  process.exitCode = 1;
});
