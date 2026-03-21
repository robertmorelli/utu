#!/usr/bin/env bun

import { checkCommand } from "./commands/check.ts";
import { compileCommand } from "./commands/compile.ts";
import { runCommand } from "./commands/run.ts";
import { parseArgv } from "./lib/argv.ts";
import { CliUsageError, formatError } from "./lib/errors.ts";
import { getCommandHelp, isKnownCommand, printMainHelp } from "./lib/help.ts";

const commands = {
  check: checkCommand,
  compile: compileCommand,
  run: runCommand,
} as const;

async function main() {
  const parsed = parseArgv(process.argv.slice(2));

  if (parsed.flags.has("version") || parsed.flags.has("v")) {
    console.log("utu cli artifact");
    return;
  }

  if (!parsed.command || parsed.command === "help" || parsed.flags.has("help") || parsed.flags.has("h")) {
    if (parsed.command && parsed.command !== "help" && isKnownCommand(parsed.command)) {
      console.log(getCommandHelp(parsed.command));
      return;
    }

    const helpTarget = parsed.command === "help" ? parsed.positionals[0] : undefined;
    if (helpTarget) {
      if (!isKnownCommand(helpTarget)) {
        throw new CliUsageError(`Unknown command "${helpTarget}".`);
      }
      console.log(getCommandHelp(helpTarget));
      return;
    }

    printMainHelp();
    return;
  }

  if (!isKnownCommand(parsed.command)) {
    throw new CliUsageError(`Unknown command "${parsed.command}".`);
  }

  await commands[parsed.command](parsed);
}

main().catch(error => {
  console.error(formatError(error));
  process.exitCode = 1;
});
