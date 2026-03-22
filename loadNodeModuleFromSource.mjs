import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function loadNodeModuleFromSource(source, { prefix = "utu-module-", wasm = null } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const modulePath = path.join(dir, "module.mjs");
  const cleanup = () => rm(dir, { force: true, recursive: true });
  await Promise.all([
    writeFile(modulePath, source, "utf8"),
    wasm != null && writeFile(path.join(dir, "module.wasm"), wasm),
  ].filter(Boolean));
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup,
  };
}
