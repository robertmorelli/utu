import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function importEphemeralModule(source: string) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "utu-cli-"));
  const modulePath = path.join(tempDir, "compiled-runtime.mjs");

  await writeFile(modulePath, source, "utf8");

  try {
    return await import(pathToFileURL(modulePath).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
