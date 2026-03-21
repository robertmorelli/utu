import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const targets = [
  {
    label: "guide documentation",
    entry: join(repoRoot, "documentation", "index.typ"),
    outputDir: join(repoRoot, "web_artifact", "docs-pages"),
  },
  {
    label: "language specification",
    entry: join(repoRoot, "documentation", "spec.typ"),
    outputDir: join(repoRoot, "web_artifact", "spec-pages"),
  },
];

for (const target of targets) {
  const outputPattern = join(target.outputDir, "page-{0p}.svg");

  mkdirSync(target.outputDir, { recursive: true });

  for (const name of readdirSync(target.outputDir)) {
    if (name.endsWith(".svg")) {
      rmSync(join(target.outputDir, name), { force: true });
    }
  }

  const compile = spawnSync(
    "typst",
    ["compile", target.entry, outputPattern, "--root", repoRoot],
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

  const svgFiles = readdirSync(target.outputDir)
    .filter((name) => name.endsWith(".svg"))
    .sort();

  if (svgFiles.length === 0) {
    console.error(`Typst compilation finished without producing any SVG files for ${target.label}.`);
    process.exit(1);
  }

  console.log(`Generated ${svgFiles.length} ${target.label} SVG files in ${target.outputDir}`);
}
