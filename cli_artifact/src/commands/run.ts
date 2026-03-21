import type { ParsedArgv } from "../lib/argv.ts";
import { hasFlag, requireInputFile, requireNoExtraPositionals, requireStringFlag } from "../lib/argv.ts";
import { compileUtuSource } from "../lib/compiler.ts";
import { CliUsageError } from "../lib/errors.ts";
import { readSourceFile } from "../lib/files.ts";
import { getCommandHelp } from "../lib/help.ts";
import { importEphemeralModule } from "../lib/module-loader.ts";
import { loadRuntimeImports } from "../lib/runtime.ts";

type RuntimeModule = {
  instantiate?: (imports?: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export async function runCommand(args: ParsedArgv) {
  if (args.flags.has("help") || args.flags.has("h")) {
    console.log(getCommandHelp("run"));
    return;
  }

  const input = requireInputFile(args, "run");
  requireNoExtraPositionals(args, "run", 1);

  const { source } = await readSourceFile(args.cwd, input);
  const optimize = hasFlag(args, ["optimize", "O"]);
  const entrypoint = requireStringFlag(args, ["entry", "e"]) ?? "main";
  const importsPath = requireStringFlag(args, ["imports", "i"]);

  const compiled = await compileUtuSource(source, { optimize, emitWat: false });
  if (compiled.warning) {
    console.warn(compiled.warning);
  }

  const runtimeImports = await loadRuntimeImports(args.cwd, importsPath);
  let runtimeModule: RuntimeModule;
  try {
    runtimeModule = (await importEphemeralModule(compiled.js)) as RuntimeModule;
  } catch (error) {
    throw new Error(`Generated JS wrapper could not be loaded: ${toErrorMessage(error)}`);
  }

  if (typeof runtimeModule.instantiate !== "function") {
    throw new Error("Compiled output did not export instantiate().");
  }

  let exports: Record<string, unknown>;
  try {
    exports = await runtimeModule.instantiate(runtimeImports);
  } catch (error) {
    throw new Error(
      `Compiled wasm failed to instantiate. The CLI wiring is in place, but the current compiler output is not validating in Bun: ${toErrorMessage(error)}`,
    );
  }

  const entry = exports[entrypoint];

  if (typeof entry !== "function") {
    throw new CliUsageError(`Export "${entrypoint}" is not a callable function.`);
  }

  const result = await entry();
  if (result !== undefined) {
    console.log(result);
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
