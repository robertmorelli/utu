import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getCallableExport } from "../../../shared/compiledRuntime.mjs";
import { createCliImportProvider, mergeImportObjects } from "../../../shared/hostImports.mjs";

export function readLineSync(fd, reader = fs) {
  const buffer = Buffer.alloc(1);
  let value = "";
  while (true) {
    const bytesRead = reader.readSync(fd, buffer, 0, 1, null);
    if (bytesRead === 0) break;
    const ch = buffer.toString("utf8", 0, bytesRead);
    if (ch === "\n") break;
    if (ch !== "\r") value += ch;
  }
  return value;
}

export function promptSync(message) {
  if (message) process.stdout.write(message);
  return readLineSync(0);
}

export async function createCliImports(importsFile = "") {
  const provider = createCliImportProvider({ prompt: promptSync });
  if (!importsFile) return provider;
  const mod = await import(pathToFileURL(path.resolve(importsFile)).href);
  return {
    ...provider,
    imports: mergeImportObjects(provider.imports, mod.default ?? mod),
  };
}

export async function loadNodeModuleFromSource(source, prefix = "utu-cli-") {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const file = path.join(dir, "module.mjs");
  const cleanup = () => rm(dir, { force: true, recursive: true });
  await writeFile(file, source, "utf8");

  try {
    return {
      module: await import(pathToFileURL(file).href),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function runCompiledProgram(instantiate, { prompt = promptSync } = {}) {
  const provider = createCliImportProvider({ prompt });
  const exports = await instantiate(provider.imports);
  const result = await getCallableExport(exports, "main", "The program does not export a callable main function")();
  if (result !== undefined) console.log(result);
}
