import type { ParsedArgv } from "../lib/argv.ts";
import { hasFlag, requireInputFile, requireNoExtraPositionals } from "../lib/argv.ts";
import { compileUtuSource } from "../lib/compiler.ts";
import { readSourceFile } from "../lib/files.ts";
import { getCommandHelp } from "../lib/help.ts";

export async function checkCommand(args: ParsedArgv) {
  if (args.flags.has("help") || args.flags.has("h")) {
    console.log(getCommandHelp("check"));
    return;
  }

  const input = requireInputFile(args, "check");
  requireNoExtraPositionals(args, "check", 1);

  const optimize = hasFlag(args, ["optimize", "O"]);
  const { filePath, source } = await readSourceFile(args.cwd, input);

  await compileUtuSource(source, { optimize, emitWat: false });
  console.log(`OK ${filePath}`);
}
