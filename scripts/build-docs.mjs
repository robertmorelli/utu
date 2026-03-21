import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const docsEntry = join(repoRoot, "documentation", "index.typ");
const outputDir = join(repoRoot, "web_artifact", "docs");
const outputPattern = join(outputDir, "page-{0p}.svg");

mkdirSync(outputDir, { recursive: true });

for (const name of readdirSync(outputDir)) {
  if (name.endsWith(".svg")) {
    rmSync(join(outputDir, name), { force: true });
  }
}

const compile = spawnSync(
  "typst",
  ["compile", docsEntry, outputPattern, "--root", repoRoot],
  { stdio: "inherit" },
);

if (compile.error) {
  if (compile.error.code === "ENOENT") {
    console.error("Typst is required to build documentation SVGs, but `typst` was not found in PATH.");
    process.exit(1);
  }

  throw compile.error;
}

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const svgFiles = readdirSync(outputDir)
  .filter((name) => name.endsWith(".svg"))
  .sort();

if (svgFiles.length === 0) {
  console.error("Typst compilation finished without producing any SVG files.");
  process.exit(1);
}

console.log(`Generated ${svgFiles.length} documentation SVG files in ${outputDir}`);
