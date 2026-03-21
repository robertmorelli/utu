const mainHelp = `utu Bun CLI

Usage:
  utu <command> [options]
  utu help [command]

Commands:
  check <input>      Parse and validate a .utu file
  compile <input>    Write .mjs/.wasm artifacts for a .utu file
  run <input>        Compile and execute an exported function

Examples:
  bun run ./src/cli.ts check ../examples/call_simple.utu
  bun run ./src/cli.ts compile ../examples/float.utu --outdir ./dist/float --wat
  bun run ./src/cli.ts run ../examples/float.utu --entry main
`;

const commandHelp = {
  check: `utu check

Usage:
  utu check <input> [--optimize]

Notes:
  Runs the shared compiler pipeline without writing artifacts.
  Optimization is off by default for faster feedback.
`,
  compile: `utu compile

Usage:
  utu compile <input> [--outdir <dir>] [--name <artifact-name>] [--wat] [--optimize]

Options:
  --outdir, -o   Directory where compiled artifacts are written
  --name, -n     Base filename for the generated artifacts
  --wat          Also write the text-format wasm alongside js/wasm
  --optimize     Enable Binaryen optimization
`,
  run: `utu run

Usage:
  utu run <input> [--entry <export>] [--imports <file>] [--optimize]

Options:
  --entry, -e    Exported function to invoke after instantiation
  --imports, -i  JS/TS module whose exports are merged into host imports
  --optimize     Enable Binaryen optimization

Built-in host imports:
  console_log
  i64_to_string
  f64_to_string
  math_sin
  math_cos
  math_sqrt
`,
} as const;

export type KnownCommand = keyof typeof commandHelp;

export function printMainHelp() {
  console.log(mainHelp);
}

export function getCommandHelp(command: KnownCommand) {
  return commandHelp[command];
}

export function isKnownCommand(command: string): command is KnownCommand {
  return command in commandHelp;
}
