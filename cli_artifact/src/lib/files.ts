import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readSourceFile(cwd: string, inputPath: string) {
  const filePath = path.resolve(cwd, inputPath);
  const source = await readFile(filePath, "utf8");
  return { filePath, source };
}

export function resolveOutputDir(cwd: string, outdir?: string) {
  return path.resolve(cwd, outdir ?? "./dist");
}

export function deriveArtifactName(inputPath: string, override?: string) {
  if (override) {
    return override;
  }

  const ext = path.extname(inputPath);
  return path.basename(inputPath, ext);
}

export async function writeArtifacts({
  outdir,
  name,
  js,
  wasm,
  wat,
}: {
  outdir: string;
  name: string;
  js: string;
  wasm: Uint8Array;
  wat?: string;
}) {
  await mkdir(outdir, { recursive: true });

  const jsPath = path.join(outdir, `${name}.mjs`);
  const wasmPath = path.join(outdir, `${name}.wasm`);
  const watPath = wat ? path.join(outdir, `${name}.wat`) : undefined;

  await writeFile(jsPath, js, "utf8");
  await writeFile(wasmPath, wasm);

  if (watPath && wat) {
    await writeFile(watPath, wat, "utf8");
  }

  return { jsPath, wasmPath, watPath };
}
