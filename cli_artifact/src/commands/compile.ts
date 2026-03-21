import type { ParsedArgv } from "../lib/argv.ts";
import { hasFlag, requireInputFile, requireNoExtraPositionals, requireStringFlag } from "../lib/argv.ts";
import { compileUtuSource } from "../lib/compiler.ts";
import { deriveArtifactName, readSourceFile, resolveOutputDir, writeArtifacts } from "../lib/files.ts";
import { getCommandHelp } from "../lib/help.ts";

export async function compileCommand(args: ParsedArgv) {
  if (args.flags.has("help") || args.flags.has("h")) {
    console.log(getCommandHelp("compile"));
    return;
  }

  const input = requireInputFile(args, "compile");
  requireNoExtraPositionals(args, "compile", 1);

  const { filePath, source } = await readSourceFile(args.cwd, input);
  const outdir = resolveOutputDir(args.cwd, requireStringFlag(args, ["outdir", "o"]));
  const name = deriveArtifactName(filePath, requireStringFlag(args, ["name", "n"]));
  const emitWat = hasFlag(args, ["wat"]);
  const optimize = hasFlag(args, ["optimize", "O"]);

  const compiled = await compileUtuSource(source, { optimize, emitWat });
  if (compiled.warning) {
    console.warn(compiled.warning);
  }

  const outputs = await writeArtifacts({
    outdir,
    name,
    js: compiled.js,
    wasm: compiled.wasm,
    wat: compiled.wat,
  });

  console.log(`Wrote ${outputs.jsPath}`);
  console.log(`Wrote ${outputs.wasmPath}`);

  if (outputs.watPath) {
    console.log(`Wrote ${outputs.watPath}`);
  }
}
